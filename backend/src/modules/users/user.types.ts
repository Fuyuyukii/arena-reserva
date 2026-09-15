export type UserRole = 'CUSTOMER' | 'ADMINISTRATOR';

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  active: boolean;
  role: UserRole;
}

export interface RegisterCustomerInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  taxId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
