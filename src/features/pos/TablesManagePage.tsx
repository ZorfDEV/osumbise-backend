import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/axios';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchTables, createTable, updateTable, deleteTable } from './api';
import { DiningTable, TABLE_STATUS_LABELS } from './types';

export default function TablesManagePage() {
  const { user } = useAuth();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newZone, setNewZone] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editZone, setEditZone] = useState('');
  const [establishmentId, setEstablishmentId] = useState<string | undefined>(
    user?.establishmentId ?? undefined
  );
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    fetchTables()
      .then(setTables)
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
    if (!newLabel.trim()) return;
    setError(null);
    try {
      await createTable({
        label: newLabel.trim(),
        zone: newZone.trim() || undefined,
        establishmentId,
      });
      setNewLabel('');
      setNewZone('');
      load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Erreur lors de la création';
      setError(message);
    }
  };

  const startEdit = (t: DiningTable) => {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditZone(t.zone ?? '');
  };

  const saveEdit = async () => {
    if (!editingId || !editLabel.trim()) return;
    await updateTable(editingId, { label: editLabel.trim(), zone: editZone.trim() || undefined });
    setEditingId(null);
    load();
  };

  const handleDelete = async (t: DiningTable) => {
    if (!confirm(`Supprimer la table "${t.label}" ?`)) return;
    setError(null);
    try {
      await deleteTable(t.id);
      load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Erreur lors de la suppression';
      setError(message);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/tables" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-900">
        ← Retour au plan de salle
      </Link>

      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Gérer les tables</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nom (ex. T01)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={newZone}
          onChange={(e) => setNewZone(e.target.value)}
          placeholder="Zone (optionnel)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                <th className="px-4 py-2 font-medium">Zone</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tables.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">
                    {editingId === t.id ? (
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="font-medium text-slate-900">{t.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {editingId === t.id ? (
                      <input
                        value={editZone}
                        onChange={(e) => setEditZone(e.target.value)}
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      t.zone ?? '—'
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{TABLE_STATUS_LABELS[t.status]}</td>
                  <td className="px-4 py-2 text-right">
                    {editingId === t.id ? (
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
                          onClick={() => startEdit(t)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="text-xs font-medium text-slate-400 hover:text-red-600"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {tables.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Aucune table
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Suppression impossible pour une table occupée ou déjà utilisée dans au moins une commande
        (même ancienne) — désactive plutôt son usage en pratique si besoin.
      </p>
    </div>
  );
}
