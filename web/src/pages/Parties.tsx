import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage } from '../api/client';
import type { Party, PartyType, LedgerResponse, TxType } from '../types';
import { Avatar, EmptyState, Modal, Money, MODE_LABEL_KEYS, PAYMENT_MODES, Spinner, fmtDateTime, timeAgo } from '../components/ui';

const emptyParty = {
  name: '', phone: '', type: 'CUSTOMER' as PartyType, gstin: '',
  addressLine: '', area: '', city: '', state: '', pincode: '',
};

export default function Parties({ type }: { type: PartyType }) {
  const { business } = useAuth();
  const { t } = useLanguage();
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
  const [submitting, setSubmitting] = useState(false);

  // modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyParty, type });
  const [entryType, setEntryType] = useState<TxType | null>(null);
  const [entry, setEntry] = useState({ amount: '', description: '', paymentMode: 'CASH' });

  const base = `/businesses/${business?.id}`;
  const isCustomer = type === 'CUSTOMER';
  const labelSingular = t(isCustomer ? 'parties.customerLabel' : 'parties.supplierLabel');
  const labelPlural = t(isCustomer ? 'parties.customerLabelPlural' : 'parties.supplierLabelPlural');

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
    if (submitting) return;
    setSubmitting(true);
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
    } catch (e) { alert(apiMessage(e)); } finally { setSubmitting(false); }
  };

  const cleaned = (obj: Record<string, string>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ''));

  const addEntry = async () => {
    if (!selected || !entryType || submitting) return;
    setSubmitting(true);
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
    } catch (e) { alert(apiMessage(e)); } finally { setSubmitting(false); }
  };

  const deleteParty = async () => {
    if (!selected || !confirm(t('parties.confirmDeleteParty', { name: selected.name }))) return;
    try {
      await api.delete(`${base}/parties/${selected.id}`);
      setSelected(null);
      await load();
    } catch (e) { alert(apiMessage(e)); }
  };

  const deleteTx = async (txId: string) => {
    if (!selected || !confirm(t('parties.confirmDeleteEntry'))) return;
    try {
      await api.delete(`${base}/transactions/${txId}`);
      await Promise.all([openLedger(selected), load()]);
    } catch (e) { alert(apiMessage(e)); }
  };

  const remind = async () => {
    if (!selected) return;
    try {
      const r = await api.post(`${base}/reminders`, { partyId: selected.id, dueDate: new Date().toISOString(), channel: 'WHATSAPP' });
      const sendRes = await api.post(`${base}/reminders/${r.data.data.id}/send`);
      const provider = sendRes.data.data.notification?.provider;
      alert(provider === 'dev-logger' ? t('parties.reminderSentDev') : t('parties.reminderSentWhatsapp'));
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
    try {
      const res = await api.get(`${base}/parties/${selected.id}/statement.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `statement-${selected.name}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(apiMessage(e)); }
  };

  return (
    <div className="flex h-full">
      {/* ── List panel ── */}
      <section className="w-[440px] border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <h2 className="font-bold text-lg">{labelPlural} <span className="ml-1 text-xs bg-brand-50 text-brand-600 rounded-full px-2 py-0.5">{summary.partyCount}</span></h2>
          <button className="btn-outline text-xs whitespace-nowrap"
            onClick={() => navigate(`/bulk-import/${isCustomer ? 'customers' : 'suppliers'}`)}>
            {t('parties.bulkImport')}
          </button>
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-slate-100 text-sm">
          <div>{t('parties.youllGive')} <Money value={-summary.youWillGive || 0} colored={summary.youWillGive > 0} className="text-give" /></div>
          <div>{t('parties.youllGet')} <Money value={summary.youWillGet || 0} colored={summary.youWillGet > 0} className="text-get" /></div>
          <button className="btn-outline text-xs whitespace-nowrap" onClick={() => navigate('/reports')}>
            {t('parties.viewReport')}
          </button>
        </div>

        <div className="px-5 py-3 flex gap-2 border-b border-slate-100">
          <input className="input" placeholder={t('parties.searchPlaceholder')} value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-32" title="Filter By" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t('parties.filterAll')}</option>
            <option value="get">{t('parties.filterGet')}</option>
            <option value="give">{t('parties.filterGive')}</option>
            <option value="settled">{t('parties.filterSettled')}</option>
          </select>
          <select className="input w-36" title="Sort By" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">{t('parties.sortRecent')}</option>
            <option value="name">{t('parties.sortName')}</option>
            <option value="highest">{t('parties.sortHighest')}</option>
            <option value="lowest">{t('parties.sortLowest')}</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? <Spinner /> : err ? (
            <p className="text-red-600 text-sm p-5">{err}</p>
          ) : visibleParties.length === 0 ? (
            search || filter !== 'all' ? (
              <EmptyState icon="🔍" title={t('parties.noFilterResultsTitle')}
                subtitle={t('parties.noFilterResultsSubtitle')} />
            ) : (
              <EmptyState icon="🧑‍🤝‍🧑" title={t('parties.noPartiesYet', { label: labelPlural })}
                subtitle={t('parties.addFirstPartySubtitle')} />
            )
          ) : (
            visibleParties.map((p) => (
              <button key={p.id} onClick={() => openLedger(p)}
                className={`w-full flex items-center gap-3 px-5 py-3 border-b border-slate-50 text-left hover:bg-slate-50 transition ${selected?.id === p.id ? 'bg-brand-50' : ''}`}>
                <Avatar name={p.name} url={p.photoUrl} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{timeAgo(p.updatedAt, t)}</p>
                </div>
                <div className="text-right">
                  <Money value={p.balance} />
                  <p className="text-[10px] text-slate-400">{p.balance > 0 ? t('parties.youWillGetTag') : p.balance < 0 ? t('parties.youWillGiveTag') : t('parties.settledTag')}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button className="btn-success w-full justify-center" onClick={() => { setForm({ ...emptyParty, type }); setAddOpen(true); }}>
            {t('parties.addLabel', { label: labelSingular })}
          </button>
        </div>
      </section>

      {/* ── Detail / ledger panel ── */}
      <section className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {!selected ? (
          <EmptyState icon="👥" title={t('parties.noPartySelected', { label: labelSingular })}
            subtitle={t('parties.selectPartySubtitle')} />
        ) : (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
              <Avatar name={selected.name} url={selected.photoUrl} size={46} />
              <div className="flex-1 min-w-0">
                <p className="font-bold">{selected.name}
                  <span className="ml-2 text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{labelSingular}</span>
                </p>
                <p className="text-xs text-slate-500">{selected.phone || t('parties.noPhone')} {selected.city ? `· ${selected.city}` : ''}</p>
              </div>
              <button className="btn-outline" onClick={remind}>{t('parties.remind')}</button>
              <button className="btn-outline" onClick={downloadStatement} data-url={statementUrl}>{t('parties.reportPdf')}</button>
              <button className="btn-outline" onClick={() => {
                setForm({
                  name: selected.name, phone: selected.phone || '', type: selected.type,
                  gstin: selected.gstin || '', addressLine: selected.addressLine || '',
                  area: selected.area || '', city: selected.city || '', state: selected.state || '',
                  pincode: selected.pincode || '',
                });
                setEditOpen(true);
              }}>{t('parties.edit')}</button>
              <button className="btn-danger" onClick={deleteParty}>🗑</button>
            </div>

            {!ledger ? <Spinner /> : (
              <>
                <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center gap-8 text-sm">
                  <span>{t('parties.netBalance')} <Money value={ledger.totals.balance} /></span>
                  <span className="text-slate-400">|</span>
                  <span className="text-get">{t('parties.youGaveColon')} <Money value={ledger.totals.gave} colored={false} className="text-get" /></span>
                  <span className="text-give">{t('parties.youGotColon')} <Money value={ledger.totals.got} colored={false} className="text-give" /></span>
                  <span className="ml-auto text-xs text-slate-400">{t('parties.onlyYouCanSee', { name: selected.name })}</span>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {ledger.entries.length === 0 ? (
                    <EmptyState icon="🧾" title={t('parties.startAddingTx', { name: selected.name })}
                      subtitle={t('parties.startAddingTxSubtitle')} />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 uppercase">
                          <th className="py-2">{t('parties.entry')}</th>
                          <th className="py-2 text-right">{t('parties.youGave')}</th>
                          <th className="py-2 text-right">{t('parties.youGot')}</th>
                          <th className="py-2 text-right">{t('parties.balance')}</th>
                          <th className="py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...ledger.entries].reverse().map((tx) => (
                          <tr key={tx.id} className="border-t border-slate-100 bg-white">
                            <td className="py-3 pl-2">
                              <p className="font-medium">{fmtDateTime(tx.entryDate)}</p>
                              <p className="text-xs text-slate-400">{tx.description || tx.paymentMode}</p>
                            </td>
                            <td className="text-right pr-3">
                              {tx.type === 'GAVE' && <span className="bg-red-50 px-3 py-1 rounded"><Money value={tx.amount} colored={false} className="text-get" /></span>}
                            </td>
                            <td className="text-right pr-3">
                              {tx.type === 'GOT' && <span className="bg-green-50 px-3 py-1 rounded"><Money value={tx.amount} colored={false} className="text-give" /></span>}
                            </td>
                            <td className="text-right pr-2 text-slate-600">
                              <Money value={tx.runningBalance ?? 0} colored={false} className="text-slate-600" />
                            </td>
                            <td className="text-right">
                              <button className="text-slate-300 hover:text-red-500" title={t('parties.deleteEntry')} onClick={() => deleteTx(tx.id)}>🗑</button>
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
                    {t('parties.youGaveButton')}
                  </button>
                  <button className="flex-1 py-3 rounded-lg bg-green-700 text-white font-bold tracking-wide hover:bg-green-800"
                    onClick={() => setEntryType('GOT')}>
                    {t('parties.youGotButton')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ── Add/Edit party modal ── */}
      <Modal open={addOpen || editOpen} title={editOpen ? t('parties.editLabel', { label: labelSingular }) : t('parties.addLabelModalTitle', { label: labelSingular })}
        onClose={() => { setAddOpen(false); setEditOpen(false); }}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('parties.partyNameRequired')}</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('parties.mobileNumber')}</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('parties.gstinOptional')}</label>
            <input className="input" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </div>
          <p className="text-xs font-semibold text-slate-500 pt-1">{t('parties.billingAddressOptional')}</p>
          <input className="input" placeholder={t('parties.flatBuilding')} value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
          <input className="input" placeholder={t('parties.areaLocality')} value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder={t('parties.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="input" placeholder={t('parties.state')} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <input className="input" placeholder={t('parties.pincode')} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          </div>
          <button className="btn-primary w-full justify-center" onClick={saveParty} disabled={submitting || !form.name.trim()}>
            {editOpen ? t('parties.saveChanges') : t('parties.addLabel', { label: labelSingular })}
          </button>
        </div>
      </Modal>

      {/* ── Add entry modal ── */}
      <Modal open={entryType !== null}
        title={entryType === 'GAVE' ? t('parties.youGaveToName', { name: selected?.name || '' }) : t('parties.youGotFromName', { name: selected?.name || '' })}
        onClose={() => setEntryType(null)}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('parties.amountRequired')}</label>
            <input className="input text-lg font-bold" type="number" min="0" autoFocus value={entry.amount}
              onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('parties.details')}</label>
            <input className="input" placeholder={t('parties.detailsPlaceholder')} value={entry.description}
              onChange={(e) => setEntry({ ...entry, description: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('parties.paymentMode')}</label>
            <select className="input" value={entry.paymentMode} onChange={(e) => setEntry({ ...entry, paymentMode: e.target.value })}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL_KEYS[m])}</option>)}
            </select>
          </div>
          <button
            className={`w-full py-3 rounded-lg text-white font-bold ${entryType === 'GAVE' ? 'bg-red-700 hover:bg-red-800' : 'bg-green-700 hover:bg-green-800'}`}
            onClick={addEntry} disabled={submitting || !entry.amount || Number(entry.amount) <= 0}>
            {t('parties.saveEntry')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
