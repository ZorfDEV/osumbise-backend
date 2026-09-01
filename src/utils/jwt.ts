import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Role } from '@prisma/client';

interface TokenPayload {
  id: string;
  organizationId: string;
  establishmentId: string | null;
  role: Role;
}

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
};

// 24h par défaut — garde cette valeur cohérente avec JWT_EXPIRES_IN dans .env
export const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;

// Express 4 ne capture pas automatiquement les rejets de promesses dans les
// controllers async : sans ça, une erreur Prisma finirait en unhandled rejection
// au lieu de passer par errorHandler.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
