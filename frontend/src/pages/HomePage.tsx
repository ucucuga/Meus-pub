import { useTonAddress } from '@tonconnect/ui-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ContractCard } from '../components/ContractCard';
import { Logo } from '../components/Logo';
import { useAuth } from '../hooks/useAuth';
import type { Escrow } from '../types/api';
import styles from './HomePage.module.css';

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="white" strokeWidth={1.5} />
      <path
        d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function NewContractIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4h8a2 2 0 0 1 2 2v14l-4-2.5L12 20l-4-2.5L4 20V6a2 2 0 0 1 2-2z"
        stroke="white"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M12 8v6M9 11h6" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function SkeletonCard() {
  return <div className={styles.skeleton} aria-hidden />;
}

export function HomePage() {
  const navigate = useNavigate();
  const walletAddress = useTonAddress();
  const { user, isAuthenticated } = useAuth();
  const [contracts, setContracts] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContracts = useCallback(async () => {
    try {
      setError(null);
      const list = await api.escrows.list();
      const sorted = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setContracts(sorted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load contracts';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    void fetchContracts();

    const interval = window.setInterval(() => {
      void fetchContracts();
    }, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchContracts();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchContracts, isAuthenticated]);

  return (
    <div className={styles.page}>
      <div className={styles.blob1} aria-hidden />
      <div className={styles.blob2} aria-hidden />
      <div className={styles.blob3} aria-hidden />
      <header className={styles.header}>
        <div className={styles.logoWrap}>
          <Logo size="md" />
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Help"
            onClick={() => navigate('/help')}
          >
            ?
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Settings"
            onClick={() => navigate('/settings')}
          >
            <ProfileIcon />
          </button>
        </div>
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>My Contracts</h1>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="New contract"
          onClick={() => navigate('/new')}
        >
          <NewContractIcon />
        </button>
      </div>

      <main className={styles.content}>
        {loading && (
          <div className={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && (error || contracts.length === 0) && (
          <div className={styles.empty}>
            <img src="./duck.svg" alt="" className={styles.duck} width={160} height={160} />
            <p className={styles.emptyText}>No contracts yet</p>
          </div>
        )}

        {!loading && !error && contracts.length > 0 && (
          <div className={styles.list}>
            {contracts.map((escrow) => (
              <ContractCard
                key={escrow.id}
                escrow={escrow}
                currentUserWallet={walletAddress}
                currentUserId={user?.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
