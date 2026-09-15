import { NextFunction, Request, Response } from 'express';
import { JwtTokenService } from '@/modules/users/token.service';
import { UnauthorizedError, ForbiddenError } from '@/shared/errors';

const tokenService = new JwtTokenService();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: number; role: string };
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token de acesso não informado.');
  }

  const payload = tokenService.verify(header.replace('Bearer ', ''));
  if (!payload) {
    throw new UnauthorizedError('Token de acesso inválido ou expirado.');
  }

  req.user = { id: payload.userId, role: payload.role };
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMINISTRATOR') {
    throw new ForbiddenError('Esta operação é restrita a administradores.');
  }
  next();
}
