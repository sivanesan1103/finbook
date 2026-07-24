import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage } from '../api/client';
import type { Invoice, InvoiceItem, Item, Party } from '../types';
import { EmptyState, Money, MODE_LABEL_KEYS, PAYMENT_MODES as MODES, Spinner, StatusBadge, STATUS_LABEL_KEYS, fmtDate, inr, useConfirm, useToast } from '../components/ui';

type Pane =
  | { type: 'none' }
  | { type: 'detail'; invoice: Invoice }
  | { type: 'create' };

export default function Invoices() {
  const { business } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState({ totalBilled: 0, totalCollected: 0 });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'oldest'>('latest');
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<Pane>({ type: 'none' });
  const [submitting, setSubmitting] = useState(false);

  // collect-payment state (inline in detail panel)
  const [collecting, setCollecting] = useState(false);
  const [payment, setPayment] = useState({ amount: '', mode: 'CASH' });

  // create-invoice state
  const [parties, setParties] = useState<Party[]>([]);
  const [catalogue, setCatalogue] = useState<Item[]>([]);
  const [partyId, setPartyId] = useState('');
  const [lines, setLines] = useState<InvoiceItem[]>([{ name: '', qty: 1, price: 0, taxRate: 0 }]);
  const [discount, setDiscount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const base = `/businesses/${business?.id}`;

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const res = await api.get(`${base}/invoices`, { params: { status: status || undefined, limit: 100 } });
    setRows(res.data.data);
    setSummary(res.data.summary);
    setLoading(false);
  }, [business, status]);

  // `business` in `load`'s deps means switching businesses re-runs this, but
  // the detail/create pane isn't part of that state — without resetting it
  // here it keeps showing the previous business's invoice.
  useEffect(() => { load(); setPane({ type: 'none' }); }, [load]);

  const openDetail = async (inv: Invoice) => {
    setCollecting(false);
    try {
      const res = await api.get(`${base}/invoices/${inv.id}`);
      setPane({ type: 'detail', invoice: res.data.data });
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const openCreate = async () => {
    try {
      const [p, i] = await Promise.all([
        api.get(`${base}/parties`, { params: { limit: 100 } }),
        api.get(`${base}/items`, { params: { limit: 100 } }),
      ]);
      setParties(p.data.data);
      setCatalogue(i.data.data);
      setPartyId(p.data.data[0]?.id || '');
      setLines([{ name: '', qty: 1, price: 0, taxRate: 0 }]);
      setDiscount('');
      setDueDate('');
      setNotes('');
      setPane({ type: 'create' });
      if (p.data.data.length === 0) toast(t('invoices.addCustomerFirst'), 'info');
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const setLine = (idx: number, patch: Partial<InvoiceItem>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const pickCatalogue = (idx: number, itemId: string) => {
    const it = catalogue.find((c) => c.id === itemId);
    if (it) setLine(idx, { itemId: it.id, name: it.name, price: Number(it.salePrice), taxRate: Number(it.taxRate) });
    else setLine(idx, { itemId: undefined });
  };

  const totals = lines.reduce(
    (acc, l) => {
      const baseAmt = l.qty * l.price;
      acc.subtotal += baseAmt;
      acc.tax += (baseAmt * (l.taxRate || 0)) / 100;
      return acc;
    },
    { subtotal: 0, tax: 0 },
  );
  const grandTotal = totals.subtotal + totals.tax - Number(discount || 0);

  const createInvoice = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`${base}/invoices`, {
        partyId,
        items: lines.filter((l) => l.name.trim() && l.qty > 0),
        discount: Number(discount || 0) || undefined,
        dueDate: dueDate ? new Date(dueDate + 'T12:00:00').toISOString() : undefined,
        notes: notes || undefined,
      });
      toast(t('invoices.invoiceCreated'));
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSubmitting(false); }
  };

  const collect = async (invoice: Invoice) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`${base}/invoices/${invoice.id}/payments`, {
        amount: Number(payment.amount), mode: payment.mode,
      });
      toast(t('invoices.paymentRecorded'));
      setCollecting(false);
      setPayment({ amount: '', mode: 'CASH' });
      await load();
      await openDetail(invoice);
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSubmitting(false); }
  };

  const cancelInvoice = async (invoice: Invoice) => {
    if (!(await confirm({ message: t('invoices.confirmCancel', { no: invoice.invoiceNo }), danger: true }))) return;
    try {
      await api.post(`${base}/invoices/${invoice.id}/cancel`);
      toast(t('invoices.invoiceCancelled'));
      await load();
      await openDetail(invoice);
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const removeInvoice = async (invoice: Invoice) => {
    if (!(await confirm({ message: t('invoices.confirmDelete', { no: invoice.invoiceNo }), danger: true }))) return;
    try {
      await api.delete(`${base}/invoices/${invoice.id}`);
      toast(t('invoices.invoiceDeleted'));
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const downloadPdf = async (inv: Invoice) => {
    try {
      const res = await api.get(`${base}/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `invoice-${inv.invoiceNo}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.invoiceNo.toLowerCase().includes(q) || (r.party?.name || '').toLowerCase().includes(q))
      : rows;
    return [...filtered].sort((a, b) => {
      const d = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      return sort === 'latest' ? -d : d;
    });
  }, [rows, search, sort]);

  const selectedId = pane.type === 'detail' ? pane.invoice.id : undefined;
  const due = (inv: Invoice) => Number(inv.total) - Number(inv.amountPaid);

  return (
    <div className="flex h-full">
      {/* ── Left: summary + list ── */}
      <div className="flex-1 min-w-0 p-6 overflow-y-auto flex flex-col">
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-3">{t('invoices.transactionsSummary')}</p>
        <div className="card p-4 flex items-center gap-12 mb-4">
          <div>
            <p className="text-sm text-slate-500">{t('invoices.sales')}</p>
            <div className="flex items-center gap-2">
              <Money value={summary.totalBilled} colored={false} className="text-xl text-slate-800" />
              <span className="w-6 h-6 rounded-full bg-green-100 text-give flex items-center justify-center text-xs">↗</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-500">{t('invoices.collected')}</p>
            <Money value={summary.totalCollected} colored={false} className="text-xl text-give" />
          </div>
          <div>
            <p className="text-sm text-slate-500">{t('invoices.outstanding')}</p>
            <Money value={summary.totalBilled - summary.totalCollected} colored={false} className="text-xl text-get" />
          </div>
        </div>

        <div className="card p-4 flex gap-4 mb-4 items-end flex-wrap">
          <div className="flex-1 min-w-[180px] max-w-xs">
            <label className="label">{t('invoices.search')}</label>
            <input className="input" placeholder={t('invoices.searchPlaceholder')} value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('invoices.filters')}</label>
            <select className="input min-w-[140px]" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('invoices.allStatuses')}</option>
              {['UNPAID', 'PARTIAL', 'PAID', 'DRAFT', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('invoices.sortBy')}</label>
            <select className="input min-w-[140px]" value={sort} onChange={(e) => setSort(e.target.value as 'latest' | 'oldest')}>
              <option value="latest">{t('invoices.latestFirst')}</option>
              <option value="oldest">{t('invoices.oldestFirst')}</option>
            </select>
          </div>
        </div>

        <div className="card overflow-hidden flex-1">
          <div className="flex justify-between px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 bg-slate-50/60">
            <span>{t('invoices.name')}</span><span>{t('invoices.amount')}</span>
          </div>
          {loading ? <Spinner /> : visibleRows.length === 0 ? (
            <EmptyState icon="🧮" title={t('invoices.noSalesYet')}
              subtitle={t('invoices.noSalesSubtitle')} />
          ) : (
            visibleRows.map((inv) => (
              <button key={inv.id}
                className={`w-full flex items-center justify-between px-5 py-4 text-left border-b border-slate-50 last:border-0 transition
                  ${selectedId === inv.id ? 'bg-link-50' : 'hover:bg-slate-50'}`}
                onClick={() => openDetail(inv)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-link-50 flex items-center justify-center shrink-0">🧾</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{inv.party?.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">{inv.invoiceNo}</span>
                      {fmtDate(inv.issueDate)}
                      <StatusBadge status={inv.status} label={t(STATUS_LABEL_KEYS[inv.status])} />
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money value={inv.total} colored={false} className="text-slate-800" />
                  {due(inv) > 0 && inv.status !== 'CANCELLED' && (
                    <p className="text-[11px] text-get font-semibold">{t('invoices.due', { amount: inr(due(inv)) })}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-center py-4">
          <button className="btn-primary px-8 py-3" onClick={openCreate}>{t('invoices.addSale')}</button>
        </div>
      </div>

      {/* ── Right: panel ── */}
      <div className="w-[440px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:flex flex-col">
        {pane.type === 'none' && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <span className="text-6xl mb-3">🧾</span>
            <p className="font-semibold text-slate-600">{t('invoices.noInvoiceSelected')}</p>
            <p className="text-sm mt-1">{t('invoices.selectSaleSubtitle')}</p>
          </div>
        )}

        {/* ── Detail ── */}
        {pane.type === 'detail' && (() => {
          const inv = pane.invoice;
          const balance = due(inv);
          return (
            <div>
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-block px-3 py-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">{t('invoices.saleLabel')}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={inv.status} label={t(STATUS_LABEL_KEYS[inv.status])} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-slate-800">{inv.invoiceNo}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{inv.party?.name} · {fmtDate(inv.issueDate)}</p>
                    {inv.dueDate && <p className="text-xs text-slate-400">{t('invoices.dueDate', { date: fmtDate(inv.dueDate) })}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn border border-link-500 text-link-600 hover:bg-link-50" onClick={() => downloadPdf(inv)}>{t('invoices.pdf')}</button>
                    <button className="btn-danger" onClick={() => removeInvoice(inv)}>🗑</button>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <p className="px-4 py-2.5 bg-slate-50 text-xs font-bold tracking-widest text-slate-500 uppercase">{t('invoices.items')}</p>
                  {(inv.items || []).map((it, idx) => (
                    <div key={idx} className="px-4 py-3 flex justify-between border-t border-slate-100">
                      <div>
                        <p className="font-medium text-slate-800">{it.name}</p>
                        <p className="text-xs text-slate-400">
                          {Number(it.qty)} × {inr(it.price)}
                          {Number(it.taxRate) > 0 && ` · GST ${Number(it.taxRate)}%`}
                        </p>
                      </div>
                      <Money value={it.amount || 0} colored={false} className="text-slate-700" />
                    </div>
                  ))}
                  <div className="px-4 py-3 space-y-1 border-t border-slate-100 text-sm">
                    <div className="flex justify-between text-slate-500"><span>{t('invoices.subtotal')}</span><Money value={inv.subtotal} colored={false} className="text-slate-600" /></div>
                    <div className="flex justify-between text-slate-500"><span>{t('invoices.tax')}</span><Money value={inv.taxAmount} colored={false} className="text-slate-600" /></div>
                    {Number(inv.discount) > 0 && (
                      <div className="flex justify-between text-slate-500"><span>{t('invoices.discount')}</span><span className="font-semibold text-give">− {inr(inv.discount)}</span></div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-4 px-1">
                  <p className="font-bold text-slate-800">{t('invoices.grossTotal')}</p>
                  <Money value={inv.total} colored={false} className="text-lg text-slate-900" />
                </div>
                <div className="flex justify-between items-center mt-1 px-1 text-sm">
                  <p className="text-slate-500">{t('invoices.paid')}</p>
                  <Money value={inv.amountPaid} colored={false} className="text-give" />
                </div>
                {balance > 0 && inv.status !== 'CANCELLED' && (
                  <div className="flex justify-between items-center mt-1 px-1 text-sm">
                    <p className="text-slate-500">{t('invoices.balanceDue')}</p>
                    <Money value={balance} colored={false} className="text-get" />
                  </div>
                )}

                {(inv.payments || []).length > 0 && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden mt-5">
                    <p className="px-4 py-2.5 bg-slate-50 text-xs font-bold tracking-widest text-slate-500 uppercase">{t('invoices.payments')}</p>
                    {(inv.payments || []).map((p) => (
                      <div key={p.id} className="px-4 py-2.5 flex justify-between border-t border-slate-100 text-sm">
                        <span className="text-slate-500">{fmtDate(p.paidAt)} · {t(MODE_LABEL_KEYS[p.mode])}</span>
                        <Money value={p.amount} colored={false} className="text-give" />
                      </div>
                    ))}
                  </div>
                )}

                {balance > 0 && (inv.status === 'UNPAID' || inv.status === 'PARTIAL') && (
                  !collecting ? (
                    <button className="w-full mt-5 py-3 rounded-lg font-bold text-white bg-give hover:brightness-110"
                      onClick={() => { setCollecting(true); setPayment({ amount: String(balance), mode: 'CASH' }); }}>
                      {t('invoices.collectPayment')}
                    </button>
                  ) : (
                    <div className="rounded-lg bg-slate-50 p-3 mt-5 space-y-2">
                      <p className="font-semibold text-sm">{t('invoices.collectPaymentDue', { amount: inr(balance) })}</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                        <input className="input pl-7 font-semibold" type="number" autoFocus value={payment.amount}
                          onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
                      </div>
                      <select className="input" value={payment.mode} onChange={(e) => setPayment({ ...payment, mode: e.target.value })}>
                        {MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL_KEYS[m])}</option>)}
                      </select>
                      <div className="flex gap-2 pt-1">
                        <button className="btn border border-slate-300 text-slate-600 flex-1 justify-center" onClick={() => setCollecting(false)}>{t('invoices.cancel')}</button>
                        <button className="btn-success flex-1 justify-center" onClick={() => collect(inv)}
                          disabled={submitting || !payment.amount || Number(payment.amount) <= 0}>{t('invoices.record')}</button>
                      </div>
                    </div>
                  )
                )}

                {inv.status !== 'CANCELLED' && inv.status !== 'PAID' && (
                  <button className="w-full mt-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-50 border border-slate-200"
                    onClick={() => cancelInvoice(inv)}>
                    {t('invoices.cancelInvoice')}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Create ── */}
        {pane.type === 'create' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">{t('invoices.createSale')}</h3>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
            </div>

            <label className="label">{t('invoices.billTo')}</label>
            <select className="input mb-4" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              {parties.length === 0 && <option value="">{t('invoices.noPartiesOption')}</option>}
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">{t('invoices.dueDateLabel')}</label>
                <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label className="label">{t('invoices.discountRupee')}</label>
                <input className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 mb-4">
              <p className="font-bold text-slate-800 mb-3">{t('invoices.items')}</p>
              <div className="space-y-3">
                {lines.map((l, idx) => (
                  <div key={idx} className="rounded-lg bg-slate-50 p-3 space-y-2">
                    <div className="flex gap-2">
                      <select className="input" value={l.itemId || ''} onChange={(e) => pickCatalogue(idx, e.target.value)}>
                        <option value="">{t('invoices.customItem')}</option>
                        {catalogue.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button className="text-slate-300 hover:text-red-500 px-1"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls))}>✕</button>
                    </div>
                    <input className="input" placeholder={t('invoices.itemNamePlaceholder')} value={l.name} onChange={(e) => setLine(idx, { name: e.target.value })} />
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block text-[11px] text-slate-500">{t('invoices.qty')}
                        <input className="input mt-0.5" type="number" min="0" value={l.qty} onChange={(e) => setLine(idx, { qty: Number(e.target.value) })} />
                      </label>
                      <label className="block text-[11px] text-slate-500">{t('invoices.rate')}
                        <input className="input mt-0.5" type="number" min="0" value={l.price} onChange={(e) => setLine(idx, { price: Number(e.target.value) })} />
                      </label>
                      <label className="block text-[11px] text-slate-500">{t('invoices.gstPercent')}
                        <input className="input mt-0.5" type="number" min="0" value={l.taxRate} onChange={(e) => setLine(idx, { taxRate: Number(e.target.value) })} />
                      </label>
                    </div>
                    <p className="text-right text-xs text-slate-500">
                      {t('invoices.amountPrefix')} <b>{inr(l.qty * l.price * (1 + (l.taxRate || 0) / 100))}</b>
                    </p>
                  </div>
                ))}
              </div>
              <button className="w-full mt-3 py-2 rounded-lg border border-link-500 text-link-600 font-semibold hover:bg-link-50"
                onClick={() => setLines((ls) => [...ls, { name: '', qty: 1, price: 0, taxRate: 0 }])}>
                {t('invoices.addLine')}
              </button>
            </div>

            <label className="label">{t('invoices.notesLabel')}</label>
            <textarea className="input mb-4 min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={t('invoices.notesPlaceholder')} />

            <div className="rounded-xl border border-slate-200 p-4 mb-5 text-sm space-y-1">
              <div className="flex justify-between text-slate-500"><span>{t('invoices.subtotal')}</span><Money value={totals.subtotal} colored={false} className="text-slate-700" /></div>
              <div className="flex justify-between text-slate-500"><span>{t('invoices.tax')}</span><Money value={totals.tax} colored={false} className="text-slate-700" /></div>
              {Number(discount) > 0 && <div className="flex justify-between text-slate-500"><span>{t('invoices.discount')}</span><span>− {inr(discount)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-100"><span>{t('invoices.total')}</span><Money value={grandTotal} colored={false} className="text-slate-900" /></div>
            </div>

            <button className="w-full py-3 rounded-lg font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400"
              onClick={createInvoice}
              disabled={submitting || !partyId || lines.every((l) => !l.name.trim()) || grandTotal < 0}>
              {t('invoices.saveInvoice')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
