import { useEffect, useState } from 'react';
import styles from './ConfirmModal.module.css';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: 'blue' | 'red';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmColor = 'blue',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  if (!isOpen && !visible) {
    return null;
  }

  const confirmClass =
    confirmColor === 'red' ? styles.confirmButtonRed : styles.confirmButtonBlue;

  return (
    <div
      className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`}
      role="presentation"
      onClick={onCancel}
    >
      <div
        className={`${styles.sheet} ${visible ? styles.sheetVisible : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden />
        <h2 id="confirm-modal-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.buttons}>
          <button
            type="button"
            className={`${styles.confirmButton} ${confirmClass}`}
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading ? <span className={styles.spinner} /> : confirmLabel}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            disabled={isLoading}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
