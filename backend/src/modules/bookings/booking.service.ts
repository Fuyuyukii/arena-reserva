import { PaymentClient, PaymentMethod } from '@/clients/PaymentClient';
import { NotificationClient } from '@/clients/NotificationClient';
import { DomainError, ForbiddenError } from '@/shared/errors';
import { BookingRepository } from './booking.repository';
import { HoldBookingInput, Booking } from './booking.types';

export interface CourtLookup {
  findById(id: number): Promise<{
    id: number;
    hourlyRate: number;
    status: 'AVAILABLE' | 'UNDER_MAINTENANCE' | 'INACTIVE';
  } | null>;
}

/** How long a slot stays reserved for one customer while they complete payment. */
export const HOLD_DURATION_MS = 5 * 60 * 1000;

function calculateHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

export class BookingService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly courts: CourtLookup,
    private readonly payments: PaymentClient,
    private readonly notifications: NotificationClient,
  ) {}

  /**
   * Reserves the slot immediately (before any payment happens) so a second customer can't
   * even start checking out on the same slot. The reservation is atomic at the repository
   * level (see PrismaBookingRepository.createHold) and expires on its own after
   * HOLD_DURATION_MS if never paid or explicitly released.
   */
  async holdBooking(input: HoldBookingInput): Promise<Booking> {
    const court = await this.courts.findById(input.courtId);
    if (!court || court.status !== 'AVAILABLE') {
      throw new DomainError('Quadra indisponível para reservas no momento.');
    }

    const totalAmount = calculateHours(input.start, input.end) * court.hourlyRate;
    const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

    return this.bookings.createHold({ ...input, totalAmount, holdExpiresAt });
  }

  async payHold(bookingId: number, customerId: number, paymentMethod: PaymentMethod): Promise<Booking> {
    const hold = await this.findOrFail(bookingId);
    if (hold.customerId !== customerId) {
      throw new ForbiddenError('Você não tem permissão para pagar esta reserva.');
    }
    if (hold.status !== 'PENDING') {
      throw new DomainError(`Não é possível pagar uma reserva com status ${hold.status}.`);
    }
    if (hold.holdExpiresAt && hold.holdExpiresAt.getTime() < Date.now()) {
      await this.bookings.updateStatus(bookingId, 'CANCELLED');
      throw new DomainError('O tempo reservado para pagamento expirou. Escolha o horário novamente.');
    }

    const charge = await this.payments.charge({
      amount: hold.totalAmount,
      method: paymentMethod,
      reference: `booking-${hold.id}`,
    });
    if (!charge.approved) {
      await this.bookings.updateStatus(bookingId, 'CANCELLED');
      throw new DomainError('Pagamento não aprovado. Verifique os dados e tente novamente.');
    }

    const confirmed = await this.bookings.confirmPayment(bookingId, {
      amount: hold.totalAmount,
      method: paymentMethod,
      transactionId: charge.transactionId,
    });

    await this.notifyConfirmed(confirmed);

    return confirmed;
  }

  /**
   * Admin "encaixe": a walk-in or phone booking the admin enters directly, confirmed
   * immediately with no payment step (settled off-app — e.g. cash on site). Goes through the
   * same atomic conflict check as a customer hold (see PrismaBookingRepository.createManual),
   * so it can't silently double-book a slot either.
   */
  async createManualBooking(input: HoldBookingInput): Promise<Booking> {
    const court = await this.courts.findById(input.courtId);
    if (!court || court.status !== 'AVAILABLE') {
      throw new DomainError('Quadra indisponível para reservas no momento.');
    }

    const totalAmount = calculateHours(input.start, input.end) * court.hourlyRate;
    const booking = await this.bookings.createManual({ ...input, totalAmount });

    await this.notifyConfirmed(booking);

    return booking;
  }

  async cancelBooking(bookingId: number, customerId: number): Promise<Booking> {
    const booking = await this.findOrFail(bookingId);
    if (booking.customerId !== customerId) {
      throw new ForbiddenError('Você não tem permissão para cancelar esta reserva.');
    }

    return this.cancel(booking);
  }

  async cancelAsAdmin(bookingId: number): Promise<Booking> {
    const booking = await this.findOrFail(bookingId);
    return this.cancel(booking);
  }

  async confirmBooking(bookingId: number): Promise<Booking> {
    const booking = await this.findOrFail(bookingId);
    if (booking.status !== 'PENDING') {
      throw new DomainError(`Não é possível confirmar uma reserva com status ${booking.status}.`);
    }

    return this.bookings.updateStatus(bookingId, 'CONFIRMED');
  }

  async markNoShow(bookingId: number): Promise<Booking> {
    const booking = await this.findOrFail(bookingId);
    if (booking.status === 'CANCELLED') {
      throw new DomainError('Não é possível marcar como não comparecimento uma reserva cancelada.');
    }
    if (booking.end.getTime() > Date.now()) {
      throw new DomainError('Só é possível marcar não comparecimento depois do horário da reserva.');
    }
    return this.bookings.updateStatus(bookingId, 'NO_SHOW');
  }

  async listAll(): Promise<Booking[]> {
    return this.bookings.listAll();
  }

  private async findOrFail(bookingId: number): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) {
      throw new DomainError('Reserva não encontrada.', 404);
    }
    return booking;
  }

  private async cancel(booking: Booking): Promise<Booking> {
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      throw new DomainError(`Não é possível cancelar uma reserva com status ${booking.status}.`);
    }

    if (booking.payment?.state === 'APPROVED' && booking.payment.transactionId) {
      await this.payments.refund(booking.payment.transactionId);
      await this.bookings.refundPayment(booking.id);
    }

    return this.bookings.updateStatus(booking.id, 'CANCELLED');
  }

  private async notifyConfirmed(booking: Booking): Promise<void> {
    const message = `Sua reserva da quadra ${booking.courtId} foi registrada para ${booking.start.toISOString()}.`;
    await this.notifications.send({
      recipient: `customer:${booking.customerId}`,
      subject: 'Reserva confirmada',
      message,
    });
    // Sending is the SMTP client's job; recording that it happened against this booking is a
    // domain concern, so it's the service (not the client) that writes the Notification row.
    await this.bookings.recordNotification(booking.id, { channel: 'EMAIL', type: 'BOOKING_CONFIRMED', message });
  }
}
