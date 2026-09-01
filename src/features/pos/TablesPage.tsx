import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/axios';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchTables, fetchOrders, createOrder } from './api';
import { DiningTable, TABLE_STATUS_LABELS } from './types';

const STATUS_STYLES: Record<DiningTable['status'], string> = {
  FREE: 'bg-green-100 border-green-300 text-green-800',
  OCCUPIED: 'bg-red-100 border-red-300 text-red-800',
  PENDING_ORDER: 'bg-amber-100 border-amber-300 text-amber-800',
  BILL_REQUESTED: 'bg-blue-100 border-blue-300 text-blue-800',
};

const ACTIVE_STATUSES = ['BROUILLON', 'EN_ATTENTE', 'EN_PREPARATION', 'PRETE', 'SERVIE'];

export default function TablesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [establishmentId, setEstablishmentId] = useState<string | undefined>(
    user?.establishmentId ?? undefined
  );

  useEffect(() => {
    fetchTables()
      .then(setTables)
      .finally(() => setIsLoading(false));

    // Un OWNER n'a pas d'établissement fixe : on prend le premier de son
    // organisation pour pouvoir créer des commandes. Un vrai sélecteur
    // multi-établissements reste à construire pour un propriétaire qui gère
    // plusieurs bars en simultané.
    if (!user?.establishmentId) {
      api.get('/establishments').then((res) => {
        const list = res.data.establishments;
        if (list.length > 0) setEstablishmentId(list[0].id);
      });
    }
  }, [user]);

  const handleTableClick = async (table: DiningTable) => {
    if (table.status === 'FREE') {
      const order = await createOrder({ tableId: table.id, establishmentId });
      navigate(`/pos/${order.id}`);
      return;
    }

    const orders = await fetchOrders({ tableId: table.id });
    const active = orders.find((o) => ACTIVE_STATUSES.includes(o.status));
    if (active) {
      navigate(`/pos/${active.id}`);
    }
  };

  const handleCounterSale = async () => {
    const order = await createOrder({ establishmentId });
    navigate(`/pos/${order.id}`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Tables</h1>
        <div className="flex gap-2">
          <Link
            to="/tables/manage"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Gérer les tables
          </Link>
          <button
            onClick={handleCounterSale}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Vente au comptoir
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={`rounded-lg border-2 p-4 text-center shadow-sm ${STATUS_STYLES[table.status]}`}
            >
              <p className="text-lg font-semibold">{table.label}</p>
              <p className="mt-1 text-xs">{TABLE_STATUS_LABELS[table.status]}</p>
            </button>
          ))}
          {tables.length === 0 && (
            <p className="col-span-full text-sm text-slate-400">
              Aucune table configurée pour le moment
            </p>
          )}
        </div>
      )}
    </div>
  );
}
