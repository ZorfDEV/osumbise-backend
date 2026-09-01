import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import TablesPage from '@/features/pos/TablesPage';
import TablesManagePage from '@/features/pos/TablesManagePage';
import PosOrderPage from '@/features/pos/PosOrderPage';
import ProductsPage from '@/features/products/ProductsPage';
import ProductDetailPage from '@/features/products/ProductDetailPage';
import CategoriesPage from '@/features/products/CategoriesPage';
import UsersPage from '@/features/users/UsersPage';
import EstablishmentsPage from '@/features/establishments/EstablishmentsPage';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';

// Provisoire : chaque écran métier (dashboard, POS, stock...) remplacera ces
// pages au fur et à mesure des prochaines étapes
const Placeholder = ({ title }: { title: string }) => (
  <div className="text-slate-700">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="mt-2 text-sm text-slate-500">Écran à construire.</p>
  </div>
);

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tables" element={<TablesPage />} />
            <Route path="/tables/manage" element={<TablesManagePage />} />
            <Route path="/pos/:orderId" element={<PosOrderPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/stock" element={<Placeholder title="Stock" />} />
            <Route path="/cash" element={<Placeholder title="Sessions de caisse" />} />
            <Route path="/reports" element={<Placeholder title="Rapports" />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/establishments" element={<EstablishmentsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
