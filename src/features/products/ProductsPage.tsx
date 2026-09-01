import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/axios';
import { fetchCategories, createCategory, fetchProducts, createProduct } from './api';
import { Category, Product, Unit } from './types';
import ProductForm from './ProductForm';

const UNIT_LABELS: Record<Unit, string> = {
  UNIT: 'unité',
  G: 'g',
  KG: 'kg',
  ML: 'ml',
  CL: 'cl',
  L: 'l',
};

export default function ProductsPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [establishmentId, setEstablishmentId] = useState<string | undefined>(
    user?.establishmentId ?? undefined
  );

  const load = () => {
    setIsLoading(true);
    Promise.all([fetchCategories(), fetchProducts()])
      .then(([cats, prods]) => {
        setCategories(cats);
        setProducts(prods);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    // Un OWNER n'a pas d'établissement fixe : on prend le premier de son
    // organisation, comme sur TablesPage
    if (!user?.establishmentId) {
      api.get('/establishments').then((res) => {
        const list = res.data.establishments;
        if (list.length > 0) setEstablishmentId(list[0].id);
      });
    }
  }, [user]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await createCategory(newCategoryName.trim(), establishmentId);
    setNewCategoryName('');
    load();
  };

  const filtered = selectedCategoryId
    ? products.filter((p) => p.categoryId === selectedCategoryId)
    : products;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Produits</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? 'Annuler' : 'Nouveau produit'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <ProductForm
            categories={categories}
            submitLabel="Créer le produit"
            onSubmit={async (data) => {
              await createProduct({ ...data, establishmentId });
              setShowForm(false);
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedCategoryId(null)}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
            !selectedCategoryId
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 text-slate-600'
          }`}
        >
          Toutes
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategoryId(c.id)}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
              selectedCategoryId === c.id
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            {c.name}
          </button>
        ))}
        <button
          onClick={() => setShowCategoryForm((s) => !s)}
          className="whitespace-nowrap rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          + Nouvelle catégorie
        </button>
        <Link
          to="/categories"
          className="whitespace-nowrap text-xs font-medium text-slate-400 underline hover:text-slate-700"
        >
          Gérer les catégories
        </Link>
      </div>

      {showCategoryForm && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Nom de la catégorie"
            autoFocus
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={async () => {
              await handleAddCategory();
              setShowCategoryForm(false);
            }}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ajouter
          </button>
          <button
            onClick={() => setShowCategoryForm(false)}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            Annuler
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Catégorie</th>
                <th className="px-4 py-2 font-medium">Prix</th>
                <th className="px-4 py-2 font-medium">Stock</th>
                <th className="px-4 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <Link
                      to={`/products/${p.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{p.category?.name ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {Number(p.sellingPrice).toLocaleString('fr-FR')} FCFA
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {Number(p.stockCurrent)} {UNIT_LABELS[p.unit]}
                    {Number(p.stockCurrent) <= Number(p.stockMin) && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        Stock bas
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Aucun produit
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
