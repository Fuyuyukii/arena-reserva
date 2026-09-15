export type PaymentMethod = 'CREDIT_CARD' | 'PIX';

export interface ChargeInput {
  amount: number;
  method: PaymentMethod;
  reference: string;
}

export interface ChargeResult {
  approved: boolean;
  transactionId: string;
}

export interface RefundResult {
  refunded: boolean;
}

export interface PaymentClient {
  charge(input: ChargeInput): Promise<ChargeResult>;
  refund(transactionId: string): Promise<RefundResult>;
}

export class SimulatedPaymentClient implements PaymentClient {
  async charge(input: ChargeInput): Promise<ChargeResult> {
    return {
      approved: true,
      transactionId: `sim_${input.reference}_${Date.now()}`,
    };
  }

  async refund(_transactionId: string): Promise<RefundResult> {
    return { refunded: true };
  }
}
