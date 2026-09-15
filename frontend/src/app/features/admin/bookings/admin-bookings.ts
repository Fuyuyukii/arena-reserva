import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../../core/services/booking.service';
import { CourtService } from '../../../core/services/court.service';
import { Booking, BookingStatus } from '../../../core/models/booking.model';
import { Court } from '../../../core/models/court.model';

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'pendente',
  CONFIRMED: 'confirmada',
  CANCELLED: 'cancelada',
  COMPLETED: 'concluída',
  NO_SHOW: 'não compareceu',
};

function defaultManualForm(): { courtId: number | null; customerEmail: string; date: string; startTime: string; notes: string } {
  return {
    courtId: null,
    customerEmail: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '08:00',
    notes: '',
  };
}

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-bookings.html',
  styleUrl: './admin-bookings.scss',
})
export class AdminBookings implements OnInit {
  bookings = signal<Booking[]>([]);
  courts = signal<Court[]>([]);
  loading = signal(true);
  processing = signal<number | null>(null);
  error = signal<string | null>(null);

  manualModalOpen = signal(false);
  manualForm = defaultManualForm();
  manualSaving = signal(false);
  manualError = signal<string | null>(null);

  constructor(
    private readonly bookingService: BookingService,
    private readonly courtService: CourtService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.courtService.listAll().then((courts) => this.courts.set(courts));
  }

  label(status: BookingStatus): string {
    return STATUS_LABELS[status];
  }

  badgeClass(status: BookingStatus): string {
    switch (status) {
      case 'CONFIRMED':
        return 'badge-ok';
      case 'PENDING':
        return 'badge-warn';
      case 'CANCELLED':
      case 'NO_SHOW':
        return 'badge-danger';
      default:
        return '';
    }
  }

  courtName(courtId: number): string {
    return this.courts().find((c) => c.id === courtId)?.name ?? `Quadra #${courtId}`;
  }

  canMarkNoShow(booking: Booking): boolean {
    return booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW' && new Date(booking.end) < new Date();
  }

  async cancel(booking: Booking): Promise<void> {
    this.error.set(null);
    this.processing.set(booking.id);
    try {
      await this.bookingService.cancel(booking.id);
      await this.load();
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível cancelar a reserva.';
      this.error.set(message);
    } finally {
      this.processing.set(null);
    }
  }

  async markNoShow(booking: Booking): Promise<void> {
    this.error.set(null);
    this.processing.set(booking.id);
    try {
      await this.bookingService.markNoShow(booking.id);
      await this.load();
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível marcar como não compareceu.';
      this.error.set(message);
    } finally {
      this.processing.set(null);
    }
  }

  openManualModal(): void {
    this.manualError.set(null);
    this.manualForm = defaultManualForm();
    if (this.courts().length > 0) {
      this.manualForm.courtId = this.courts()[0].id;
    }
    this.manualModalOpen.set(true);
  }

  closeManualModal(): void {
    this.manualModalOpen.set(false);
  }

  async submitManualBooking(): Promise<void> {
    this.manualError.set(null);
    if (!this.manualForm.courtId) {
      this.manualError.set('Selecione uma quadra.');
      return;
    }

    this.manualSaving.set(true);
    try {
      const start = new Date(`${this.manualForm.date}T${this.manualForm.startTime}:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await this.bookingService.createManual({
        courtId: this.manualForm.courtId,
        customerEmail: this.manualForm.customerEmail,
        start: start.toISOString(),
        end: end.toISOString(),
        notes: this.manualForm.notes || undefined,
      });
      this.manualModalOpen.set(false);
      await this.load();
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível criar a reserva de encaixe.';
      this.manualError.set(message);
    } finally {
      this.manualSaving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.bookings.set(await this.bookingService.listAll());
    } finally {
      this.loading.set(false);
    }
  }
}
