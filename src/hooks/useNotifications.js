import { useEffect, useRef } from 'react';
import { deleteNotification, receiveNotification } from '../api/greenApi.js';

const RETRY_DELAY = 1500;

export function useNotifications({ credentials, enabled, onNotification, onError }) {
  const callbackRef = useRef(onNotification);
  const errorRef = useRef(onError);

  useEffect(() => {
    callbackRef.current = onNotification;
    errorRef.current = onError;
  }, [onNotification, onError]);

  useEffect(() => {
    if (!enabled || !credentials) return undefined;

    const controller = new AbortController();
    let stopped = false;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function poll() {
      while (!stopped) {
        try {
          const notification = await receiveNotification(credentials, controller.signal);

          if (!notification) continue;

          try {
            callbackRef.current?.(notification.body);
          } finally {
            // Важно удалить уведомление после обработки, иначе оно снова
            // вернётся при следующем ReceiveNotification.
            await deleteNotification(credentials, notification.receiptId);
          }
        } catch (error) {
          if (error.name === 'AbortError' || stopped) break;
          errorRef.current?.(error);
          await wait(RETRY_DELAY);
        }
      }
    }

    poll();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [credentials, enabled]);
}
