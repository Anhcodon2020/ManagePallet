import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  durationMs?: number;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const DEFAULT_DURATION_MS = 4200;

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss }) => {
  const [paused, setPaused] = useState(false);
  const duration = toast.durationMs ?? DEFAULT_DURATION_MS;

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, duration, paused, onDismiss]);

  const icon =
    toast.variant === 'success' ? (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
    ) : toast.variant === 'error' ? (
      <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
    ) : (
      <Info className="h-5 w-5 shrink-0 text-blue-600" />
    );

  const progressColor =
    toast.variant === 'success'
      ? 'bg-emerald-600'
      : toast.variant === 'error'
      ? 'bg-red-600'
      : 'bg-blue-600';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 leading-snug">
            {toast.title}
          </p>
          {toast.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              {toast.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Đóng thông báo"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!paused && (
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          style={{ transformOrigin: 'left' }}
          className={`h-0.5 w-full ${progressColor} opacity-80`}
        />
      )}
    </motion.div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-5 lg:bottom-6 no-print"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
