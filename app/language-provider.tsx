"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { formatQuoteTime, percent } from "@/lib/fx";
import { LANGUAGE_STORAGE_KEY, resolveLocale, translate, localizeError, localizedCurrencyName, type Locale } from "@/lib/i18n";

function languageTools(locale: Locale) {
  return {
    locale,
    t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values),
    name: (code: string, currency?: Parameters<typeof localizedCurrencyName>[2]) => localizedCurrencyName(code, locale, currency),
    errorText: (message: string) => localizeError(locale, message),
    quoteTime: (date: string) => { const text = formatQuoteTime(date); return text === "时间无效" ? translate(locale, "时间无效") : text; },
    change: (value: number | null) => value === null ? translate(locale, "暂无对比") : percent(value),
  };
}

const LanguageContext = createContext<ReturnType<typeof languageTools> & { setLocale: (locale: Locale) => void } | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Match server markup on first render. Storage is read only after hydration.
  const [locale, updateLocale] = useState<Locale>("zh-CN");
  useEffect(() => {
    try { updateLocale(resolveLocale(JSON.parse(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "null"))); } catch { /* Keep Chinese when storage is unavailable. */ }
    const sync = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY && event.key !== null) return;
      try { updateLocale(resolveLocale(event.newValue ? JSON.parse(event.newValue) : null)); } catch { updateLocale("zh-CN"); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "汇观 FX · 全球汇率看板");
    document.querySelector('meta[name="description"]')?.setAttribute("content", translate(locale, "中英文汇率看板：小时参考报价、历史日线、货币换算、自选与本机到价提醒。"));
  }, [locale]);
  const value = useMemo(() => ({
    ...languageTools(locale),
    setLocale: (next: Locale) => {
      updateLocale(next);
      try { localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(next)); }
      catch { toast.warning(translate(next, "浏览器无法保存本机数据，关闭页面后设置可能丢失。")); }
    },
  }), [locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}

export function LanguageSwitch() {
  const { locale, setLocale, t } = useLanguage();
  return <div className="language-switch" role="group" aria-label={t("界面语言")}>
    <button type="button" lang="zh-CN" aria-label="切换为中文" aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>中文</button>
    <button type="button" lang="en" aria-label="Switch to English" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
  </div>;
}
