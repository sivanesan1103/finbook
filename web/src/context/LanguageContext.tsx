import { createContext, useContext, useState, ReactNode } from 'react';
import { dictionaries, interpolate, Lang, TranslationKey } from '../i18n';

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

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('bk_lang', l);
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
