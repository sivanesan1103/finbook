import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage } from '../api/client';
import type { StaffMember, PermissionFlags } from '../types';
import type { TranslationKey } from '../i18n';
import { Avatar, EmptyState, Modal, Spinner, useConfirm, useToast } from '../components/ui';

// `reports` is intentionally NOT here: report access is derived from the
// data-type permissions on the server (a sales report needs `bills`, a party
// report needs `parties`), so there is no standalone reports toggle.
const FLAGS: (keyof PermissionFlags)[] = ['parties', 'bills', 'items', 'cashbook', 'expenses'];
const FLAG_LABEL_KEYS: Record<string, TranslationKey> = {
  parties: 'staff.flagParties',
  bills: 'staff.flagBills',
  items: 'staff.flagItems',
  cashbook: 'staff.flagCashbook',
  expenses: 'staff.flagExpenses',
};

type Lookup = { status: 'idle' | 'checking' | 'existing' | 'new'; name?: string | null };

export default function Staff() {
  const { business } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'STAFF' as 'STAFF' | 'PARTNER', password: '' });
  const [perms, setPerms] = useState<PermissionFlags>({ parties: true, bills: false, items: false, cashbook: false, expenses: false });
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [addedCredentials, setAddedCredentials] = useState<{ email: string; password: string } | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>();

  const base = `/businesses/${business?.id}/staff`;
  const canManage = business?.role === 'OWNER' || business?.role === 'PARTNER';
  const isOwner = business?.role === 'OWNER';
  const emailValid = /^\S+@\S+\.\S+$/.test(form.email);

  const load = useCallback(async () => {
    if (!business || !canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get(base);
      setMembers(res.data.data);
    } catch (e) { setErr(apiMessage(e)); }
    setLoading(false);
  }, [business]);

  useEffect(() => { load(); }, [load]);

  // Debounced "does this email already have an account?" so the form can drop
  // the name/password fields for an existing user (who keeps their own login).
  useEffect(() => {
    clearTimeout(lookupTimer.current);
    if (!emailValid) { setLookup({ status: 'idle' }); return; }
    setLookup({ status: 'checking' });
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`${base}/lookup`, { params: { email: form.email } });
        const d = res.data.data;
        setLookup(d.exists ? { status: 'existing', name: d.name } : { status: 'new' });
      } catch { setLookup({ status: 'new' }); }
    }, 400);
    return () => clearTimeout(lookupTimer.current);
  }, [form.email, emailValid]);

  const openAdd = () => {
    setForm({ email: '', name: '', role: 'STAFF', password: '' });
    setPerms({ parties: true, bills: false, items: false, cashbook: false, expenses: false });
    setLookup({ status: 'idle' });
    setOpen(true);
  };

  const isExisting = lookup.status === 'existing';
  const canSubmit = emailValid && lookup.status !== 'checking'
    && (isExisting || (form.name.trim().length >= 2 && form.password.length >= 6));

  const add = async () => {
    setSubmitting(true);
    try {
      const payload = isExisting
        ? { email: form.email, role: form.role, permissions: perms }
        : { ...form, permissions: perms };
      const res = await api.post(base, payload);
      setOpen(false);
      if (res.data.data.passwordSet) setAddedCredentials({ email: form.email, password: form.password });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); } finally { setSubmitting(false); }
  };

  const togglePerm = async (m: StaffMember, flag: keyof PermissionFlags) => {
    const next = { ...(m.permissions || {}), [flag]: !m.permissions?.[flag] };
    try {
      await api.patch(`${base}/${m.id}`, { permissions: next });
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  const remove = async (m: StaffMember) => {
    if (!(await confirm({ message: t('staff.confirmRemove', { name: m.user.name }), danger: true }))) return;
    try {
      await api.delete(`${base}/${m.id}`);
      await load();
    } catch (e) { toast(apiMessage(e), 'error'); }
  };

  if (!canManage) {
    return <EmptyState icon="🔒" title={t('staff.restrictedTitle')} subtitle={t('staff.restrictedSubtitle')} />;
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">🧑‍💼 {t('staff.title')}</h1>
        {isOwner && <button className="btn-primary" onClick={openAdd}>{t('staff.addNew')}</button>}
      </div>
      <ul className="text-sm text-slate-500 mb-4 list-disc pl-5 space-y-0.5">
        <li>{t('staff.note1')}</li>
        <li>{t('staff.note2')}</li>
        <li>{t('staff.note3')}</li>
      </ul>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : err ? <p className="p-5 text-red-600 text-sm">{err}</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="px-5 py-3">{t('staff.member')}</th><th>{t('staff.role')}</th>
                {FLAGS.map((f) => <th key={f} className="text-center capitalize">{t(FLAG_LABEL_KEYS[f])}</th>)}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.user.name} url={m.user.avatarUrl} size={34} />
                      <div>
                        <p className="font-medium">{m.user.name}</p>
                        <p className="text-xs text-slate-400">{m.user.email || m.user.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      m.role === 'OWNER' ? 'bg-brand-50 text-brand-700'
                        : m.role === 'PARTNER' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>{m.role}</span>
                  </td>
                  {FLAGS.map((f) => (
                    <td key={f} className="text-center">
                      {m.role === 'OWNER' || m.role === 'PARTNER'
                        ? <span className="text-green-600">✓</span>
                        : <input type="checkbox" checked={!!m.permissions?.[f]} onChange={() => togglePerm(m, f)} />}
                    </td>
                  ))}
                  <td className="text-right pr-5">
                    {m.role !== 'OWNER' && (
                      <button className="text-slate-300 hover:text-red-500" onClick={() => remove(m)}>🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} title={t('staff.addModalTitle')} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('common.email')}</label>
            <div className="relative">
              <input className="input" type="email" placeholder={t('staff.emailPlaceholder')} value={form.email} autoFocus
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {lookup.status === 'checking' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>
              )}
            </div>
          </div>

          {/* Existing account → no password; new email → name + password. */}
          {isExisting && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              ✓ {t('staff.existingAccount', { name: lookup.name || form.email })}
            </div>
          )}
          {lookup.status === 'new' && (
            <>
              <div>
                <label className="label">{t('staff.namePlaceholder')}</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('staff.passwordPlaceholder')}</label>
                <input className="input" type="text" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <p className="text-xs text-slate-400 mt-1">{t('staff.passwordHint')}</p>
              </div>
            </>
          )}

          <div>
            <label className="label">{t('staff.role')}</label>
            <select className="input" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'STAFF' | 'PARTNER' })}>
              <option value="STAFF">{t('staff.roleStaffOption')}</option>
              <option value="PARTNER">{t('staff.rolePartnerOption')}</option>
            </select>
          </div>

          {form.role === 'STAFF' ? (
            <div>
              <label className="label">{t('staff.permissionsLabel')}</label>
              <div className="grid grid-cols-2 gap-2">
                {FLAGS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm capitalize">
                    <input type="checkbox" checked={!!perms[f]}
                      onChange={(e) => setPerms({ ...perms, [f]: e.target.checked })} /> {t(FLAG_LABEL_KEYS[f])}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">{t('staff.reportsDerivedHint')}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('staff.partnerFullAccessHint')}</p>
          )}

          <button className="btn-primary w-full justify-center" onClick={add} disabled={!canSubmit || submitting}>
            {t('staff.addMember')}
          </button>
        </div>
      </Modal>

      <Modal open={!!addedCredentials} title={t('staff.credentialsTitle')} onClose={() => setAddedCredentials(null)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{t('staff.credentialsSubtitle')}</p>
          <div className="rounded-lg bg-slate-50 p-3 space-y-1">
            <p className="text-sm"><span className="text-slate-400">{t('common.email')}: </span>{addedCredentials?.email}</p>
            <p className="text-sm font-mono"><span className="text-slate-400 font-sans">{t('staff.password')}: </span>{addedCredentials?.password}</p>
          </div>
          <button className="btn-primary w-full justify-center" onClick={() => setAddedCredentials(null)}>{t('common.close')}</button>
        </div>
      </Modal>
    </div>
  );
}
