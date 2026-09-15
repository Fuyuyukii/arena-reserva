import { PaymentMethod } from '@/clients/PaymentClient';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type PaymentState = 'APPROVED' | 'REFUNDED';

export interface BookingPayment {
  method: PaymentMethod;
  state: PaymentState;
  transactionId: string | null;
  paidAt: Date | null;
}

export interface BookingCustomer {
  name: string;
  email: string;
}

export interface Booking {
  id: number;
  courtId: number;
  customerId: number;
  start: Date;
  end: Date;
  status: BookingStatus;
  totalAmount: number;
  createdAt: Date;
  holdExpiresAt?: Date | null;
  notes?: string | null;
  payment?: BookingPayment | null;
  /** Only populated by admin-facing listings (listAll) — customer's own reads don't need it. */
  customer?: BookingCustomer | null;
}

export interface HoldBookingInput {
  courtId: number;
  customerId: number;
  start: Date;
  end: Date;
  notes?: string;
}
