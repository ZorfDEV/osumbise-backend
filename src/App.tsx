import { AuthProvider } from '@/features/auth/AuthContext';
import AppRouter from '@/routes/AppRouter';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
