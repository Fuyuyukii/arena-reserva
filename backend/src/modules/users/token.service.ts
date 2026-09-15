import jwt from 'jsonwebtoken';
import { env } from '@/config/env';

export interface TokenPayload {
  userId: number;
  role: string;
}

export interface TokenService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload | null;
}

export class JwtTokenService implements TokenService {
  sign(payload: TokenPayload): string {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
  }

  verify(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, env.jwtSecret) as unknown as TokenPayload;
    } catch {
      return null;
    }
  }
}
