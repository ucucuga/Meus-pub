import React from 'react';
import styles from './LiquidGlass.module.css';

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  borderRadius?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

export function LiquidGlass({
  children,
  className,
  contentClassName,
  borderRadius = 20,
  onClick,
  ariaLabel,
}: LiquidGlassProps) {
  const id = React.useId().replace(/:/g, '');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`${styles.container} ${onClick ? styles.clickable : ''} ${className ?? ''}`}
      style={{ borderRadius }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter
            id={`glass-${id}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves={3}
              seed={2}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={4}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={0.5} result="blurred" />
            <feComposite in="blurred" in2="SourceGraphic" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div
        className={styles.blurLayer}
        style={{ borderRadius, filter: `url(#glass-${id})` }}
        aria-hidden
      />

      <div className={styles.specular} style={{ borderRadius }} aria-hidden />

      <div className={`${styles.content} ${contentClassName ?? ''}`}>{children}</div>
    </div>
  );
}
