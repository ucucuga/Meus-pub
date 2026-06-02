import { useEffect, useState } from 'react';

export function useCountdown(targetDate: string | undefined): string {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft('');
      return;
    }

    const update = () => {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('00h 00m 00s');
        return;
      }

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      setTimeLeft(
        `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`,
      );
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}
