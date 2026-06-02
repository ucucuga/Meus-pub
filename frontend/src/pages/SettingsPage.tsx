import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { truncateWallet } from '../utils/format';
import styles from './SettingsPage.module.css';

const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getInitials(
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  } | null,
): string {
  const first = user?.firstName?.trim();
  const last = user?.lastName?.trim();
  const username = user?.username;
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first) {
    return first.slice(0, 2).toUpperCase();
  }
  if (username) {
    const clean = username.replace(/^@/, '');
    return clean.slice(0, 2).toUpperCase();
  }
  return '?';
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const connectedWallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [notificationsOn, setNotificationsOn] = useState(true);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [pressing, setPressing] = useState(false);

  const displayName = useMemo(() => {
    if (!user) return '';
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '';
  }, [user]);

  const walletDisplay = connectedWallet ?? user?.walletAddress ?? null;

  const fetchCompletedCount = useCallback(async () => {
    if (isViteDevMode) {
      setCompletedCount(3);
      return;
    }
    try {
      const list = await api.escrows.list({ status: 'COMPLETED' });
      setCompletedCount(list.length);
    } catch {
      setCompletedCount(0);
    }
  }, []);

  useEffect(() => {
    void fetchCompletedCount();
  }, [fetchCompletedCount]);

  const walletTruncated = useMemo(() => {
    if (!walletDisplay) return null;
    return truncateWallet(walletDisplay);
  }, [walletDisplay]);

  const handleSave = () => {
    setPressing(true);
    window.setTimeout(() => setPressing(false), 300);
  };

  const handleDisconnect = async () => {
    await tonConnectUI.disconnect();
    navigate('/');
  };

  const openSupportLink = () => {
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink('https://t.me/meus_escrow_help');
    } else {
      window.open('https://t.me/meus_escrow_help', '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.blob1} aria-hidden />
      <div className={styles.blob2} aria-hidden />
      <div className={styles.blob3} aria-hidden />
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          aria-label="Go back"
          onClick={() => navigate(-1)}
        >
          <BackIcon />
        </button>
      </header>

      <div className={styles.scroll}>
        <div className={styles.avatarSection}>
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.username ?? ''}
              className={styles.avatarImage}
            />
          ) : (
            <span className={styles.avatarInitials}>{getInitials(user)}</span>
          )}
          <p className={styles.username}>@{user?.username || 'username'}</p>
        </div>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-name">
              Name
            </label>
            <input
              id="settings-name"
              className={`${styles.input} ${styles.readOnly}`}
              type="text"
              value={displayName}
              readOnly
              tabIndex={-1}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-wallet">
              Wallet address
            </label>
            <div className={styles.walletRow}>
              <input
                id="settings-wallet"
                className={`${styles.input} ${styles.readOnly} ${styles.walletInput}`}
                type="text"
                value={walletTruncated ?? ''}
                placeholder="Not connected"
                readOnly
                tabIndex={-1}
              />
              <button
                type="button"
                className={styles.plusButton}
                aria-label="Change wallet"
                onClick={() => tonConnectUI.openModal()}
              >
                +
              </button>
            </div>
            <p className={styles.walletHint}>Change wallet</p>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Number of completed orders</span>
            <div className={styles.valueDisplay}>
              {completedCount === null ? '…' : completedCount}
            </div>
            <p className={styles.valueHint}>Synced from blockchain</p>
          </div>

          <div className={styles.field}>
            <div className={styles.toggleRow}>
              <span className={styles.label}>Notifications</span>
              <button
                type="button"
                role="switch"
                aria-checked={notificationsOn}
                className={`${styles.toggle} ${notificationsOn ? styles.toggleOn : ''}`}
                onClick={() => setNotificationsOn((v) => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          className={`${styles.saveBtn} ${pressing ? styles.saveBtnPressing : ''}`}
          onClick={handleSave}
        >
          Save changes
        </button>

        <button type="button" className={styles.disconnect} onClick={() => void handleDisconnect()}>
          Disconnect wallet
        </button>

        <p className={styles.supportText}>
          For any questions please contact{' '}
          <span className={styles.supportLink} onClick={openSupportLink}>
            @meus_escrow_help
          </span>
        </p>

        <p className={styles.version}>Meus v0.1.0 · Testnet</p>
      </div>
    </div>
  );
}
