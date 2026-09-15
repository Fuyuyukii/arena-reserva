import { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import { ConflictError } from '@/shared/errors';
import { UpdateCourtInput, CreateCourtInput, Court } from './court.types';
import { CourtRepository } from './court.service';

type CourtRow = Awaited<ReturnType<typeof prisma.court.findFirstOrThrow>>;

function toDomain(
  row: CourtRow & {
    sports?: { sport: { name: string } }[];
    operatingHours?: { dayOfWeek: number; openingTime: string; closingTime: string }[];
  },
): Court {
  return {
    id: row.id,
    name: row.name,
    surfaceType: row.surfaceType,
    covered: row.covered,
    capacity: row.capacity,
    hourlyRate: Number(row.hourlyRate),
    status: row.status,
    sports: row.sports?.map((s) => s.sport.name) ?? [],
    operatingHours:
      row.operatingHours?.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openingTime: h.openingTime,
        closingTime: h.closingTime,
      })) ?? [],
  };
}

const include = {
  sports: { include: { sport: true } },
  operatingHours: true,
} as const;

const DEFAULT_OPENING_TIME = '08:00';
const DEFAULT_CLOSING_TIME = '22:00';
const ALL_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

function buildOperatingHours(openingTime?: string, closingTime?: string) {
  return ALL_DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    openingTime: openingTime ?? DEFAULT_OPENING_TIME,
    closingTime: closingTime ?? DEFAULT_CLOSING_TIME,
  }));
}

export class PrismaCourtRepository implements CourtRepository {
  async findById(id: number): Promise<Court | null> {
    const row = await prisma.court.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<Court[]> {
    const rows = await prisma.court.findMany({ include });
    return rows.map(toDomain);
  }

  async listBySport(sport: string): Promise<Court[]> {
    const rows = await prisma.court.findMany({
      where: { sports: { some: { sport: { name: sport } } } },
      include,
    });
    return rows.map(toDomain);
  }

  async create(input: CreateCourtInput): Promise<Court> {
    const row = await prisma.court.create({
      data: {
        name: input.name,
        surfaceType: input.surfaceType,
        covered: input.covered,
        capacity: input.capacity,
        hourlyRate: input.hourlyRate,
        sportsCenterId: input.sportsCenterId,
        sports: input.sports
          ? {
              create: input.sports.map((name) => ({
                sport: {
                  connectOrCreate: { where: { name }, create: { name } },
                },
              })),
            }
          : undefined,
        // Every day of the week, same hours by default — a court with no operating hours
        // can never produce a bookable slot (see CourtService.listAvailableSlots).
        operatingHours: { create: buildOperatingHours(input.openingTime, input.closingTime) },
      },
      include,
    });
    return toDomain(row);
  }

  async update(id: number, data: UpdateCourtInput): Promise<Court> {
    if (data.sports) {
      await prisma.courtSport.deleteMany({ where: { courtId: id } });
    }
    if (data.openingTime || data.closingTime) {
      await prisma.operatingHours.deleteMany({ where: { courtId: id } });
    }

    const row = await prisma.court.update({
      where: { id },
      data: {
        name: data.name,
        surfaceType: data.surfaceType,
        covered: data.covered,
        capacity: data.capacity,
        hourlyRate: data.hourlyRate,
        status: data.status,
        sports: data.sports
          ? {
              create: data.sports.map((name) => ({
                sport: { connectOrCreate: { where: { name }, create: { name } } },
              })),
            }
          : undefined,
        operatingHours:
          data.openingTime || data.closingTime
            ? { create: buildOperatingHours(data.openingTime, data.closingTime) }
            : undefined,
      },
      include,
    });
    return toDomain(row);
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.court.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictError('Não é possível excluir uma quadra com reservas em seu histórico.');
      }
      throw err;
    }
  }
}
