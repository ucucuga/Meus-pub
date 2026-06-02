import { api } from '../api/client';
import type { Escrow } from '../types/api';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

export function startEscrowStatusPoll(
  escrowId: string,
  statusAtSend: string,
  onUpdate: (fresh: Escrow) => void,
  onPollingChange: (polling: boolean) => void,
): () => void {
  onPollingChange(true);

  let pollStatus: ReturnType<typeof setInterval> | null = null;
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (pollStatus) clearInterval(pollStatus);
    if (pollTimeout) clearTimeout(pollTimeout);
    pollStatus = null;
    pollTimeout = null;
    onPollingChange(false);
  };

  const checkStatus = async () => {
    try {
      const fresh = await api.escrows.get(escrowId);
      if (fresh.status !== statusAtSend) {
        stop();
        onUpdate(fresh);
      }
    } catch {
    }
  };

  void checkStatus();

  pollStatus = setInterval(() => {
    void checkStatus();
  }, POLL_INTERVAL_MS);

  pollTimeout = setTimeout(stop, POLL_TIMEOUT_MS);

  return stop;
}
