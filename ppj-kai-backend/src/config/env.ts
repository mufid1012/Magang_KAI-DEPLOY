import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const MIN_JWT_SECRET_LENGTH = 32;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`FATAL: JWT_SECRET must be set and contain at least ${MIN_JWT_SECRET_LENGTH} characters.`);
  }
  return secret;
}

export function getAllowedOrigins(): string[] {
  const configured = process.env.FRONTEND_URL
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (configured?.length) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: FRONTEND_URL must be set in production. Use commas for multiple origins.');
  }
  return ['http://localhost:3000'];
}

/**
 * Proxy hops in front of the API. The server binds to loopback behind nginx, so without this
 * every client shares nginx's IP and one user's failed logins lock everybody out.
 */
export function getTrustProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS;
  const hops = Number(raw);
  if (raw !== undefined && raw !== '' && (!Number.isSafeInteger(hops) || hops < 0)) {
    throw new Error('FATAL: TRUST_PROXY_HOPS must be a whole number (0 without a reverse proxy, 1 behind nginx).');
  }
  if ((raw === undefined || raw === '') && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: TRUST_PROXY_HOPS must be set in production (1 behind nginx, 0 without a reverse proxy).');
  }
  return raw ? hops : 0;
}

export function validateRuntimeEnvironment(): void {
  getJwtSecret();
  getAllowedOrigins();
  getTrustProxyHops();
}
