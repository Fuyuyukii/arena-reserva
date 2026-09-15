import { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import { PaymentMethod } from '@/clients/PaymentClient';
import { ConflictError } from '@/shared/errors';
import { HoldBookingInput, Booking, BookingStatus, PaymentState } from './booking.types';

export interface CreateHoldInput extends HoldBookingInput {
  totalAmount: number;
  holdExpiresAt: Date;
}

export interface CreateManualInput extends HoldBookingInput {
  totalAmount: number;
}

export interface ConfirmPaymentInput {
  amount: number;
  method: PaymentMethod;
  transactionId: string;
}

export interface RecordNotificationInput {
  channel: string;
  type: string;
  message: string;
}

export interface UsageReportFilters {
  startDate?: Date;
  endDate?: Date;
  courtId?: number;
  sport?: string;
}

export interface UsageReportRow {
  courtId: number;
  totalBookings: number;
  totalRevenue: number;
}

export interface BookingRepository {
  createHold(input: CreateHoldInput): Promise<Booking>;
  createManual(input: CreateManualInput): Promise<Booking>;
  confirmPayment(id: number, payment: ConfirmPaymentInput): Promise<Booking>;
  findById(id: number): Promise<Booking | null>;
  updateStatus(id: number, status: BookingStatus): Promise<Booking>;
  refundPayment(id: number): Promise<void>;
  recordNotification(bookingId: number, input: RecordNotificationInput): Promise<void>;
  listByCustomer(customerId: number): Promise<Booking[]>;
  listAll(): Promise<Booking[]>;
}

type BookingRow = {
  id: number;
  courtId: number;
  customerId: number;
  startsAt: Date;
  endsAt: Date;
  status: string;
  totalAmount: unknown;
  createdAt: Date;
  holdExpiresAt: Date | null;
  notes: string | null;
  payment?: {
    method: string;
    state: string;
    transactionId: string | null;
    paidAt: Date | null;
  } | null;
  customer?: {
    user: { name: string; email: string };
  };
};

function toDomain(row: BookingRow): Booking {
  return {
    id: row.id,
    courtId: row.courtId,
    customerId: row.customerId,
    start: row.startsAt,
    end: row.endsAt,
    status: row.status as BookingStatus,
    totalAmount: Number(row.totalAmount),
    createdAt: row.createdAt,
    holdExpiresAt: row.holdExpiresAt,
    notes: row.notes,
    payment: row.payment
      ? {
          method: row.payment.method as PaymentMethod,
          state: row.payment.state as PaymentState,
          transactionId: row.payment.transactionId,
          paidAt: row.payment.paidAt,
        }
      : null,
    customer: row.customer ? { name: row.customer.user.name, email: row.customer.user.email } : null,
  };
}

const include = { payment: true } as const;
const adminListInclude = { payment: true, customer: { include: { user: { select: { name: true, email: true } } } } } as const;

/**
 * A booking is only "not blocking" once it is CANCELLED/COMPLETED/NO_SHOW, or once a
 * PENDING hold's TTL has lapsed. Every place that decides whether a court is free for a
 * given interval (this exclusion filter, the availability display in the courts module)
 * must apply the same rule, or a slot can look free in one place and blocked in another.
 */
function blockingStatusFilter(now: Date) {
  return [{ status: 'CONFIRMED' as const }, { status: 'PENDING' as const, holdExpiresAt: { gt: now } }];
}

/** Statuses that represent a booking that actually happened (or was expected to), for revenue purposes. */
const REVENUE_STATUSES: BookingStatus[] = ['CONFIRMED', 'COMPLETED', 'NO_SHOW'];

export class PrismaBookingRepository implements BookingRepository {
  async createHold(input: CreateHoldInput): Promise<Booking> {
    return prisma.$transaction(async (tx) => {
      await this.assertNoConflict(tx, input.courtId, input.start, input.end);

      const row = await tx.booking.create({
        data: {
          courtId: input.courtId,
          customerId: input.customerId,
          startsAt: input.start,
          endsAt: input.end,
          totalAmount: input.totalAmount,
          notes: input.notes,
          status: 'PENDING',
          holdExpiresAt: input.holdExpiresAt,
        },
        include,
      });
      return toDomain(row);
    });
  }

  /** Admin "encaixe": same atomic conflict guarantee as createHold, but confirmed immediately with no payment. */
  async createManual(input: CreateManualInput): Promise<Booking> {
    return prisma.$transaction(async (tx) => {
      await this.assertNoConflict(tx, input.courtId, input.start, input.end);

      const row = await tx.booking.create({
        data: {
          courtId: input.courtId,
          customerId: input.customerId,
          startsAt: input.start,
          endsAt: input.end,
          totalAmount: input.totalAmount,
          notes: input.notes,
          status: 'CONFIRMED',
        },
        include,
      });
      return toDomain(row);
    });
  }

  async confirmPayment(id: number, payment: ConfirmPaymentInput): Promise<Booking> {
    const row = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        payment: {
          create: {
            amount: payment.amount,
            method: payment.method,
            state: 'APPROVED',
            transactionId: payment.transactionId,
            paidAt: new Date(),
          },
        },
      },
      include,
    });
    return toDomain(row);
  }

  async findById(id: number): Promise<Booking | null> {
    const row = await prisma.booking.findUnique({ where: { id }, include });
    if (!row) return null;
    const [settled] = await this.settlePast([toDomain(row)]);
    return settled;
  }

  async updateStatus(id: number, status: BookingStatus): Promise<Booking> {
    const row = await prisma.booking.update({ where: { id }, data: { status }, include });
    return toDomain(row);
  }

  async refundPayment(id: number): Promise<void> {
    await prisma.payment.update({ where: { bookingId: id }, data: { state: 'REFUNDED' } });
  }

  async recordNotification(bookingId: number, input: RecordNotificationInput): Promise<void> {
    await prisma.notification.create({
      data: { bookingId, channel: input.channel, type: input.type, message: input.message, sentAt: new Date() },
    });
  }

  async listByCustomer(customerId: number): Promise<Booking[]> {
    const rows = await prisma.booking.findMany({
      where: { customerId },
      orderBy: { startsAt: 'desc' },
      include,
    });
    return this.settlePast(rows.map(toDomain));
  }

  async listAll(): Promise<Booking[]> {
    const rows = await prisma.booking.findMany({ orderBy: { startsAt: 'desc' }, include: adminListInclude });
    return this.settlePast(rows.map(toDomain));
  }

  async usageReport(filters: UsageReportFilters = {}): Promise<UsageReportRow[]> {
    const where: Prisma.BookingWhereInput = {
      // Cancelled bookings never happened (and were refunded if paid) — they shouldn't
      // count as revenue, only actually-honored or no-show bookings should.
      status: { in: REVENUE_STATUSES },
    };
    if (filters.startDate || filters.endDate) {
      where.startsAt = {
        ...(filters.startDate ? { gte: filters.startDate } : {}),
        ...(filters.endDate ? { lte: filters.endDate } : {}),
      };
    }
    if (filters.courtId) {
      where.courtId = filters.courtId;
    }
    if (filters.sport) {
      where.court = { sports: { some: { sport: { name: filters.sport } } } };
    }

    const groups = await prisma.booking.groupBy({
      by: ['courtId'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    return groups.map((g) => ({
      courtId: g.courtId,
      totalBookings: g._count._all,
      totalRevenue: Number(g._sum.totalAmount ?? 0),
    }));
  }

  /**
   * Advisory lock scoped to this court serializes conflict-checking + insertion per court
   * across all connections (including other server instances hitting the same Postgres), so
   * this is effectively atomic. Without it, two requests can both read "no conflict" under
   * READ COMMITTED before either one commits. Must run inside the same transaction as the
   * insert that follows it, or the lock is released before it protects anything.
   */
  private async assertNoConflict(
    tx: Prisma.TransactionClient,
    courtId: number,
    start: Date,
    end: Date,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${courtId})`;

    const now = new Date();
    const [conflictingBookings, conflictingBlocks] = await Promise.all([
      tx.booking.findMany({
        where: { courtId, startsAt: { lt: end }, endsAt: { gt: start }, OR: blockingStatusFilter(now) },
      }),
      tx.courtBlock.findMany({
        where: { courtId, startsAt: { lt: end }, endsAt: { gt: start } },
      }),
    ]);
    if (conflictingBookings.length > 0 || conflictingBlocks.length > 0) {
      throw new ConflictError('Já existe uma reserva ou bloqueio para esta quadra no horário solicitado.');
    }
  }

  /**
   * There's no scheduled job flipping bookings to COMPLETED once their time passes — instead,
   * every read opportunistically settles any CONFIRMED booking whose end has already gone by.
   * Same lazy-evaluation approach as the hold TTL: cheap, and correct as long as every read
   * path goes through here (an admin can still override to NO_SHOW after this runs).
   */
  private async settlePast(bookings: Booking[]): Promise<Booking[]> {
    const now = new Date();
    const toComplete = bookings.filter((b) => b.status === 'CONFIRMED' && b.end < now);
    if (toComplete.length === 0) {
      return bookings;
    }

    await prisma.booking.updateMany({
      where: { id: { in: toComplete.map((b) => b.id) }, status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });

    const completedIds = new Set(toComplete.map((b) => b.id));
    return bookings.map((b) => (completedIds.has(b.id) ? { ...b, status: 'COMPLETED' as BookingStatus } : b));
  }
}
