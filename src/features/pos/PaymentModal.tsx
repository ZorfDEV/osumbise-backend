import { useEffect, useState } from 'react';
import { api } from '@/lib/axios';
import { payOrder, PaymentLine } from './api';

interface CashRegisterWithSession {
  id: string;
  sessions: { id: string }[];
}

interface Props {
  orderId: string;
  total: number;
  onClose: () => void;
  onPaid: () => void;
}

const METHODS: { value: PaymentLine['method']; label: string }[] = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CARD', label: 'Carte' },
  { value: 'TRANSFER', label: 'Virement' },
  { value: 'CREDIT', label: 'Crédit' },
];

export default function PaymentModal({ orderId, total, onClose, onPaid }: Props) {
  const [lines, setLines] = useState<PaymentLine[]>([{ method: 'CASH', amount: total }]);
  const [cashSessionId, setCashSessionId] = useState<string | undefined>();
  const [hasOpenSession, setHasOpenSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api.get('/cash-registers').then((res) => {
      const registers: CashRegisterWithSession[] = res.data.cashRegisters;
      const withOpenSession = registers.find((r) => r.sessions.length > 0);
      if (withOpenSession) {
        setCashSessionId(withOpenSession.sessions[0].id);
      } else {
        setHasOpenSession(false);
      }
    });
  }, []);

  const totalEntered = lines.reduce((sum, l) => sum + (l.amount || 0), 0);
  const remaining = total - totalEntered;

  const updateLine = (index: number, patch: Partial<PaymentLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { method: 'CASH', amount: Math.max(remaining, 0) }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    if (totalEntered < total) {
      setError('Le montant saisi est inférieur au total de la commande');
      return;
    }
    setIsSubmitting(true);
    try {
      await payOrder(orderId, lines, cashSessionId);
      onPaid();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Erreur lors de l’encaissement';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-lg bg-white p-6 sm:rounded-lg">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Encaissement</h2>
        <p className="mb-4 text-sm text-slate-500">
          Total à payer :{' '}
          <span className="font-medium text-slate-900">{total.toLocaleString('fr-FR')} FCFA</span>
        </p>

        {!hasOpenSession && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Aucune session de caisse ouverte : le paiement sera enregistré, mais aucun mouvement
            de caisse ne sera créé.
          </p>
        )}

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={line.method}
                onChange={(e) =>
                  updateLine(i, { method: e.target.value as PaymentLine['method'] })
                }
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={line.amount}
                onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {lines.length > 1 && (
                <button
                  onClick={() => removeLine(i)}
                  aria-label="Retirer cette ligne"
                  className="text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addLine}
          className="mt-3 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          + Ajouter un mode de paiement (paiement mixte)
        </button>

        <p className="mt-4 text-sm text-slate-600">
          Reste à percevoir :{' '}
          <span
            className={remaining > 0 ? 'font-medium text-red-600' : 'font-medium text-green-600'}
          >
            {remaining.toLocaleString('fr-FR')} FCFA
          </span>
        </p>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Encaissement...' : 'Valider le paiement'}
          </button>
        </div>
      </div>
    </div>
  );
}
