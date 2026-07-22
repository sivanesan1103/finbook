import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { User } from '../types';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { setSession } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();

  // ── OTP step (shown after a successful register, before entering the app) ──
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [pending, setPending] = useState<{ user: User; accessToken: string; refreshToken: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [otpErr, setOtpErr] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr('');
    if (form.password !== form.confirm) return setErr(t('auth.passwordsDontMatch'));
    setBusy(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      const d = res.data.data;
      setPending({ user: d.user, accessToken: d.accessToken, refreshToken: d.refreshToken });
      setStep('otp');
    } catch (e) { setErr(apiMessage(e)); } finally { setBusy(false); }
  };

  const enterApp = async (user: User) => {
    if (!pending) return;
    await setSession(user, pending.accessToken, pending.refreshToken);
    navigate('/');
  };

  const verifyOtp = async () => {
    if (!pending) return;
    if (otp.trim().length !== 6) return setOtpErr(t('auth.otpInvalid'));
    setOtpErr('');
    setOtpBusy(true);
    try {
      const res = await api.post('/auth/verify-email', { email: pending.user.email, code: otp.trim() });
      await enterApp(res.data.data);
    } catch (e) { setOtpErr(apiMessage(e)); } finally { setOtpBusy(false); }
  };

  const resendOtp = async () => {
    if (!pending) return;
    setResendMsg('');
    setResendBusy(true);
    try {
      await api.post('/auth/resend-otp', { email: pending.user.email });
      setResendMsg(t('auth.otpResent'));
    } catch (e) { setOtpErr(apiMessage(e)); } finally { setResendBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center gap-3 mb-3 text-sm">
          <button className={lang === 'en' ? 'text-white font-semibold' : 'text-slate-400'} onClick={() => setLang('en')}>English</button>
          <span className="text-slate-500">|</span>
          <button className={lang === 'ta' ? 'text-white font-semibold' : 'text-slate-400'} onClick={() => setLang('ta')}>தமிழ்</button>
        </div>

        {step === 'form' ? (
          <>
            <div className="bg-navy-800 rounded-t-3xl px-8 py-12 text-center border-b border-navy-700">
              <h1 className="text-4xl font-extrabold text-white leading-tight">{t('auth.createAccountTitleLine1')}<br />{t('auth.createAccountTitleLine2')}</h1>
            </div>
            <div className="bg-white rounded-b-3xl px-8 py-8 shadow-2xl space-y-4">
              <input className="input py-3 rounded-2xl" placeholder={t('auth.fullNamePlaceholder')} value={form.name} onChange={set('name')} />
              <input className="input py-3 rounded-2xl" placeholder={t('auth.emailPlaceholder')} type="email" value={form.email} onChange={set('email')} />
              <input className="input py-3 rounded-2xl" type="password" placeholder={t('auth.passwordPlaceholder')} value={form.password} onChange={set('password')} />
              <input className="input py-3 rounded-2xl" type="password" placeholder={t('auth.confirmPasswordPlaceholder')} value={form.confirm} onChange={set('confirm')} />
              <button className="btn-primary w-full py-3 rounded-2xl justify-center bg-brand-600 hover:bg-brand-700 text-white"
                onClick={submit} disabled={busy}>
                {busy ? t('auth.creating') : t('auth.register')}
              </button>
              {err && <p className="text-red-600 text-sm text-center">{err}</p>}
              <p className="text-center text-sm text-slate-500">
                {t('auth.haveAccount')} <Link to="/login" className="underline font-semibold text-brand-600">{t('auth.signIn')}</Link>
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-navy-800 rounded-t-3xl px-8 py-12 text-center border-b border-navy-700">
              <h1 className="text-3xl font-extrabold text-white leading-tight">{t('auth.otpTitle')}</h1>
              <p className="text-slate-400 mt-2 text-sm">{t('auth.otpSubtitle', { email: pending?.user.email || '' })}</p>
            </div>
            <div className="bg-white rounded-b-3xl px-8 py-8 shadow-2xl space-y-4">
              <input
                className="input py-3 rounded-2xl text-center text-2xl tracking-[0.5em] font-bold"
                placeholder={t('auth.otpPlaceholder')}
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
              <button className="btn-primary w-full py-3 rounded-2xl justify-center bg-brand-600 hover:bg-brand-700 text-white"
                onClick={verifyOtp} disabled={otpBusy || otp.length !== 6}>
                {otpBusy ? t('auth.otpVerifying') : t('auth.otpVerify')}
              </button>
              {otpErr && <p className="text-red-600 text-sm text-center">{otpErr}</p>}
              {resendMsg && <p className="text-green-600 text-sm text-center">{resendMsg}</p>}
              <div className="flex items-center justify-between text-sm">
                <button className="text-brand-600 font-semibold underline disabled:opacity-50" onClick={resendOtp} disabled={resendBusy}>
                  {resendBusy ? t('auth.otpResending') : t('auth.otpResend')}
                </button>
                <button className="text-slate-500 underline" onClick={() => pending && enterApp(pending.user)}>
                  {t('auth.otpSkip')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
