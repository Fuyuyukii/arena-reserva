export type UserRole = 'CUSTOMER' | 'ADMINISTRATOR';

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: AuthenticatedUser;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  taxId?: string;
}
