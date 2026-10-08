import { Role } from '@prisma/client';
import { ScopedPrismaClient } from '../utils/scopedPrisma';

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
      // Corps brut de la requête, capturé pour vérifier la signature HMAC
      // des webhooks (ex. Airtel Money) — voir app.ts et webhook.controller.ts
      rawBody?: Buffer;
    }
  }
}

export {};
