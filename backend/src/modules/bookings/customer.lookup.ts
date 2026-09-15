import { prisma } from '@/config/prisma';
import { NotFoundError } from '@/shared/errors';

export interface CustomerLookup {
  findIdByUserId(userId: number): Promise<number>;
  findIdByEmail(email: string): Promise<number>;
}

export class PrismaCustomerLookup implements CustomerLookup {
  async findIdByUserId(userId: number): Promise<number> {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) {
      throw new NotFoundError('Este usuário não possui um perfil de cliente.');
    }
    return customer.id;
  }

  async findIdByEmail(email: string): Promise<number> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundError('Nenhum cliente encontrado com esse e-mail.');
    }
    return this.findIdByUserId(user.id);
  }
}
