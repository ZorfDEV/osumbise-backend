export interface Category {
  id: string;
  name: string;
}

// sellingPrice arrive en string : Prisma sérialise les champs Decimal en JSON
// comme des chaînes, pas des nombres — toujours passer par Number(...) avant
// tout calcul ou affichage
export interface Product {
  id: string;
  name: string;
  sellingPrice: string;
  categoryId: string;
  isActive: boolean;
}

export type TableStatus = 'FREE' | 'OCCUPIED' | 'PENDING_ORDER' | 'BILL_REQUESTED';

export interface DiningTable {
  id: string;
  label: string;
  zone: string | null;
  status: TableStatus;
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  FREE: 'Libre',
  OCCUPIED: 'Occupée',
  PENDING_ORDER: 'Commande en attente',
  BILL_REQUESTED: 'Addition demandée',
};

export type OrderStatus =
  | 'BROUILLON'
  | 'EN_ATTENTE'
  | 'EN_PREPARATION'
  | 'PRETE'
  | 'SERVIE'
  | 'PAYEE'
  | 'FERMEE'
  | 'ANNULEE';

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  note: string | null;
  product: { name: string };
}

export interface Order {
  id: string;
  status: OrderStatus;
  tableId: string | null;
  table: DiningTable | null;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  items: OrderItem[];
}
