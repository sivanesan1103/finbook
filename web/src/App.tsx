import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Parties from './pages/Parties';
import BulkImport from './pages/BulkImport';
import Expenses from './pages/Expenses';
import Cashbook from './pages/Cashbook';
import Items from './pages/Items';
import Invoices from './pages/Invoices';
import Staff from './pages/Staff';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import PublicEntry from './pages/PublicEntry';
import { ConfirmProvider, Spinner, ToastProvider } from './components/ui';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center"><Spinner /></div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ToastProvider>
        <ConfirmProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/t/:token" element={<PublicEntry />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/" element={<Navigate to="/customers" replace />} />
              <Route path="/customers" element={<Parties key="c" type="CUSTOMER" />} />
              <Route path="/suppliers" element={<Parties key="s" type="SUPPLIER" />} />
              <Route path="/bulk-import/customers" element={<BulkImport key="bc" type="CUSTOMER" />} />
              <Route path="/bulk-import/suppliers" element={<BulkImport key="bs" type="SUPPLIER" />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/cashbook" element={<Cashbook />} />
              <Route path="/items" element={<Items />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
