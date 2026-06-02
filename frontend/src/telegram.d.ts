interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramWebAppInitDataUnsafe {
  query_id?: string;
  user?: TelegramWebAppUser;
  auth_date?: string;
  hash?: string;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  openTelegramLink?: (url: string) => void;
  sendData?: (data: string) => void;
  initData: string;
  initDataUnsafe: TelegramWebAppInitDataUnsafe;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
}

interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

interface Window {
  Telegram?: TelegramNamespace;
}
