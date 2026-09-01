import { useAuth } from '@/features/auth/AuthContext';

interface Props {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: Props) {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        aria-label="Ouvrir le menu"
        className="text-slate-500 hover:text-slate-900 lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="hidden text-sm text-slate-600 sm:inline">
          {user?.name} <span className="text-slate-400">— {user?.role}</span>
        </span>
        <button
          onClick={() => logout()}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
}
