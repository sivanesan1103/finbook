import { ReactNode } from 'react';
import { useLanguage } from '../context/LanguageContext';

/** Shared split-screen shell for Login/Register: branded showcase panel + form panel. */
export function AuthShell({ children, headline }: { children: ReactNode; headline: string }) {
  const { lang, setLang, t } = useLanguage();

  const FEATURES = [
    { icon: '📒', text: t('auth.feature1') },
    { icon: '🧾', text: t('auth.feature2') },
    { icon: '📊', text: t('auth.feature3') },
  ];

  return (
    <div className="min-h-screen flex bg-navy-900 lg:bg-slate-50">
      {/* ── Left: branded showcase panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 flex-col justify-between p-12">
        <div className="pointer-events-none absolute -top-24 -left-20 w-96 h-96 rounded-full bg-brand-500/20 blur-3xl animate-float-slow" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-link-500/10 blur-3xl animate-float-slower" />

        <div className="relative flex items-center gap-3">
          <img src="/icon.png" alt="FinBook" className="w-10 h-10 rounded-xl shadow-lg shadow-black/30" />
          <span className="text-white font-extrabold text-xl tracking-tight">FinBook</span>
        </div>

        <div className="relative">
          <p className="text-brand-500 text-xs font-bold tracking-widest uppercase mb-3">{t('auth.brandTagline')}</p>
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-10 max-w-md">{headline}</h2>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-slate-200">
                <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-lg shrink-0">{f.icon}</span>
                <span className="text-sm">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-slate-500 text-xs">© {new Date().getFullYear()} FinBook</p>
      </div>

      {/* ── Right: form panel ── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
        <div className="lg:hidden pointer-events-none absolute -top-24 -left-20 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl animate-float-slow" />
        <div className="lg:hidden pointer-events-none absolute -bottom-28 -right-16 w-80 h-80 rounded-full bg-link-500/10 blur-3xl animate-float-slower" />

        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex gap-3 text-sm z-10">
          <button className={lang === 'en' ? 'text-white lg:text-slate-800 font-semibold' : 'text-slate-400'} onClick={() => setLang('en')}>English</button>
          <span className="text-slate-500 lg:text-slate-300">|</span>
          <button className={lang === 'ta' ? 'text-white lg:text-slate-800 font-semibold' : 'text-slate-400'} onClick={() => setLang('ta')}>தமிழ்</button>
        </div>

        <div className="w-full max-w-sm relative animate-fade-in-up">
          <div className="lg:hidden text-center mb-8">
            <img src="/icon.png" alt="FinBook" className="mx-auto w-16 h-16 rounded-2xl shadow-lg shadow-black/30 animate-pop-in" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
