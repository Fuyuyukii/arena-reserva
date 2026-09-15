import {
  CourtService,
  CourtRepository,
  OccupancyLookup,
  ActiveBookingLookup,
  BlockRepository,
} from '@/modules/courts/court.service';
import { Court, Occupancy, CreateCourtInput, CourtBlock, CreateBlockInput } from '@/modules/courts/court.types';
import { ConflictError, DomainError, NotFoundError } from '@/shared/errors';

class CourtRepositoryFake implements CourtRepository {
  courts: Court[] = [];

  async findById(id: number): Promise<Court | null> {
    return this.courts.find((c) => c.id === id) ?? null;
  }

  async list(): Promise<Court[]> {
    return this.courts;
  }

  async listBySport(sport: string): Promise<Court[]> {
    return this.courts.filter((c) => c.sports.includes(sport));
  }

  async create(input: CreateCourtInput): Promise<Court> {
    const court: Court = {
      id: this.courts.length + 1,
      name: input.name,
      surfaceType: input.surfaceType,
      covered: input.covered,
      capacity: input.capacity,
      hourlyRate: input.hourlyRate,
      status: 'AVAILABLE',
      sports: input.sports ?? [],
      operatingHours: [],
    };
    this.courts.push(court);
    return court;
  }

  async update(id: number, data: Partial<CreateCourtInput> & { status?: Court['status'] }): Promise<Court> {
    const court = this.courts.find((c) => c.id === id);
    if (!court) throw new Error('court not found');
    Object.assign(court, data);
    return court;
  }

  async delete(id: number): Promise<void> {
    this.courts = this.courts.filter((c) => c.id !== id);
  }
}

class OccupancyLookupFake implements OccupancyLookup {
  constructor(private occupancies: Occupancy[] = []) {}
  async listByDay(_courtId: number, _date: Date): Promise<Occupancy[]> {
    return this.occupancies;
  }
}

class ActiveBookingLookupFake implements ActiveBookingLookup {
  constructor(private active = false) {}
  async hasActiveBookings(_courtId: number): Promise<boolean> {
    return this.active;
  }
  async hasActiveBookingsInRange(_courtId: number, _start: Date, _end: Date): Promise<boolean> {
    return this.active;
  }
}

class BlockRepositoryFake implements BlockRepository {
  blocks: CourtBlock[] = [];
  private nextId = 1;

  async create(courtId: number, input: CreateBlockInput): Promise<CourtBlock> {
    const block: CourtBlock = { id: this.nextId++, courtId, start: input.start, end: input.end, reason: input.reason ?? null };
    this.blocks.push(block);
    return block;
  }

  async listByCourt(courtId: number): Promise<CourtBlock[]> {
    return this.blocks.filter((b) => b.courtId === courtId);
  }

  async findById(id: number): Promise<CourtBlock | null> {
    return this.blocks.find((b) => b.id === id) ?? null;
  }

  async delete(id: number): Promise<void> {
    this.blocks = this.blocks.filter((b) => b.id !== id);
  }
}

function buildService(court: Court, occupancies: Occupancy[] = [], activeBookings = false) {
  const repository = new CourtRepositoryFake();
  repository.courts.push(court);
  const occupancyLookup = new OccupancyLookupFake(occupancies);
  const activeBookingLookup = new ActiveBookingLookupFake(activeBookings);
  const blockRepository = new BlockRepositoryFake();
  const service = new CourtService(repository, occupancyLookup, activeBookingLookup, blockRepository);
  return { service, repository, blockRepository };
}

const baseCourt: Court = {
  id: 1,
  name: 'Quadra 1',
  surfaceType: 'sintético',
  covered: true,
  capacity: 10,
  hourlyRate: 100,
  status: 'AVAILABLE',
  sports: ['Futsal'],
  operatingHours: [{ dayOfWeek: 3, openingTime: '08:00', closingTime: '11:00' }],
};

describe('CourtService.listAvailableSlots', () => {
  it('lista todos os horários de 1h dentro do funcionamento quando não há ocupações', async () => {
    const { service } = buildService(baseCourt);

    const slots = await service.listAvailableSlots(1, new Date('2026-09-16T00:00:00'));

    expect(slots).toEqual(['08:00', '09:00', '10:00']);
  });

  it('remove da lista os horários que já possuem reserva ou bloqueio', async () => {
    const occupancies: Occupancy[] = [{ start: new Date('2026-09-16T09:00:00'), end: new Date('2026-09-16T10:00:00') }];
    const { service } = buildService(baseCourt, occupancies);

    const slots = await service.listAvailableSlots(1, new Date('2026-09-16T00:00:00'));

    expect(slots).toEqual(['08:00', '10:00']);
  });
});

describe('CourtService.listAvailable', () => {
  it('não inclui quadras em manutenção ou inativas na listagem pública', async () => {
    const { service, repository } = buildService(baseCourt);
    repository.courts.push({ ...baseCourt, id: 2, status: 'UNDER_MAINTENANCE' });
    repository.courts.push({ ...baseCourt, id: 3, status: 'INACTIVE' });

    const available = await service.listAvailable();

    expect(available.map((c) => c.id)).toEqual([1]);
  });
});

describe('CourtService.delete', () => {
  it('exclui uma quadra sem reservas ativas', async () => {
    const { service, repository } = buildService(baseCourt, [], false);

    await service.delete(1);

    expect(await repository.findById(1)).toBeNull();
  });

  it('impede a exclusão de uma quadra com reservas pendentes ou confirmadas', async () => {
    const { service } = buildService(baseCourt, [], true);

    await expect(service.delete(1)).rejects.toThrow(ConflictError);
  });
});

describe('CourtService.createBlock', () => {
  it('cria um bloqueio quando não há reservas ativas no período', async () => {
    const { service, blockRepository } = buildService(baseCourt, [], false);

    const block = await service.createBlock(1, {
      start: new Date('2026-09-20T08:00:00'),
      end: new Date('2026-09-20T10:00:00'),
      reason: 'Manutenção do piso',
    });

    expect(block.reason).toBe('Manutenção do piso');
    expect(blockRepository.blocks).toHaveLength(1);
  });

  it('rejeita o bloqueio quando já existem reservas ativas no período', async () => {
    const { service } = buildService(baseCourt, [], true);

    await expect(
      service.createBlock(1, { start: new Date('2026-09-20T08:00:00'), end: new Date('2026-09-20T10:00:00') }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejeita quando o horário de início não é anterior ao término', async () => {
    const { service } = buildService(baseCourt);

    await expect(
      service.createBlock(1, { start: new Date('2026-09-20T10:00:00'), end: new Date('2026-09-20T08:00:00') }),
    ).rejects.toThrow(DomainError);
  });
});

describe('CourtService.deleteBlock', () => {
  it('remove um bloqueio existente da quadra', async () => {
    const { service, blockRepository } = buildService(baseCourt);
    const block = await service.createBlock(1, { start: new Date('2026-09-20T08:00:00'), end: new Date('2026-09-20T09:00:00') });

    await service.deleteBlock(1, block.id);

    expect(blockRepository.blocks).toHaveLength(0);
  });

  it('rejeita excluir um bloqueio que pertence a outra quadra', async () => {
    const { service, repository } = buildService(baseCourt);
    repository.courts.push({ ...baseCourt, id: 2 });
    const block = await service.createBlock(1, { start: new Date('2026-09-20T08:00:00'), end: new Date('2026-09-20T09:00:00') });

    await expect(service.deleteBlock(2, block.id)).rejects.toThrow(NotFoundError);
  });
});
