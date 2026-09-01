export type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'SERVER' | 'STOCK_KEEPER' | 'COOK';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  establishmentId: string | null;
}
