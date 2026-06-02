import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTonWallet } from '@tonconnect/ui-react';
import { api, clearAuthToken, setAuthToken } from '../api/client';
import type { User } from '../types/api';
import { useTelegram } from './useTelegram';

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDevMode: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';

const mockUser: User = {
  id: 'dev-user-1',
  telegramId: '123456789',
  username: 'devuser',
  firstName: 'Dev',
  lastName: 'User',
  walletAddress: undefined,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { initData } = useTelegram();
  const wallet = useTonWallet();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    const data = initData || window.Telegram?.WebApp?.initData || '';
    if (!data) {
      if (isViteDevMode) {
        setAuthToken('dev-mode-token');
        setToken('dev-mode-token');
        setUser(mockUser);
        setIsDevMode(false);
        setError(null);
        setIsLoading(false);
        return;
      }
      setIsDevMode(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsDevMode(false);

    try {
      const result = await api.auth.telegram(data);
      setAuthToken(result.token);
      sessionStorage.setItem('meus_jwt', result.token);
      setToken(result.token);
      setUser({
        ...result.user,
        telegramId: String(result.user.telegramId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      clearAuthToken();
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [initData]);

  // Restore cached JWT immediately, then refresh auth and user data
  useEffect(() => {
    const cached = sessionStorage.getItem('meus_jwt');
    if (cached) {
      setAuthToken(cached);
      setToken(cached);
    }
    void login();
  }, [login]);

  const isAuthenticated = Boolean(token && user);

  useEffect(() => {
    const address = wallet?.account?.address;
    if (!address || !isAuthenticated) return;
    if (user?.walletAddress === address) return;

    void api.auth
      .connectWallet(address)
      .then((updated) => {
        setUser({
          ...updated,
          telegramId: String(updated.telegramId),
        });
      })
      .catch(() => {});
  }, [wallet?.account?.address, isAuthenticated, user?.walletAddress]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated,
      isDevMode,
      error,
      login,
    }),
    [user, token, isLoading, isDevMode, error, login, isAuthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
