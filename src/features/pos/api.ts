import { api } from '@/lib/axios';
import { Category, Product, DiningTable, Order } from './types';

export const fetchCategories = async (): Promise<Category[]> => {
  const res = await api.get('/categories');
  return res.data.categories;
};

export const fetchProducts = async (): Promise<Product[]> => {
  const res = await api.get('/products', { params: { isActive: true } });
  return res.data.products;
};

export const fetchTables = async (): Promise<DiningTable[]> => {
  const res = await api.get('/tables');
  return res.data.tables;
};

export const createTable = async (payload: {
  label: string;
  zone?: string;
  establishmentId?: string;
}): Promise<DiningTable> => {
  const res = await api.post('/tables', payload);
  return res.data.table;
};

export const updateTable = async (
  id: string,
  payload: { label?: string; zone?: string }
): Promise<DiningTable> => {
  const res = await api.patch(`/tables/${id}`, payload);
  return res.data.table;
};

export const deleteTable = async (id: string): Promise<void> => {
  await api.delete(`/tables/${id}`);
};

export const fetchOrders = async (params: {
  tableId?: string;
  status?: string;
}): Promise<Order[]> => {
  const res = await api.get('/orders', { params });
  return res.data.orders;
};

export const fetchOrder = async (id: string): Promise<Order> => {
  const res = await api.get(`/orders/${id}`);
  return res.data.order;
};

export const createOrder = async (payload: {
  tableId?: string;
  establishmentId?: string;
}): Promise<Order> => {
  const res = await api.post('/orders', payload);
  return res.data.order;
};

// Les endpoints de mutation ci-dessous ne renvoient PAS la commande complète
// avec ses lignes (le backend ne fait pas d'include dessus, voir
// order.controller.ts) — l'appelant doit toujours refaire un fetchOrder()
// après coup plutôt que de se fier à la réponse.
export const addOrderItem = async (
  orderId: string,
  payload: { productId: string; quantity: number }
): Promise<void> => {
  await api.post(`/orders/${orderId}/items`, payload);
};

export const updateOrderItem = async (
  orderId: string,
  itemId: string,
  quantity: number
): Promise<void> => {
  await api.patch(`/orders/${orderId}/items/${itemId}`, { quantity });
};

export const removeOrderItem = async (orderId: string, itemId: string): Promise<void> => {
  await api.delete(`/orders/${orderId}/items/${itemId}`);
};

export const updateOrderStatus = async (orderId: string, status: string): Promise<void> => {
  await api.patch(`/orders/${orderId}/status`, { status });
};

export interface PaymentLine {
  method: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'TRANSFER' | 'CREDIT';
  amount: number;
}

export const payOrder = async (
  orderId: string,
  payments: PaymentLine[],
  cashSessionId?: string
): Promise<void> => {
  await api.post(`/orders/${orderId}/pay`, { payments, cashSessionId });
};
