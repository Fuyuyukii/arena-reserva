import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CourtService } from '../../../core/services/court.service';
import { BookingService } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';
import { Court } from '../../../core/models/court.model';
import { Booking, PaymentMethod } from '../../../core/models/booking.model';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatCardExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

interface SlotGroup {
  label: string;
  slots: string[];
}

/** Groups slots by period of day so a short last row reads as "these are the evening slots", not a leftover grid cell. */
function groupSlotsByPeriod(slots: string[]): SlotGroup[] {
  const groups: SlotGroup[] = [
    { label: 'Manhã', slots: [] },
    { label: 'Tarde', slots: [] },
    { label: 'Noite', slots: [] },
  ];
  for (const slot of slots) {
    const hour = Number(slot.slice(0, 2));
    if (hour < 12) groups[0].slots.push(slot);
    else if (hour < 18) groups[1].slots.push(slot);
    else groups[2].slots.push(slot);
  }
  return groups.filter((g) => g.slots.length > 0);
}

@Component({
  selector: 'app-court-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './court-detail.html',
  styleUrl: './court-detail.scss',
})
export class CourtDetail implements OnInit, OnDestroy {
  court = signal<Court | null>(null);
  slots = signal<string[]>([]);
  slotGroups = computed(() => groupSlotsByPeriod(this.slots()));
  date = signal(todayISO());
  loadingSlots = signal(true);
  message = signal<{ type: 'ok' | 'error'; text: string } | null>(null);

  heldBooking = signal<Booking | null>(null);
  holding = signal(false);
  paymentMethod = signal<PaymentMethod>('PIX');
  processingPayment = signal(false);
  remainingSeconds = signal(0);

  cardNumber = '';
  cardExpiry = '';
  cardCvv = '';
  cardName = '';

  private courtId!: number;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly courtService: CourtService,
    private readonly bookingService: BookingService,
    readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.courtId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadCourt();
    this.loadSlots();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    const hold = this.heldBooking();
    if (hold) {
      this.bookingService.cancel(hold.id).catch(() => undefined);
    }
  }

  get remainingLabel(): string {
    const minutes = Math.floor(this.remainingSeconds() / 60);
    const seconds = this.remainingSeconds() % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  async changeDate(newDate: string): Promise<void> {
    this.date.set(newDate);
    await this.loadSlots();
  }

  onCardNumberInput(value: string): void {
    this.cardNumber = formatCardNumber(value);
  }

  onCardExpiryInput(value: string): void {
    this.cardExpiry = formatCardExpiry(value);
  }

  async selectSlot(slot: string): Promise<void> {
    if (!this.auth.loggedIn()) {
      this.router.navigateByUrl('/login');
      return;
    }

    this.message.set(null);
    this.holding.set(true);
    try {
      const start = new Date(`${this.date()}T${slot}:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const hold = await this.bookingService.hold({
        courtId: this.courtId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      this.heldBooking.set(hold);
      this.startCountdown(hold.holdExpiresAt);
    } catch (err: unknown) {
      const text =
        (err as { error?: { error?: string } })?.error?.error ?? 'Este horário acabou de ser reservado por outra pessoa.';
      this.message.set({ type: 'error', text });
      await this.loadSlots();
    } finally {
      this.holding.set(false);
    }
  }

  async cancelCheckout(): Promise<void> {
    const hold = this.heldBooking();
    this.stopCountdown();
    this.heldBooking.set(null);
    if (hold) {
      await this.bookingService.cancel(hold.id).catch(() => undefined);
      await this.loadSlots();
    }
  }

  async pay(): Promise<void> {
    const hold = this.heldBooking();
    if (!hold) return;

    this.processingPayment.set(true);
    try {
      await this.bookingService.pay(hold.id, this.paymentMethod());
      this.message.set({ type: 'ok', text: `Pagamento aprovado! Reserva confirmada.` });
      this.stopCountdown();
      this.heldBooking.set(null);
      this.resetCardFields();
      await this.loadSlots();
    } catch (err: unknown) {
      const text = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível concluir o pagamento.';
      this.message.set({ type: 'error', text });
      this.stopCountdown();
      this.heldBooking.set(null);
      await this.loadSlots();
    } finally {
      this.processingPayment.set(false);
    }
  }

  private startCountdown(holdExpiresAt?: string | null): void {
    this.stopCountdown();
    if (!holdExpiresAt) return;

    const expiresAtMs = new Date(holdExpiresAt).getTime();
    const tick = () => {
      const secondsLeft = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
      this.remainingSeconds.set(secondsLeft);
      if (secondsLeft <= 0) {
        this.expireCheckout();
      }
    };

    tick();
    this.countdownHandle = setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }

  private async expireCheckout(): Promise<void> {
    const hold = this.heldBooking();
    this.stopCountdown();
    this.heldBooking.set(null);
    this.message.set({ type: 'error', text: 'O tempo para pagamento esgotou. Escolha o horário novamente.' });
    if (hold) {
      await this.bookingService.cancel(hold.id).catch(() => undefined);
    }
    await this.loadSlots();
  }

  private resetCardFields(): void {
    this.cardNumber = '';
    this.cardExpiry = '';
    this.cardCvv = '';
    this.cardName = '';
  }

  private async loadCourt(): Promise<void> {
    const courts = await this.courtService.list();
    this.court.set(courts.find((c) => c.id === this.courtId) ?? null);
  }

  private async loadSlots(): Promise<void> {
    this.loadingSlots.set(true);
    try {
      const result = await this.courtService.availability(this.courtId, this.date());
      this.slots.set(result.slots);
    } finally {
      this.loadingSlots.set(false);
    }
  }
}
