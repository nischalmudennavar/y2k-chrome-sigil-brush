import { useCallback, useEffect, useRef, useState } from 'react';
import { ToastItem } from '../components/ToastStack';

const MAX_TOASTS = 4;
const DEFAULT_DURATION_MS = 1800;

function parseToastMessage(raw: string): { message: string; badge?: string } {
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0 && colonIdx < raw.length - 1) {
    const label = raw.slice(0, colonIdx).trim();
    const detail = raw.slice(colonIdx + 1).trim();
    if (label && detail) {
      return { message: label, badge: detail };
    }
  }
  return { message: raw };
}

export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef<number>(1);
  const timersRef = useRef<Map<number, number>>(new Map());

  const showToast = useCallback((rawMessage: string, durationMs = DEFAULT_DURATION_MS) => {
    const id = nextIdRef.current++;
    const { message, badge } = parseToastMessage(rawMessage);

    setToasts((prev) => {
      const next = [...prev, { id, message, badge, durationMs }];
      if (next.length > MAX_TOASTS) {
        const dropped = next.slice(0, next.length - MAX_TOASTS);
        dropped.forEach((item) => {
          const t = timersRef.current.get(item.id);
          if (t !== undefined) {
            window.clearTimeout(t);
            timersRef.current.delete(item.id);
          }
        });
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });

    const timer = window.setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, durationMs);

    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return { toasts, showToast };
}
