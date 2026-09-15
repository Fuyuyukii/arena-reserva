import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreateCourtInput, UpdateCourtInput, CourtService } from '../../../core/services/court.service';
import { Court, CourtStatus, CourtBlock } from '../../../core/models/court.model';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_OPTIONS: { value: CourtStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Disponível' },
  { value: 'UNDER_MAINTENANCE', label: 'Em manutenção' },
  { value: 'INACTIVE', label: 'Inativa' },
];

function defaultCourtForm(): CreateCourtInput & { status: CourtStatus } {
  return {
    name: '',
    surfaceType: '',
    covered: false,
    capacity: 10,
    hourlyRate: 100,
    sportsCenterId: 1,
    openingTime: '08:00',
    closingTime: '22:00',
    status: 'AVAILABLE',
  };
}

@Component({
  selector: 'app-admin-courts',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './admin-courts.html',
  styleUrl: './admin-courts.scss',
})
export class AdminCourts implements OnInit {
  readonly statusOptions = STATUS_OPTIONS;

  courts = signal<Court[]>([]);
  loading = signal(true);
  listError = signal<string | null>(null);

  courtModalOpen = signal(false);
  courtModalMode = signal<'create' | 'edit'>('create');
  editingCourtId = signal<number | null>(null);
  form = defaultCourtForm();
  sportsText = '';
  saving = signal(false);
  formError = signal<string | null>(null);

  blocksModalOpen = signal(false);
  blocksCourt = signal<Court | null>(null);
  blocks = signal<CourtBlock[]>([]);
  blocksLoading = signal(false);
  blockError = signal<string | null>(null);
  blockForm = { date: todayISO(), startTime: '08:00', endTime: '09:00', reason: '' };

  constructor(private readonly courtService: CourtService) {}

  ngOnInit(): void {
    this.load();
  }

  openCreateModal(): void {
    this.formError.set(null);
    this.courtModalMode.set('create');
    this.editingCourtId.set(null);
    this.form = defaultCourtForm();
    this.sportsText = '';
    this.courtModalOpen.set(true);
  }

  openEditModal(court: Court): void {
    this.formError.set(null);
    this.courtModalMode.set('edit');
    this.editingCourtId.set(court.id);
    this.form = {
      name: court.name,
      surfaceType: court.surfaceType,
      covered: court.covered,
      capacity: court.capacity,
      hourlyRate: court.hourlyRate,
      sportsCenterId: 1,
      openingTime: court.operatingHours[0]?.openingTime ?? '08:00',
      closingTime: court.operatingHours[0]?.closingTime ?? '22:00',
      status: court.status,
    };
    this.sportsText = court.sports.join(', ');
    this.courtModalOpen.set(true);
  }

  closeCourtModal(): void {
    this.courtModalOpen.set(false);
  }

  async submitCourtModal(): Promise<void> {
    this.formError.set(null);
    this.saving.set(true);
    try {
      const sports = this.sportsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (this.courtModalMode() === 'create') {
        await this.courtService.create({ ...this.form, sports });
      } else {
        const { name, surfaceType, covered, capacity, hourlyRate, openingTime, closingTime, status } = this.form;
        const update: UpdateCourtInput = { name, surfaceType, covered, capacity, hourlyRate, openingTime, closingTime, status, sports };
        await this.courtService.update(this.editingCourtId()!, update);
      }

      this.courtModalOpen.set(false);
      await this.load();
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível salvar a quadra.';
      this.formError.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(court: Court): Promise<void> {
    this.listError.set(null);
    try {
      await this.courtService.delete(court.id);
      await this.load();
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível excluir a quadra.';
      this.listError.set(message);
    }
  }

  async openBlocksModal(court: Court): Promise<void> {
    this.blockError.set(null);
    this.blocksCourt.set(court);
    this.blocksModalOpen.set(true);
    await this.loadBlocks(court.id);
  }

  closeBlocksModal(): void {
    this.blocksModalOpen.set(false);
  }

  async addBlock(): Promise<void> {
    const court = this.blocksCourt();
    if (!court) return;

    this.blockError.set(null);
    try {
      const start = new Date(`${this.blockForm.date}T${this.blockForm.startTime}:00`);
      const end = new Date(`${this.blockForm.date}T${this.blockForm.endTime}:00`);
      if (start >= end) {
        this.blockError.set('O horário de início deve ser antes do horário de término.');
        return;
      }
      await this.courtService.createBlock(court.id, {
        start: start.toISOString(),
        end: end.toISOString(),
        reason: this.blockForm.reason || undefined,
      });
      this.blockForm = { date: todayISO(), startTime: '08:00', endTime: '09:00', reason: '' };
      await this.loadBlocks(court.id);
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível criar o bloqueio.';
      this.blockError.set(message);
    }
  }

  async removeBlock(blockId: number): Promise<void> {
    const court = this.blocksCourt();
    if (!court) return;

    this.blockError.set(null);
    try {
      await this.courtService.deleteBlock(court.id, blockId);
      await this.loadBlocks(court.id);
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível remover o bloqueio.';
      this.blockError.set(message);
    }
  }

  private async loadBlocks(courtId: number): Promise<void> {
    this.blocksLoading.set(true);
    try {
      this.blocks.set(await this.courtService.listBlocks(courtId));
    } finally {
      this.blocksLoading.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.courts.set(await this.courtService.listAll());
    } finally {
      this.loading.set(false);
    }
  }
}
