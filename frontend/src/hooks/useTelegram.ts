import { useEffect } from 'react';

export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, [tg]);

  return {
    tg,
    initData: tg?.initData ?? '',
    initDataUnsafe: tg?.initDataUnsafe,
    user: tg?.initDataUnsafe?.user,
    colorScheme: tg?.colorScheme ?? 'dark',
  };
}
