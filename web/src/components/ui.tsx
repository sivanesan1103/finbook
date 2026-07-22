import { ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';
import type { TranslationKey } from '../i18n';

/** Payment modes shared by cashbook, expenses and invoices. */
export const PAYMENT_MODES = ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE'];

/** Translation keys for payment modes — use with useLanguage().t(MODE_LABEL_KEYS[m]). */
export const MODE_LABEL_KEYS: Record<string, TranslationKey> = {
  CASH: 'common.modeCash',
  ONLINE: 'common.modeOnline',
  UPI: 'common.modeUpi',
  BANK: 'common.modeBank',
  CHEQUE: 'common.modeCheque',
};

/** Plain ₹-formatted string for inline text (use <Money> for styled amounts). */
export const inr = (n: number | string) =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Indian-format money with give/get coloring. */
export function Money({ value, colored = true, className = '' }: { value: number | string; colored?: boolean; className?: string }) {
  const n = Number(value);
  const color = !colored ? '' : n > 0 ? 'text-get' : n < 0 ? 'text-give' : 'text-slate-500';
  return (
    <span className={`font-semibold tabular-nums ${color} ${className}`}>
      ₹{Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    </span>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover" />;
  }
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center shrink-0"
    >
      {initials}
    </div>
  );
}

export function EmptyState({ icon = '📒', title, subtitle, action }: { icon?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Right-side slide-over panel, Khatabook desktop style. */
export function Drawer({ open, title, onClose, children, accent }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; accent?: 'red' | 'green';
}) {
  if (!open) return null;
  const headerBg = accent === 'red' ? 'bg-get text-white' : accent === 'green' ? 'bg-give text-white' : 'bg-white border-b border-slate-200';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slidein_.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}>
        <div className={`px-5 py-4 flex items-center justify-between ${headerBg}`}>
          <h3 className="font-bold text-base">{title}</h3>
          <button onClick={onClose} className={`text-xl leading-none ${accent ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Toasts ──
type Toast = { id: number; text: string; kind: 'success' | 'error' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3500);
  }, []);
  const style = { success: 'bg-slate-900 text-white', error: 'bg-red-600 text-white', info: 'bg-slate-700 text-white' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`${style[t.kind]} px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium`}>
            {t.kind === 'success' ? '✓ ' : t.kind === 'error' ? '✕ ' : ''}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Translation keys for invoice/entity statuses — use with useLanguage().t(STATUS_LABEL_KEYS[status]). */
export const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  PAID: 'common.statusPaid',
  PARTIAL: 'common.statusPartial',
  UNPAID: 'common.statusUnpaid',
  DRAFT: 'common.statusDraft',
  CANCELLED: 'common.statusCancelled',
  PENDING: 'common.statusPending',
  SENT: 'common.statusSent',
  OPEN: 'common.statusOpen',
  CONVERTED: 'common.statusConverted',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const styles: Record<string, string> = {
    PAID: 'bg-green-100 text-green-700',
    PARTIAL: 'bg-amber-100 text-amber-700',
    UNPAID: 'bg-red-100 text-red-700',
    DRAFT: 'bg-slate-100 text-slate-600',
    CANCELLED: 'bg-slate-200 text-slate-500 line-through',
    PENDING: 'bg-amber-100 text-amber-700',
    SENT: 'bg-green-100 text-green-700',
    OPEN: 'bg-blue-100 text-blue-700',
    CONVERTED: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {label ?? status}
    </span>
  );
}

/** Small pill shown once a customer has replied YES to confirm an invoice/reminder on WhatsApp. */
export function ConfirmedBadge({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
      {label}
    </span>
  );
}

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const timeAgo = (d: string | Date, t: Translate) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return t('common.secondsAgo', { count: s });
  if (s < 3600) return t('common.minutesAgo', { count: Math.floor(s / 60) });
  if (s < 86400) return t('common.hoursAgo', { count: Math.floor(s / 3600) });
  return t('common.daysAgo', { count: Math.floor(s / 86400) });
};
