import { ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';
import type { TranslationKey } from '../i18n';
import { useLanguage } from '../context/LanguageContext';

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

/**
 * Neutralises spreadsheet formula injection for a value that will be written
 * to an .xlsx/.csv cell. A cell beginning with = + - @ (or tab/CR) is
 * interpreted as a formula by Excel/Sheets, so a party named
 * `=cmd|'/c calc'!A1` would execute on whoever opens the export. Prefixing a
 * single quote forces it to be treated as literal text. Non-strings pass
 * through untouched so numbers stay numeric in the sheet.
 */
export const csvSafe = <T,>(v: T): T | string => {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
};

/**
 * Indian-format money.
 *
 * Colour convention across the app (the `give`/`get` token names are
 * historical and read backwards — go by the colour, not the name):
 *   text-give = green = money coming in / owed to you  (positive)
 *   text-get  = red   = money going out / you owe      (negative)
 *
 * With `colored`, a positive amount is therefore green and a negative one
 * red. This used to be inverted, which showed a customer who owed you money
 * in red and money you owed in green on every balance in the app.
 */
export function Money({ value, colored = true, className = '' }: { value: number | string; colored?: boolean; className?: string }) {
  const n = Number(value);
  const color = !colored ? '' : n > 0 ? 'text-give' : n < 0 ? 'text-get' : 'text-slate-500';
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

export function EmptyState({ icon = '📒', illustration, title, subtitle, action }: { icon?: string; illustration?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {illustration ?? <div className="text-5xl mb-3">{icon}</div>}
      <p className="font-semibold text-slate-700 mt-4">{title}</p>
      {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Larger on-brand illustration for empty states that need more visual weight than an emoji icon. */
export function PeopleIllustration({ size = 140 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" rx="44" fill="#FDECED" />
      <g fill="#C92F34" opacity="0.55">
        <circle cx="82" cy="78" r="30" />
        <path d="M40 158c0-32 18.8-49 42-49s42 17 42 49" />
      </g>
      <g fill="#A92428">
        <circle cx="124" cy="82" r="32" />
        <path d="M78 160c0-34 20.6-52 46-52s46 18 46 52" />
      </g>
    </svg>
  );
}

/** Shown instead of a page's content when the staff member's role doesn't have permission for it. */
export function LockedState() {
  const { t } = useLanguage();
  return <EmptyState icon="🔒" title={t('common.noAccessTitle')} subtitle={t('common.noAccessSubtitle')} />;
}

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
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

// ── Confirm dialog (replaces window.confirm, which blocks the tab and can't be styled) ──
type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    []
  );
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} title={state?.opts.title || 'Confirm'} onClose={() => close(false)}>
        {state && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{state.opts.message}</p>
            <div className="flex gap-2 justify-end">
              <button className="btn-outline" onClick={() => close(false)}>{state.opts.cancelLabel || 'Cancel'}</button>
              <button className={state.opts.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
                {state.opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
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

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Local calendar date as YYYY-MM-DD — Date#toISOString() always converts to
// UTC, which silently rolls the date back for anyone east of Greenwich
// between midnight and their UTC offset (all of India, every single night).
export const localDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
