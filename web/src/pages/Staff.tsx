import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, apiMessage } from '../api/client';
import type { StaffMember, PermissionFlags } from '../types';
import { Avatar, EmptyState, Modal, Spinner } from '../components/ui';

const FLAGS: (keyof PermissionFlags)[] = ['parties', 'bills', 'items', 'cashbook', 'reports'];

export default function Staff() {
  const { business } = useAuth();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'STAFF' as 'STAFF' | 'PARTNER' });
  const [perms, setPerms] = useState<PermissionFlags>({ parties: true, bills: true, items: false, cashbook: false, reports: false });
  const [err, setErr] = useState('');

  const base = `/businesses/${business?.id}/staff`;
  const canManage = business?.role === 'OWNER' || business?.role === 'PARTNER';

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

  const add = async () => {
    try {
      await api.post(base, { ...form, name: form.name || undefined, permissions: perms });
      setOpen(false);
      setForm({ email: '', name: '', role: 'STAFF' });
      await load();
    } catch (e) { alert(apiMessage(e)); }
  };

  const togglePerm = async (m: StaffMember, flag: keyof PermissionFlags) => {
    const next = { ...(m.permissions || {}), [flag]: !m.permissions?.[flag] };
    await api.patch(`${base}/${m.id}`, { permissions: next });
    await load();
  };

  const remove = async (m: StaffMember) => {
    if (!confirm(`Remove ${m.user.name} from this business?`)) return;
    await api.delete(`${base}/${m.id}`);
    await load();
  };

  if (!canManage) {
    return <EmptyState icon="🔒" title="Staff management is for owners and partners"
      subtitle="Ask the business owner to change your role if you need access." />;
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">Staff</h1>
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Add New Staff</button>
      </div>
      <ul className="text-sm text-slate-500 mb-4 list-disc pl-5 space-y-0.5">
        <li>Partners & staff sign in with their own email — invitees register with the invited email to claim their account</li>
        <li>Add different permission levels for Bills, Items & Parties</li>
        <li>View entries and bills made by each staff in the Activity log</li>
      </ul>

      <div className="card">
        {loading ? <Spinner /> : err ? <p className="p-5 text-red-600 text-sm">{err}</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="px-5 py-3">Member</th><th>Role</th>
                {FLAGS.map((f) => <th key={f} className="text-center capitalize">{f}</th>)}
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
                      m.role === 'OWNER' ? 'bg-brand-50 text-brand-700' :
                      m.role === 'PARTNER' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>{m.role}</span>
                  </td>
                  {FLAGS.map((f) => (
                    <td key={f} className="text-center">
                      {m.role === 'OWNER' || m.role === 'PARTNER' ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <input type="checkbox" checked={!!m.permissions?.[f]} onChange={() => togglePerm(m, f)} />
                      )}
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

      <Modal open={open} title="Add Staff / Partner" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <input className="input" type="email" placeholder="Email address *" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Name (optional)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'STAFF' | 'PARTNER' })}>
            <option value="STAFF">Staff (custom permissions)</option>
            <option value="PARTNER">Partner (full access)</option>
          </select>
          {form.role === 'STAFF' && (
            <div className="grid grid-cols-2 gap-2">
              {FLAGS.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm capitalize">
                  <input type="checkbox" checked={!!perms[f]}
                    onChange={(e) => setPerms({ ...perms, [f]: e.target.checked })} /> {f}
                </label>
              ))}
            </div>
          )}
          <button className="btn-primary w-full justify-center" onClick={add} disabled={!/^\S+@\S+\.\S+$/.test(form.email)}>
            Add Member
          </button>
        </div>
      </Modal>
    </div>
  );
}
