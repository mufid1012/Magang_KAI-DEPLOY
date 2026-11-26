import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env';

// Keep the existing one-day session window so a PPJ is not logged out in the
// middle of a field shift. Authentication still re-checks the live DB account
// and role on every request.
const JWT_EXPIRES_IN = '1d';
const JWT_ALGORITHM = 'HS256' as const;

// tv = the account's tokenVersion at login; a password change bumps it and ends older sessions.
export const generateToken = (userId: number, role: string, tokenVersion = 0): string => {
  return jwt.sign({ id: userId, role, tv: tokenVersion }, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
  });
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] });
  } catch (error) {
    return null;
  }
};
