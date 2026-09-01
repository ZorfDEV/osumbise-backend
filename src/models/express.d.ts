import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        establishmentId: string | null;
        role: Role;
      };
    }
  }
}

export {};
