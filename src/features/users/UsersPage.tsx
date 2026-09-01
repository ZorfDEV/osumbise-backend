import { useEffect, useState } from 'react';
import { fetchUsers, updateUser } from './api';
import { AppUser, AssignableRole } from './types';
import { useAuth } from '@/features/auth/AuthContext';
import CreateUserForm from './CreateUserForm';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  CASHIER: 'Caissier',
  SERVER: 'Serveur',
  STOCK_KEEPER: 'Magasinier',
  COOK: 'Cuisinier',
};

const ASSIGNABLE_ROLES: AssignableRole[] = ['ADMIN', 'CASHIER', 'SERVER', 'STOCK_KEEPER', 'COOK'];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setIsLoading(true);
    fetchUsers()
      .then(setUsers)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleActive = async (u: AppUser) => {
    await updateUser(u.id, { isActive: !u.isActive });
    load();
  };

  const handleRoleChange = async (u: AppUser, role: string) => {
    await updateUser(u.id, { role: role as AssignableRole });
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Utilisateurs</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? 'Annuler' : 'Ajouter un utilisateur'}
        </button>
      </div>

      {showForm && (
        <CreateUserForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Rôle</th>
                <th className="px-4 py-2 font-medium">Établissement</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-900">{u.name}</td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2">
                    {u.role === 'OWNER' || u.id === currentUser?.id ? (
                      <span className="text-slate-600">{ROLE_LABELS[u.role]}</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.establishment?.name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {u.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {u.role !== 'OWNER' && u.id !== currentUser?.id && (
                      <button
                        onClick={() => handleToggleActive(u)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        {u.isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
