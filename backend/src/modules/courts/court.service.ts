import { ConflictError, DomainError, NotFoundError } from '@/shared/errors';
import { CreateCourtInput, UpdateCourtInput, Occupancy, Court, CourtBlock, CreateBlockInput } from './court.types';

export interface CourtRepository {
  findById(id: number): Promise<Court | null>;
  list(): Promise<Court[]>;
  listBySport(sport: string): Promise<Court[]>;
  create(input: CreateCourtInput): Promise<Court>;
  update(id: number, data: UpdateCourtInput): Promise<Court>;
  delete(id: number): Promise<void>;
}

export interface OccupancyLookup {
  listByDay(courtId: number, date: Date): Promise<Occupancy[]>;
}

export interface ActiveBookingLookup {
  hasActiveBookings(courtId: number): Promise<boolean>;
  hasActiveBookingsInRange(courtId: number, start: Date, end: Date): Promise<boolean>;
}

export interface BlockRepository {
  create(courtId: number, input: CreateBlockInput): Promise<CourtBlock>;
  listByCourt(courtId: number): Promise<CourtBlock[]>;
  findById(id: number): Promise<CourtBlock | null>;
  delete(id: number): Promise<void>;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isSlotOccupied(slotStart: Date, slotEnd: Date, occupancies: Occupancy[]): boolean {
  return occupancies.some((o) => slotStart < o.end && slotEnd > o.start);
}

export class CourtService {
  constructor(
    private readonly courts: CourtRepository,
    private readonly occupancy: OccupancyLookup,
    private readonly activeBookings: ActiveBookingLookup,
    private readonly blocks: BlockRepository,
  ) {}

  async list(): Promise<Court[]> {
    return this.courts.list();
  }

  async listBySport(sport: string): Promise<Court[]> {
    return this.courts.listBySport(sport);
  }

  async listAvailable(sport?: string): Promise<Court[]> {
    const all = sport ? await this.courts.listBySport(sport) : await this.courts.list();
    return all.filter((c) => c.status === 'AVAILABLE');
  }

  async create(input: CreateCourtInput): Promise<Court> {
    return this.courts.create(input);
  }

  async update(id: number, data: UpdateCourtInput): Promise<Court> {
    const court = await this.courts.findById(id);
    if (!court) {
      throw new NotFoundError('Quadra não encontrada.');
    }
    return this.courts.update(id, data);
  }

  async delete(id: number): Promise<void> {
    const court = await this.courts.findById(id);
    if (!court) {
      throw new NotFoundError('Quadra não encontrada.');
    }
    if (await this.activeBookings.hasActiveBookings(id)) {
      throw new ConflictError('Não é possível excluir uma quadra com reservas pendentes ou confirmadas.');
    }
    await this.courts.delete(id);
  }

  async listAvailableSlots(courtId: number, date: Date): Promise<string[]> {
    const court = await this.courts.findById(courtId);
    if (!court) {
      throw new NotFoundError('Quadra não encontrada.');
    }

    const dayOfWeek = date.getDay();
    const hours = court.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
    if (!hours) {
      return [];
    }

    const occupanciesOnDay = await this.occupancy.listByDay(courtId, date);
    const startMin = toMinutes(hours.openingTime);
    const endMin = toMinutes(hours.closingTime);

    const slots: string[] = [];
    for (let minute = startMin; minute + 60 <= endMin; minute += 60) {
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

      if (!isSlotOccupied(slotStart, slotEnd, occupanciesOnDay)) {
        const hh = String(Math.floor(minute / 60)).padStart(2, '0');
        const mm = String(minute % 60).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
      }
    }

    return slots;
  }

  async createBlock(courtId: number, input: CreateBlockInput): Promise<CourtBlock> {
    const court = await this.courts.findById(courtId);
    if (!court) {
      throw new NotFoundError('Quadra não encontrada.');
    }
    if (input.start >= input.end) {
      throw new DomainError('O horário de início deve ser antes do horário de término.');
    }
    if (await this.activeBookings.hasActiveBookingsInRange(courtId, input.start, input.end)) {
      throw new ConflictError('Existem reservas pendentes ou confirmadas nesse período. Cancele-as antes de bloquear o horário.');
    }
    return this.blocks.create(courtId, input);
  }

  async listBlocks(courtId: number): Promise<CourtBlock[]> {
    return this.blocks.listByCourt(courtId);
  }

  async deleteBlock(courtId: number, blockId: number): Promise<void> {
    const block = await this.blocks.findById(blockId);
    if (!block || block.courtId !== courtId) {
      throw new NotFoundError('Bloqueio não encontrado.');
    }
    await this.blocks.delete(blockId);
  }
}
