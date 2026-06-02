import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { api } from '../api/client';
import { useCountdown } from '../hooks/useCountdown';
import type { Escrow } from '../types/api';
import { buildDepositPayload, depositValidUntil } from '../utils/escrowDeposit';
import { formatClientLabel, formatTonFromNanotons } from '../utils/format';
import { startEscrowStatusPoll } from '../utils/escrowStatusPoll';

const formatDeadlineWithTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${hh}:${mm}, ${dd}.${mo}.${yyyy}`;
};
import { ConfirmModal } from './ConfirmModal';
import { LiquidGlass } from './LiquidGlass';
import { StatusBadge } from './StatusBadge';
import styles from './ContractCard.module.css';

const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';
const DEV_FREELANCER_MOCKS = ['mock-2', 'mock-5'];
const DEFAULT_WORK_DESCRIPTION = 'Delivered via Telegram messages';

interface ContractCardProps {
  escrow: Escrow;
  currentUserWallet?: string;
  currentUserId?: string;
}

export function ContractCard({
  escrow,
  currentUserWallet,
  currentUserId,
}: ContractCardProps) {
  const navigate = useNavigate();
  const [tonConnectUI] = useTonConnectUI();

  const [expanded, setExpanded] = useState(false);
  const [escrowDetail, setEscrowDetail] = useState<Escrow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmingBlockchain, setConfirmingBlockchain] = useState(false);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const [workDescription, setWorkDescription] = useState('');
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false);
  const [modal, setModal] = useState<{
    type: 'approve' | 'dispute' | null;
    escrowId: string;
  }>({ type: null, escrowId: '' });
  const expandedRef = useRef<HTMLDivElement>(null);

  const activeEscrow = escrowDetail ?? escrow;

  const { isEmployer, isFreelancer } = useMemo(() => {
    if (isViteDevMode) {
      const devIsFreelancer = DEV_FREELANCER_MOCKS.includes(escrow.id);
      return {
        isEmployer: !devIsFreelancer,
        isFreelancer: devIsFreelancer,
      };
    }

    const employer =
      currentUserWallet === escrow.employerWallet ||
      (currentUserId !== undefined && escrow.employerId === currentUserId);
    const freelancer =
      currentUserWallet === escrow.freelancerWallet ||
      (currentUserId !== undefined && escrow.freelancerId === currentUserId);

    return { isEmployer: employer, isFreelancer: freelancer && !employer };
  }, [escrow, currentUserWallet, currentUserId]);

  const counterpartyLabel = isEmployer ? 'Performer:' : 'Customer:';
  const customerDisplay = formatClientLabel(
    activeEscrow.employerUsername ?? activeEscrow.employer?.username,
    activeEscrow.employerWallet,
  );
  const performerDisplay = formatClientLabel(
    activeEscrow.freelancerUsername ?? activeEscrow.freelancer?.username,
    activeEscrow.freelancerWallet,
  );
  const counterpartyDisplay = isEmployer ? performerDisplay : customerDisplay;

  const countdownTarget = expanded
    ? escrow.status === 'SUBMITTED' || escrow.status === 'DISPUTE'
      ? escrow.reviewDeadline ?? undefined
      : escrow.deadline
    : undefined;

  const timeLeft = useCountdown(countdownTarget);

  const disputeEvidenceDeadlineIso = useMemo(() => {
    if (activeEscrow.status !== 'DISPUTE' || !activeEscrow.updatedAt) return undefined;
    return new Date(
      new Date(activeEscrow.updatedAt).getTime() + 48 * 60 * 60 * 1000,
    ).toISOString();
  }, [activeEscrow.status, activeEscrow.updatedAt]);

  const disputeEvidenceCountdown = useCountdown(
    activeEscrow.status === 'DISPUTE' ? disputeEvidenceDeadlineIso : undefined,
  );

  const disputeEvidenceWindowOpen = useMemo(() => {
    if (!disputeEvidenceDeadlineIso) return false;
    return new Date(disputeEvidenceDeadlineIso).getTime() > Date.now();
  }, [disputeEvidenceDeadlineIso]);

  const amountTon = Number(activeEscrow.amount) / 1e9;

  const beginStatusPolling = useCallback((escrowId: string, statusAtSend: string) => {
    stopPollingRef.current?.();
    stopPollingRef.current = startEscrowStatusPoll(
      escrowId,
      statusAtSend,
      (fresh) => setEscrowDetail(fresh),
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

  useEffect(() => {
    if (!expanded) return;
    const key = `evidence_submitted_${escrow.id}`;
    setEvidenceSubmitted(sessionStorage.getItem(key) === 'true');
  }, [expanded, escrow.id]);

  const handleCardClick = (e: MouseEvent) => {
    if (expandedRef.current?.contains(e.target as Node)) return;

    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    if (!escrowDetail) {
      setLoadingDetail(true);
      void api.escrows
        .get(escrow.id)
        .then((result) => {
          setEscrowDetail(result);
        })
        .catch(() => {
          setEscrowDetail(null);
        })
        .finally(() => {
          setLoadingDetail(false);
        });
    }
  };

  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const handleSubmitWork = async (escrowId: string) => {
    const workHash = workDescription.trim() || DEFAULT_WORK_DESCRIPTION;

    setActionLoading(true);
    try {
      const statusAtSend = activeEscrow.status;
      await api.escrows.submitWork(escrowId, workHash);
      beginStatusPolling(escrowId, statusAtSend);
      const fresh = await api.escrows.get(escrowId);
      setEscrowDetail(fresh);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (escrowId: string) => {
    setActionLoading(true);
    try {
      const statusAtSend = activeEscrow.status;
      setModal({ type: null, escrowId: '' });
      await api.escrows.approve(escrowId);
      beginStatusPolling(escrowId, statusAtSend);
      const fresh = await api.escrows.get(escrowId);
      setEscrowDetail(fresh);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async (escrowId: string) => {
    setActionLoading(true);
    try {
      setModal({ type: null, escrowId: '' });
      await api.escrows.dispute(escrowId);
      navigate(`/dispute/${escrowId}`);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleModalConfirm = async () => {
    if (!modal.type || !modal.escrowId) return;

    if (modal.type === 'dispute') {
      void handleDispute(modal.escrowId);
      return;
    }

    if (modal.type === 'approve') {
      void handleApprove(modal.escrowId);
    }
  };

  const runAcceptDecline = async (action: () => Promise<Escrow>) => {
    setActionLoading(true);
    try {
      await action();
      const fresh = await api.escrows.get(escrow.id);
      setEscrowDetail(fresh);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeposit = async (
    escrowId: string,
    contractAddress: string,
    amount: string,
    statusAtSend: string,
  ) => {
    setActionLoading(true);
    try {
      await tonConnectUI.sendTransaction({
        validUntil: depositValidUntil(),
        messages: [
          {
            address: contractAddress,
            amount,
            payload: buildDepositPayload(),
          },
        ],
      });
      beginStatusPolling(escrowId, statusAtSend);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const modalConfig = useMemo(() => {
    if (!modal.type) return null;

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
  }, [modal.type, amountTon]);

  const renderStatusContent = useCallback(() => {
    const e = activeEscrow;
    const { status } = e;
    const timerDisplay = timeLeft || '00h 00m 00s';

    if (status === 'INIT' && isEmployer) {
      if (!e.freelancerAccepted) {
        return <p className={styles.waitingText}>Waiting for performer to accept...</p>;
      }

      if (confirmingBlockchain) {
        return waitingConfirmation;
      }

      if (!e.contractAddress) {
        return (
          <p className={styles.waitingText}>
            Performer accepted! Contract address unavailable — try again later.
          </p>
        );
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
            onClick={(ev) => {
              stopPropagation(ev);
              void handleDeposit(e.id, e.contractAddress!, e.amount, e.status);
            }}
          >
            {actionLoading ? <span className={styles.spinner} /> : 'Deposit'}
          </button>
        </div>
      );
    }

    if (status === 'INIT' && isFreelancer) {
      if (e.freelancerAccepted) {
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
              onClick={(ev) => {
                stopPropagation(ev);
                void runAcceptDecline(() => api.escrows.accept(e.id));
              }}
            >
              {actionLoading ? <span className={styles.spinner} /> : 'Accept'}
            </button>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={actionLoading}
              onClick={(ev) => {
                stopPropagation(ev);
                void runAcceptDecline(() => api.escrows.decline(e.id));
              }}
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
          <label className={styles.workDescriptionLabel} htmlFor={`work-description-${e.id}`}>
            Work delivery link or description
          </label>
          <textarea
            id={`work-description-${e.id}`}
            className={styles.workDescriptionInput}
            placeholder="Paste a link to your work (Google Drive, GitHub, Figma) or describe what was delivered. If you sent it in direct messages, write that here."
            value={workDescription}
            onClick={stopPropagation}
            onChange={(ev) => {
              ev.stopPropagation();
              setWorkDescription(ev.target.value);
            }}
          />

          <p className={styles.timerLabel}>Remaining time:</p>
          <p className={styles.timerLarge}>{timerDisplay}</p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={actionLoading || workDescription.trim().length < 1}
            onClick={(ev) => {
              stopPropagation(ev);
              void handleSubmitWork(e.id);
            }}
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
              {e.workHash || 'No delivery description provided'}
            </p>
            {e.workHash && e.workHash.startsWith('http') && (
              <a
                href={e.workHash}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.workDeliveryLink}
                onClick={stopPropagation}
              >
                Open link ↗
              </a>
            )}
          </div>
          <p className={styles.headline}>The task is done! Check and confirm.</p>
          <p className={styles.timerLarge}>{timerDisplay}</p>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={actionLoading}
              onClick={(ev) => {
                stopPropagation(ev);
                setModal({ type: 'approve', escrowId: e.id });
              }}
            >
              Confirm
            </button>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={actionLoading}
              onClick={(ev) => {
                stopPropagation(ev);
                setModal({ type: 'dispute', escrowId: e.id });
              }}
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
          <p className={styles.subheadline}>Work submitted! Waiting for review.</p>
          <p className={styles.workDeliveryContent}>
            Your submission: {e.workHash || '—'}
          </p>
          <p className={styles.timerLarge}>{timerDisplay}</p>
        </div>
      );
    }

    if (status === 'DISPUTE') {
      return (
        <div className={styles.statusSection}>
          <p className={styles.disputeTitle}>Dispute in progress</p>
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
            <p className={styles.evidenceSubmitted}>✓ Evidence submitted</p>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={(ev) => {
                stopPropagation(ev);
                navigate(`/dispute/${e.id}`);
              }}
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
      return <p className={styles.cancelledTitle}>🚫 Contract cancelled</p>;
    }

    if (status === 'EXPIRED') {
      return <p className={styles.expiredTitle}>⏰ Contract expired</p>;
    }

    return null;
  }, [
    activeEscrow,
    isEmployer,
    isFreelancer,
    currentUserId,
    timeLeft,
    amountTon,
    actionLoading,
    confirmingBlockchain,
    evidenceSubmitted,
    navigate,
    workDescription,
    disputeEvidenceWindowOpen,
    disputeEvidenceCountdown,
  ]);

  return (
    <>
      <LiquidGlass className={styles.card} borderRadius={20}>
        <div onClick={handleCardClick}>
        <div className={styles.topRow}>
          <StatusBadge status={escrow.status} />
          <h3 className={styles.title}>{escrow.title}</h3>
        </div>
        <div className={styles.details}>
          <p className={styles.row}>
            <span className={styles.label}>{counterpartyLabel}</span>{' '}
            <span className={styles.value}>{counterpartyDisplay}</span>
          </p>
          <p className={styles.row}>
            <span className={styles.label}>Deadline:</span>{' '}
            <span className={styles.value}>{formatDeadlineWithTime(escrow.deadline)}</span>
          </p>
          <p className={styles.row}>
            <span className={styles.label}>Money:</span>{' '}
            <span className={styles.value}>{formatTonFromNanotons(escrow.amount)}</span>
          </p>
        </div>

        {expanded && (
          <div ref={expandedRef} className={styles.expandedContent}>
            <div className={styles.expandedDivider}>
              {loadingDetail && (
                <>
                  <div className={styles.skeletonRow} />
                  <div className={styles.skeletonRow} />
                  <div className={styles.skeletonRow} />
                </>
              )}

              {!loadingDetail && (
                <>
                  <div className={styles.descriptionBlock}>
                    <p className={styles.descriptionLabel}>Description:</p>
                    <div className={styles.descriptionBox}>
                      {activeEscrow.description || '—'}
                    </div>
                  </div>

                  {renderStatusContent()}
                </>
              )}
            </div>

          </div>
        )}
        </div>
      </LiquidGlass>

      {modalConfig && (
        <ConfirmModal
          isOpen={modal.type !== null}
          title={modalConfig.title}
          message={modalConfig.message}
          confirmLabel={modalConfig.confirmLabel}
          confirmColor={modalConfig.confirmColor}
          isLoading={actionLoading}
          onConfirm={() => void handleModalConfirm()}
          onCancel={() => setModal({ type: null, escrowId: '' })}
        />
      )}
    </>
  );
}
