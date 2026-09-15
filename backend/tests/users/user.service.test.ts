import { UserService } from '@/modules/users/user.service';
import { UserRepository, CreateUserInput } from '@/modules/users/user.repository';
import { User } from '@/modules/users/user.types';
import { TokenService, TokenPayload } from '@/modules/users/token.service';
import { NotificationClient } from '@/clients/NotificationClient';
import { DomainError, UnauthorizedError } from '@/shared/errors';
import bcrypt from 'bcryptjs';

class UserRepositoryFake implements UserRepository {
  users: User[] = [];
  private nextId = 1;

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async findById(id: number): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async findFirstAdmin(): Promise<User | null> {
    return this.users.find((u) => u.role === 'ADMINISTRATOR') ?? null;
  }

  async findFirstCustomer(): Promise<User | null> {
    return this.users.find((u) => u.role === 'CUSTOMER') ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: this.nextId++,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      phone: input.phone ?? null,
      active: true,
      role: input.role,
    };
    this.users.push(user);
    return user;
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    const user = this.users.find((u) => u.id === id);
    if (user) user.passwordHash = passwordHash;
  }
}

class TokenServiceFake implements TokenService {
  sign(payload: TokenPayload): string {
    return `token:${payload.userId}:${payload.role}`;
  }
  verify(token: string): TokenPayload | null {
    const [, id, role] = token.split(':');
    return id ? { userId: Number(id), role } : null;
  }
}

class NotificationClientFake implements NotificationClient {
  sent: string[] = [];
  async send(input: { recipient: string }) {
    this.sent.push(input.recipient);
  }
}

function buildService() {
  const repository = new UserRepositoryFake();
  const tokens = new TokenServiceFake();
  const notifications = new NotificationClientFake();
  const service = new UserService(repository, tokens, notifications);
  return { service, repository, tokens, notifications };
}

describe('UserService.registerCustomer', () => {
  it('cadastra um novo cliente com a senha armazenada de forma criptografada', async () => {
    const { service, repository } = buildService();

    await service.registerCustomer({ name: 'Ana', email: 'ana@example.com', password: 'senha123' });

    const saved = await repository.findByEmail('ana@example.com');
    expect(saved).not.toBeNull();
    expect(saved!.passwordHash).not.toBe('senha123');
    expect(await bcrypt.compare('senha123', saved!.passwordHash)).toBe(true);
  });

  it('rejeita o cadastro quando o e-mail já está em uso', async () => {
    const { service } = buildService();
    await service.registerCustomer({ name: 'Ana', email: 'ana@example.com', password: 'senha123' });

    await expect(
      service.registerCustomer({ name: 'Outra Ana', email: 'ana@example.com', password: 'outrasenha' }),
    ).rejects.toThrow(DomainError);
  });
});

describe('UserService.login', () => {
  it('retorna um token de acesso quando as credenciais estão corretas', async () => {
    const { service } = buildService();
    await service.registerCustomer({ name: 'Ana', email: 'ana@example.com', password: 'senha123' });

    const result = await service.login({ email: 'ana@example.com', password: 'senha123' });

    expect(result.token).toContain('token:');
  });

  it('rejeita o login quando a senha está incorreta', async () => {
    const { service } = buildService();
    await service.registerCustomer({ name: 'Ana', email: 'ana@example.com', password: 'senha123' });

    await expect(service.login({ email: 'ana@example.com', password: 'errada' })).rejects.toThrow(
      UnauthorizedError,
    );
  });
});

describe('UserService.devAdminLogin', () => {
  it('faz login como o primeiro administrador cadastrado, sem senha', async () => {
    const { service, repository } = buildService();
    const admin = await repository.create({
      name: 'Admin',
      email: 'admin@arenareserva.com',
      passwordHash: 'hash-qualquer',
      role: 'ADMINISTRATOR',
    });

    const result = await service.devAdminLogin();

    expect(result.user.id).toBe(admin.id);
    expect(result.user.role).toBe('ADMINISTRATOR');
  });

  it('rejeita quando não há nenhum administrador cadastrado', async () => {
    const { service } = buildService();

    await expect(service.devAdminLogin()).rejects.toThrow(DomainError);
  });
});

describe('UserService.devCustomerLogin', () => {
  it('faz login como o primeiro cliente cadastrado, sem senha', async () => {
    const { service } = buildService();
    const customer = await service.registerCustomer({ name: 'Ana', email: 'ana@example.com', password: 'senha123' });

    const result = await service.devCustomerLogin();

    expect(result.user.id).toBe(customer.id);
    expect(result.user.role).toBe('CUSTOMER');
  });

  it('rejeita quando não há nenhum cliente cadastrado', async () => {
    const { service } = buildService();

    await expect(service.devCustomerLogin()).rejects.toThrow(DomainError);
  });
});

describe('UserService.requestPasswordReset', () => {
  it('envia uma notificação com um token de redefinição para o e-mail cadastrado', async () => {
    const { service, notifications } = buildService();
    await service.registerCustomer({ name: 'Ana', email: 'ana@example.com', password: 'senha123' });

    await service.requestPasswordReset('ana@example.com');

    expect(notifications.sent).toEqual(['ana@example.com']);
  });
});
