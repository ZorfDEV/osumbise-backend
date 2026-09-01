export interface Category {
  id: string;
  name: string;
}

export type Unit = 'UNIT' | 'G' | 'KG' | 'ML' | 'CL' | 'L';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: string;
  cost: string;
  unit: Unit;
  stockCurrent: string;
  stockMin: string;
  isActive: boolean;
  categoryId: string;
  category?: { name: string };
}

export interface RecipeItem {
  id: string;
  ingredientProductId: string;
  quantity: string;
  ingredientProduct: { id: string; name: string; unit: Unit };
}

export interface ProductDetail extends Product {
  recipeItems: RecipeItem[];
}
