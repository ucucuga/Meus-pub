import { useTonAddress } from '@tonconnect/ui-react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { CreateContractPage } from './pages/CreateContractPage';
import { DisputePage } from './pages/DisputePage';
import { EntryPage } from './pages/EntryPage';
import { HelpPage } from './pages/HelpPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';

const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const walletAddress = useTonAddress();
  const location = useLocation();

  if (!walletAddress && !isViteDevMode) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/new"
        element={
          <ProtectedRoute>
            <CreateContractPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/escrow/:id"
        element={
          <ProtectedRoute>
            <ContractDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <HelpPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dispute/:id"
        element={
          <ProtectedRoute>
            <DisputePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
