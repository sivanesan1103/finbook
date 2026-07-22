import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage } from '../api/client';
import type { CashbookEntry } from '../types';
import { EmptyState, Money, PAYMENT_MODES as MODES, MODE_LABEL_KEYS, Spinner, useToast } from '../components/ui';

const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const fmtDayLabel = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const isToday = (dateStr: string) => new Date().toISOString().slice(0, 10) === dateStr;

type Pane =
  | { type: 'none' }
  | { type: 'form'; dir: 'IN' | 'OUT'; editing?: CashbookEntry }
  | { type: 'detail'; entry: CashbookEntry };

export default function Cashbook() {
  const { business } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [summary, setSummary] = useState({ totalBalance: 0, todayBalance: 0 });
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<Pane>({ type: 'none' });
  const [form, setForm] = useState({ amount: '', description: '', paymentMode: 'CASH', entryDate: date });
  const [submitting, setSubmitting] = useState(false);

  const base = `/businesses/${business?.id}/cashbook`;

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const [list, sum] = await Promise.all([
      api.get(base, { params: { date, paymentMode: mode, limit: 100 } }),
      api.get(`${base}/summary`),
    ]);
    setEntries(list.data.data);
    setSummary(sum.data.data);
    setLoading(false);
  }, [business, date, mode]);

  // Switching businesses re-runs `load` (business is in its deps), but the
  // detail/edit pane isn't part of that state — reset it or it keeps showing
  // the previous business's entry.
  useEffect(() => { load(); setPane({ type: 'none' }); }, [load]);

  const openForm = (dir: 'IN' | 'OUT', editing?: CashbookEntry) => {
    setForm(editing
      ? {
          amount: String(Number(editing.amount)),
          description: editing.description || '',
          paymentMode: editing.paymentMode,
          entryDate: editing.entryDate.slice(0, 10),
        }
      : { amount: '', description: '', paymentMode: 'CASH', entryDate: date });
    setPane({ type: 'form', dir, editing });
  };

  const save = async () => {
    if (pane.type !== 'form' || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        direction: pane.dir,
        amount: Number(form.amount),
        description: form.description || undefined,
        paymentMode: form.paymentMode,
        entryDate: new Date(form.entryDate + 'T12:00:00').toISOString(),
      };
      if (pane.editing) {
        await api.patch(`${base}/${pane.editing.id}`, payload);
        toast(t('cashbook.entryUpdated'));
      } else {
        await api.post(base, payload);
        toast(pane.dir === 'IN' ? t('cashbook.inEntrySaved') : t('cashbook.outEntrySaved'));
      }
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSubmitting(false); }
  };

  const remove = async (entry: CashbookEntry) => {
    if (!confirm(t('cashbook.confirmDeleteEntry'))) return;
    try {
      await api.delete(`${base}/${entry.id}`);
      toast(t('cashbook.entryDeleted'));
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const downloadReport = async () => {
    try {
      const res = await api.get(`${base}/report.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'cashbook-report.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const totalIn = entries.filter((e) => e.direction === 'IN').reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = entries.filter((e) => e.direction === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
  const selectedId = pane.type === 'detail' ? pane.entry.id : pane.type === 'form' ? pane.editing?.id : undefined;

  return (
    <div className="flex h-full">
      {/* ── Left: list ── */}
      <div className="flex-1 min-w-0 p-6 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">{t('cashbook.title')}</h1>

        <div className="card p-4 flex items-center gap-10 mb-4">
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-slate-500">{t('cashbook.totalBalance')}</p>
            <Money value={summary.totalBalance} colored={false} className="text-lg text-link-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-slate-500">{t('cashbook.todaysBalance')}</p>
            <Money value={summary.todayBalance} colored={false} className="text-lg text-link-600" />
          </div>
          <button className="btn border border-link-500 text-link-600 hover:bg-link-50 ml-auto" onClick={downloadReport}>
            {t('cashbook.viewReport')}
          </button>
        </div>

        <div className="card p-4 flex gap-6 mb-4">
          <div>
            <label className="label">{t('cashbook.date')}</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="border-l border-slate-200 pl-6">
            <label className="label">{t('cashbook.paymentMode')}</label>
            <select className="input min-w-[180px]" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="ALL">{t('cashbook.all')}</option>
              {MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL_KEYS[m])}</option>)}
            </select>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <span>{t('cashbook.name')}</span><span className="text-right">{t('cashbook.out')}</span><span className="text-right">{t('cashbook.in')}</span>
          </div>

          {/* Day header with totals */}
          <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 bg-slate-50/60 border-b border-slate-100 items-center">
            <div>
              <p className="font-bold text-slate-800">{fmtDayLabel(date)}{isToday(date) ? ` ${t('cashbook.today')}` : ''}</p>
              <p className="text-xs text-slate-400">{t('cashbook.entriesCount', { count: entries.length })}</p>
            </div>
            <span className="text-right font-semibold text-get">
              {totalOut > 0 ? <Money value={totalOut} colored={false} className="text-get" /> : '₹--'}
            </span>
            <span className="text-right font-semibold text-give">
              {totalIn > 0 ? <Money value={totalIn} colored={false} className="text-give" /> : '₹--'}
            </span>
          </div>

          {loading ? <Spinner /> : entries.length === 0 ? (
            <EmptyState icon="📔" title={t('cashbook.addFirstTransaction')} subtitle={t('cashbook.emptySubtitle')} />
          ) : (
            entries.map((e) => (
              <button
                key={e.id}
                className={`w-full grid grid-cols-[1fr_120px_120px] px-5 py-4 items-center text-left border-b border-slate-50 last:border-0 transition
                  ${selectedId === e.id ? 'bg-link-50' : 'hover:bg-slate-50'}`}
                onClick={() => setPane({ type: 'detail', entry: e })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">🧾</span>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      {fmtTime(e.entryDate)}
                      <span className="px-1.5 py-0.5 rounded bg-link-50 text-link-600 text-[10px] font-bold tracking-wide">
                        {e.paymentMode}
                      </span>
                    </p>
                    <p className="font-medium text-slate-800 truncate">
                      {e.description ? t('cashbook.descriptionPrefix', { desc: e.description }) : t('cashbook.noDescription')}
                    </p>
                  </div>
                </div>
                <span className="text-right">
                  {e.direction === 'OUT' ? <Money value={e.amount} colored={false} className="text-get" /> : <span className="text-slate-300">-</span>}
                </span>
                <span className="text-right">
                  {e.direction === 'IN' ? <Money value={e.amount} colored={false} className="text-give" /> : <span className="text-slate-300">-</span>}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="card mt-4 p-4 flex gap-4">
          <button className="flex-1 py-3 rounded-lg bg-red-100 text-red-700 font-bold tracking-wide hover:bg-red-200"
            onClick={() => openForm('OUT')}>{t('cashbook.outButton')}</button>
          <button className="flex-1 py-3 rounded-lg bg-green-100 text-green-700 font-bold tracking-wide hover:bg-green-200"
            onClick={() => openForm('IN')}>{t('cashbook.inButton')}</button>
        </div>
      </div>

      {/* ── Right: panel ── */}
      <div className="w-[400px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:block">
        {pane.type === 'none' && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <span className="text-6xl mb-3">👥</span>
            <p className="font-semibold text-slate-600">{t('cashbook.noTransactionSelected')}</p>
          </div>
        )}

        {pane.type === 'form' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className={`font-bold text-lg ${pane.dir === 'IN' ? 'text-give' : 'text-get'}`}>
                {pane.editing ? t('cashbook.editPrefix') : ''}{pane.dir === 'IN' ? t('cashbook.inEntry') : t('cashbook.outEntry')}
              </h3>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
            </div>

            <label className="label">{t('cashbook.amount')}</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
              <input className="input pl-7 text-lg font-semibold" type="number" placeholder={t('cashbook.enterAmount')} autoFocus
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>

            <label className="label">{t('cashbook.description')}</label>
            <textarea className="input mb-4 min-h-[100px] resize-none" placeholder={t('cashbook.enterDetails')}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <label className="label">{t('cashbook.paymentMode')}</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
              {MODES.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="paymentMode" className="accent-link-600"
                    checked={form.paymentMode === m} onChange={() => setForm({ ...form, paymentMode: m })} />
                  {t(MODE_LABEL_KEYS[m])}
                </label>
              ))}
            </div>

            <label className="label">{t('cashbook.date')}</label>
            <input type="date" className="input mb-6" value={form.entryDate}
              onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />

            <button
              className={`w-full py-3 rounded-lg font-bold text-white transition disabled:bg-slate-200 disabled:text-slate-400
                ${pane.dir === 'IN' ? 'bg-give hover:brightness-110' : 'bg-get hover:brightness-110'}`}
              disabled={submitting || !form.amount || Number(form.amount) <= 0}
              onClick={save}
            >
              {t('cashbook.save')}
            </button>
          </div>
        )}

        {pane.type === 'detail' && (
          <div>
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-2xl font-bold
                  ${pane.entry.direction === 'IN' ? 'bg-give' : 'bg-get'}`}>
                  {pane.entry.direction === 'IN' ? '+' : '−'}
                </span>
                <div>
                  <p className="font-bold text-slate-800">{pane.entry.direction}</p>
                  <p className="text-xs text-slate-500">{fmtTime(pane.entry.entryDate)} {new Date(pane.entry.entryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn border border-link-500 text-link-600 hover:bg-link-50"
                  onClick={() => openForm(pane.entry.direction, pane.entry)}>{t('cashbook.edit')}</button>
                <button className="btn-danger" onClick={() => remove(pane.entry)}>{t('cashbook.delete')}</button>
              </div>
            </div>

            <div className="p-5 text-right border-b border-slate-100">
              <Money value={pane.entry.amount} colored={false}
                className={`text-2xl ${pane.entry.direction === 'IN' ? 'text-give' : 'text-get'}`} />
              <p className="text-sm font-semibold text-link-600 mt-1">{pane.entry.paymentMode}</p>
            </div>

            <div className="p-5 flex gap-3">
              <span className="text-slate-400 text-lg">📝</span>
              <div>
                <p className="font-semibold text-slate-700 mb-1">{t('cashbook.description')}</p>
                <p className="text-slate-600 whitespace-pre-wrap">{pane.entry.description || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
