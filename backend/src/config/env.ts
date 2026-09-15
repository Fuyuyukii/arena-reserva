import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  // The 'dev-secret' fallback below only exists for local convenience — never let it
  // silently apply in production, where anyone could forge a valid token from it.
  throw new Error('JWT_SECRET é obrigatório em produção (NODE_ENV=production).');
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
};
