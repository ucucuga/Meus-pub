import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { HashRouter } from 'react-router-dom';
import { AppRouter } from './router';
import { AuthProvider } from './hooks/useAuth';

export function App() {
  return (
    <TonConnectUIProvider manifestUrl="https://hilarious-blini-f529d3.netlify.app/tonconnect-manifest.json">
      <AuthProvider>
        <HashRouter>
          <AppRouter />
        </HashRouter>
      </AuthProvider>
    </TonConnectUIProvider>
  );
}
