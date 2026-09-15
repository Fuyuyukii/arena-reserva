import { isUpcoming } from './my-bookings';
import { Booking } from '../../../core/models/booking.model';

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: 1,
    courtId: 1,
    customerId: 1,
    start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    status: 'CONFIRMED',
    totalAmount: 100,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('isUpcoming', () => {
  it('considera futura uma reserva confirmada cujo horário ainda não passou', () => {
    expect(isUpcoming(booking({ status: 'CONFIRMED' }))).toBe(true);
  });

  it('considera futura uma reserva pendente cujo horário ainda não passou', () => {
    expect(isUpcoming(booking({ status: 'PENDING' }))).toBe(true);
  });

  it('não considera futura uma reserva cujo horário já passou, mesmo confirmada', () => {
    const past = booking({
      status: 'CONFIRMED',
      start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    expect(isUpcoming(past)).toBe(false);
  });

  it('não considera futura uma reserva cancelada, mesmo com horário à frente', () => {
    expect(isUpcoming(booking({ status: 'CANCELLED' }))).toBe(false);
  });

  it('não considera futura uma reserva já concluída', () => {
    expect(isUpcoming(booking({ status: 'COMPLETED' }))).toBe(false);
  });
});
