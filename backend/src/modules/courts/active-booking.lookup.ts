import { prisma } from '@/config/prisma';
import { ActiveBookingLookup } from './court.service';

function activeStatusFilter(now: Date) {
  return [{ status: 'CONFIRMED' as const }, { status: 'PENDING' as const, holdExpiresAt: { gt: now } }];
}

export class PrismaActiveBookingLookup implements ActiveBookingLookup {
  async hasActiveBookings(courtId: number): Promise<boolean> {
    const count = await prisma.booking.count({
      where: { courtId, OR: activeStatusFilter(new Date()) },
    });
    return count > 0;
  }

  async hasActiveBookingsInRange(courtId: number, start: Date, end: Date): Promise<boolean> {
    const count = await prisma.booking.count({
      where: {
        courtId,
        startsAt: { lt: end },
        endsAt: { gt: start },
        OR: activeStatusFilter(new Date()),
      },
    });
    return count > 0;
  }
}
