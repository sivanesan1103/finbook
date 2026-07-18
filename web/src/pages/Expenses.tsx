import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, apiMessage } from '../api/client';
import type { Expense, ExpenseItem } from '../types';
import { EmptyState, Money, PAYMENT_MODES as MODES, Spinner, fmtDate, modeLabel, useToast } from '../components/ui';

/** One picked expense item with quantity. */
type Picked = { item: ExpenseItem; qty: number };

const lineAmount = (p: Picked) => (p.item.price != null && p.item.price !== '' ? Number(p.item.price) * p.qty : 0);
const grossOf = (picked: Picked[]) => picked.reduce((s, p) => s + lineAmount(p), 0);

/** Notes are stored as one line per item: "name × qty = ₹amount". */
const buildNotes = (picked: Picked[]) =>
  picked.map((p) => `${p.item.name} × ${p.qty}${lineAmount(p) ? ` = ₹${lineAmount(p)}` : ''}`).join('\n');

const parseItems = (notes?: string | null) => {
  if (!notes) return [];
  const out: { name: string; qty: number; amount?: number }[] = [];
  for (const line of notes.split('\n')) {
    const m = line.match(/^(.+) × (\d+)(?: = ₹([\d.]+))?$/);
    if (!m) return []; // free-form notes → don't render as items
    out.push({ name: m[1], qty: Number(m[2]), amount: m[3] ? Number(m[3]) : undefined });
  }
  return out;
};

type Pane =
  | { type: 'none' }
  | { type: 'detail'; expense: Expense }
  | { type: 'create' }
  | { type: 'picker' }
  | { type: 'edit'; expense: Expense };

export default function Expenses() {
  const { business } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'oldest'>('latest');
  const [pane, setPane] = useState<Pane>({ type: 'none' });

  // Create-expense state
  const [picked, setPicked] = useState<Picked[]>([]);
  const [createForm, setCreateForm] = useState({ date: new Date().toISOString().slice(0, 10), paymentMode: 'CASH', amountPaid: '' });
  const [file, setFile] = useState<File | null>(null);

  // Item picker state
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '' });

  // Edit-expense state (plain fields — items breakdown stays editable as text)
  const [editForm, setEditForm] = useState({ category: '', amount: '', notes: '', paymentMode: 'CASH', date: '' });

  const base = `/businesses/${business?.id}/expenses`;

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const list = await api.get(base, { params: { limit: 100 } });
    setRows(list.data.data);
    setTotal(list.data.summary.totalAmount);
    setLoading(false);
  }, [business]);

  useEffect(() => { load(); }, [load]);

  const loadItems = useCallback(async () => {
    if (!business) return;
    const res = await api.get(`${base}/items`);
    setItems(res.data.data);
  }, [business]);

  const startCreate = () => {
    setPicked([]);
    setFile(null);
    setCreateForm({ date: new Date().toISOString().slice(0, 10), paymentMode: 'CASH', amountPaid: '' });
    setPane({ type: 'create' });
  };

  const openPicker = async () => {
    setItemSearch('');
    setSelectedOnly(false);
    setCreatingItem(false);
    setNewItem({ name: '', price: '' });
    setPane({ type: 'picker' });
    await loadItems();
  };

  const qtyOf = (id: string) => picked.find((p) => p.item.id === id)?.qty ?? 0;
  const setQty = (item: ExpenseItem, qty: number) => {
    setPicked((ps) => {
      const rest = ps.filter((p) => p.item.id !== item.id);
      return qty > 0
        ? [...rest, { item, qty }].sort((a, b) => a.item.name.localeCompare(b.item.name))
        : rest;
    });
  };

  const saveNewItem = async () => {
    try {
      const res = await api.post(`${base}/items`, {
        name: newItem.name.trim(),
        price: newItem.price ? Number(newItem.price) : undefined,
      });
      setCreatingItem(false);
      setNewItem({ name: '', price: '' });
      await loadItems();
      setQty(res.data.data, 1);
      toast('Expense item added');
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const removeItem = async (item: ExpenseItem) => {
    if (!confirm(`Delete expense item "${item.name}"?`)) return;
    await api.delete(`${base}/items/${item.id}`);
    setPicked((ps) => ps.filter((p) => p.item.id !== item.id));
    await loadItems();
  };

  const continueFromPicker = () => {
    const gross = grossOf(picked);
    setCreateForm((f) => ({ ...f, amountPaid: gross ? String(gross) : f.amountPaid }));
    setPane({ type: 'create' });
  };

  const saveExpense = async () => {
    if (picked.length === 0) return;
    const category = picked.length === 1 ? picked[0].item.name : `${picked[0].item.name} +${picked.length - 1} more`;
    try {
      const payload: Record<string, string> = {
        category: category.slice(0, 60),
        amount: createForm.amountPaid || String(grossOf(picked)),
        notes: buildNotes(picked),
        paymentMode: createForm.paymentMode,
        entryDate: new Date(createForm.date + 'T12:00:00').toISOString(),
      };
      let body: FormData | Record<string, string> = payload;
      if (file) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => fd.append(k, v));
        fd.append('attachment', file);
        body = fd;
      }
      await api.post(base, body);
      toast('Expense saved');
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const startEdit = (expense: Expense) => {
    setEditForm({
      category: expense.category,
      amount: String(Number(expense.amount)),
      notes: expense.notes || '',
      paymentMode: expense.paymentMode,
      date: expense.entryDate.slice(0, 10),
    });
    setPane({ type: 'edit', expense });
  };

  const saveEdit = async () => {
    if (pane.type !== 'edit') return;
    try {
      await api.patch(`${base}/${pane.expense.id}`, {
        category: editForm.category,
        amount: Number(editForm.amount),
        notes: editForm.notes || undefined,
        paymentMode: editForm.paymentMode,
        entryDate: new Date(editForm.date + 'T12:00:00').toISOString(),
      });
      toast('Expense updated');
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const remove = async (expense: Expense) => {
    if (!confirm('Delete this expense?')) return;
    await api.delete(`${base}/${expense.id}`);
    toast('Expense deleted');
    setPane({ type: 'none' });
    await load();
  };

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.category.toLowerCase().includes(q) || (r.notes || '').toLowerCase().includes(q))
      : rows;
    return [...filtered].sort((a, b) => {
      const d = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
      return sort === 'latest' ? -d : d;
    });
  }, [rows, search, sort]);

  const visibleItems = items.filter((i) => {
    if (selectedOnly && qtyOf(i.id) === 0) return false;
    return i.name.toLowerCase().includes(itemSearch.trim().toLowerCase());
  });

  const monthTotal = rows
    .filter((r) => new Date(r.entryDate).getMonth() === new Date().getMonth()
      && new Date(r.entryDate).getFullYear() === new Date().getFullYear())
    .reduce((s, r) => s + Number(r.amount), 0);

  const selectedId = pane.type === 'detail' ? pane.expense.id : pane.type === 'edit' ? pane.expense.id : undefined;
  const gross = grossOf(picked);

  return (
    <div className="flex h-full">
      {/* ── Left: summary + list ── */}
      <div className="flex-1 min-w-0 p-6 overflow-y-auto flex flex-col">
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-3">Transactions Summary</p>
        <div className="card p-4 flex items-center gap-12 mb-4">
          <div>
            <p className="text-sm text-slate-500">Expenses</p>
            <div className="flex items-center gap-2">
              <Money value={total} colored={false} className="text-xl text-slate-800" />
              <span className="w-6 h-6 rounded-full bg-green-100 text-give flex items-center justify-center text-xs">↗</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-500">This Month</p>
            <Money value={monthTotal} colored={false} className="text-xl text-slate-800" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Entries</p>
            <p className="text-xl font-semibold tabular-nums">{rows.length}</p>
          </div>
        </div>

        <div className="card p-4 flex gap-6 mb-4 items-end">
          <div className="flex-1 max-w-xs">
            <label className="label">Search</label>
            <input className="input" placeholder="Search for Expense Items" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="label">Sort by</label>
            <select className="input min-w-[160px]" value={sort} onChange={(e) => setSort(e.target.value as 'latest' | 'oldest')}>
              <option value="latest">Latest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        <div className="card overflow-hidden flex-1">
          <div className="flex justify-between px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 bg-slate-50/60">
            <span>Name</span><span>Amount</span>
          </div>
          {loading ? <Spinner /> : visibleRows.length === 0 ? (
            <EmptyState icon="🧾" title="Looks like you're yet to add your first expense"
              subtitle="Add your expenses with expense items and automatic cashbook entries" />
          ) : (
            visibleRows.map((e) => (
              <button key={e.id}
                className={`w-full flex items-center justify-between px-5 py-4 text-left border-b border-slate-50 last:border-0 transition
                  ${selectedId === e.id ? 'bg-link-50' : 'hover:bg-slate-50'}`}
                onClick={() => setPane({ type: 'detail', expense: e })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">💸</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{e.category}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDate(e.entryDate)} · {modeLabel(e.paymentMode)}</p>
                  </div>
                </div>
                <Money value={e.amount} colored={false} className="text-slate-800" />
              </button>
            ))
          )}
        </div>

        <div className="flex justify-center py-4">
          <button className="btn-primary px-8 py-3" onClick={startCreate}>+ Add Expense</button>
        </div>
      </div>

      {/* ── Right: panel ── */}
      <div className="w-[420px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:flex flex-col">
        {pane.type === 'none' && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <span className="text-6xl mb-3">🧾</span>
            <p className="font-semibold text-slate-600">Select an expense to view details</p>
          </div>
        )}

        {/* ── Detail ── */}
        {pane.type === 'detail' && (() => {
          const detailItems = parseItems(pane.expense.notes);
          return (
            <div>
              <div className="p-5 border-b border-slate-100">
                <span className="inline-block px-3 py-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 mb-3">Expense</span>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-slate-800">{pane.expense.category}</p>
                    <p className="text-sm text-slate-500 mt-1">{fmtDate(pane.expense.entryDate)} · {modeLabel(pane.expense.paymentMode)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn border border-link-500 text-link-600 hover:bg-link-50"
                      onClick={() => startEdit(pane.expense)}>✏️ Edit</button>
                    <button className="btn-danger" onClick={() => remove(pane.expense)}>🗑 Delete</button>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <p className="px-4 py-2.5 bg-slate-50 text-xs font-bold tracking-widest text-slate-500 uppercase">Items</p>
                  {detailItems.length > 0 ? detailItems.map((it, idx) => (
                    <div key={idx} className="px-4 py-3 flex justify-between border-t border-slate-100">
                      <div>
                        <p className="font-medium text-slate-800">{it.name}</p>
                        <p className="text-xs text-slate-400">Qty: {it.qty}</p>
                      </div>
                      {it.amount != null && <Money value={it.amount} colored={false} className="text-slate-700" />}
                    </div>
                  )) : (
                    <p className="px-4 py-3 text-sm text-slate-500 border-t border-slate-100 whitespace-pre-wrap">
                      {pane.expense.notes || 'No item details'}
                    </p>
                  )}
                  <div className="px-4 py-3 flex justify-between border-t border-slate-100">
                    <p className="font-semibold text-slate-700">Net Amount</p>
                    <Money value={pane.expense.amount} colored={false} className="text-slate-800" />
                  </div>
                </div>

                <div className="flex justify-between items-center mt-4 px-1">
                  <p className="font-bold text-slate-800">Gross Total</p>
                  <Money value={pane.expense.amount} colored={false} className="text-lg text-slate-900" />
                </div>

                {pane.expense.attachment && (
                  <div className="mt-5">
                    <p className="label">Attached Bill</p>
                    <img src={pane.expense.attachment} alt="Bill" className="rounded-lg border border-slate-200 max-h-64" />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Create ── */}
        {pane.type === 'create' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Create an Expense</h3>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="label">Expense Date</label>
                <input type="date" className="input" value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">Payment Mode</label>
                <select className="input" value={createForm.paymentMode}
                  onChange={(e) => setCreateForm({ ...createForm, paymentMode: e.target.value })}>
                  {MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 mb-5">
              <p className="font-bold text-slate-800 mb-3">Expense Item Details</p>

              {picked.length > 0 && (
                <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {picked.map((p) => (
                    <div key={p.item.id} className="flex items-center justify-between px-3 py-2.5">
                      <div>
                        <p className="font-medium text-sm text-slate-800">{p.item.name}</p>
                        {p.item.price != null && p.item.price !== '' && (
                          <p className="text-xs text-slate-400">₹{Number(p.item.price)} × {p.qty} = ₹{lineAmount(p)}</p>
                        )}
                      </div>
                      <QtyStepper qty={p.qty} onChange={(q) => setQty(p.item, q)} />
                    </div>
                  ))}
                </div>
              )}

              <button className="w-full py-2.5 rounded-lg border border-link-500 text-link-600 font-semibold hover:bg-link-50"
                onClick={openPicker}>
                + Select Expense Items
              </button>
              <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2 mt-3">
                ℹ️ Expense Items will not affect your regular inventory items
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 mb-5">
              <label className="label">Amount Paid</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                <input className="input pl-7" type="number" placeholder="Enter Amount"
                  value={createForm.amountPaid}
                  onChange={(e) => setCreateForm({ ...createForm, amountPaid: e.target.value })} />
              </div>
              {gross > 0 && Number(createForm.amountPaid || 0) !== gross && (
                <p className="text-xs text-slate-400 mt-1">Items gross total: ₹{gross}</p>
              )}
            </div>

            <div className="mb-6">
              <label className="label">Attach Bill</label>
              <label className="block border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-link-500">
                <input type="file" accept="image/png,image/jpeg" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <p className="font-semibold text-slate-700">{file ? file.name : 'Click to upload'}</p>
                <p className="text-xs text-slate-400 mt-1">Only PNG or JPG file format supported</p>
              </label>
            </div>

            <button className="w-full py-3 rounded-lg font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400"
              disabled={picked.length === 0 || !(Number(createForm.amountPaid) > 0 || gross > 0)}
              onClick={saveExpense}>
              Save
            </button>
          </div>
        )}

        {/* ── Item picker ── */}
        {pane.type === 'picker' && (
          <div className="flex flex-col h-full">
            <div className="p-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <button className="text-link-600 text-xl" onClick={continueFromPicker}>←</button>
                <h3 className="font-bold text-lg">Select Expense Items</h3>
                <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
              </div>
              <p className="text-xs bg-amber-50 text-amber-800 rounded px-3 py-1.5 mb-3">
                ℹ️ Expense items would not affect your inventory
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input className="input pl-9" placeholder="Search for an expense item" value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)} />
              </div>

              {!creatingItem ? (
                <button className="text-link-600 font-semibold text-sm mt-3" onClick={() => setCreatingItem(true)}>
                  + Add new expense item
                </button>
              ) : (
                <div className="rounded-lg bg-slate-50 p-3 mt-3 space-y-2">
                  <p className="font-semibold text-sm">Add New Expense Item</p>
                  <label className="block text-xs text-slate-500">Expense Item Name
                    <input className="input mt-1" placeholder="Enter the name of the expense" autoFocus
                      value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
                  </label>
                  <label className="block text-xs text-slate-500">Price
                    <input className="input mt-1" type="number" placeholder="₹ Enter the price per unit"
                      value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button className="btn border border-link-500 text-link-600 hover:bg-link-50 flex-1 justify-center"
                      onClick={() => { setCreatingItem(false); setNewItem({ name: '', price: '' }); }}>Cancel</button>
                    <button className="btn-primary flex-1 justify-center" onClick={saveNewItem}
                      disabled={!newItem.name.trim()}>Save</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5">
              {items.length === 0 && !creatingItem ? (
                <div className="text-center py-10">
                  <div className="text-5xl mb-3">🧾</div>
                  <p className="font-semibold text-slate-700 mb-4">You can add your expense items (eg- Petrol, Electricity, Rent etc)</p>
                  <button className="btn-primary" onClick={() => setCreatingItem(true)}>Add Expense Item</button>
                </div>
              ) : visibleItems.map((i) => {
                const qty = qtyOf(i.id);
                return (
                  <div key={i.id} className="py-4 border-b border-slate-100 last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{i.name}</p>
                        {i.price != null && i.price !== '' && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            <span className="uppercase tracking-wide">Price</span>{' '}
                            <span className="text-slate-700 font-semibold">₹{Number(i.price)}</span>
                          </p>
                        )}
                      </div>
                      {qty === 0 ? (
                        <button className="px-6 py-1.5 rounded-lg border border-link-500 text-link-600 font-semibold hover:bg-link-50"
                          onClick={() => setQty(i, 1)}>+ Add</button>
                      ) : (
                        <QtyStepper qty={qty} onChange={(q) => setQty(i, q)} />
                      )}
                    </div>
                    <button className="text-slate-300 hover:text-red-500 text-sm mt-1" onClick={() => removeItem(i)}>🗑 Delete item</button>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200">
              <label className="flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-700 cursor-pointer">
                Show selected items only
                <input type="checkbox" className="accent-link-600 w-4 h-4" checked={selectedOnly}
                  onChange={(e) => setSelectedOnly(e.target.checked)} />
              </label>
              <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-slate-600">{picked.length} Item{picked.length === 1 ? '' : 's'}</p>
                  <p className="text-lg font-bold">₹ {gross.toLocaleString('en-IN')}</p>
                </div>
                <button className="px-10 py-2.5 rounded-lg bg-link-600 text-white font-bold hover:bg-link-500 disabled:bg-slate-200 disabled:text-slate-400"
                  disabled={picked.length === 0} onClick={continueFromPicker}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit ── */}
        {pane.type === 'edit' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Edit Expense</h3>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Expense Name</label>
                <input className="input" value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Expense Date</label>
                  <input type="date" className="input" value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="label">Payment Mode</label>
                  <select className="input" value={editForm.paymentMode}
                    onChange={(e) => setEditForm({ ...editForm, paymentMode: e.target.value })}>
                    {MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                  <input className="input pl-7" type="number" value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Item Details / Notes</label>
                <textarea className="input min-h-[100px]" value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <button className="w-full py-3 rounded-lg font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!editForm.amount || Number(editForm.amount) <= 0 || !editForm.category.trim()}
                onClick={saveEdit}>
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QtyStepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-link-500 overflow-hidden">
      <button className="px-3 py-1.5 text-link-600 font-bold hover:bg-link-50" onClick={() => onChange(qty - 1)}>−</button>
      <span className="px-3 font-semibold tabular-nums min-w-[2.5rem] text-center">{qty}</span>
      <button className="px-3 py-1.5 text-link-600 font-bold hover:bg-link-50" onClick={() => onChange(qty + 1)}>+</button>
    </div>
  );
}
