import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, apiMessage } from '../api/client';
import type { Item } from '../types';
import { EmptyState, Money, Spinner, useToast } from '../components/ui';

/** Items with unit SERVICE are shown under the Services tab; everything else is a product. */
const SERVICE_UNIT = 'SERVICE';
const UNITS = ['PCS', 'KG', 'G', 'L', 'ML', 'BAG', 'BOX', 'M'];

type Pane =
  | { type: 'none' }
  | { type: 'detail'; item: Item }
  | { type: 'form'; editing?: Item };

const emptyForm = {
  name: '', sku: '', unit: 'PCS', salePrice: '', purchasePrice: '', taxRate: '', stockQty: '', lowStockAlert: '',
};

export default function Items() {
  const { business } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'PRODUCTS' | 'SERVICES'>('PRODUCTS');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'LOW' | 'IN' | 'OUT'>('ALL');
  const [sort, setSort] = useState<'recent' | 'name' | 'price' | 'stock'>('recent');
  const [pane, setPane] = useState<Pane>({ type: 'none' });

  const [kind, setKind] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [form, setForm] = useState(emptyForm);
  const [stock, setStock] = useState({ type: 'IN', qty: '', note: '' });
  const [adjusting, setAdjusting] = useState(false);

  const base = `/businesses/${business?.id}/items`;

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const res = await api.get(base, { params: { limit: 500 } });
    setRows(res.data.data);
    setLoading(false);
  }, [business]);

  useEffect(() => { load(); }, [load]);

  const isService = (i: Item) => i.unit === SERVICE_UNIT;
  const isLow = (i: Item) => !isService(i) && i.lowStockAlert != null && Number(i.stockQty) <= Number(i.lowStockAlert);

  const products = rows.filter((i) => !isService(i));
  const services = rows.filter(isService);
  const stockValue = products.reduce((s, i) => s + Number(i.stockQty) * Number(i.purchasePrice ?? i.salePrice), 0);
  const lowCount = products.filter(isLow).length;

  const visible = useMemo(() => {
    let list = tab === 'PRODUCTS' ? products : services;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q));
    if (tab === 'PRODUCTS' && filter !== 'ALL') {
      list = list.filter((i) =>
        filter === 'LOW' ? isLow(i) : filter === 'OUT' ? Number(i.stockQty) <= 0 : Number(i.stockQty) > 0);
    }
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'price') sorted.sort((a, b) => Number(b.salePrice) - Number(a.salePrice));
    if (sort === 'stock') sorted.sort((a, b) => Number(a.stockQty) - Number(b.stockQty));
    return sorted;
  }, [rows, tab, search, filter, sort]);

  const openForm = (editing?: Item) => {
    if (editing) {
      setKind(isService(editing) ? 'SERVICE' : 'PRODUCT');
      setForm({
        name: editing.name,
        sku: editing.sku || '',
        unit: isService(editing) ? 'PCS' : editing.unit,
        salePrice: String(Number(editing.salePrice)),
        purchasePrice: editing.purchasePrice != null ? String(Number(editing.purchasePrice)) : '',
        taxRate: String(Number(editing.taxRate)),
        stockQty: String(Number(editing.stockQty)),
        lowStockAlert: editing.lowStockAlert != null ? String(Number(editing.lowStockAlert)) : '',
      });
    } else {
      setKind(tab === 'SERVICES' ? 'SERVICE' : 'PRODUCT');
      setForm(emptyForm);
    }
    setPane({ type: 'form', editing });
  };

  const save = async () => {
    if (pane.type !== 'form') return;
    const service = kind === 'SERVICE';
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      unit: service ? SERVICE_UNIT : form.unit,
      salePrice: Number(form.salePrice),
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
      taxRate: form.taxRate ? Number(form.taxRate) : undefined,
      ...(service ? {} : {
        // Stock is only set at creation; edits go through Adjust Stock so the
        // movement ledger stays consistent with the on-hand quantity.
        ...(pane.editing ? {} : { stockQty: form.stockQty ? Number(form.stockQty) : undefined }),
        lowStockAlert: form.lowStockAlert ? Number(form.lowStockAlert) : undefined,
      }),
    };
    try {
      if (pane.editing) {
        const res = await api.patch(`${base}/${pane.editing.id}`, payload);
        toast('Item updated');
        setPane({ type: 'detail', item: res.data.data });
      } else {
        await api.post(base, payload);
        toast(service ? 'Service added' : 'Product added');
        setPane({ type: 'none' });
      }
      setTab(service ? 'SERVICES' : 'PRODUCTS');
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const adjust = async (item: Item) => {
    try {
      await api.post(`${base}/${item.id}/stock`, {
        type: stock.type, qty: Number(stock.qty), note: stock.note || undefined,
      });
      toast('Stock updated');
      setAdjusting(false);
      setStock({ type: 'IN', qty: '', note: '' });
      await load();
      const res = await api.get(`${base}/${item.id}`);
      setPane({ type: 'detail', item: res.data.data });
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const remove = async (item: Item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`${base}/${item.id}`);
      toast('Item deleted');
      setPane({ type: 'none' });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const selectedId = pane.type === 'detail' ? pane.item.id : pane.type === 'form' ? pane.editing?.id : undefined;

  return (
    <div className="flex h-full">
      {/* ── Left ── */}
      <div className="flex-1 min-w-0 p-6 overflow-y-auto flex flex-col">
        {/* Tabs */}
        <div className="flex gap-8 border-b border-slate-200 mb-4">
          {(['PRODUCTS', 'SERVICES'] as const).map((t) => (
            <button key={t}
              className={`pb-3 font-semibold flex items-center gap-2 border-b-2 -mb-px transition
                ${tab === t ? 'text-link-600 border-link-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
              onClick={() => { setTab(t); setFilter('ALL'); }}>
              {t === 'PRODUCTS' ? 'Products' : 'Services'}
              <span className={`px-2 py-0.5 rounded-full text-xs ${tab === t ? 'bg-link-50 text-link-600' : 'bg-slate-100 text-slate-500'}`}>
                {t === 'PRODUCTS' ? products.length : services.length}
              </span>
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="card p-4 flex items-center mb-4">
          <div className="flex-1 flex items-baseline gap-2 justify-center">
            <p className="text-sm text-slate-500">Total Stock value:</p>
            <Money value={stockValue} colored={false} className="text-lg text-slate-800" />
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex-1 flex items-baseline gap-2 justify-center">
            <p className="text-sm text-slate-500">Low Stock Products:</p>
            <p className={`text-lg font-bold ${lowCount > 0 ? 'text-get' : 'text-slate-800'}`}>{lowCount}</p>
          </div>
        </div>

        {/* Search / filter / sort */}
        <div className="card p-4 flex gap-4 mb-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <label className="label">Search for {tab === 'PRODUCTS' ? 'Products' : 'Services'}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input className="input pl-9" placeholder={`Search by ${tab === 'PRODUCTS' ? 'Product' : 'Service'} name`}
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {tab === 'PRODUCTS' && (
            <div>
              <label className="label">Filter by</label>
              <select className="input min-w-[130px]" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="ALL">All</option>
                <option value="LOW">Low Stock</option>
                <option value="IN">In Stock</option>
                <option value="OUT">Out of Stock</option>
              </select>
            </div>
          )}
          <div>
            <label className="label">Sort by</label>
            <select className="input min-w-[150px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">Most recent</option>
              <option value="name">Name A–Z</option>
              <option value="price">Price high → low</option>
              <option value="stock">Stock low → high</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="card overflow-hidden flex-1">
          {loading ? <Spinner /> : visible.length === 0 ? (
            <EmptyState icon="📦" title="No Results"
              subtitle={tab === 'PRODUCTS'
                ? 'Add your products to use them in bills and track stock.'
                : 'Add your services (eg- Repair, Delivery, Consulting) to bill them.'}
              action={<button className="btn-primary" onClick={() => openForm()}>+ Add {tab === 'PRODUCTS' ? 'Product' : 'Service'}</button>} />
          ) : (
            visible.map((i) => (
              <button key={i.id}
                className={`w-full flex items-center justify-between px-5 py-4 text-left border-b border-slate-50 last:border-0 transition
                  ${selectedId === i.id ? 'bg-link-50' : 'hover:bg-slate-50'}`}
                onClick={() => { setAdjusting(false); setPane({ type: 'detail', item: i }); }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {i.imageUrl ? <img src={i.imageUrl} alt="" className="w-full h-full object-cover" /> : (isService(i) ? '🛠' : '📦')}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">
                      {i.name}
                      {isLow(i) && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold align-middle">LOW STOCK</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {i.sku ? `${i.sku} · ` : ''}{Number(i.taxRate) > 0 ? `GST ${Number(i.taxRate)}%` : 'No GST'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money value={i.salePrice} colored={false} className="text-slate-800" />
                  {!isService(i) && (
                    <p className={`text-[11px] font-semibold ${isLow(i) ? 'text-get' : 'text-slate-400'}`}>
                      Stock: {Number(i.stockQty)} {i.unit}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-center py-4">
          <button className="btn-primary px-8 py-3" onClick={() => openForm()}>
            + Add {tab === 'PRODUCTS' ? 'Product' : 'Service'}
          </button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-[420px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:flex flex-col">
        {pane.type === 'none' && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <span className="text-6xl mb-3">📦</span>
            <p className="font-semibold text-slate-600">No item selected</p>
            <p className="text-sm mt-1">Select a {tab === 'PRODUCTS' ? 'product' : 'service'} from the left panel</p>
          </div>
        )}

        {/* Detail */}
        {pane.type === 'detail' && (() => {
          const it = pane.item;
          const service = isService(it);
          return (
            <div>
              <div className="p-5 border-b border-slate-100">
                <span className="inline-block px-3 py-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 mb-3">
                  {service ? 'Service' : 'Product'}
                </span>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-lg text-slate-800 truncate">{it.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{it.sku || 'No SKU'}{!service && ` · ${it.unit}`}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn border border-link-500 text-link-600 hover:bg-link-50" onClick={() => openForm(it)}>✏️ Edit</button>
                    <button className="btn-danger" onClick={() => remove(it)}>🗑</button>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  <div className="px-4 py-3 flex justify-between"><span className="text-slate-500 text-sm">Sale Price</span><Money value={it.salePrice} colored={false} className="text-slate-800" /></div>
                  <div className="px-4 py-3 flex justify-between"><span className="text-slate-500 text-sm">Purchase Price</span>
                    <span className="font-semibold">{it.purchasePrice != null ? `₹${Number(it.purchasePrice).toLocaleString('en-IN')}` : '—'}</span></div>
                  <div className="px-4 py-3 flex justify-between"><span className="text-slate-500 text-sm">GST Rate</span><span className="font-semibold">{Number(it.taxRate)}%</span></div>
                  {!service && (<>
                    <div className="px-4 py-3 flex justify-between">
                      <span className="text-slate-500 text-sm">Current Stock</span>
                      <span className={`font-bold ${isLow(it) ? 'text-get' : 'text-slate-800'}`}>{Number(it.stockQty)} {it.unit}</span>
                    </div>
                    <div className="px-4 py-3 flex justify-between"><span className="text-slate-500 text-sm">Low Stock Alert</span>
                      <span className="font-semibold">{it.lowStockAlert != null ? `${Number(it.lowStockAlert)} ${it.unit}` : '—'}</span></div>
                    <div className="px-4 py-3 flex justify-between"><span className="text-slate-500 text-sm">Stock Value</span>
                      <Money value={Number(it.stockQty) * Number(it.purchasePrice ?? it.salePrice)} colored={false} className="text-slate-800" /></div>
                  </>)}
                </div>

                {!service && (!adjusting ? (
                  <button className="w-full py-2.5 rounded-lg border border-link-500 text-link-600 font-semibold hover:bg-link-50"
                    onClick={() => { setAdjusting(true); setStock({ type: 'IN', qty: '', note: '' }); }}>
                    Adjust Stock
                  </button>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-3 space-y-2">
                    <p className="font-semibold text-sm">Adjust stock — current {Number(it.stockQty)} {it.unit}</p>
                    <select className="input" value={stock.type} onChange={(e) => setStock({ ...stock, type: e.target.value })}>
                      <option value="IN">Stock IN (purchase)</option>
                      <option value="OUT">Stock OUT (sale/waste)</option>
                      <option value="ADJUST">Set absolute quantity</option>
                    </select>
                    <input className="input" type="number" min="0" placeholder="Quantity" autoFocus value={stock.qty}
                      onChange={(e) => setStock({ ...stock, qty: e.target.value })} />
                    <input className="input" placeholder="Note (optional)" value={stock.note}
                      onChange={(e) => setStock({ ...stock, note: e.target.value })} />
                    <div className="flex gap-2 pt-1">
                      <button className="btn border border-slate-300 text-slate-600 flex-1 justify-center" onClick={() => setAdjusting(false)}>Cancel</button>
                      <button className="btn-primary flex-1 justify-center" onClick={() => adjust(it)} disabled={stock.qty === ''}>Apply</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Add / edit form */}
        {pane.type === 'form' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">{pane.editing ? 'Edit' : 'Add'} {kind === 'SERVICE' ? 'Service' : 'Product'}</h3>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setPane({ type: 'none' })}>×</button>
            </div>

            {!pane.editing && (
              <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-5">
                {(['PRODUCT', 'SERVICE'] as const).map((k) => (
                  <button key={k}
                    className={`flex-1 py-2 text-sm font-semibold transition ${kind === k ? 'bg-link-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => setKind(k)}>
                    {k === 'PRODUCT' ? 'Product' : 'Service'}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">{kind === 'SERVICE' ? 'Service' : 'Product'} Name *</label>
                <input className="input" placeholder={kind === 'SERVICE' ? 'eg- Repair, Delivery' : 'eg- Sugar 1kg'} autoFocus
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU / Code</label>
                  <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div>
                  <label className="label">GST %</label>
                  <input className="input" type="number" min="0" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Sale Price ₹ *</label>
                  <input className="input" type="number" min="0" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
                </div>
                <div>
                  <label className="label">Purchase Price ₹</label>
                  <input className="input" type="number" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
                </div>
              </div>

              {kind === 'PRODUCT' && (<>
                <div>
                  <label className="label">Unit</label>
                  <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">{pane.editing ? 'Stock Qty' : 'Opening Stock'}</label>
                    <input className="input" type="number" min="0" value={form.stockQty}
                      onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
                      disabled={!!pane.editing} title={pane.editing ? 'Use Adjust Stock from the item view' : undefined} />
                  </div>
                  <div>
                    <label className="label">Low Stock Alert</label>
                    <input className="input" type="number" min="0" value={form.lowStockAlert}
                      onChange={(e) => setForm({ ...form, lowStockAlert: e.target.value })} />
                  </div>
                </div>
                {pane.editing && <p className="text-xs text-slate-400 -mt-2">Stock quantity is changed via “Adjust Stock” on the item view.</p>}
              </>)}

              <button className="w-full py-3 rounded-lg font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400"
                onClick={save} disabled={!form.name.trim() || form.salePrice === ''}>
                Save {kind === 'SERVICE' ? 'Service' : 'Product'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
