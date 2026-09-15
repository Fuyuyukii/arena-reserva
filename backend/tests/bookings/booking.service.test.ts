import { BookingService, HOLD_DURATION_MS } from '@/modules/bookings/booking.service';
import {
  BookingRepository,
  CreateHoldInput,
  CreateManualInput,
  ConfirmPaymentInput,
  RecordNotificationInput,
} from '@/modules/bookings/booking.repository';
import { CourtLookup } from '@/modules/bookings/booking.service';
import { Booking, BookingStatus } from '@/modules/bookings/booking.types';
import { PaymentClient, ChargeInput } from '@/clients/PaymentClient';
import { NotificationClient } from '@/clients/NotificationClient';
import { ConflictError, DomainError } from '@/shared/errors';

class BookingRepositoryFake implements BookingRepository {
  bookings: Booking[] = [];
  notifications: (RecordNotificationInput & { bookingId: number })[] = [];
  private nextId = 1;

  async createHold(input: CreateHoldInput): Promise<Booking> {
    this.assertNoOverlap(input.courtId, input.start, input.end);

    const booking: Booking = {
      id: this.nextId++,
      courtId: input.courtId,
      customerId: input.customerId,
      start: input.start,
      end: input.end,
      status: 'PENDING',
      totalAmount: input.totalAmount,
      createdAt: new Date(),
      holdExpiresAt: input.holdExpiresAt,
      notes: input.notes ?? null,
      payment: null,
    };
    this.bookings.push(booking);
    return booking;
  }

  async createManual(input: CreateManualInput): Promise<Booking> {
    this.assertNoOverlap(input.courtId, input.start, input.end);

    const booking: Booking = {
      id: this.nextId++,
      courtId: input.courtId,
      customerId: input.customerId,
      start: input.start,
      end: input.end,
      status: 'CONFIRMED',
      totalAmount: input.totalAmount,
      createdAt: new Date(),
      holdExpiresAt: null,
      notes: input.notes ?? null,
      payment: null,
    };
    this.bookings.push(booking);
    return booking;
  }

  private assertNoOverlap(courtId: number, start: Date, end: Date): void {
    const overlaps = this.bookings.some(
      (b) =>
        b.courtId === courtId &&
        b.start < end &&
        b.end > start &&
        (b.status === 'CONFIRMED' || (b.status === 'PENDING' && (b.holdExpiresAt?.getTime() ?? 0) > Date.now())),
    );
    if (overlaps) {
      throw new ConflictError('Já existe uma reserva para esta quadra no horário solicitado.');
    }
  }

  async confirmPayment(id: number, payment: ConfirmPaymentInput): Promise<Booking> {
    const booking = this.bookings.find((b) => b.id === id);
    if (!booking) throw new Error('booking not found');
    booking.status = 'CONFIRMED';
    booking.payment = { method: payment.method, state: 'APPROVED', transactionId: payment.transactionId, paidAt: new Date() };
    return booking;
  }

  async findById(id: number): Promise<Booking | null> {
    return this.bookings.find((b) => b.id === id) ?? null;
  }

  async updateStatus(id: number, status: BookingStatus): Promise<Booking> {
    const booking = this.bookings.find((b) => b.id === id);
    if (!booking) throw new Error('booking not found');
    booking.status = status;
    return booking;
  }

  async refundPayment(id: number): Promise<void> {
    const booking = this.bookings.find((b) => b.id === id);
    if (booking?.payment) booking.payment.state = 'REFUNDED';
  }

  async recordNotification(bookingId: number, input: RecordNotificationInput): Promise<void> {
    this.notifications.push({ bookingId, ...input });
  }

  async listByCustomer(customerId: number): Promise<Booking[]> {
    return this.bookings.filter((b) => b.customerId === customerId);
  }

  async listAll(): Promise<Booking[]> {
    return this.bookings;
  }
}

class CourtLookupFake implements CourtLookup {
  constructor(private hourlyRate = 100, private status: 'AVAILABLE' | 'UNDER_MAINTENANCE' | 'INACTIVE' = 'AVAILABLE') {}

  async findById(id: number) {
    return { id, hourlyRate: this.hourlyRate, status: this.status };
  }
}

class PaymentClientFake implements PaymentClient {
  refundedTransactionIds: string[] = [];
  chargeCalls: ChargeInput[] = [];
  constructor(private approved = true) {}

  async charge(input: ChargeInput) {
    this.chargeCalls.push(input);
    return { approved: this.approved, transactionId: 'fake-tx' };
  }
  async refund(transactionId: string) {
    this.refundedTransactionIds.push(transactionId);
    return { refunded: true };
  }
}

class NotificationClientFake implements NotificationClient {
  sent: string[] = [];
  async send(input: { recipient: string }) {
    this.sent.push(input.recipient);
  }
}

function buildService(overrides?: {
  hourlyRate?: number;
  courtStatus?: 'AVAILABLE' | 'UNDER_MAINTENANCE' | 'INACTIVE';
  paymentApproved?: boolean;
}) {
  const repository = new BookingRepositoryFake();
  const courts = new CourtLookupFake(overrides?.hourlyRate, overrides?.courtStatus);
  const payments = new PaymentClientFake(overrides?.paymentApproved ?? true);
  const notifications = new NotificationClientFake();
  const service = new BookingService(repository, courts, payments, notifications);
  return { service, repository, courts, payments, notifications };
}

const sampleHold = {
  courtId: 1,
  customerId: 10,
  start: new Date('2026-10-01T18:00:00Z'),
  end: new Date('2026-10-01T20:00:00Z'),
};

describe('BookingService.holdBooking', () => {
  it('reserva o horário com status pendente e calcula o valor total, sem cobrar ainda', async () => {
    const { service, payments } = buildService({ hourlyRate: 100 });

    const hold = await service.holdBooking(sampleHold);

    expect(hold.totalAmount).toBe(200);
    expect(hold.status).toBe('PENDING');
    expect(payments.chargeCalls).toHaveLength(0);
  });

  it('define um prazo de expiração para o hold', async () => {
    const { service } = buildService();

    const before = Date.now();
    const hold = await service.holdBooking(sampleHold);

    expect(hold.holdExpiresAt).toBeDefined();
    expect(hold.holdExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + HOLD_DURATION_MS);
  });

  it('rejeita um novo hold quando o horário já está reservado (pendente ou confirmado) na mesma quadra', async () => {
    const { service } = buildService();

    await service.holdBooking(sampleHold);

    await expect(
      service.holdBooking({ ...sampleHold, customerId: 20, start: new Date('2026-10-01T19:00:00Z'), end: new Date('2026-10-01T21:00:00Z') }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejeita o hold quando a quadra não está disponível (em manutenção ou inativa)', async () => {
    const { service } = buildService({ courtStatus: 'UNDER_MAINTENANCE' });

    await expect(service.holdBooking(sampleHold)).rejects.toThrow('indisponível');
  });

  it('libera o horário para outro cliente depois que o hold anterior expira', async () => {
    const { service, repository } = buildService();
    const hold = await service.holdBooking(sampleHold);
    repository.bookings.find((b) => b.id === hold.id)!.holdExpiresAt = new Date(Date.now() - 1000);

    const secondHold = await service.holdBooking({ ...sampleHold, customerId: 20 });

    expect(secondHold.status).toBe('PENDING');
  });
});

describe('BookingService.payHold', () => {
  it('cobra o valor do hold e confirma a reserva quando o pagamento é aprovado', async () => {
    const { service, payments } = buildService();
    const hold = await service.holdBooking(sampleHold);

    const confirmed = await service.payHold(hold.id, 10, 'PIX');

    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.payment?.state).toBe('APPROVED');
    expect(payments.chargeCalls).toEqual([{ amount: 200, method: 'PIX', reference: `booking-${hold.id}` }]);
  });

  it('cancela o hold e não confirma quando o pagamento não é aprovado', async () => {
    const { service, repository } = buildService({ paymentApproved: false });
    const hold = await service.holdBooking(sampleHold);

    await expect(service.payHold(hold.id, 10, 'PIX')).rejects.toThrow(DomainError);
    expect((await repository.findById(hold.id))!.status).toBe('CANCELLED');
  });

  it('não permite que outro cliente pague o hold de alguém', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);

    await expect(service.payHold(hold.id, 999, 'PIX')).rejects.toThrow();
  });

  it('cancela o hold e rejeita o pagamento quando o prazo já expirou', async () => {
    const { service, repository, payments } = buildService();
    const hold = await service.holdBooking(sampleHold);
    repository.bookings.find((b) => b.id === hold.id)!.holdExpiresAt = new Date(Date.now() - 1000);

    await expect(service.payHold(hold.id, 10, 'PIX')).rejects.toThrow('expirou');
    expect((await repository.findById(hold.id))!.status).toBe('CANCELLED');
    expect(payments.chargeCalls).toHaveLength(0);
  });

  it('envia uma notificação de confirmação ao cliente após o pagamento', async () => {
    const { service, notifications } = buildService();
    const hold = await service.holdBooking(sampleHold);

    await service.payHold(hold.id, 10, 'PIX');

    expect(notifications.sent).toHaveLength(1);
  });

  it('registra a notificação de confirmação vinculada à reserva', async () => {
    const { service, repository } = buildService();
    const hold = await service.holdBooking(sampleHold);

    await service.payHold(hold.id, 10, 'PIX');

    expect(repository.notifications).toEqual([
      expect.objectContaining({ bookingId: hold.id, type: 'BOOKING_CONFIRMED' }),
    ]);
  });
});

describe('BookingService.cancelBooking', () => {
  it('libera um hold ainda não pago sem tentar estornar (nada foi cobrado)', async () => {
    const { service, payments } = buildService();
    const hold = await service.holdBooking(sampleHold);

    const cancelled = await service.cancelBooking(hold.id, 10);

    expect(cancelled.status).toBe('CANCELLED');
    expect(payments.refundedTransactionIds).toHaveLength(0);
  });

  it('cancela uma reserva confirmada pertencente ao cliente e estorna o pagamento', async () => {
    const { service, payments } = buildService();
    const hold = await service.holdBooking(sampleHold);
    await service.payHold(hold.id, 10, 'PIX');

    const cancelled = await service.cancelBooking(hold.id, 10);

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.payment?.state).toBe('REFUNDED');
    expect(payments.refundedTransactionIds).toEqual(['fake-tx']);
  });

  it('não permite que um cliente cancele a reserva de outro cliente', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);

    await expect(service.cancelBooking(hold.id, 999)).rejects.toThrow();
  });

  it('não permite cancelar uma reserva já cancelada', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);
    await service.cancelBooking(hold.id, 10);

    await expect(service.cancelBooking(hold.id, 10)).rejects.toThrow();
  });
});

describe('BookingService.confirmBooking', () => {
  it('confirma uma reserva pendente', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);

    const confirmed = await service.confirmBooking(hold.id);

    expect(confirmed.status).toBe('CONFIRMED');
  });

  it('não permite confirmar uma reserva que já foi cancelada', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);
    await service.cancelBooking(hold.id, 10);

    await expect(service.confirmBooking(hold.id)).rejects.toThrow();
  });
});

describe('BookingService.markNoShow', () => {
  const pastSlot = {
    ...sampleHold,
    start: new Date(Date.now() - 2 * 60 * 60 * 1000),
    end: new Date(Date.now() - 60 * 60 * 1000),
  };

  it('marca como não comparecimento uma reserva confirmada cujo horário já passou', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(pastSlot);
    await service.payHold(hold.id, 10, 'PIX');

    const result = await service.markNoShow(hold.id);

    expect(result.status).toBe('NO_SHOW');
  });

  it('rejeita marcar não comparecimento antes do horário da reserva terminar', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);
    await service.payHold(hold.id, 10, 'PIX');

    await expect(service.markNoShow(hold.id)).rejects.toThrow();
  });

  it('rejeita marcar não comparecimento em uma reserva já cancelada', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(pastSlot);
    await service.cancelBooking(hold.id, 10);

    await expect(service.markNoShow(hold.id)).rejects.toThrow();
  });
});

describe('BookingService.createManualBooking', () => {
  it('cria a reserva já confirmada, sem cobrar pagamento', async () => {
    const { service, payments } = buildService({ hourlyRate: 100 });

    const booking = await service.createManualBooking(sampleHold);

    expect(booking.status).toBe('CONFIRMED');
    expect(booking.totalAmount).toBe(200);
    expect(booking.payment).toBeNull();
    expect(payments.chargeCalls).toHaveLength(0);
  });

  it('rejeita quando o horário já está ocupado', async () => {
    const { service } = buildService();
    await service.createManualBooking(sampleHold);

    await expect(
      service.createManualBooking({ ...sampleHold, customerId: 20, start: new Date('2026-10-01T19:00:00Z'), end: new Date('2026-10-01T21:00:00Z') }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejeita quando a quadra não está disponível', async () => {
    const { service } = buildService({ courtStatus: 'INACTIVE' });

    await expect(service.createManualBooking(sampleHold)).rejects.toThrow('indisponível');
  });

  it('notifica o cliente da reserva de encaixe', async () => {
    const { service, notifications, repository } = buildService();

    const booking = await service.createManualBooking(sampleHold);

    expect(notifications.sent).toHaveLength(1);
    expect(repository.notifications).toEqual([expect.objectContaining({ bookingId: booking.id })]);
  });
});

describe('BookingService.cancelAsAdmin', () => {
  it('cancela a reserva de qualquer cliente, sem checar propriedade', async () => {
    const { service } = buildService();
    const hold = await service.holdBooking(sampleHold);
    await service.payHold(hold.id, 10, 'PIX');

    const cancelled = await service.cancelAsAdmin(hold.id);

    expect(cancelled.status).toBe('CANCELLED');
  });
});
