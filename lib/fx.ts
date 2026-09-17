export type Currency = { code: string; name: string; englishName: string; symbol: string };
export type Point = { date: string; rate: number };
export type Quote = Currency & { rate: number; date: string; previousDate: string | null; change: number | null; points: Point[] };
export type Frequency = "daily" | "hourly";
export type Snapshot = { base: string; quotes: Quote[]; currencies: Currency[]; fetchedAt: string; source: string; frequency: Frequency; historyAvailable: boolean; nextUpdateAt?: string; setupRequired?: boolean };
export type HistoryData = { from: string; to: string; days: number; points: Point[]; fetchedAt: string; source: string; frequency: "daily" };
export type PairRate = { from: string; to: string; rate: number; date: string; fetchedAt: string; source: string; frequency: Frequency; nextUpdateAt?: string };
export type RateAlert = { id: string; from: string; to: string; direction: "above" | "below"; target: number; createdAt: string; triggeredAt: string | null; lastRate?: number; lastDate?: string };
export function alertMatches(alert: RateAlert, quote: PairRate, now = Date.now()) {
  return !alert.triggeredAt && alert.from === quote.from && alert.to === quote.to && !isOlderQuote(quote.date, now) && Number.isFinite(quote.rate) && quote.rate > 0 && (alert.direction === "above" ? quote.rate >= alert.target : quote.rate <= alert.target);
}
export const COMMON = ["USD", "EUR", "JPY", "GBP", "HKD", "AUD", "CAD", "CHF", "SGD", "KRW", "NZD", "THB", "CNY", "INR", "MYR", "AED"];
export const NAMES: Record<string, string> = { CNY: "人民币", USD: "美元", EUR: "欧元", JPY: "日元", GBP: "英镑", HKD: "港币", AUD: "澳大利亚元", CAD: "加拿大元", CHF: "瑞士法郎", SGD: "新加坡元", KRW: "韩元", NZD: "新西兰元", THB: "泰铢", INR: "印度卢比", MYR: "马来西亚林吉特", AED: "阿联酋迪拉姆", TWD: "新台币", MOP: "澳门元" };
export function currencyName(code: string, fallback = code) {
  if (NAMES[code]) return NAMES[code];
  try { return new Intl.DisplayNames(["zh-CN"], { type: "currency" }).of(code) || fallback; } catch { return fallback; }
}
export function formatRate(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: value >= 100 ? 2 : 4, maximumFractionDigits: value < 0.01 ? 8 : value < 1 ? 6 : 4 });
}
export function percent(value: number | null) { return value === null ? "暂无对比" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`; }
export const HOUR_MS = 3600000;
export function isOlderQuote(date: string, now = Date.now()) {
  const daily = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const time = Date.parse(daily ? `${date}T00:00:00Z` : date);
  if (!Number.isFinite(time) || !daily && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date)) return true;
  return time > now + (daily ? 86400000 : 300000) || now - time > (daily ? 4 * 86400000 : 2 * HOUR_MS);
}
export function formatQuoteTime(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const time = Date.parse(date);
  return Number.isFinite(time) ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(time) : "时间无效";
}
export function convertAmount(amount: number, rate: number) {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0) return null;
  const result = amount * rate;
  return Number.isFinite(result) ? result : null;
}
