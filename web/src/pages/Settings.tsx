import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage } from '../api/client';
import type { Notification } from '../types';
import { Modal, localDateStr, useConfirm, useToast } from '../components/ui';

export default function Settings() {
  const { user, business, reloadBusinesses, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
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
  const [savingBiz, setSavingBiz] = useState(false);
  const [savingInv, setSavingInv] = useState(false);
  const [savingMe, setSavingMe] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    api.get('/notifications')
      .then((r) => { setNotifs(r.data.data); setUnread(r.data.unread); })
      .catch((e) => toast(apiMessage(e), 'error'));
  }, [business, user]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const saveBusiness = async () => {
    if (savingBiz) return;
    setSavingBiz(true);
    try {
      await api.patch(`/businesses/${business?.id}`, {
        ...bizForm,
        phone: bizForm.phone || undefined, address: bizForm.address || undefined,
        gstin: bizForm.gstin || undefined, category: bizForm.category || undefined,
      });
      await reloadBusinesses();
      flash(t('settings.savedBusinessSettings'));
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSavingBiz(false); }
  };

  const saveInvoice = async () => {
    if (savingInv) return;
    setSavingInv(true);
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
      flash(t('settings.savedInvoiceDetails'));
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSavingInv(false); }
  };

  const exportData = async () => {
    try {
      const res = await api.get(`/businesses/${business?.id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finbook-backup-${localDateStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash(t('settings.backupDownloaded'));
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const importData = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast(t('settings.invalidBackupFile'), 'error');
      return;
    }
    if (!(await confirm({ message: t('settings.confirmRestore', { file: file.name, business: business?.name || '' }), danger: true }))) return;
    setImporting(true);
    setImportResult('');
    try {
      const res = await api.post(`/businesses/${business?.id}/import`, parsed);
      const s = res.data.data;
      setImportResult(
        t('settings.restoreSummary', {
          partiesCreated: s.parties.created,
          partiesReused: s.parties.reused,
          txCreated: s.transactions.created,
          cashbookCreated: s.cashbookEntries.created,
          expensesCreated: s.expenses.created,
          itemsCreated: s.items.created,
          invoicesCreated: s.invoices.created,
          invoicesSkipped: s.invoices.skipped ? t('settings.restoreSummarySkipped', { count: s.invoices.skipped }) : '',
        })
      );
      await reloadBusinesses();
      flash(t('settings.backupRestored'));
    } catch (e) { toast(apiMessage(e), 'error'); }
    setImporting(false);
  };

  const saveMe = async () => {
    if (savingMe) return;
    setSavingMe(true);
    try {
      await api.patch('/auth/me', { name: meForm.name, email: meForm.email || null });
      flash(t('settings.profileUpdated'));
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSavingMe(false); }
  };

  const deleteBook = async () => {
    if (deleting || !(await confirm({ message: t('settings.confirmDeleteBook', { business: business?.name || '' }), danger: true }))) return;
    setDeleting(true);
    try {
      await api.delete(`/businesses/${business?.id}`);
      await reloadBusinesses();
      flash(t('settings.bookDeleted'));
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setDeleting(false); }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setUnread(0);
      setNotifs((n) => n.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-4">⚙️ {t('settings.title')}</h1>
      {msg && <p className="mb-4 text-sm bg-green-50 text-green-700 rounded-lg px-4 py-2">{msg}</p>}

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-3">{t('settings.bookSettingsTitle', { business: business?.name || '' })}</h2>
        <div className="space-y-3">
          <div><label className="label">{t('settings.businessName')}</label>
            <input className="input" value={bizForm.name} onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('settings.phone')}</label>
              <input className="input" value={bizForm.phone} onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value })} /></div>
            <div><label className="label">{t('settings.gstin')}</label>
              <input className="input" value={bizForm.gstin} onChange={(e) => setBizForm({ ...bizForm, gstin: e.target.value })} /></div>
          </div>
          <div><label className="label">{t('settings.category')}</label>
            <input className="input" placeholder={t('settings.categoryPlaceholder')} value={bizForm.category}
              onChange={(e) => setBizForm({ ...bizForm, category: e.target.value })} /></div>
          <div><label className="label">{t('settings.address')}</label>
            <textarea className="input" rows={2} value={bizForm.address}
              onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })} /></div>
          <button className="btn-primary" onClick={saveBusiness} disabled={savingBiz}>{t('settings.saveBusinessSettings')}</button>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-1">{t('settings.invoicePaymentTitle')}</h2>
        <p className="text-xs text-slate-400 mb-3">{t('settings.invoicePaymentSubtitle')}</p>
        <div className="space-y-3">
          <div><label className="label">{t('settings.upiId')}</label>
            <input className="input" placeholder={t('settings.upiIdPlaceholder')} value={invForm.upiId}
              onChange={(e) => setInvForm({ ...invForm, upiId: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('settings.bankName')}</label>
              <input className="input" placeholder={t('settings.bankNamePlaceholder')} value={invForm.bankName}
                onChange={(e) => setInvForm({ ...invForm, bankName: e.target.value })} /></div>
            <div><label className="label">{t('settings.bankAccountName')}</label>
              <input className="input" value={invForm.bankAccountName}
                onChange={(e) => setInvForm({ ...invForm, bankAccountName: e.target.value })} /></div>
            <div><label className="label">{t('settings.bankAccountNo')}</label>
              <input className="input" value={invForm.bankAccountNo}
                onChange={(e) => setInvForm({ ...invForm, bankAccountNo: e.target.value })} /></div>
            <div><label className="label">{t('settings.bankIfsc')}</label>
              <input className="input" placeholder={t('settings.bankIfscPlaceholder')} value={invForm.bankIfsc}
                onChange={(e) => setInvForm({ ...invForm, bankIfsc: e.target.value })} /></div>
          </div>
          <div><label className="label">{t('settings.invoiceTerms')}</label>
            <textarea className="input" rows={3}
              placeholder={t('settings.invoiceTermsPlaceholder')}
              value={invForm.invoiceTerms}
              onChange={(e) => setInvForm({ ...invForm, invoiceTerms: e.target.value })} />
            <p className="text-xs text-slate-400 mt-1">{t('settings.invoiceTermsHint')}</p></div>
          <button className="btn-primary" onClick={saveInvoice} disabled={savingInv}>{t('settings.saveInvoiceDetails')}</button>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-1">{t('settings.backupTitle')}</h2>
        <p className="text-xs text-slate-400 mb-3">
          {t('settings.backupSubtitle')}
        </p>
        <div className="flex gap-3 flex-wrap">
          <button className="btn-primary" onClick={exportData}>{t('settings.exportData')}</button>
          <label className={`btn-outline cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? t('settings.restoring') : t('settings.importData')}
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
          {t('settings.restoreWarning')}
        </p>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-3">{t('settings.languageTitle')}</h2>
        <div className="flex gap-2">
          <button className={lang === 'en' ? 'btn-primary' : 'btn-outline'} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'ta' ? 'btn-primary' : 'btn-outline'} onClick={() => setLang('ta')}>தமிழ்</button>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold mb-3">{t('settings.myProfileTitle')}</h2>
        <div className="space-y-3">
          <div><label className="label">{t('common.name')}</label>
            <input className="input" value={meForm.name} onChange={(e) => setMeForm({ ...meForm, name: e.target.value })} /></div>
          <div><label className="label">{t('common.email')}</label>
            <input className="input" value={meForm.email} onChange={(e) => setMeForm({ ...meForm, email: e.target.value })} /></div>
          <p className="text-xs text-slate-400">{t('settings.emailLoginHint', { email: user?.email || '' })}</p>
          <button className="btn-primary" onClick={saveMe} disabled={savingMe}>{t('settings.updateProfile')}</button>
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        <button className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
          onClick={() => setNotifOpen(true)}>
          <div><p className="font-medium">{t('settings.notifications')}</p>
            <p className="text-xs text-slate-400">{t('settings.unreadCount', { count: unread })}</p></div>
          <span className="text-slate-300">›</span>
        </button>
        <button className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 disabled:opacity-50"
          onClick={deleteBook} disabled={deleting}>
          <div><p className="font-medium text-red-600">{t('settings.deleteBookTitle')}</p>
            <p className="text-xs text-slate-400">{t('settings.deleteBookSubtitle')}</p></div>
          <span className="text-slate-300">›</span>
        </button>
        <button className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
          onClick={() => { logout(); navigate('/login'); }}>
          <div><p className="font-medium">{t('settings.logout')}</p>
            <p className="text-xs text-slate-400">{t('settings.logoutSubtitle')}</p></div>
          <span className="text-slate-300">›</span>
        </button>
      </div>

      <Modal open={notifOpen} title={t('settings.notificationsModalTitle')} onClose={() => setNotifOpen(false)}>
        <button className="btn-outline text-xs mb-3" onClick={markAllRead}>{t('settings.markAllRead')}</button>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {notifs.length === 0 && <p className="text-sm text-slate-400">{t('settings.noNotifications')}</p>}
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
