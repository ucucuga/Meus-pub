import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../hooks/useAuth';
import styles from './EntryPage.module.css';

function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5C4 6.12 5.12 5 6.5 5H17a3 3 0 0 1 3 3v1.25M4 10.5V17a2.5 2.5 0 0 0 2.5 2.5H19a2 2 0 0 0 2-2v-5.75M20 12h-4a1.5 1.5 0 0 0 0 3h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EntryPage() {
  const address = useTonAddress();
  const navigate = useNavigate();
  const [tonConnectUI] = useTonConnectUI();
  const { isLoading: authLoading, isDevMode, login } = useAuth();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (address) {
      navigate('/home', { replace: true });
    }
  }, [address, navigate]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await tonConnectUI.openModal();
    } finally {
      setConnecting(false);
    }
  };

  if (isDevMode) {
    return (
      <div className={styles.page}>
        <section className={styles.top}>
          <Logo size="lg" />
          <p className={styles.devTitle}>Open in Telegram</p>
          <p className={styles.devText}>
            Meus runs as a Telegram Mini App. Open @meus_escrow_bot in Telegram to continue.
          </p>
          <button type="button" className={styles.retryButton} onClick={() => void login()}>
            Retry
          </button>
        </section>
      </div>
    );
  }

  const walletBusy = connecting || authLoading;

  return (
    <div className={styles.page}>
      <section className={styles.top}>
        <p className={styles.welcome}>Welcome to</p>
        <Logo size="lg" />
        <p className={styles.subtitle}>Start creating your Smart Contracts</p>
      </section>
      <section className={styles.bottom}>
        <button
          type="button"
          className={styles.connectButton}
          onClick={() => void handleConnect()}
          disabled={authLoading || walletBusy}
        >
          <span className={styles.walletIconWrap}>
            {walletBusy ? <span className={styles.spinner} /> : <WalletIcon />}
          </span>
          <span className={styles.connectText}>
            Connect your <strong>Wallet</strong>
          </span>
        </button>
      </section>
    </div>
  );
}
