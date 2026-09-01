import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchOrder,
  fetchCategories,
  fetchProducts,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  updateOrderStatus,
} from './api';
import { Order, Category, Product, OrderStatus } from './types';
import PaymentModal from './PaymentModal';

const STATUS_LABELS: Record<OrderStatus, string> = {
  BROUILLON: 'Brouillon',
  EN_ATTENTE: 'En attente',
  EN_PREPARATION: 'En préparation',
  PRETE: 'Prête',
  SERVIE: 'Servie',
  PAYEE: 'Payée',
  FERMEE: 'Fermée',
  ANNULEE: 'Annulée',
};

// BROUILLON -> EN_ATTENTE -> EN_PREPARATION -> PRETE -> SERVIE, puis paiement
// via la modale dédiée (pas ce bouton). Correspond exactement au workflow de
// order.controller.ts côté backend.
const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  BROUILLON: { label: 'Envoyer en cuisine', next: 'EN_ATTENTE' },
  EN_ATTENTE: { label: 'Marquer en préparation', next: 'EN_PREPARATION' },
  EN_PREPARATION: { label: 'Marquer prête', next: 'PRETE' },
  PRETE: { label: 'Marquer servie', next: 'SERVIE' },
};

const EDITABLE_STATUSES: OrderStatus[] = ['BROUILLON', 'EN_ATTENTE'];

const formatFcfa = (value: number) => `${value.toLocaleString('fr-FR')} FCFA`;

export default function PosOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [view, setView] = useState<'products' | 'cart'>('products');
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadOrder = useCallback(() => {
    if (!orderId) return;
    fetchOrder(orderId).then(setOrder);
  }, [orderId]);

  useEffect(() => {
    reloadOrder();
    fetchCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setSelectedCategoryId(cats[0].id);
    });
    fetchProducts().then(setProducts);
  }, [reloadOrder]);

  if (!order) {
    return <p className="text-sm text-slate-500">Chargement...</p>;
  }

  const isEditable = EDITABLE_STATUSES.includes(order.status);
  const total = Number(order.total);
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

  const handleAddProduct = async (product: Product) => {
    if (!orderId) return;
    try {
      await addOrderItem(orderId, { productId: product.id, quantity: 1 });
      reloadOrder();
    } catch {
      setError('Impossible d’ajouter ce produit');
    }
  };

  const handleQuantityChange = async (itemId: string, quantity: number) => {
    if (!orderId) return;
    if (quantity <= 0) {
      await removeOrderItem(orderId, itemId);
    } else {
      await updateOrderItem(orderId, itemId, quantity);
    }
    reloadOrder();
  };

  const handleNextStatus = async () => {
    if (!orderId) return;
    const action = NEXT_ACTION[order.status];
    if (!action) return;
    await updateOrderStatus(orderId, action.next);
    reloadOrder();
  };

  const handleCancel = async () => {
    if (!orderId) return;
    if (!confirm('Annuler cette commande ?')) return;
    await updateOrderStatus(orderId, 'ANNULEE');
    navigate('/tables');
  };

  const filteredProducts = products.filter(
    (p) => !selectedCategoryId || p.categoryId === selectedCategoryId
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {order.table ? `Table ${order.table.label}` : 'Vente au comptoir'}
          </h1>
          <p className="text-xs text-slate-500">Statut : {STATUS_LABELS[order.status]}</p>
        </div>
        {/* Bascule Produits/Commande — mobile et tablette uniquement */}
        <div className="flex gap-1 rounded-md border border-slate-300 p-1 lg:hidden">
          <button
            onClick={() => setView('products')}
            className={`rounded px-3 py-1 text-xs font-medium ${
              view === 'products' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Produits
          </button>
          <button
            onClick={() => setView('cart')}
            className={`rounded px-3 py-1 text-xs font-medium ${
              view === 'cart' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Commande ({itemCount})
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[1fr_360px]">
        {/* Panneau produits */}
        <div className={`${view === 'products' ? 'block' : 'hidden'} lg:block`}>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategoryId(c.id)}
                className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${
                  selectedCategoryId === c.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => isEditable && handleAddProduct(p)}
                disabled={!isEditable}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="text-sm font-medium text-slate-900">{p.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatFcfa(Number(p.sellingPrice))}
                </p>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <p className="col-span-full text-sm text-slate-400">
                Aucun produit dans cette catégorie
              </p>
            )}
          </div>
        </div>

        {/* Panneau commande */}
        <div className={`${view === 'cart' ? 'block' : 'hidden'} lg:block`}>
          <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white">
            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatFcfa(Number(item.unitPrice))} × {item.quantity}
                    </p>
                  </div>
                  {isEditable ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                        className="h-7 w-7 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                        className="h-7 w-7 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-slate-900">
                      {formatFcfa(Number(item.unitPrice) * item.quantity)}
                    </span>
                  )}
                </div>
              ))}
              {order.items.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  Aucun article — touchez un produit pour l’ajouter
                </p>
              )}
            </div>

            <div className="border-t border-slate-200 p-4">
              <div className="mb-3 flex justify-between text-base font-semibold text-slate-900">
                <span>Total</span>
                <span>{formatFcfa(total)}</span>
              </div>

              {order.status === 'SERVIE' ? (
                <button
                  onClick={() => setIsPaying(true)}
                  className="w-full rounded-md bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  Encaisser
                </button>
              ) : NEXT_ACTION[order.status] ? (
                <button
                  onClick={handleNextStatus}
                  disabled={order.items.length === 0}
                  className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {NEXT_ACTION[order.status]!.label}
                </button>
              ) : (
                <p className="text-center text-sm text-slate-500">{STATUS_LABELS[order.status]}</p>
              )}

              {isEditable && (
                <button
                  onClick={handleCancel}
                  className="mt-2 w-full text-center text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  Annuler la commande
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isPaying && (
        <PaymentModal
          orderId={order.id}
          total={total}
          onClose={() => setIsPaying(false)}
          onPaid={() => {
            setIsPaying(false);
            navigate('/tables');
          }}
        />
      )}
    </div>
  );
}
