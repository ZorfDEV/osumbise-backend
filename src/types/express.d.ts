import { Role } from '@prisma/client';
import { ScopedPrismaClient } from './scopedPrisma';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        establishmentId: string | null;
        role: Role;
      };
      db: ScopedPrismaClient;
    }
  }
}

export {};
