import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, apiMessage } from '../api/client';
import type { CashbookEntry } from '../types';
import { EmptyState, Money, PAYMENT_MODES as MODES, Spinner, modeLabel, useToast } from '../components/ui';

const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const fmtDayLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const today = new Date().toISOString().slice(0, 10) === dateStr;
  return today ? `${label} (TODAY)` : label;
};

type Pane =
  | { type: 'none' }
  | { type: 'form'; dir: 'IN' | 'OUT'; editing?: CashbookEntry }
  | { type: 'detail'; entry: CashbookEntry };

export default function Cashbook() {
  const { business } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [summary, setSummary] = useState({ totalBalance: 0, todayBalance: 0 });
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<Pane>({ type: 'none' });
  const [form, setForm] = useState({ amount: '', description: '', paymentMode: 'CASH', entryDate: date });

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

  useEffect(() => { load(); }, [load]);

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
    if (pane.type !== 'form') return;
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
        toast('Entry updated');
      } else {
        await api.post(base, payload);
        toast(`${pane.dir === 'IN' ? 'In' : 'Out'} entry saved`);
      }
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const remove = async (entry: CashbookEntry) => {
    if (!confirm('Delete this entry?')) return;
    await api.delete(`${base}/${entry.id}`);
    toast('Entry deleted');
    setPane({ type: 'none' });
    await load();
  };

  const downloadReport = async () => {
    const res = await api.get(`${base}/report.pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = 'cashbook-report.pdf'; a.click();
    URL.revokeObjectURL(url);
  };

  const totalIn = entries.filter((e) => e.direction === 'IN').reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = entries.filter((e) => e.direction === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
  const selectedId = pane.type === 'detail' ? pane.entry.id : pane.type === 'form' ? pane.editing?.id : undefined;

  return (
    <div className="flex h-full">
      {/* ── Left: list ── */}
      <div className="flex-1 min-w-0 p-6 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Cashbook</h1>

        <div className="card p-4 flex items-center gap-10 mb-4">
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-slate-500">Total Balance</p>
            <Money value={summary.totalBalance} colored={false} className="text-lg text-link-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-slate-500">Todays Balance</p>
            <Money value={summary.todayBalance} colored={false} className="text-lg text-link-600" />
          </div>
          <button className="btn border border-link-500 text-link-600 hover:bg-link-50 ml-auto" onClick={downloadReport}>
            📄 View Report
          </button>
        </div>

        <div className="card p-4 flex gap-6 mb-4">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="border-l border-slate-200 pl-6">
            <label className="label">Payment Mode</label>
            <select className="input min-w-[180px]" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="ALL">All</option>
              {MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
            </select>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <span>Name</span><span className="text-right">Out</span><span className="text-right">In</span>
          </div>

          {/* Day header with totals */}
          <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 bg-slate-50/60 border-b border-slate-100 items-center">
            <div>
              <p className="font-bold text-slate-800">{fmtDayLabel(date)}</p>
              <p className="text-xs text-slate-400">{entries.length} Entries</p>
            </div>
            <span className="text-right font-semibold text-get">
              {totalOut > 0 ? <Money value={totalOut} colored={false} className="text-get" /> : '₹--'}
            </span>
            <span className="text-right font-semibold text-give">
              {totalIn > 0 ? <Money value={totalIn} colored={false} className="text-give" /> : '₹--'}
            </span>
          </div>

          {loading ? <Spinner /> : entries.length === 0 ? (
            <EmptyState icon="📔" title="Add your first transaction" subtitle="Looks a bit empty in here!" />
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
                      {e.description ? `Description: ${e.description}` : '(no description)'}
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
            onClick={() => openForm('OUT')}>OUT</button>
          <button className="flex-1 py-3 rounded-lg bg-green-100 text-green-700 font-bold tracking-wide hover:bg-green-200"
            onClick={() => openForm('IN')}>IN</button>
        </div>
      </div>

      {/* ── Right: panel ── */}
      <div className="w-[400px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:block">
        {pane.type === 'none' && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <span className="text-6xl mb-3">👥</span>
            <p className="font-semibold text-slate-600">No transaction selected</p>
          </div>
        )}

        {pane.type === 'form' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className={`font-bold text-lg ${pane.dir === 'IN' ? 'text-give' : 'text-get'}`}>
                {pane.editing ? 'Edit ' : ''}{pane.dir === 'IN' ? 'In Entry' : 'Out Entry'}
              </h3>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
            </div>

            <label className="label">Amount</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
              <input className="input pl-7 text-lg font-semibold" type="number" placeholder="Enter Amount" autoFocus
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>

            <label className="label">Description</label>
            <textarea className="input mb-4 min-h-[100px] resize-none" placeholder="Enter Details (Item Name, Bill No, Quantity, etc)"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <label className="label">Payment Mode</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
              {MODES.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="paymentMode" className="accent-link-600"
                    checked={form.paymentMode === m} onChange={() => setForm({ ...form, paymentMode: m })} />
                  {modeLabel(m)}
                </label>
              ))}
            </div>

            <label className="label">Date</label>
            <input type="date" className="input mb-6" value={form.entryDate}
              onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />

            <button
              className={`w-full py-3 rounded-lg font-bold text-white transition disabled:bg-slate-200 disabled:text-slate-400
                ${pane.dir === 'IN' ? 'bg-give hover:brightness-110' : 'bg-get hover:brightness-110'}`}
              disabled={!form.amount || Number(form.amount) <= 0}
              onClick={save}
            >
              Save
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
                  onClick={() => openForm(pane.entry.direction, pane.entry)}>✏️ Edit</button>
                <button className="btn-danger" onClick={() => remove(pane.entry)}>🗑 Delete</button>
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
                <p className="font-semibold text-slate-700 mb-1">Description</p>
                <p className="text-slate-600 whitespace-pre-wrap">{pane.entry.description || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
