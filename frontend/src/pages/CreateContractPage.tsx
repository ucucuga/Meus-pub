import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { CreateEscrowRequest, User } from '../types/api';
import {
  commissionLabel,
  formatCommission,
  getCommissionRatePercent,
} from '../utils/commission';
import styles from './CreateContractPage.module.css';

type RoleToggle = 'performer' | 'customer';

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

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '');
}

function formatDate(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function formatTime(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseDeadline(deadlineDate: string, deadlineTime: string): Date | null {
  const dateParts = deadlineDate.split('.').map(Number);
  const timeParts = deadlineTime.split(':').map(Number);
  if (dateParts.length < 3 || timeParts.length < 2) return null;

  const day = dateParts[0];
  const month = dateParts[1];
  const year = dateParts[2];
  const hours = timeParts[0];
  const minutes = timeParts[1];

  if (
    day === undefined ||
    month === undefined ||
    year === undefined ||
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(day) ||
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }
  if (!day || !month || !year) return null;
  if (day < 1 || day > 31) return null;
  if (month < 1 || month > 12) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;

  const date = new Date(year, month - 1, day, hours, minutes);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function CreateContractPage() {
  const navigate = useNavigate();
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const { user } = useAuth();

  const [projectName, setProjectName] = useState('');
  const [roleToggle, setRoleToggle] = useState<RoleToggle>('customer');
  const [telegramId, setTelegramId] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [amountTon, setAmountTon] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterpartySelfError, setCounterpartySelfError] = useState<string | null>(null);

  const parsedDeadline = useMemo(
    () => parseDeadline(deadlineDate.trim(), deadlineTime.trim()),
    [deadlineDate, deadlineTime],
  );

  const deadlineError = useMemo(() => {
    if (!deadlineDate.trim() || !deadlineTime.trim()) return null;
    if (!parsedDeadline) {
      return 'Please enter a valid date (DD.MM.YYYY) and time (HH:MM)';
    }
    if (parsedDeadline.getTime() < Date.now()) {
      return 'Deadline must be in the future';
    }
    if (parsedDeadline.getTime() - Date.now() < 60 * 60 * 1000) {
      return 'Deadline must be at least 1 hour from now';
    }
    return null;
  }, [deadlineDate, deadlineTime, parsedDeadline]);

  const amountNum = parseFloat(amountTon) || 0;
  const commissionPercent = getCommissionRatePercent(amountNum);

  const counterpartyLabel =
    roleToggle === 'customer' ? "Performer's Telegram id" : "Customer's Telegram id";

  const amountLabel = useMemo(() => {
    if (amountNum <= 0) return 'Sum of money';
    return `Sum of money (${commissionLabel(amountNum)})`;
  }, [amountNum]);

  const isSelfCounterparty = (counterparty: User | undefined): boolean => {
    if (!counterparty) return false;
    if (user?.id && counterparty.id === user.id) return true;
    if (
      walletAddress &&
      counterparty.walletAddress &&
      counterparty.walletAddress === walletAddress
    ) {
      return true;
    }
    return false;
  };

  const canSubmit =
    Boolean(projectName.trim()) &&
    Boolean(telegramId.trim()) &&
    Boolean(deadlineDate.trim()) &&
    Boolean(deadlineTime.trim()) &&
    !deadlineError &&
    amountNum >= 0.01 &&
    !counterpartySelfError &&
    !submitting;

  const handleSubmit = async () => {
    setError(null);

    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    if (!telegramId.trim()) {
      setError('Counterparty Telegram id is required');
      return;
    }
    if (!deadlineDate.trim() || !deadlineTime.trim()) {
      setError('Deadline date and time are required');
      return;
    }
    const deadline = parseDeadline(deadlineDate.trim(), deadlineTime.trim());
    if (!deadline) {
      setError('Please enter a valid date (DD.MM.YYYY) and time (HH:MM)');
      return;
    }
    if (deadline.getTime() < Date.now()) {
      setError('Deadline must be in the future');
      return;
    }
    if (deadline.getTime() - Date.now() < 60 * 60 * 1000) {
      setError('Deadline must be at least 1 hour from now');
      return;
    }
    if (!amountNum || amountNum < 0.01) {
      setError('Minimum amount is 0.01 TON');
      return;
    }

    setSubmitting(true);
    try {
      const username = normalizeUsername(telegramId);
      let users;
      try {
        users = await api.users.search(username);
      } catch (searchErr) {
        const is401 =
          searchErr instanceof Error &&
          (searchErr.message.includes('(401)') || searchErr.message.includes('401'));
        if (is401) {
          setError('Session expired, please reconnect your wallet');
          await tonConnectUI.disconnect();
          return;
        }
        throw searchErr;
      }
      const counterpartyUser =
        users.find((u) => u.username?.toLowerCase() === username.toLowerCase()) ?? users[0];

      if (isSelfCounterparty(counterpartyUser)) {
        setCounterpartySelfError('You cannot create a contract with yourself');
        return;
      }

      let freelancerWallet = counterpartyUser?.walletAddress ?? undefined;

      if (roleToggle === 'customer') {
        if (!freelancerWallet) {
          setError('Performer must connect a wallet first');
          return;
        }
        if (walletAddress && freelancerWallet === walletAddress) {
          setCounterpartySelfError('You cannot create a contract with yourself');
          return;
        }
      } else {
        if (!walletAddress) {
          setError('Connect your wallet first');
          return;
        }
        if (!counterpartyUser?.walletAddress) {
          setError('Customer must connect a wallet first');
          return;
        }
        freelancerWallet = walletAddress;
        if (counterpartyUser.walletAddress === walletAddress) {
          setCounterpartySelfError('You cannot create a contract with yourself');
          return;
        }
      }

      const nanotons = Math.floor(amountNum * 1e9).toString();
      const isPerformerCreator = roleToggle === 'performer';

      const payload: CreateEscrowRequest = {
        title: projectName.trim(),
        description: description.trim() || undefined,
        amount: nanotons,
        deadline: deadline.toISOString(),
        role: isPerformerCreator ? 'freelancer' : 'employer',
        freelancerWallet,
        ...(isPerformerCreator && counterpartyUser?.walletAddress
          ? { employerWallet: counterpartyUser.walletAddress }
          : {}),
        freelancerTelegramId: '@' + telegramId.trim(),
      };

      await api.escrows.create(payload);
      navigate('/home', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create contract';
      setError(message);
    } finally {
      setSubmitting(false);
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
          aria-label="Back"
          onClick={() => navigate('/home')}
        >
          <BackIcon />
        </button>
        <h1 className={styles.title}>Creating Contract</h1>
      </header>

      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="projectName">
            Name of project
          </label>
          <input
            id="projectName"
            className={styles.input}
            type="text"
            placeholder="System Design"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>I&apos;m a</span>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${roleToggle === 'performer' ? styles.toggleActive : ''}`}
              onClick={() => setRoleToggle('performer')}
            >
              Performer
            </button>
            <button
              type="button"
              className={`${styles.toggle} ${roleToggle === 'customer' ? styles.toggleActive : ''}`}
              onClick={() => setRoleToggle('customer')}
            >
              Customer
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="counterparty">
            {counterpartyLabel}
          </label>
          <div className={styles.inputWithPrefix}>
            <span className={styles.inputPrefix}>@</span>
            <input
              id="counterparty"
              className={styles.inputNoBorder}
              type="text"
              value={telegramId.replace(/^@/, '')}
              onChange={(e) => {
                setTelegramId(e.target.value.replace(/^@/, ''));
                setCounterpartySelfError(null);
              }}
              placeholder="username"
            />
          </div>
          {counterpartySelfError && (
            <p className={styles.fieldError}>{counterpartySelfError}</p>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Deadline</span>
          <div className={styles.deadlineRow}>
            <input
              id="deadline-date"
              className={styles.input}
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="DD.MM.YYYY"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(formatDate(e.target.value))}
            />
            <input
              id="deadline-time"
              className={styles.input}
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:MM"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(formatTime(e.target.value))}
            />
          </div>
          {deadlineError && <p className={styles.fieldError}>{deadlineError}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="amount">
            {amountLabel}
          </label>
          <div className={styles.amountWrap}>
            <input
              id="amount"
              className={`${styles.input} ${styles.amountInput}`}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="100"
              value={amountTon}
              onChange={(e) => setAmountTon(e.target.value)}
            />
            <span className={styles.amountSuffix}>TON</span>
          </div>
          {amountNum > 0 && (
            <p className={styles.commissionPreview}>
              Commission: {formatCommission(amountNum)} TON ({commissionPercent}%) → You pay:{' '}
              {amountNum.toFixed(2)} TON total
            </p>
          )}
          {amountNum > 0 && (
            <p className={styles.commissionHint}>
              {commissionPercent}% fee is deducted from the escrow amount
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            placeholder="Describe the work to be done..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
          {submitting ? <span className={styles.spinner} /> : 'Create'}
        </button>

        {error && <p className={styles.error}>{error}</p>}
      </form>
    </div>
  );
}
