import { useEffect, useState } from 'react';
import { fetchEstablishments, createEstablishment, updateEstablishment } from './api';
import { Establishment, EstablishmentType } from './types';

const TYPE_LABELS: Record<EstablishmentType, string> = {
  BAR: 'Bar',
  RESTAURANT: 'Restaurant',
  HOTEL: 'Hôtel',
};

export default function EstablishmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<EstablishmentType>('BAR');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<EstablishmentType>('BAR');
  const [editAddress, setEditAddress] = useState('');

  const load = () => {
    setIsLoading(true);
    fetchEstablishments()
      .then(setEstablishments)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createEstablishment({ name: name.trim(), type, address: address.trim() || undefined });
    setName('');
    setAddress('');
    setType('BAR');
    setShowForm(false);
    load();
  };

  const startEdit = (e: Establishment) => {
    setEditingId(e.id);
    setEditName(e.name);
    setEditType(e.type);
    setEditAddress(e.address ?? '');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateEstablishment(editingId, {
      name: editName.trim(),
      type: editType,
      address: editAddress.trim() || undefined,
    });
    setEditingId(null);
    load();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Établissements</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? 'Annuler' : 'Nouvel établissement'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EstablishmentType)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="BAR">Bar</option>
              <option value="RESTAURANT">Restaurant</option>
              <option value="HOTEL">Hôtel</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Adresse (optionnel)
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              onClick={handleCreate}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="space-y-3">
          {establishments.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4">
              {editingId === e.id ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    value={editName}
                    onChange={(ev) => setEditName(ev.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={editType}
                    onChange={(ev) => setEditType(ev.target.value as EstablishmentType)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="BAR">Bar</option>
                    <option value="RESTAURANT">Restaurant</option>
                    <option value="HOTEL">Hôtel</option>
                  </select>
                  <input
                    value={editAddress}
                    onChange={(ev) => setEditAddress(ev.target.value)}
                    placeholder="Adresse"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-3 sm:col-span-3">
                    <button
                      onClick={saveEdit}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-sm text-slate-400 hover:text-slate-600"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{e.name}</p>
                    <p className="text-xs text-slate-500">
                      {TYPE_LABELS[e.type]}
                      {e.address ? ` — ${e.address}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(e)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    Modifier
                  </button>
                </div>
              )}
            </div>
          ))}
          {establishments.length === 0 && (
            <p className="text-sm text-slate-400">Aucun établissement</p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        La suppression d’un établissement n’est pas proposée : trop de données en dépendent
        (produits, tables, commandes, utilisateurs...). Il n’y a pas non plus de désactivation
        pour l’instant — à construire si le besoin se présente.
      </p>
    </div>
  );
}
