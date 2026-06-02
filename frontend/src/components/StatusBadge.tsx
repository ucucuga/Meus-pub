import type { CSSProperties } from 'react';
import type { EscrowStatus } from '../types/api';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: EscrowStatus;
}

interface BadgeConfig {
  label: string;
  background: string;
  border: string;
}

function getBadgeConfig(status: EscrowStatus): BadgeConfig {
  switch (status) {
    case 'INIT':
      return {
        label: 'INVITATION',
        background: 'rgba(245, 158, 11, 0.35)',
        border: '1.5px solid rgba(245, 158, 11, 0.7)',
      };
    case 'FUNDED':
      return {
        label: 'WORKING',
        background: 'rgba(59, 130, 246, 0.35)',
        border: '1.5px solid rgba(59, 130, 246, 0.7)',
      };
    case 'SUBMITTED':
      return {
        label: 'SUBMITTED',
        background: 'rgba(234, 179, 8, 0.35)',
        border: '1.5px solid rgba(234, 179, 8, 0.7)',
      };
    case 'DISPUTE':
      return {
        label: 'DISPUTE',
        background: 'rgba(239, 68, 68, 0.35)',
        border: '1.5px solid rgba(239, 68, 68, 0.7)',
      };
    case 'COMPLETED':
      return {
        label: 'DONE',
        background: 'rgba(74, 222, 128, 0.35)',
        border: '1.5px solid rgba(74, 222, 128, 0.7)',
      };
    case 'CANCELLED':
      return {
        label: 'CANCELLED',
        background: 'var(--status-gray-bg)',
        border: '1.5px solid rgba(148, 163, 184, 0.7)',
      };
    case 'EXPIRED':
      return {
        label: 'EXPIRED',
        background: 'var(--status-gray-bg)',
        border: '1.5px solid rgba(148, 163, 184, 0.7)',
      };
    default:
      return {
        label: status,
        background: 'var(--status-gray-bg)',
        border: '1.5px solid rgba(148, 163, 184, 0.7)',
      };
  }
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = getBadgeConfig(status);

  return (
    <span
      className={`${styles.badge} ${status === 'FUNDED' ? styles.badgeWorking : ''}`}
      style={
        {
          '--badge-bg': config.background,
          '--badge-border': config.border,
        } as CSSProperties
      }
    >
      {config.label}
    </span>
  );
}
