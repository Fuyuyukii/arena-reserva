import { prisma } from '@/config/prisma';
import { OccupancyLookup } from './court.service';
import { Occupancy } from './court.types';

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export class PrismaOccupancyLookup implements OccupancyLookup {
  async listByDay(courtId: number, date: Date): Promise<Occupancy[]> {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const now = new Date();
    const [bookings, blocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          courtId,
          startsAt: { lt: end },
          endsAt: { gt: start },
          // A PENDING hold only blocks the slot while it hasn't expired — otherwise an
          // abandoned checkout would keep a slot looking taken forever. Must match the
          // same rule used when a new hold is created (PrismaBookingRepository.createHold).
          OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', holdExpiresAt: { gt: now } }],
        },
      }),
      prisma.courtBlock.findMany({
        where: {
          courtId,
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
      }),
    ]);

    return [
      ...bookings.map((b) => ({ start: b.startsAt, end: b.endsAt })),
      ...blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    ];
  }
}
