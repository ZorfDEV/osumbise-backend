import { api } from '@/lib/axios';
import { Category, Product, ProductDetail } from './types';

export const fetchCategories = async (): Promise<Category[]> => {
  const res = await api.get('/categories');
  return res.data.categories;
};

export const createCategory = async (name: string, establishmentId?: string): Promise<Category> => {
  const res = await api.post('/categories', { name, establishmentId });
  return res.data.category;
};

export const updateCategory = async (id: string, name: string): Promise<Category> => {
  const res = await api.patch(`/categories/${id}`, { name });
  return res.data.category;
};

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(`/categories/${id}`);
};

export const fetchProducts = async (): Promise<Product[]> => {
  const res = await api.get('/products');
  return res.data.products;
};

export const fetchProduct = async (id: string): Promise<ProductDetail> => {
  const res = await api.get(`/products/${id}`);
  return res.data.product;
};

export interface ProductPayload {
  categoryId?: string;
  name?: string;
  sellingPrice?: number;
  cost?: number;
  unit?: string;
  stockMin?: number;
  isActive?: boolean;
  establishmentId?: string;
}

export const createProduct = async (payload: ProductPayload): Promise<Product> => {
  const res = await api.post('/products', payload);
  return res.data.product;
};

export const updateProduct = async (id: string, payload: ProductPayload): Promise<Product> => {
  const res = await api.patch(`/products/${id}`, payload);
  return res.data.product;
};

export const addRecipeItem = async (
  productId: string,
  ingredientProductId: string,
  quantity: number
): Promise<void> => {
  await api.post(`/products/${productId}/recipe-items`, { ingredientProductId, quantity });
};

export const updateRecipeItem = async (
  productId: string,
  recipeItemId: string,
  quantity: number
): Promise<void> => {
  await api.patch(`/products/${productId}/recipe-items/${recipeItemId}`, { quantity });
};

export const removeRecipeItem = async (productId: string, recipeItemId: string): Promise<void> => {
  await api.delete(`/products/${productId}/recipe-items/${recipeItemId}`);
};
