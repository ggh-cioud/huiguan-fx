import { decimalInput, type ConversionInputs } from "./conversion";
import type { Locale } from "./i18n";

export type QueryState = ConversionInputs & { base: string; selected: string; days: number; from: string; to: string };
export const QUERY_STORAGE_KEY = "huiguan.query.v1";
export const DEFAULT_QUERY: QueryState = { base: "CNY", selected: "USD", days: 30, from: "USD", to: "CNY", amount: "1000", mode: "send", feePercent: "0", fixedFee: "0", spreadPercent: "0" };
const codes = ["base", "selected", "from", "to"] as const;
const numbers = ["amount", "feePercent", "fixedFee", "spreadPercent"] as const;

export function restoreQuery(value: unknown, fallback: QueryState = DEFAULT_QUERY): QueryState {
  const result = { ...fallback };
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const saved = value as Record<string, unknown>;
  for (const key of codes) if (typeof saved[key] === "string" && /^[A-Z]{3}$/.test(saved[key])) result[key] = saved[key];
  for (const key of numbers) {
    const number = decimalInput(saved[key]);
    if (number !== null && (!(key === "feePercent" || key === "spreadPercent") || number < 100)) result[key] = saved[key] as string;
  }
  if (saved.mode === "send" || saved.mode === "receive") result.mode = saved.mode;
  if ([7, 30, 90, 365].includes(Number(saved.days))) result.days = Number(saved.days);
  if (result.selected === result.base) result.selected = result.base === "USD" ? "EUR" : "USD";
  return result;
}

export function readSharedQuery(hash: string): { query: QueryState; locale: Locale } | null {
  if (hash.length > 1800) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("q") !== "1") return null;
  const saved = Object.fromEntries(params);
  return { query: restoreQuery(saved), locale: params.get("lang") === "en" ? "en" : "zh-CN" };
}

export function shareQueryUrl(location: string, query: QueryState, locale: Locale): string | null {
  const clean = restoreQuery(query);
  if (Object.entries(query).some(([key, value]) => clean[key as keyof QueryState] !== value)) return null;
  const url = new URL(location);
  // Only query settings go into the fragment: no quote snapshots, favorites,
  // alerts or credentials. The fragment is not sent in an HTTP request.
  url.search = "";
  url.hash = new URLSearchParams({ q: "1", ...Object.fromEntries(Object.entries(clean).map(([key, value]) => [key, String(value)])), lang: locale }).toString();
  return url.toString();
}
