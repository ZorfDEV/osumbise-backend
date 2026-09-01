import { NavLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Role } from '@/features/auth/types';

const NAV_ITEMS: { to: string; label: string; roles: Role[] }[] = [
  { to: '/', label: 'Tableau de bord', roles: ['OWNER', 'ADMIN'] },
  { to: '/tables', label: 'Point de vente', roles: ['OWNER', 'ADMIN', 'SERVER', 'CASHIER'] },
  { to: '/products', label: 'Produits', roles: ['OWNER', 'ADMIN', 'STOCK_KEEPER'] },
  { to: '/stock', label: 'Stock', roles: ['OWNER', 'ADMIN', 'STOCK_KEEPER'] },
  { to: '/cash', label: 'Sessions de caisse', roles: ['OWNER', 'ADMIN', 'CASHIER'] },
  { to: '/reports', label: 'Rapports', roles: ['OWNER', 'ADMIN'] },
  { to: '/users', label: 'Utilisateurs', roles: ['OWNER', 'ADMIN'] },
  { to: '/establishments', label: 'Établissements', roles: ['OWNER'] },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const { user } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  return (
    <>
      {/* Fond sombre derrière le menu ouvert, mobile/tablette uniquement */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-56 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <span className="text-lg font-semibold text-slate-900">Osumbise</span>
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="text-slate-400 hover:text-slate-600 lg:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
