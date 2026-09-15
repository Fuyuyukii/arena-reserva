export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type PaymentMethod = 'CREDIT_CARD' | 'PIX';
export type PaymentState = 'APPROVED' | 'REFUNDED';

export interface BookingPayment {
  method: PaymentMethod;
  state: PaymentState;
  transactionId: string | null;
  paidAt: string | null;
}

export interface BookingCustomer {
  name: string;
  email: string;
}

export interface Booking {
  id: number;
  courtId: number;
  customerId: number;
  start: string;
  end: string;
  status: BookingStatus;
  totalAmount: number;
  createdAt: string;
  holdExpiresAt?: string | null;
  notes?: string | null;
  payment?: BookingPayment | null;
  customer?: BookingCustomer | null;
}

export interface HoldBookingInput {
  courtId: number;
  start: string;
  end: string;
  notes?: string;
}
