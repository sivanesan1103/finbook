import { createContext, useContext, useState, ReactNode } from 'react';
import { dictionaries, interpolate, Lang, TranslationKey } from '../i18n';
import { api, tokens } from '../api/client';

interface LanguageState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageState>(null as unknown as LanguageState);
export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('bk_lang');
    return saved === 'ta' ? 'ta' : 'en';
  });

  // Persisted on the user's profile (not just localStorage) once logged in
  // so the backend can compose reminder/WhatsApp/SMS text in the right
  // language — those go out server-side with no other signal for which
  // language the sender's app is set to.
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('bk_lang', l);
    if (tokens.access) {
      api.patch('/auth/me', { language: l }).catch(() => {});
    }
  };

  const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
    const raw = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
    return interpolate(raw, vars);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
