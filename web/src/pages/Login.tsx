import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { AuthShell } from '../components/AuthLayout';
import { useToast } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { setSession } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const d = res.data.data;
      await setSession(d.user, d.accessToken, d.refreshToken);
      navigate('/');
    } catch (e) {
      const msg = apiMessage(e);
      setErr(msg);
      toast(msg, 'error');
    } finally { setBusy(false); }
  };

  return (
    <AuthShell headline={t('auth.brandHeadlineLogin')}>
      <div className="text-center lg:text-left mb-8">
        <h1 className="text-2xl font-bold text-white lg:text-slate-900">{t('auth.welcomeBack')}</h1>
        <p className="text-slate-400 lg:text-slate-500 text-sm mt-1">{t('auth.welcomeBackSubtitle')}</p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 text-slate-400 pointer-events-none">📧</span>
          <input className="input py-3 rounded-2xl pl-10 shadow-sm transition focus:scale-[1.01]" placeholder={t('auth.emailPlaceholder')} type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 text-slate-400 pointer-events-none">🔒</span>
          <input className="input py-3 rounded-2xl pl-10 shadow-sm transition focus:scale-[1.01]" type="password" placeholder={t('auth.passwordPlaceholder')} value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full py-3 rounded-2xl justify-center bg-brand-600 hover:bg-brand-700 text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          onClick={submit} disabled={busy || !email || !password}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>
        {err && <p className="text-red-400 lg:text-red-600 text-sm text-center animate-fade-in-up">{err}</p>}
        <p className="text-center text-sm text-slate-400 lg:text-slate-500 mt-6">
          {t('auth.noAccount')} <Link to="/register" className="underline font-semibold text-brand-500 lg:text-brand-600">{t('auth.signUp')}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
