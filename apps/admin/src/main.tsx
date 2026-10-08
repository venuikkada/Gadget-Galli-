import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';

import { Layout } from './components/Layout';
import { Spinner, ToastHost } from './components/ui';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import AreasPage from './pages/AreasPage';
import CatalogPage from './pages/CatalogPage';
import ContentPage from './pages/ContentPage';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import IssueDetailPage from './pages/IssueDetailPage';
import IssuesPage from './pages/IssuesPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import ReportsPage from './pages/ReportsPage';
import SharePage from './pages/SharePage';
import ShopDetailPage from './pages/ShopDetailPage';
import ShopsPage from './pages/ShopsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

function RequireAdmin() {
  const { session, profile, isAdmin, loading } = useAuth();
  if (loading || (session && !profile)) return <Spinner label="Loading…" />;
  if (!session || !isAdmin) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function NotConfigured() {
  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-bold">Connect the admin panel to Supabase</h1>
      <p className="mt-2 text-sm text-slate-600">
        Copy <code>apps/admin/.env.example</code> to <code>apps/admin/.env</code> and set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>pnpm admin</code>. See docs/SETUP.md.
      </p>
    </div>
  );
}

const router = createBrowserRouter([
  { path: '/s/:type/:id', element: <SharePage /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'shops', element: <ShopsPage /> },
          { path: 'shops/:id', element: <ShopDetailPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'problems', element: <IssuesPage /> },
          { path: 'problems/:id', element: <IssueDetailPage /> },
          { path: 'catalog', element: <CatalogPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'content', element: <ContentPage /> },
          { path: 'areas', element: <AreasPage /> },
          { path: 'reports', element: <ReportsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured || location.pathname.startsWith('/s/') ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <ToastHost />
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
);
