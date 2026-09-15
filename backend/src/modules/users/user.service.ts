import bcrypt from 'bcryptjs';
import { NotificationClient } from '@/clients/NotificationClient';
import { DomainError, UnauthorizedError } from '@/shared/errors';
import { UserRepository } from './user.repository';
import { TokenService } from './token.service';
import { RegisterCustomerInput, LoginInput, User } from './user.types';

const SALT_ROUNDS = 10;

export interface LoginResult {
  token: string;
  user: Pick<User, 'id' | 'name' | 'email' | 'role'>;
}

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationClient,
  ) {}

  async registerCustomer(input: RegisterCustomerInput): Promise<User> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new DomainError('Este e-mail já está cadastrado.');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    return this.users.create({
      name: input.name,
      email: input.email,
      passwordHash,
      phone: input.phone,
      taxId: input.taxId,
      role: 'CUSTOMER',
    });
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    return this.buildLoginResult(user);
  }

  /**
   * Dev-only shortcut so nobody has to remember the seeded admin's password while testing
   * locally. The route wiring this up (POST /users/dev-admin-login) refuses to run at all
   * outside development — see config/env.ts and user.routes.ts — this method itself doesn't
   * re-check that, so it must never be reachable from a route without that guard.
   */
  async devAdminLogin(): Promise<LoginResult> {
    const admin = await this.users.findFirstAdmin();
    if (!admin) {
      throw new DomainError('Nenhum administrador cadastrado ainda — rode o seed.', 404);
    }
    return this.buildLoginResult(admin);
  }

  /** Same dev-only shortcut as devAdminLogin, but for a seeded customer account. */
  async devCustomerLogin(): Promise<LoginResult> {
    const customer = await this.users.findFirstCustomer();
    if (!customer) {
      throw new DomainError('Nenhum cliente cadastrado ainda — rode o seed.', 404);
    }
    return this.buildLoginResult(customer);
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      return null;
    }

    const token = this.tokens.sign({ userId: user.id, role: user.role });
    await this.notifications.send({
      recipient: user.email,
      subject: 'Recuperação de senha - ArenaReserva',
      message: `Use o código a seguir para redefinir sua senha: ${token}`,
    });
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const payload = this.tokens.verify(token);
    if (!payload) {
      throw new UnauthorizedError('Token de redefinição inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.users.updatePassword(payload.userId, passwordHash);
  }

  private buildLoginResult(user: User): LoginResult {
    const token = this.tokens.sign({ userId: user.id, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}
