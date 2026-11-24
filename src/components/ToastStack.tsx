import React from 'react';

export interface ToastItem {
  id: number;
  message: string;
  badge?: string;
  durationMs: number;
}

interface ToastStackProps {
  toasts: ToastItem[];
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className="skeuo-toast" role="status">
          <span className="toast-led" aria-hidden="true" />
          <span className="toast-text">{toast.message}</span>
          {toast.badge && <span className="toast-badge">{toast.badge}</span>}
          <span
            className="toast-life-bar"
            style={{ animationDuration: `${toast.durationMs}ms` }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
};
