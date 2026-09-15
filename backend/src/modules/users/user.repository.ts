import { prisma } from '@/config/prisma';
import { UserRole, User } from './user.types';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  role: UserRole;
  taxId?: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: number): Promise<User | null>;
  findFirstAdmin(): Promise<User | null>;
  findFirstCustomer(): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  updatePassword(id: number, passwordHash: string): Promise<void>;
}

function toDomain(row: {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  active: boolean;
  role: string;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    phone: row.phone,
    active: row.active,
    role: row.role as UserRole,
  };
}

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async findById(id: number): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findFirstAdmin(): Promise<User | null> {
    const row = await prisma.user.findFirst({ where: { role: 'ADMINISTRATOR' }, orderBy: { id: 'asc' } });
    return row ? toDomain(row) : null;
  }

  async findFirstCustomer(): Promise<User | null> {
    const row = await prisma.user.findFirst({ where: { role: 'CUSTOMER' }, orderBy: { id: 'asc' } });
    return row ? toDomain(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        phone: input.phone,
        role: input.role,
        customer: input.role === 'CUSTOMER' ? { create: { taxId: input.taxId } } : undefined,
      },
    });
    return toDomain(row);
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
