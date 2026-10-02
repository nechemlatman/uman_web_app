import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { en, he, type MessageKey } from "./messages";
type Locale = "he" | "en";
const Context = createContext({
  locale: "he" as Locale,
  setLocale: (_l: Locale) => {},
  t: (key: string): string => key,
});
export function I18n({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem("uman.language") === "en" ? "en" : "he",
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    localStorage.setItem("uman.language", locale);
  }, [locale]);
  const t = (key: string) =>
    (locale === "he" ? he : en)[key as MessageKey] ?? key;
  return (
    <Context.Provider value={{ locale, setLocale, t }}>
      {children}
    </Context.Provider>
  );
}
export const useI18n = () => useContext(Context);
export function formatDate(
  value: unknown,
  locale: string,
  time = false,
): string {
  if (!value) return "—";
  const date = new Date(
    time ? String(value) : String(value).slice(0, 10) + "T12:00:00Z",
  );
  if (!Number.isFinite(date.valueOf())) return "—";
  return (
    new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
      dateStyle: "medium",
      ...(time ? { timeStyle: "short" as const } : {}),
      timeZone: "UTC",
    }).format(date) + (time ? " UTC" : "")
  );
}
