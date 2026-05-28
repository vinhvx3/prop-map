import React from 'react';
import { useStore } from '../store';

export function Toast() {
  const toast = useStore((s) => s.toast);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type}`} role="alert">
      <span className="toast-icon">
        {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
      </span>
      <span>{toast.message}</span>
    </div>
  );
}
