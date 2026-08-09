import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage, isForbidden } from '../api/client';
import type { CashbookEntry } from '../types';
import { EmptyState, LockedState, Modal, Money, PAYMENT_MODES as MODES, MODE_LABEL_KEYS, Spinner, localDateStr, useConfirm, useToast } from '../components/ui';

const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const fmtDayLabel = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const isToday = (dateStr: string) => localDateStr() === dateStr;

type Pane =
  | { type: 'none' }
  | { type: 'form'; dir: 'IN' | 'OUT'; editing?: CashbookEntry }
  | { type: 'detail'; entry: CashbookEntry };

export default function Cashbook() {
  const { business } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [summary, setSummary] = useState({ totalBalance: 0, todayBalance: 0 });
  const [date, setDate] = useState(() => localDateStr());
  const [mode, setMode] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [pane, setPane] = useState<Pane>({ type: 'none' });
  const [form, setForm] = useState({ amount: '', description: '', paymentMode: 'CASH', entryDate: date });
  const [submitting, setSubmitting] = useState(false);

  const base = `/businesses/${business?.id}/cashbook`;

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    setForbidden(false);
    try {
      // A single page (limit:100) isn't enough to total the day correctly —
      // a busy shop can log more than 100 entries in one day. Page through
      // all of them before computing totals, same as Reports.tsx does for
      // its cashbook report.
      const all: CashbookEntry[] = [];
      let page = 1, pages = 1;
      do {
        const res = await api.get(base, { params: { date, paymentMode: mode, page, limit: 100 } });
        all.push(...res.data.data);
        pages = res.data.meta.pages;
        page++;
      } while (page <= pages && page <= 50);
      const sum = await api.get(`${base}/summary`);
      setEntries(all);
      setSummary(sum.data.data);
    } catch (e) {
      if (isForbidden(e)) setForbidden(true); else toast(apiMessage(e), 'error');
    } finally {
      setLoading(false);
    }
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
    if (!(await confirm({ message: t('cashbook.confirmDeleteEntry'), danger: true }))) return;
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
      {/* ── List (full width — the form/detail panel below is a modal so it works on any screen size) ── */}
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0">
        <div className="p-6 pb-0 shrink-0">
          <h1 className="text-xl font-bold mb-4">📔 {t('cashbook.title')}</h1>

          <div className="card p-4 flex items-center gap-10 mb-4">
            <div className="flex items-baseline gap-2">
              <p className="text-sm text-slate-500">{t('cashbook.totalBalance')}</p>
              <Money value={summary.totalBalance} className="text-lg" />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-sm text-slate-500">{t('cashbook.todaysBalance')}</p>
              <Money value={summary.todayBalance} className="text-lg" />
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
        </div>

        {/* Only this middle section scrolls — header and IN/OUT buttons stay put */}
        <div className="flex-1 min-h-0 px-6 flex flex-col">
          <div className="card overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 shrink-0">
              <span>{t('cashbook.name')}</span><span className="text-right">{t('cashbook.out')}</span><span className="text-right">{t('cashbook.in')}</span>
            </div>

            {/* Day header with totals */}
            <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 bg-slate-50/60 border-b border-slate-100 items-center shrink-0">
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

            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? <Spinner /> : forbidden ? <LockedState /> : entries.length === 0 ? (
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
          </div>
        </div>

        {!forbidden && (
          <div className="p-6 pt-4 shrink-0">
            <div className="card p-4 flex gap-4">
              <button className="flex-1 py-3 rounded-lg bg-red-100 text-red-700 font-bold tracking-wide hover:bg-red-200"
                onClick={() => openForm('OUT')}>{t('cashbook.outButton')}</button>
              <button className="flex-1 py-3 rounded-lg bg-green-100 text-green-700 font-bold tracking-wide hover:bg-green-200"
                onClick={() => openForm('IN')}>{t('cashbook.inButton')}</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Form / detail panel — a modal overlay so it's reachable on every screen size, not just desktop widths ── */}
      <Modal
        open={pane.type === 'form'}
        onClose={() => setPane({ type: 'none' })}
        title={pane.type === 'form' ? (
          <span className={pane.dir === 'IN' ? 'text-give' : 'text-get'}>
            {pane.editing ? t('cashbook.editPrefix') : ''}{pane.dir === 'IN' ? t('cashbook.inEntry') : t('cashbook.outEntry')}
          </span>
        ) : ''}
      >
        {pane.type === 'form' && (
          <div>
            <label className="label">{t('cashbook.amount')}</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
              <input className="input pl-7 text-lg font-semibold" type="number" placeholder={t('cashbook.enterAmount')} autoFocus
                value={form.amount} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
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
      </Modal>

      <Modal
        open={pane.type === 'detail'}
        onClose={() => setPane({ type: 'none' })}
        title={pane.type === 'detail' ? (pane.entry.direction === 'IN' ? t('cashbook.inEntry') : t('cashbook.outEntry')) : ''}
      >
        {pane.type === 'detail' && (
          <div className="-m-5">
            <div className={`p-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-br ${
              pane.entry.direction === 'IN' ? 'from-give/10' : 'from-get/10'} to-white`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 shadow-sm
                  ${pane.entry.direction === 'IN' ? 'bg-give' : 'bg-get'}`}>
                  {pane.entry.direction === 'IN' ? '+' : '−'}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800">{pane.entry.direction}</p>
                  <p className="text-xs text-slate-500">{fmtTime(pane.entry.entryDate)} {new Date(pane.entry.entryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
              {pane.entry.transactionId || pane.entry.expenseId ? (
                <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-3 py-1.5 shrink-0">
                  {pane.entry.expenseId ? t('cashbook.linkedToExpense') : t('cashbook.linkedToLedger')}
                </span>
              ) : (
                <div className="flex gap-2 shrink-0">
                  <button className="btn border border-link-500 text-link-600 hover:bg-link-50"
                    onClick={() => openForm(pane.entry.direction, pane.entry)}>{t('cashbook.edit')}</button>
                  <button className="btn-danger" onClick={() => remove(pane.entry)}>{t('cashbook.delete')}</button>
                </div>
              )}
            </div>

            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wide text-link-600 bg-link-50 rounded-full px-3 py-1.5">
                {pane.entry.paymentMode}
              </span>
              <Money value={pane.entry.amount} colored={false}
                className={`text-2xl ${pane.entry.direction === 'IN' ? 'text-give' : 'text-get'}`} />
            </div>

            <div className="p-5">
              <div className="rounded-xl border border-slate-200 p-4 flex gap-3 shadow-sm">
                <span className="text-slate-400 text-lg shrink-0">📝</span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-700 mb-1">{t('cashbook.description')}</p>
                  <p className="text-slate-600 whitespace-pre-wrap">{pane.entry.description || '—'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
