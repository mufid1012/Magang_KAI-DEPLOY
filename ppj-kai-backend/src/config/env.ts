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

export function validateRuntimeEnvironment(): void {
  getJwtSecret();
  getAllowedOrigins();
}
