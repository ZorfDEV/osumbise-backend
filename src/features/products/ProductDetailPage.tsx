import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchProduct,
  fetchProducts,
  fetchCategories,
  updateProduct,
  addRecipeItem,
  updateRecipeItem,
  removeRecipeItem,
} from './api';
import { ProductDetail, Product, Category } from './types';
import ProductForm from './ProductForm';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newIngredientId, setNewIngredientId] = useState('');
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    fetchProduct(id).then(setProduct);
  }, [id]);

  useEffect(() => {
    reload();
    fetchProducts().then(setAllProducts);
    fetchCategories().then(setCategories);
  }, [reload]);

  if (!product) {
    return <p className="text-sm text-slate-500">Chargement...</p>;
  }

  const handleToggleActive = async () => {
    if (!id) return;
    await updateProduct(id, { isActive: !product.isActive });
    reload();
  };

  const handleAddIngredient = async () => {
    if (!id || !newIngredientId) return;
    setError(null);
    try {
      await addRecipeItem(id, newIngredientId, newQuantity);
      setNewIngredientId('');
      setNewQuantity(1);
      reload();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Erreur lors de l\u2019ajout';
      setError(message);
    }
  };

  const ingredientOptions = allProducts.filter((p) => p.id !== product.id);

  return (
    <div className="max-w-2xl">
      <Link to="/products" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-900">
        ← Retour aux produits
      </Link>

      {isEditing ? (
        <>
          <h1 className="mb-4 text-2xl font-semibold text-slate-900">Modifier {product.name}</h1>
          <ProductForm
            categories={categories}
            defaultValues={{
              categoryId: product.categoryId,
              name: product.name,
              sellingPrice: Number(product.sellingPrice),
              cost: Number(product.cost),
              unit: product.unit,
              stockMin: Number(product.stockMin),
            }}
            submitLabel="Enregistrer"
            onSubmit={async (data) => {
              if (!id) return;
              await updateProduct(id, data);
              setIsEditing(false);
              reload();
            }}
            onCancel={() => setIsEditing(false)}
          />
        </>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Modifier
            </button>
          </div>
          <p className="mb-6 text-sm text-slate-500">{product.category?.name}</p>

          <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Prix de vente</p>
              <p className="font-medium text-slate-900">
                {Number(product.sellingPrice).toLocaleString('fr-FR')} FCFA
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Coût d’achat</p>
              <p className="font-medium text-slate-900">
                {Number(product.cost).toLocaleString('fr-FR')} FCFA
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Stock actuel</p>
              <p className="font-medium text-slate-900">{Number(product.stockCurrent)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Seuil d’alerte</p>
              <p className="font-medium text-slate-900">{Number(product.stockMin)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Statut</p>
              <p className="font-medium text-slate-900">
                {product.isActive ? 'Actif' : 'Désactivé'}
              </p>
            </div>
          </div>
        </>
      )}

      {!isEditing && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Recette</h2>
            <p className="mb-4 text-xs text-slate-500">
              Ingrédients décrémentés du stock à chaque vente de ce produit. Sans recette, le
              produit se décrémente lui-même (article "simple").
            </p>

            <ul className="mb-4 divide-y divide-slate-100">
              {product.recipeItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-900">{item.ingredientProduct.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      defaultValue={Number(item.quantity)}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value > 0 && id) {
                          updateRecipeItem(id, item.id, value).then(reload);
                        }
                      }}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-slate-500">{item.ingredientProduct.unit}</span>
                    <button
                      onClick={() => id && removeRecipeItem(id, item.id).then(reload)}
                      aria-label="Retirer cet ingrédient"
                      className="text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
              {product.recipeItems.length === 0 && (
                <li className="py-2 text-sm text-slate-400">Aucun ingrédient — produit simple</li>
              )}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newIngredientId}
                onChange={(e) => setNewIngredientId(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">— Ingrédient —</option>
                {ingredientOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={newQuantity}
                onChange={(e) => setNewQuantity(Number(e.target.value))}
                className="w-24 rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
              <button
                onClick={handleAddIngredient}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Ajouter
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <div className="mt-4">
            <button
              onClick={handleToggleActive}
              className="text-sm font-medium text-slate-500 hover:text-red-600"
            >
              {product.isActive ? 'Supprimer ce produit' : 'Réactiver ce produit'}
            </button>
            {product.isActive && (
              <p className="mt-1 text-xs text-slate-400">
                "Supprimer" désactive le produit plutôt que de l’effacer : ses ventes et
                mouvements de stock passés doivent rester consultables dans l’historique. Il
                disparaît du POS mais reste réactivable ici à tout moment.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
