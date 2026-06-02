import styles from './Logo.module.css';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

function getSizeClass(size: NonNullable<LogoProps['size']>): string {
  switch (size) {
    case 'sm':
      return styles.sm ?? '';
    case 'lg':
      return styles.lg ?? '';
    default:
      return styles.md ?? '';
  }
}

export function Logo({ size = 'md' }: LogoProps) {
  return (
    <div className={`${styles.logo} ${getSizeClass(size)}`} aria-label="MEUS">
      <span className={styles.line}>ME</span>
      <span className={styles.line}>US</span>
    </div>
  );
}
