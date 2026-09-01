import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      navigate('/');
    } catch {
      setServerError('Identifiants incorrects');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Connexion</h1>

        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          {...register('email')}
          className="mb-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        {errors.email && <p className="mb-3 text-xs text-red-600">{errors.email.message}</p>}

        <label className="mb-1 block text-sm font-medium text-slate-700">Mot de passe</label>
        <input
          type="password"
          {...register('password')}
          className="mb-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        {errors.password && (
          <p className="mb-3 text-xs text-red-600">{errors.password.message}</p>
        )}

        {serverError && <p className="mb-3 text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
