import { useEffect, useState } from 'react';
import { fetchDashboardSummary, fetchHourlySales, fetchStaffPerformance } from './api';
import { DashboardSummary, HourlySales, StaffPerformance } from './types';
import KpiCard from './KpiCard';
import HourlySalesChart from './HourlySalesChart';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  CARD: 'Carte',
  MOBILE_MONEY: 'Mobile Money',
  TRANSFER: 'Virement',
  CREDIT: 'Crédit',
};

const formatFcfa = (value: number) => `${Math.round(value).toLocaleString('fr-FR')} FCFA`;

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [hourly, setHourly] = useState<HourlySales | null>(null);
  const [staff, setStaff] = useState<StaffPerformance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchDashboardSummary(), fetchHourlySales(), fetchStaffPerformance()])
      .then(([s, h, st]) => {
        setSummary(s);
        setHourly(h);
        setStaff(st);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Chargement...</p>;
  }

  if (!summary) {
    return <p className="text-sm text-red-600">Impossible de charger le tableau de bord.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Tableau de bord</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="CA du jour" value={formatFcfa(summary.revenue)} />
        <KpiCard label="Commandes" value={String(summary.orderCount)} />
        <KpiCard label="Bénéfice" value={formatFcfa(summary.profit)} />
        <KpiCard label="Panier moyen" value={formatFcfa(summary.averageBasket)} />
      </div>

      {hourly && <HourlySalesChart data={hourly.hourly} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Modes de paiement</h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(summary.paymentBreakdown).map(([method, amount]) => (
              <li key={method} className="flex justify-between text-slate-600">
                <span>{PAYMENT_LABELS[method] ?? method}</span>
                <span className="font-medium text-slate-900">{formatFcfa(amount)}</span>
              </li>
            ))}
            {Object.keys(summary.paymentBreakdown).length === 0 && (
              <li className="text-slate-400">Aucun paiement enregistré</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Catégories les plus rentables
          </h2>
          <ul className="space-y-2 text-sm">
            {summary.topCategories.slice(0, 5).map((c) => (
              <li key={c.categoryId} className="flex justify-between text-slate-600">
                <span>{c.name}</span>
                <span className="font-medium text-slate-900">{formatFcfa(c.profit)}</span>
              </li>
            ))}
            {summary.topCategories.length === 0 && (
              <li className="text-slate-400">Aucune donnée</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Produits les plus vendus</h2>
          <ul className="space-y-2 text-sm">
            {summary.topProducts.slice(0, 8).map((p) => (
              <li key={p.productId} className="flex justify-between text-slate-600">
                <span>{p.name}</span>
                <span className="font-medium text-slate-900">{p.quantity}</span>
              </li>
            ))}
            {summary.topProducts.length === 0 && (
              <li className="text-slate-400">Aucune vente aujourd’hui</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Performance des serveurs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Nom</th>
                  <th className="pb-2 font-medium">Commandes</th>
                  <th className="pb-2 font-medium">Ventes</th>
                  <th className="pb-2 font-medium">Annulées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff?.staff.map((s) => (
                  <tr key={s.userId}>
                    <td className="py-2 text-slate-900">{s.name}</td>
                    <td className="py-2 text-slate-600">{s.ordersCreated}</td>
                    <td className="py-2 text-slate-600">{formatFcfa(s.revenue)}</td>
                    <td className="py-2 text-slate-600">{s.cancelled}</td>
                  </tr>
                ))}
                {(!staff || staff.staff.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-2 text-slate-400">
                      Aucune donnée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
