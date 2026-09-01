import { Role } from '@/features/auth/types';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  establishmentId: string | null;
  isActive: boolean;
  establishment?: { name: string } | null;
}

export type AssignableRole = Exclude<Role, 'OWNER'>;
