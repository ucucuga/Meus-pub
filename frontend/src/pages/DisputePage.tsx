import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTonWallet } from '@tonconnect/ui-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type { Dispute, Escrow, EvidenceFilePayload } from '../types/api';
import { formatTonFromNanotons } from '../utils/format';
import styles from './DisputePage.module.css';

const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';
const DEV_FREELANCER_MOCKS = ['mock-2', 'mock-5'];
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_DESCRIPTION = 5000;
const MIN_DESCRIPTION = 10;

interface SelectedFile {
  id: string;
  file: File;
}

interface PartyEvidence {
  reason: string;
  fileNames: string[];
  files?: EvidenceFilePayload[];
  submittedAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function fileIcon(file: File): string {
  return isImageFile(file) ? '🖼' : '📄';
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function parsePartyEvidence(value: unknown): PartyEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.reason !== 'string') return null;

  const files: EvidenceFilePayload[] = [];
  if (Array.isArray(record.files)) {
    for (const item of record.files) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.name === 'string' &&
        typeof row.type === 'string' &&
        typeof row.data === 'string' &&
        typeof row.size === 'number'
      ) {
        files.push({
          name: row.name,
          type: row.type,
          data: row.data,
          size: row.size,
        });
      }
    }
  }

  return {
    reason: record.reason,
    fileNames: Array.isArray(record.fileNames)
      ? record.fileNames.filter((name): name is string => typeof name === 'string')
      : files.map((f) => f.name),
    files: files.length > 0 ? files : undefined,
    submittedAt: typeof record.submittedAt === 'string' ? record.submittedAt : '',
  };
}

function getOpenDispute(escrow: Escrow): Dispute | null {
  const disputes = escrow.disputes ?? [];
  const open = disputes.filter((d) => d.status === 'OPEN');
  if (open.length === 0) return disputes[0] ?? null;
  return open.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0] ?? null;
}

function parseEvidence(dispute: Dispute | null): {
  employer: PartyEvidence | null;
  freelancer: PartyEvidence | null;
} {
  if (!dispute?.evidence || typeof dispute.evidence !== 'object' || Array.isArray(dispute.evidence)) {
    return { employer: null, freelancer: null };
  }
  const record = dispute.evidence as Record<string, unknown>;
  return {
    employer: parsePartyEvidence(record.employer),
    freelancer: parsePartyEvidence(record.freelancer),
  };
}

interface EvidenceFormProps {
  partyLabel: string;
  onSubmit: (reason: string, files: EvidenceFilePayload[]) => Promise<void>;
}

function EvidenceForm({ partyLabel, onSubmit }: EvidenceFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    setFileError(null);

    const next: SelectedFile[] = [...files];
    for (let i = 0; i < incoming.length; i += 1) {
      const file = incoming[i];
      if (!file) continue;

      if (next.length >= MAX_FILES) {
        setFileError(`Maximum ${MAX_FILES} files allowed`);
        break;
      }

      if (file.size > MAX_FILE_BYTES) {
        setFileError('File too large (max 10MB)');
        continue;
      }

      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
      });
    }

    if (next.length > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} files allowed`);
      setFiles(next.slice(0, MAX_FILES));
      return;
    }

    setFiles(next);
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setFileError(null);
  };

  const descriptionError = useMemo(() => {
    const trimmed = description.trim();
    if (!trimmed) return null;
    if (trimmed.length < MIN_DESCRIPTION) {
      return `Description must be at least ${MIN_DESCRIPTION} characters`;
    }
    return null;
  }, [description]);

  const canSubmit =
    description.trim().length >= MIN_DESCRIPTION &&
    files.length > 0 &&
    !submitting &&
    !success;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const reason = description.trim();
      const filesData = await Promise.all(
        files.map(async ({ file }) => ({
          name: file.name,
          type: file.type,
          data: await readFileAsBase64(file),
          size: file.size,
        })),
      );

      const totalSize = filesData.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_BYTES) {
        setSubmitError('Total file size too large (max 50MB)');
        return;
      }

      if (isViteDevMode) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1500);
        });
      } else {
        await onSubmit(reason, filesData);
      }

      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit evidence';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className={styles.submittedBanner}>
        <span aria-hidden>✅</span>
        <p>Your evidence has been submitted. The arbiter will review both parties&apos; cases.</p>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <h3 className={styles.sectionTitle}>Submit your evidence ({partyLabel})</h3>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`dispute-description-${partyLabel}`}>
          Describe the situation
        </label>
        <div className={styles.textareaWrap}>
          <textarea
            id={`dispute-description-${partyLabel}`}
            className={styles.textarea}
            placeholder="Explain what went wrong and why you believe the dispute should be resolved in your favor..."
            value={description}
            maxLength={MAX_DESCRIPTION}
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className={styles.charCount}>
            {description.length} / {MAX_DESCRIPTION}
          </span>
        </div>
        {descriptionError && <p className={styles.fileError}>{descriptionError}</p>}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Attach evidence</span>
        <p className={styles.subtitle}>Photos, screenshots, or documents</p>

        <input
          ref={fileInputRef}
          type="file"
          className={styles.hiddenInput}
          multiple
          accept="image/*,.pdf"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          className={styles.uploadArea}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className={styles.uploadIcon} aria-hidden>
            📎
          </span>
          <span className={styles.uploadText}>Tap to attach files</span>
          <span className={styles.uploadSubtext}>Max 10 files, 10MB each</span>
        </button>

        {fileError && <p className={styles.fileError}>{fileError}</p>}

        {files.length > 0 && (
          <ul className={styles.fileList}>
            {files.map(({ id: fileId, file }) => (
              <li key={fileId} className={styles.fileRow}>
                <span className={styles.fileTypeIcon} aria-hidden>
                  {fileIcon(file)}
                </span>
                <div className={styles.fileMeta}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                </div>
                <button
                  type="button"
                  className={styles.removeFile}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeFile(fileId)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
        {submitting ? <span className={styles.spinner} /> : 'Submit evidence'}
      </button>

      {submitError && <p className={styles.submitError}>{submitError}</p>}
    </form>
  );
}

interface PartyEvidenceSectionProps {
  partyLabel: string;
  evidence: PartyEvidence | null;
  showForm: boolean;
  onSubmit: (reason: string, files: EvidenceFilePayload[]) => Promise<void>;
  submittedMessage?: boolean;
}

function PartyEvidenceSection({
  partyLabel,
  evidence,
  showForm,
  onSubmit,
  submittedMessage = true,
}: PartyEvidenceSectionProps) {
  if (showForm) {
    return <EvidenceForm partyLabel={partyLabel} onSubmit={onSubmit} />;
  }
  if (!evidence) return null;
  return (
    <section className={styles.evidenceSection}>
      <EvidenceDisplay partyLabel={partyLabel} evidence={evidence} />
      {submittedMessage && (
        <p className={styles.statusMessage}>You have submitted your evidence.</p>
      )}
    </section>
  );
}

interface EvidenceDisplayProps {
  partyLabel: string;
  evidence: PartyEvidence;
}

function EvidenceDisplay({ partyLabel, evidence }: EvidenceDisplayProps) {
  return (
    <article className={styles.evidenceCard}>
      <h3 className={styles.evidenceTitle}>{partyLabel}</h3>
      <p className={styles.evidenceReason}>{evidence.reason}</p>
      {evidence.files && evidence.files.length > 0 ? (
        <ul className={styles.evidenceFiles}>
          {evidence.files.map((file) => (
            <li key={file.name} className={styles.evidenceFileRow}>
              {file.type.startsWith('image/') ? (
                <img
                  src={file.data}
                  alt={file.name}
                  className={styles.evidenceImage}
                />
              ) : (
                <>📄 {file.name}</>
              )}
            </li>
          ))}
        </ul>
      ) : (
        evidence.fileNames.length > 0 && (
          <ul className={styles.evidenceFiles}>
            {evidence.fileNames.map((name) => (
              <li key={name} className={styles.evidenceFileRow}>
                📄 {name}
              </li>
            ))}
          </ul>
        )
      )}
      {evidence.submittedAt && (
        <p className={styles.evidenceDate}>
          Submitted {new Date(evidence.submittedAt).toLocaleString()}
        </p>
      )}
    </article>
  );
}

export function DisputePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const wallet = useTonWallet();
  const { user } = useAuth();
  const connectedWallet = wallet?.account.address;

  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEscrow = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.escrows.get(id);
      setEscrow(data);
    } catch {
      setEscrow(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchEscrow();
  }, [fetchEscrow]);

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

  const isArbiter = useMemo(() => {
    if (!escrow) return false;
    if (escrow.arbiterId && user?.id && escrow.arbiterId === user.id) return true;
    const wallet = connectedWallet ?? user?.walletAddress ?? undefined;
    if (wallet && escrow.arbiterWallet && wallet === escrow.arbiterWallet) return true;
    return false;
  }, [escrow, connectedWallet, user?.id, user?.walletAddress]);

  const dispute = useMemo(() => (escrow ? getOpenDispute(escrow) : null), [escrow]);
  const { employer: employerEvidence, freelancer: freelancerEvidence } = useMemo(
    () => parseEvidence(dispute),
    [dispute],
  );

  const submitEvidence = async (reason: string, files: EvidenceFilePayload[]) => {
    if (!id) return;

    await api.disputes.submitEvidence({
      escrowId: id,
      reason,
      files,
    });

    window.Telegram?.WebApp?.sendData?.(
      JSON.stringify({
        action: 'dispute_evidence',
        escrowId: id,
        reason,
        fileCount: files.length,
        fileNames: files.map((f) => f.name),
      }),
    );

    await fetchEscrow();
  };

  const showEmployerForm = isEmployer && !isArbiter && !employerEvidence;
  const showFreelancerForm = isFreelancer && !isArbiter && !freelancerEvidence;

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
          ←
        </button>
        <h1 className={styles.headerTitle}>Dispute</h1>
      </header>

      <main className={styles.content}>
        {loading && (
          <article className={styles.infoCard}>
            <div className={styles.skeleton} />
          </article>
        )}

        {!loading && !escrow && (
          <p className={styles.statusMessage}>Contract not found.</p>
        )}

        {!loading && escrow && escrow.status !== 'DISPUTE' && (
          <p className={styles.statusMessage}>
            This contract is not in dispute. Open a dispute from the contract page first.
          </p>
        )}

        {!loading && escrow && escrow.status === 'DISPUTE' && (
          <>
            <article className={styles.infoCard}>
              <div className={styles.cardTop}>
                <StatusBadge status={escrow.status} />
                <h2 className={styles.cardTitle}>{escrow.title}</h2>
              </div>
              <p className={styles.amountRow}>
                <span className={styles.amountLabel}>Amount:</span>{' '}
                {formatTonFromNanotons(escrow.amount)}
              </p>
              {dispute?.reason && (
                <p className={styles.disputeReason}>
                  <span className={styles.amountLabel}>Dispute reason:</span> {dispute.reason}
                </p>
              )}
            </article>

            {isArbiter ? (
              <section className={styles.evidenceSection}>
                <h2 className={styles.sectionHeading}>Submitted evidence</h2>
                {employerEvidence ? (
                  <EvidenceDisplay partyLabel="Customer" evidence={employerEvidence} />
                ) : (
                  <p className={styles.statusMessage}>Customer evidence not submitted yet.</p>
                )}
                {freelancerEvidence ? (
                  <EvidenceDisplay partyLabel="Performer" evidence={freelancerEvidence} />
                ) : (
                  <p className={styles.statusMessage}>Performer evidence not submitted yet.</p>
                )}
              </section>
            ) : isEmployer ? (
              <PartyEvidenceSection
                partyLabel="Customer"
                evidence={employerEvidence}
                showForm={showEmployerForm}
                onSubmit={submitEvidence}
              />
            ) : isFreelancer ? (
              <PartyEvidenceSection
                partyLabel="Performer"
                evidence={freelancerEvidence}
                showForm={showFreelancerForm}
                onSubmit={submitEvidence}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
