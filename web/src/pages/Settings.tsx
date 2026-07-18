import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, apiMessage } from '../api/client';
import type { Notification } from '../types';
import { Modal } from '../components/ui';

export default function Settings() {
  const { user, business, reloadBusinesses, logout } = useAuth();
  const [bizForm, setBizForm] = useState({ name: '', phone: '', address: '', gstin: '', category: '' });
  const [invForm, setInvForm] = useState({
    upiId: '', bankName: '', bankAccountName: '', bankAccountNo: '', bankIfsc: '', invoiceTerms: '',
  });
  const [meForm, setMeForm] = useState({ name: '', email: '' });
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (business) {
      setBizForm({
        name: business.name || '', phone: business.phone || '', address: business.address || '',
        gstin: business.gstin || '', category: business.category || '',
      });
      setInvForm({
        upiId: business.upiId || '', bankName: business.bankName || '',
        bankAccountName: business.bankAccountName || '', bankAccountNo: business.bankAccountNo || '',
        bankIfsc: business.bankIfsc || '', invoiceTerms: business.invoiceTerms || '',
      });
    }
    if (user) setMeForm({ name: user.name, email: user.email || '' });
    api.get('/notifications').then((r) => { setNotifs(r.data.data); setUnread(r.data.unread); });
  }, [business, user]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const saveBusiness = async () => {
    try {
      await api.patch(`/businesses/${business?.id}`, {
        ...bizForm,
        phone: bizForm.phone || undefined, address: bizForm.address || undefined,
        gstin: bizForm.gstin || undefined, category: bizForm.category || undefined,
      });
      await reloadBusinesses();
      flash('Business settings saved.');
    } catch (e) { alert(apiMessage(e)); }
  };

  const saveInvoice = async () => {
    try {
      await api.patch(`/businesses/${business?.id}`, {
        upiId: invForm.upiId.trim() || null,
        bankName: invForm.bankName.trim() || null,
        bankAccountName: invForm.bankAccountName.trim() || null,
        bankAccountNo: invForm.bankAccountNo.trim() || null,
        bankIfsc: invForm.bankIfsc.trim() || null,
        invoiceTerms: invForm.invoiceTerms.trim() || null,
      });
      await reloadBusinesses();
      flash('Invoice & payment details saved — they will print on your tax invoices.');
    } catch (e) { alert(apiMessage(e)); }
  };

  const exportData = async () => {
    try {
      const res = await api.get(`/businesses/${business?.id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash('Backup downloaded — keep the file somewhere safe.');
    } catch (e) { alert(apiMessage(e)); }
  };

  const importData = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      alert('That file is not a valid FinBook backup (could not read it as JSON).');
      return;
    }
    if (!confirm(`Restore "${file.name}" into "${business?.name}"?\n\nExisting parties/items are reused; ledger entries from the file are added. Importing the same file twice will duplicate ledger entries.`)) return;
    setImporting(true);
    setImportResult('');
    try {
      const res = await api.post(`/businesses/${business?.id}/import`, parsed);
      const s = res.data.data;
      setImportResult(
        `Restored: ${s.parties.created} new parties (${s.parties.reused} reused), ` +
        `${s.transactions.created} ledger entries, ${s.cashbookEntries.created} cashbook entries, ` +
        `${s.expenses.created} expenses, ${s.items.created} items, ${s.invoices.created} invoices` +
        (s.invoices.skipped ? ` (${s.invoices.skipped} skipped — already exist)` : '') + '.'
      );
      await reloadBusinesses();
      flash('Backup restored into this book.');
    } catch (e) { alert(apiMessage(e)); }
    setImporting(false);
  };

  const saveMe = async () => {
    try {
      await api.patch('/auth/me', { name: meForm.name, email: meForm.email || null });
      flash('Profile updated.');
    } catch (e) { alert(apiMessage(e)); }
  };

  const deleteBook = async () => {
    if (!confirm(`Delete the khata "${business?.name}"? This soft-deletes all its data.`)) return;
    try {
      await api.delete(`/businesses/${business?.id}`);
      await reloadBusinesses();
      flash('Book deleted.');
    } catch (e) { alert(apiMessage(e)); }
  };

  const markAllRead = async () => {
    await api.post('/notifications/read-all');
    setUnread(0);
    setNotifs((n) => n.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Settings</h1>
      {msg && <p className="mb-4 text-sm bg-green-50 text-green-700 rounded-lg px-4 py-2">{msg}</p>}

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-3">Book Settings — {business?.name}</h2>
        <div className="space-y-3">
          <div><label className="label">Business name</label>
            <input className="input" value={bizForm.name} onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Phone</label>
              <input className="input" value={bizForm.phone} onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value })} /></div>
            <div><label className="label">GSTIN</label>
              <input className="input" value={bizForm.gstin} onChange={(e) => setBizForm({ ...bizForm, gstin: e.target.value })} /></div>
          </div>
          <div><label className="label">Category</label>
            <input className="input" placeholder="Kirana, Electronics, Services…" value={bizForm.category}
              onChange={(e) => setBizForm({ ...bizForm, category: e.target.value })} /></div>
          <div><label className="label">Address</label>
            <textarea className="input" rows={2} value={bizForm.address}
              onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })} /></div>
          <button className="btn-primary" onClick={saveBusiness}>Save Business Settings</button>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-1">Invoice & Payment Details</h2>
        <p className="text-xs text-slate-400 mb-3">Printed on your tax invoice PDFs — business name and address come from Book Settings above.</p>
        <div className="space-y-3">
          <div><label className="label">UPI ID</label>
            <input className="input" placeholder="yourname@upi" value={invForm.upiId}
              onChange={(e) => setInvForm({ ...invForm, upiId: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Bank Name</label>
              <input className="input" placeholder="Kotak Mahindra Bank" value={invForm.bankName}
                onChange={(e) => setInvForm({ ...invForm, bankName: e.target.value })} /></div>
            <div><label className="label">Account Holder Name</label>
              <input className="input" value={invForm.bankAccountName}
                onChange={(e) => setInvForm({ ...invForm, bankAccountName: e.target.value })} /></div>
            <div><label className="label">Account Number</label>
              <input className="input" value={invForm.bankAccountNo}
                onChange={(e) => setInvForm({ ...invForm, bankAccountNo: e.target.value })} /></div>
            <div><label className="label">IFSC Code</label>
              <input className="input" placeholder="KKBK0000001" value={invForm.bankIfsc}
                onChange={(e) => setInvForm({ ...invForm, bankIfsc: e.target.value })} /></div>
          </div>
          <div><label className="label">Default Terms & Conditions</label>
            <textarea className="input" rows={3}
              placeholder={'1. Goods once sold will not be returned.\n2. Payment is due within the mentioned due date.'}
              value={invForm.invoiceTerms}
              onChange={(e) => setInvForm({ ...invForm, invoiceTerms: e.target.value })} />
            <p className="text-xs text-slate-400 mt-1">Used on invoices that don't have their own notes.</p></div>
          <button className="btn-primary" onClick={saveInvoice}>Save Invoice Details</button>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-1">Data Backup & Restore</h2>
        <p className="text-xs text-slate-400 mb-3">
          Export everything in this book — parties, ledger, cashbook, expenses, items and invoices — as one file.
          If your storage ever crashes, upload that file here to restore all your data.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button className="btn-primary" onClick={exportData}>⬇ Export All Data</button>
          <label className={`btn-outline cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? 'Restoring…' : '⬆ Import / Restore Backup'}
            <input type="file" accept="application/json,.json" className="hidden" disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) importData(f);
              }} />
          </label>
        </div>
        {importResult && <p className="text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2 mt-3">{importResult}</p>}
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
          ⚠️ Restore adds the file's entries into the current book. Importing the same backup twice will duplicate ledger, cashbook and expense entries.
        </p>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-3">My Profile</h2>
        <div className="space-y-3">
          <div><label className="label">Name</label>
            <input className="input" value={meForm.name} onChange={(e) => setMeForm({ ...meForm, name: e.target.value })} /></div>
          <div><label className="label">Email</label>
            <input className="input" value={meForm.email} onChange={(e) => setMeForm({ ...meForm, email: e.target.value })} /></div>
          <p className="text-xs text-slate-400">Email: {user?.email} (used for login)</p>
          <button className="btn-primary" onClick={saveMe}>Update Profile</button>
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        <button className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
          onClick={() => setNotifOpen(true)}>
          <div><p className="font-medium">🔔 Notifications</p>
            <p className="text-xs text-slate-400">{unread} unread</p></div>
          <span className="text-slate-300">›</span>
        </button>
        <button className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
          onClick={deleteBook}>
          <div><p className="font-medium text-red-600">🗑 Book Settings — Delete your FinBook</p>
            <p className="text-xs text-slate-400">Soft-deletes this book and its records</p></div>
          <span className="text-slate-300">›</span>
        </button>
        <button className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
          onClick={() => { logout(); navigate('/login'); }}>
          <div><p className="font-medium">⎋ Logout</p>
            <p className="text-xs text-slate-400">You will be logged out on this device</p></div>
          <span className="text-slate-300">›</span>
        </button>
      </div>

      <Modal open={notifOpen} title="Notifications" onClose={() => setNotifOpen(false)}>
        <button className="btn-outline text-xs mb-3" onClick={markAllRead}>Mark all read</button>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {notifs.length === 0 && <p className="text-sm text-slate-400">No notifications yet.</p>}
          {notifs.map((n) => (
            <div key={n.id} className={`p-3 rounded-lg border ${n.readAt ? 'border-slate-100' : 'border-brand-500 bg-brand-50'}`}>
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
