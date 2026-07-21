import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { setSession } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const d = res.data.data;
      await setSession(d.user, d.accessToken, d.refreshToken);
      navigate('/');
    } catch (e) { setErr(apiMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center gap-3 mb-3 text-sm">
          <button className={lang === 'en' ? 'text-white font-semibold' : 'text-slate-400'} onClick={() => setLang('en')}>English</button>
          <span className="text-slate-500">|</span>
          <button className={lang === 'ta' ? 'text-white font-semibold' : 'text-slate-400'} onClick={() => setLang('ta')}>தமிழ்</button>
        </div>
        <div className="bg-navy-800 rounded-t-3xl px-8 py-12 text-center border-b border-navy-700">
          <h1 className="text-4xl font-extrabold text-white leading-tight">{t('auth.signInTitleLine1')}<br />{t('auth.signInTitleLine2')}</h1>
          <p className="text-slate-400 mt-2 text-sm">{t('auth.signInSubtitle')}</p>
        </div>
        <div className="bg-white rounded-b-3xl px-8 py-8 shadow-2xl space-y-4">
          <input className="input py-3 rounded-2xl" placeholder={t('auth.emailPlaceholder')} type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <input className="input py-3 rounded-2xl" type="password" placeholder={t('auth.passwordPlaceholder')} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-primary w-full py-3 rounded-2xl justify-center bg-brand-600 hover:bg-brand-700 text-white"
            onClick={submit} disabled={busy || !email || !password}>
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
          {err && <p className="text-red-600 text-sm mt-3 text-center">{err}</p>}
          <p className="text-center text-sm text-slate-500 mt-6">
            {t('auth.noAccount')} <Link to="/register" className="underline font-semibold text-brand-600">{t('auth.signUp')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
