import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, apiMessage } from '../api/client';
import type { Party, PartyType, LedgerResponse, TxType } from '../types';
import { Avatar, EmptyState, Modal, Money, Spinner, fmtDateTime, timeAgo } from '../components/ui';

const emptyParty = {
  name: '', phone: '', type: 'CUSTOMER' as PartyType, gstin: '',
  addressLine: '', area: '', city: '', state: '', pincode: '',
};

export default function Parties({ type }: { type: PartyType }) {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [summary, setSummary] = useState({ youWillGet: 0, youWillGive: 0, partyCount: 0 });
  const [selected, setSelected] = useState<Party | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyParty, type });
  const [entryType, setEntryType] = useState<TxType | null>(null);
  const [entry, setEntry] = useState({ amount: '', description: '', paymentMode: 'CASH' });

  const base = `/businesses/${business?.id}`;
  const label = type === 'CUSTOMER' ? 'Customer' : 'Supplier';

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.get(`${base}/parties`, { params: { type, search: search || undefined, sort, limit: 100 } }),
        api.get(`${base}/parties/summary`, { params: { type } }),
      ]);
      setParties(p.data.data);
      setSummary(s.data.data);
    } catch (e) { setErr(apiMessage(e)); } finally { setLoading(false); }
  }, [business, type, search, sort]);

  useEffect(() => { load(); setSelected(null); setLedger(null); }, [load]);

  const openLedger = async (party: Party) => {
    setSelected(party);
    setLedger(null);
    const res = await api.get(`${base}/parties/${party.id}/transactions`);
    setLedger(res.data.data);
  };

  const saveParty = async () => {
    try {
      if (editOpen && selected) {
        await api.patch(`${base}/parties/${selected.id}`, cleaned(form));
        setEditOpen(false);
      } else {
        await api.post(`${base}/parties`, cleaned({ ...form, type }));
        setAddOpen(false);
      }
      setForm({ ...emptyParty, type });
      await load();
    } catch (e) { alert(apiMessage(e)); }
  };

  const cleaned = (obj: Record<string, string>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ''));

  const addEntry = async () => {
    if (!selected || !entryType) return;
    try {
      await api.post(`${base}/parties/${selected.id}/transactions`, {
        type: entryType,
        amount: Number(entry.amount),
        description: entry.description || undefined,
        paymentMode: entry.paymentMode,
      });
      setEntryType(null);
      setEntry({ amount: '', description: '', paymentMode: 'CASH' });
      await Promise.all([openLedger(selected), load()]);
    } catch (e) { alert(apiMessage(e)); }
  };

  const deleteParty = async () => {
    if (!selected || !confirm(`Delete ${selected.name}? Entries move to recycle bin.`)) return;
    await api.delete(`${base}/parties/${selected.id}`);
    setSelected(null);
    await load();
  };

  const deleteTx = async (txId: string) => {
    if (!selected || !confirm('Delete this entry?')) return;
    await api.delete(`${base}/transactions/${txId}`);
    await Promise.all([openLedger(selected), load()]);
  };

  const remind = async () => {
    if (!selected) return;
    try {
      const r = await api.post(`${base}/reminders`, { partyId: selected.id, dueDate: new Date().toISOString() });
      await api.post(`${base}/reminders/${r.data.data.id}/send`);
      alert('Payment reminder sent (see backend log in dev mode).');
    } catch (e) { alert(apiMessage(e)); }
  };

  const visibleParties = parties.filter((p) =>
    filter === 'get' ? p.balance > 0 :
    filter === 'give' ? p.balance < 0 :
    filter === 'settled' ? p.balance === 0 : true
  );

  const statementUrl = selected
    ? `${(import.meta.env.VITE_API_URL || '')}/api/v1${base}/parties/${selected.id}/statement.pdf`
    : '#';

  const downloadStatement = async () => {
    if (!selected) return;
    const res = await api.get(`${base}/parties/${selected.id}/statement.pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = `statement-${selected.name}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full">
      {/* ── List panel ── */}
      <section className="w-[440px] border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <h2 className="font-bold text-lg">{label}s <span className="ml-1 text-xs bg-brand-50 text-brand-600 rounded-full px-2 py-0.5">{summary.partyCount}</span></h2>
          <button className="btn-outline text-xs whitespace-nowrap"
            onClick={() => navigate(`/bulk-import/${type === 'CUSTOMER' ? 'customers' : 'suppliers'}`)}>
            ⬆ Bulk Import
          </button>
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-slate-100 text-sm">
          <div>You'll Give: <Money value={-summary.youWillGive || 0} colored={summary.youWillGive > 0} className="text-give" /></div>
          <div>You'll Get: <Money value={summary.youWillGet || 0} colored={summary.youWillGet > 0} className="text-get" /></div>
          <button className="btn-outline text-xs whitespace-nowrap" onClick={() => navigate('/reports')}>
            📄 View Report
          </button>
        </div>

        <div className="px-5 py-3 flex gap-2 border-b border-slate-100">
          <input className="input" placeholder="Name or Phone Number" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-32" title="Filter By" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="get">You'll Get</option>
            <option value="give">You'll Give</option>
            <option value="settled">Settled</option>
          </select>
          <select className="input w-36" title="Sort By" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Most Recent</option>
            <option value="name">Name A–Z</option>
            <option value="highest">Highest Amount</option>
            <option value="lowest">Least Amount</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? <Spinner /> : err ? (
            <p className="text-red-600 text-sm p-5">{err}</p>
          ) : visibleParties.length === 0 ? (
            search || filter !== 'all' ? (
              <EmptyState icon="🔍" title="No party data available for applied filters"
                subtitle="Try clearing the search or changing the filter." />
            ) : (
              <EmptyState icon="🧑‍🤝‍🧑" title={`No ${label.toLowerCase()}s yet`}
                subtitle="Add your first party to start recording credit and payments." />
            )
          ) : (
            visibleParties.map((p) => (
              <button key={p.id} onClick={() => openLedger(p)}
                className={`w-full flex items-center gap-3 px-5 py-3 border-b border-slate-50 text-left hover:bg-slate-50 transition ${selected?.id === p.id ? 'bg-brand-50' : ''}`}>
                <Avatar name={p.name} url={p.photoUrl} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</p>
                </div>
                <div className="text-right">
                  <Money value={p.balance} />
                  <p className="text-[10px] text-slate-400">{p.balance > 0 ? 'YOU WILL GET' : p.balance < 0 ? 'YOU WILL GIVE' : 'SETTLED'}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button className="btn-success w-full justify-center" onClick={() => { setForm({ ...emptyParty, type }); setAddOpen(true); }}>
            + Add {label}
          </button>
        </div>
      </section>

      {/* ── Detail / ledger panel ── */}
      <section className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {!selected ? (
          <EmptyState icon="👥" title={`No ${label.toLowerCase()} selected`}
            subtitle="Select a party from the left panel to view their khata here." />
        ) : (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
              <Avatar name={selected.name} url={selected.photoUrl} size={46} />
              <div className="flex-1 min-w-0">
                <p className="font-bold">{selected.name}
                  <span className="ml-2 text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{label}</span>
                </p>
                <p className="text-xs text-slate-500">{selected.phone || 'No phone'} {selected.city ? `· ${selected.city}` : ''}</p>
              </div>
              <button className="btn-outline" onClick={remind}>🔔 Remind</button>
              <button className="btn-outline" onClick={downloadStatement} data-url={statementUrl}>📄 Report PDF</button>
              <button className="btn-outline" onClick={() => {
                setForm({
                  name: selected.name, phone: selected.phone || '', type: selected.type,
                  gstin: selected.gstin || '', addressLine: selected.addressLine || '',
                  area: selected.area || '', city: selected.city || '', state: selected.state || '',
                  pincode: selected.pincode || '',
                });
                setEditOpen(true);
              }}>✏️ Edit</button>
              <button className="btn-danger" onClick={deleteParty}>🗑</button>
            </div>

            {!ledger ? <Spinner /> : (
              <>
                <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center gap-8 text-sm">
                  <span>Net Balance: <Money value={ledger.totals.balance} /></span>
                  <span className="text-slate-400">|</span>
                  <span className="text-get">You gave: <Money value={ledger.totals.gave} colored={false} className="text-get" /></span>
                  <span className="text-give">You got: <Money value={ledger.totals.got} colored={false} className="text-give" /></span>
                  <span className="ml-auto text-xs text-slate-400">🔒 Only you and {selected.name} can see these entries</span>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {ledger.entries.length === 0 ? (
                    <EmptyState icon="🧾" title={`Start adding transactions with ${selected.name}`}
                      subtitle="Use the buttons below — red when you give credit, green when you receive payment." />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 uppercase">
                          <th className="py-2">Entry</th>
                          <th className="py-2 text-right">You Gave</th>
                          <th className="py-2 text-right">You Got</th>
                          <th className="py-2 text-right">Balance</th>
                          <th className="py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...ledger.entries].reverse().map((t) => (
                          <tr key={t.id} className="border-t border-slate-100 bg-white">
                            <td className="py-3 pl-2">
                              <p className="font-medium">{fmtDateTime(t.entryDate)}</p>
                              <p className="text-xs text-slate-400">{t.description || t.paymentMode}</p>
                            </td>
                            <td className="text-right pr-3">
                              {t.type === 'GAVE' && <span className="bg-red-50 px-3 py-1 rounded"><Money value={t.amount} colored={false} className="text-get" /></span>}
                            </td>
                            <td className="text-right pr-3">
                              {t.type === 'GOT' && <span className="bg-green-50 px-3 py-1 rounded"><Money value={t.amount} colored={false} className="text-give" /></span>}
                            </td>
                            <td className="text-right pr-2 text-slate-600">
                              <Money value={t.runningBalance ?? 0} colored={false} className="text-slate-600" />
                            </td>
                            <td className="text-right">
                              <button className="text-slate-300 hover:text-red-500" title="Delete entry" onClick={() => deleteTx(t.id)}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white border-t border-slate-200 px-6 py-4 flex gap-4">
                  <button className="flex-1 py-3 rounded-lg bg-red-700 text-white font-bold tracking-wide hover:bg-red-800"
                    onClick={() => setEntryType('GAVE')}>
                    YOU GAVE ₹
                  </button>
                  <button className="flex-1 py-3 rounded-lg bg-green-700 text-white font-bold tracking-wide hover:bg-green-800"
                    onClick={() => setEntryType('GOT')}>
                    YOU GOT ₹
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ── Add/Edit party modal ── */}
      <Modal open={addOpen || editOpen} title={editOpen ? `Edit ${label}` : `Add ${label}`}
        onClose={() => { setAddOpen(false); setEditOpen(false); }}>
        <div className="space-y-3">
          <div>
            <label className="label">Party name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Mobile number</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">GSTIN (optional)</label>
            <input className="input" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </div>
          <p className="text-xs font-semibold text-slate-500 pt-1">Billing address (optional)</p>
          <input className="input" placeholder="Flat / Building Number" value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
          <input className="input" placeholder="Area / Locality" value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="input" placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <input className="input" placeholder="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          </div>
          <button className="btn-primary w-full justify-center" onClick={saveParty} disabled={!form.name.trim()}>
            {editOpen ? 'Save changes' : `Add ${label}`}
          </button>
        </div>
      </Modal>

      {/* ── Add entry modal ── */}
      <Modal open={entryType !== null}
        title={entryType === 'GAVE' ? `You gave ₹ to ${selected?.name}` : `You got ₹ from ${selected?.name}`}
        onClose={() => setEntryType(null)}>
        <div className="space-y-3">
          <div>
            <label className="label">Amount *</label>
            <input className="input text-lg font-bold" type="number" min="0" autoFocus value={entry.amount}
              onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Details</label>
            <input className="input" placeholder="Items, bill no, notes…" value={entry.description}
              onChange={(e) => setEntry({ ...entry, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Payment mode</label>
            <select className="input" value={entry.paymentMode} onChange={(e) => setEntry({ ...entry, paymentMode: e.target.value })}>
              {['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <button
            className={`w-full py-3 rounded-lg text-white font-bold ${entryType === 'GAVE' ? 'bg-red-700 hover:bg-red-800' : 'bg-green-700 hover:bg-green-800'}`}
            onClick={addEntry} disabled={!entry.amount || Number(entry.amount) <= 0}>
            Save Entry
          </button>
        </div>
      </Modal>
    </div>
  );
}
