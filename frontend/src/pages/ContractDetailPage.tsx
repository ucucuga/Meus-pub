import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { Logo } from '../components/Logo';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useCountdown } from '../hooks/useCountdown';
import type { Escrow } from '../types/api';
import { buildDepositPayload, depositValidUntil } from '../utils/escrowDeposit';
import {
  formatClientLabel,
  formatDeadline,
  formatTonFromNanotons,
} from '../utils/format';
import { startEscrowStatusPoll } from '../utils/escrowStatusPoll';
import styles from './ContractDetailPage.module.css';

const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';
const DEV_FREELANCER_MOCKS = ['mock-2', 'mock-5'];
const DEFAULT_WORK_DESCRIPTION = 'Delivered via Telegram messages';

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5"
        stroke="currentColor"
        strokeWidth="1.6"
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
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8v6M9 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const connectedWallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const { user } = useAuth();

  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmingBlockchain, setConfirmingBlockchain] = useState(false);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const [workDescription, setWorkDescription] = useState('');
  const [modal, setModal] = useState<{
    type: 'approve' | 'dispute' | null;
  }>({ type: null });
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false);

  const fetchEscrow = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.escrows.get(id);
      setEscrow(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load contract';
      setError(message);
      setEscrow(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchEscrow();
  }, [fetchEscrow]);

  useEffect(() => {
    if (!escrow?.id) return;
    const key = `evidence_submitted_${escrow.id}`;
    setEvidenceSubmitted(sessionStorage.getItem(key) === 'true');
  }, [escrow?.id, location.pathname]);

  const { isEmployer, isFreelancer } = useMemo(() => {
    if (!escrow) {
      return { isEmployer: false, isFreelancer: false };
    }

    if (isViteDevMode) {
      const devIsFreelancer = DEV_FREELANCER_MOCKS.includes(escrow.id);
      return {
        isEmployer: !devIsFreelancer,
        isFreelancer: devIsFreelancer,
      };
    }

    const employer =
      escrow.employerWallet === connectedWallet ||
      (user?.id !== undefined && escrow.employerId === user.id);
    const freelancer =
      escrow.freelancerWallet === connectedWallet ||
      (user?.id !== undefined && escrow.freelancerId === user.id);

    return { isEmployer: employer, isFreelancer: freelancer && !employer };
  }, [escrow, connectedWallet, user?.id]);

  const deadlineCountdown = useCountdown(
    escrow?.status === 'FUNDED' ? escrow.deadline : undefined,
  );
  const reviewCountdown = useCountdown(
    escrow?.status === 'SUBMITTED' ? escrow.reviewDeadline ?? undefined : undefined,
  );

  const disputeEvidenceDeadlineIso = useMemo(() => {
    if (escrow?.status !== 'DISPUTE' || !escrow.updatedAt) return undefined;
    return new Date(
      new Date(escrow.updatedAt).getTime() + 48 * 60 * 60 * 1000,
    ).toISOString();
  }, [escrow?.status, escrow?.updatedAt]);

  const disputeEvidenceCountdown = useCountdown(
    escrow?.status === 'DISPUTE' ? disputeEvidenceDeadlineIso : undefined,
  );

  const disputeEvidenceWindowOpen = useMemo(() => {
    if (!disputeEvidenceDeadlineIso) return false;
    return new Date(disputeEvidenceDeadlineIso).getTime() > Date.now();
  }, [disputeEvidenceDeadlineIso]);

  const amountTon = escrow ? Number(escrow.amount) / 1e9 : 0;

  const beginStatusPolling = useCallback((escrowId: string, statusAtSend: string) => {
    stopPollingRef.current?.();
    stopPollingRef.current = startEscrowStatusPoll(
      escrowId,
      statusAtSend,
      (fresh) => setEscrow(fresh),
      setConfirmingBlockchain,
    );
  }, []);

  useEffect(() => {
    return () => {
      stopPollingRef.current?.();
    };
  }, []);

  const waitingConfirmation = (
    <p className={styles.waitingText}>Waiting for blockchain confirmation...</p>
  );

  const runAction = async (action: () => Promise<Escrow>) => {
    setActionLoading(true);
    setError(null);
    try {
      await action();
      setModal({ type: null });
      navigate('/home', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!escrow) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.escrows.accept(escrow.id);
      await fetchEscrow();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!escrow?.contractAddress) {
      setError('Contract address not available');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const statusAtSend = escrow.status;
      await tonConnectUI.sendTransaction({
        validUntil: depositValidUntil(),
        messages: [
          {
            address: escrow.contractAddress,
            amount: escrow.amount,
            payload: buildDepositPayload(),
          },
        ],
      });
      beginStatusPolling(escrow.id, statusAtSend);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitWork = async () => {
    if (!escrow) return;
    const workHash = workDescription.trim() || DEFAULT_WORK_DESCRIPTION;
    setActionLoading(true);
    setError(null);
    try {
      const statusAtSend = escrow.status;
      await api.escrows.submitWork(escrow.id, workHash);
      beginStatusPolling(escrow.id, statusAtSend);
      const fresh = await api.escrows.get(escrow.id);
      setEscrow(fresh);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submit failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!escrow) return;
    setActionLoading(true);
    setError(null);
    try {
      const statusAtSend = escrow.status;
      setModal({ type: null });
      await api.escrows.approve(escrow.id);
      beginStatusPolling(escrow.id, statusAtSend);
      await fetchEscrow();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approve failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async () => {
    if (!escrow) return;
    setActionLoading(true);
    setError(null);
    try {
      setModal({ type: null });
      await api.escrows.dispute(escrow.id);
      navigate(`/dispute/${escrow.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open dispute';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleModalConfirm = () => {
    if (!escrow) return;

    if (modal.type === 'approve') {
      void handleApprove();
      return;
    }

    if (modal.type === 'dispute') {
      void handleDispute();
    }
  };

  const modalConfig = useMemo(() => {
    if (!modal.type || !escrow) return null;

    if (modal.type === 'approve') {
      return {
        title: 'Approve work?',
        message: `This will release ${amountTon.toFixed(2)} TON to the performer. This action cannot be undone.`,
        confirmLabel: 'Approve & pay',
        confirmColor: 'blue' as const,
      };
    }

    return {
      title: 'Open dispute?',
      message:
        'This will freeze the funds and notify the arbiter. Both parties will need to submit evidence.',
      confirmLabel: 'Open dispute',
      confirmColor: 'red' as const,
    };
  }, [modal.type, escrow, amountTon]);

  const counterpartyLabel = isEmployer ? 'Performer' : 'Customer';
  const customerDisplay = formatClientLabel(
    escrow?.employerUsername ?? escrow?.employer?.username,
    escrow?.employerWallet,
  );
  const performerDisplay = formatClientLabel(
    escrow?.freelancerUsername ?? escrow?.freelancer?.username,
    escrow?.freelancerWallet,
  );
  const clientDisplay = isEmployer ? performerDisplay : customerDisplay;

  const renderStatusContent = () => {
    if (!escrow) return null;

    const { status } = escrow;

    if (status === 'INIT' && isEmployer) {
      if (!escrow.freelancerAccepted) {
        return (
          <p className={styles.waitingText}>Waiting for performer to accept...</p>
        );
      }

      if (confirmingBlockchain) {
        return waitingConfirmation;
      }

      return (
        <div className={styles.statusSection}>
          <p className={styles.payHint}>
            Performer accepted! Fund the contract to start work.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={actionLoading}
            onClick={() => void handleDeposit()}
          >
            {actionLoading ? <span className={styles.spinner} /> : 'Deposit'}
          </button>
        </div>
      );
    }

    if (status === 'INIT' && isFreelancer) {
      if (escrow.freelancerAccepted) {
        return (
          <p className={styles.waitingText}>
            You accepted this contract. Waiting for customer to deposit funds.
          </p>
        );
      }

      return (
        <div className={styles.statusSection}>
          <p className={styles.payHint}>Accept this contract to get started</p>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={actionLoading}
              onClick={() => void handleAcceptInvitation()}
            >
              {actionLoading ? <span className={styles.spinner} /> : 'Accept'}
            </button>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={actionLoading}
              onClick={() => void runAction(() => api.escrows.decline(escrow.id))}
            >
              Decline
            </button>
          </div>
        </div>
      );
    }

    if (status === 'FUNDED' && isFreelancer) {
      if (confirmingBlockchain) {
        return waitingConfirmation;
      }

      return (
        <div className={styles.statusSection}>
          <label className={styles.workDescriptionLabel} htmlFor="work-description">
            Work delivery link or description
          </label>
          <textarea
            id="work-description"
            className={styles.workDescriptionInput}
            placeholder="Paste a link to your work (Google Drive, GitHub, Figma) or describe what was delivered. If you sent it in direct messages, write that here."
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
          />
          <p className={styles.timerLabel}>Remaining time:</p>
          <p className={styles.timerLarge}>{deadlineCountdown || '00h 00m 00s'}</p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={actionLoading || workDescription.trim().length < 1}
            onClick={() => void handleSubmitWork()}
          >
            {actionLoading ? <span className={styles.spinner} /> : 'Submit Work'}
          </button>
        </div>
      );
    }

    if (status === 'FUNDED' && isEmployer) {
      return (
        <p className={styles.waitingText}>
          Work is in progress. Waiting for performer to submit.
        </p>
      );
    }

    if (status === 'SUBMITTED' && isEmployer) {
      if (confirmingBlockchain) {
        return waitingConfirmation;
      }

      return (
        <div className={styles.statusSection}>
          <div className={styles.workDelivery}>
            <p className={styles.workDeliveryLabel}>Feedback of worker</p>
            <p className={styles.workDeliveryContent}>
              {escrow.workHash || 'No delivery description provided'}
            </p>
            {escrow.workHash && escrow.workHash.startsWith('http') && (
              <a
                href={escrow.workHash}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.workDeliveryLink}
              >
                Open link ↗
              </a>
            )}
          </div>
          <p className={styles.headline}>The task is done!</p>
          <p className={styles.subheadline}>Check and confirm the execution</p>
          <p className={styles.timerLarge}>{reviewCountdown || '00h 00m 00s'}</p>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={actionLoading}
              onClick={() => setModal({ type: 'approve' })}
            >
              Confirm
            </button>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={actionLoading}
              onClick={() => setModal({ type: 'dispute' })}
            >
              Dispute
            </button>
          </div>
        </div>
      );
    }

    if (status === 'SUBMITTED' && isFreelancer) {
      return (
        <div className={styles.statusSection}>
          <p className={styles.subheadline}>Work submitted! Waiting for employer review.</p>
          <p className={styles.workDeliveryContent}>
            Your submission: {escrow.workHash || '—'}
          </p>
          <p className={styles.timerLabel}>Review deadline:</p>
          <p className={styles.timerLarge}>{reviewCountdown || '00h 00m 00s'}</p>
        </div>
      );
    }

    if (status === 'DISPUTE') {
      return (
        <div className={styles.statusSection}>
          <p className={styles.disputeTitle}>Dispute in progress</p>
          <p className={styles.disputeInfo}>
            You have one chance to submit your evidence. After submission you cannot edit it.
          </p>
          <div className={styles.disputeTimerSection}>
            {disputeEvidenceWindowOpen ? (
              <>
                <p className={styles.disputeTimerLabel}>Evidence submission deadline:</p>
                <p className={styles.disputeTimerValue}>
                  {disputeEvidenceCountdown || '00h 00m 00s'}
                </p>
              </>
            ) : (
              <p className={styles.disputeTimerValue}>Submission closed</p>
            )}
            <p className={styles.disputeReviewText}>
              Under review — arbiter resolving within 30 days
            </p>
          </div>
          {evidenceSubmitted ? (
            <>
              <p className={styles.evidenceSubmitted}>✓ Evidence submitted</p>
              <p className={styles.evidenceWaiting}>Waiting for arbiter decision...</p>
            </>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate(`/dispute/${escrow.id}`)}
            >
              Send evidence
            </button>
          )}
        </div>
      );
    }

    if (status === 'COMPLETED') {
      return (
        <div className={styles.statusSection}>
          <p className={styles.completedTitle}>✅ Contract completed</p>
          <p className={styles.waitingText}>Funds have been released.</p>
        </div>
      );
    }

    if (status === 'CANCELLED') {
      return (
        <p className={styles.cancelledTitle}>🚫 Contract cancelled</p>
      );
    }

    if (status === 'EXPIRED') {
      return <p className={styles.expiredTitle}>⏰ Contract expired</p>;
    }

    return null;
  };

  return (
    <div className={styles.page}>
      <div className={styles.blob1} aria-hidden />
      <div className={styles.blob2} aria-hidden />
      <div className={styles.blob3} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.backButton}
            aria-label="Go back"
            onClick={() => navigate(-1)}
          >
            ←
          </button>
          <Logo size="md" />
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <ProfileIcon />
        </button>
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>My Contracts</h1>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="New contract"
          onClick={() => navigate('/new')}
        >
          <NewContractIcon />
        </button>
      </div>

      <main className={styles.content}>
        {loading && (
          <article className={styles.card}>
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </article>
        )}

        {!loading && error && !escrow && (
          <div className={styles.errorBlock}>
            <p className={styles.errorText}>Failed to load contract</p>
            <button type="button" className={styles.retryButton} onClick={() => void fetchEscrow()}>
              Retry
            </button>
          </div>
        )}

        {!loading && escrow && (
          <article className={styles.card}>
            <div className={styles.topRow}>
              <StatusBadge status={escrow.status} />
              <h2 className={styles.contractTitle}>{escrow.title}</h2>
            </div>

            <div className={styles.infoRows}>
              <p className={styles.row}>
                <span className={styles.label}>{counterpartyLabel}:</span> {clientDisplay}
              </p>
              <p className={styles.row}>
                <span className={styles.label}>Deadline:</span> {formatDeadline(escrow.deadline)}
              </p>
              <p className={styles.row}>
                <span className={styles.label}>Money:</span>{' '}
                {formatTonFromNanotons(escrow.amount)}
              </p>
            </div>

            <div className={styles.descriptionBlock}>
              <p className={styles.descriptionLabel}>Description:</p>
              <div className={styles.descriptionBox}>
                {escrow.description || '—'}
              </div>
            </div>

            {renderStatusContent()}

            {error && <p className={styles.actionError}>{error}</p>}
          </article>
        )}
      </main>

      {modalConfig && (
        <ConfirmModal
          isOpen={modal.type !== null}
          title={modalConfig.title}
          message={modalConfig.message}
          confirmLabel={modalConfig.confirmLabel}
          confirmColor={modalConfig.confirmColor}
          isLoading={actionLoading}
          onConfirm={handleModalConfirm}
          onCancel={() => setModal({ type: null })}
        />
      )}
    </div>
  );
}
