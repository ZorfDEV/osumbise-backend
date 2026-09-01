import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/axios';
import { createUser } from './api';
import { useAuth } from '@/features/auth/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  CASHIER: 'Caissier',
  SERVER: 'Serveur',
  STOCK_KEEPER: 'Magasinier',
  COOK: 'Cuisinier',
};

const createUserFormSchema = z.object({
  name: z.string().min(2, 'Le nom est requis'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
  role: z.enum(['ADMIN', 'CASHIER', 'SERVER', 'STOCK_KEEPER', 'COOK']),
  establishmentId: z.string().uuid().optional(),
});

type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

interface Props {
  onCreated: () => void;
}

export default function CreateUserForm({ onCreated }: Props) {
  const { user: currentUser } = useAuth();
  const [establishments, setEstablishments] = useState<{ id: string; name: string }[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({ resolver: zodResolver(createUserFormSchema) });

  // Seul un OWNER (pas d'établissement fixe) a besoin de choisir parmi la liste
  useEffect(() => {
    if (!currentUser?.establishmentId) {
      api.get('/establishments').then((res) => setEstablishments(res.data.establishments));
    }
  }, [currentUser]);

  const onSubmit = async (data: CreateUserFormValues) => {
    setServerError(null);
    try {
      await createUser(data);
      onCreated();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Erreur lors de la création';
      setServerError(message);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
        <input
          {...register('name')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          {...register('email')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Mot de passe initial
        </label>
        <input
          type="password"
          {...register('password')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {errors.password && (
          <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Rôle</label>
        <select
          {...register('role')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {!currentUser?.establishmentId && (
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Établissement</label>
          <select
            {...register('establishmentId')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Choisir —</option>
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {serverError && <p className="text-sm text-red-600 sm:col-span-2">{serverError}</p>}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isSubmitting ? 'Création...' : 'Créer l’utilisateur'}
        </button>
      </div>
    </form>
  );
}
