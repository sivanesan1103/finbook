import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr('');
    if (form.password !== form.confirm) return setErr('Passwords do not match');
    setBusy(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      const d = res.data.data;
      await setSession(d.user, d.accessToken, d.refreshToken);
      navigate('/');
    } catch (e) { setErr(apiMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-navy-800 rounded-t-3xl px-8 py-12 text-center border-b border-navy-700">
          <h1 className="text-4xl font-extrabold text-white leading-tight">Create your<br />account</h1>
        </div>
        <div className="bg-white rounded-b-3xl px-8 py-8 shadow-2xl space-y-4">
          <input className="input py-3 rounded-2xl" placeholder="Full Name" value={form.name} onChange={set('name')} />
          <input className="input py-3 rounded-2xl" placeholder="Email address" type="email" value={form.email} onChange={set('email')} />
          <input className="input py-3 rounded-2xl" type="password" placeholder="Password" value={form.password} onChange={set('password')} />
          <input className="input py-3 rounded-2xl" type="password" placeholder="Confirm Password" value={form.confirm} onChange={set('confirm')} />
          <button className="btn-primary w-full py-3 rounded-2xl justify-center bg-brand-600 hover:bg-brand-700 text-white"
            onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Register'}
          </button>
          {err && <p className="text-red-600 text-sm text-center">{err}</p>}
          <p className="text-center text-sm text-slate-500">
            Already have an account? <Link to="/login" className="underline font-semibold text-brand-600">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
