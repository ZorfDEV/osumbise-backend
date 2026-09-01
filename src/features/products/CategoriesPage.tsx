import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/axios';
import { fetchCategories, createCategory, updateCategory, deleteCategory } from './api';
import { Category } from './types';

export default function CategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [establishmentId, setEstablishmentId] = useState<string | undefined>(
    user?.establishmentId ?? undefined
  );

  const load = () => {
    setIsLoading(true);
    fetchCategories()
      .then(setCategories)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    if (!user?.establishmentId) {
      api.get('/establishments').then((res) => {
        const list = res.data.establishments;
        if (list.length > 0) setEstablishmentId(list[0].id);
      });
    }
  }, [user]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setError(null);
    await createCategory(newName.trim(), establishmentId);
    setNewName('');
    load();
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditingName(c.name);
  };

  const saveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    await updateCategory(editingId, editingName.trim());
    setEditingId(null);
    load();
  };

  const handleDelete = async (c: Category) => {
    if (!confirm(`Supprimer la catégorie "${c.name}" ?`)) return;
    setError(null);
    try {
      await deleteCategory(c.id);
      load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Erreur lors de la suppression';
      setError(message);
    }
  };

  return (
    <div className="max-w-xl">
      <Link to="/products" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-900">
        ← Retour aux produits
      </Link>

      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Catégories</h1>

      <div className="mb-4 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Nouvelle catégorie"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleCreate}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Ajouter
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    {editingId === c.id ? (
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        autoFocus
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-slate-900">{c.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editingId === c.id ? (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={saveEdit}
                          className="text-xs font-medium text-slate-900 hover:underline"
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="text-xs font-medium text-slate-400 hover:text-red-600"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                    Aucune catégorie
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Une catégorie encore utilisée par au moins un produit ne peut pas être supprimée — il
        faut d’abord changer la catégorie de ces produits ou les désactiver.
      </p>
    </div>
  );
}
