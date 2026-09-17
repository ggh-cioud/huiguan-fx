import { COMMON, currencyName, type Currency, type Snapshot, type HistoryData, type Point, type PairRate } from "./fx";
import { hourlySource, HOURLY_SOURCE, OxrError, type HourlyRates } from "./oxr";
type RawRate = { date: string; base: string; quote: string; rate: number };
type RawCurrency = { iso_code: string; name: string; symbol: string };
const API = "https://api.frankfurter.dev/v2";
const cache = new Map<string, { expires: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const NON_CURRENCY = new Set(["XAU", "XAG", "XPT", "XPD", "XDR", "XTS", "XXX", "BTC"]);
const DAILY_SOURCE = "Frankfurter · 央行综合参考汇率";
export class FxError extends Error { constructor(message: string, public status = 502) { super(message); } }
export function checkCode(code: string) { if (!/^[A-Z]{3}$/.test(code)) throw new FxError("请选择有效的三位货币代码。", 400); return code; }
async function fetchJson<T>(path: string, ttl = 3600000): Promise<T> {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.data as T;
  if (inflight.has(path)) return inflight.get(path) as Promise<T>;
  const pending = (async () => {
    const response = await fetch(`${API}/${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new FxError(response.status === 404 || response.status === 422 ? "暂时没有这组货币的数据。" : "数据源暂时无法连接，请稍后重试。", response.status === 404 || response.status === 422 ? 404 : 502);
    const data = await response.json();
    if (!Array.isArray(data)) throw new FxError("数据源返回的格式不正确。");
    if (cache.size >= 48) cache.delete(cache.keys().next().value!);
    cache.set(path, { expires: Date.now() + ttl, data });
    return data as T;
  })().finally(() => inflight.delete(path));
  inflight.set(path, pending);
  return pending;
}
function validRate(row: RawRate) { return row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^[A-Z]{3}$/.test(row.quote) && Number.isFinite(row.rate) && row.rate > 0; }
function dateBefore(date: string, days: number) { return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10); }
export async function getCurrencies(): Promise<Currency[]> {
  const rows = await fetchJson<RawCurrency[]>("currencies", 86400000);
  return rows.filter(r => /^[A-Z]{3}$/.test(r.iso_code) && !NON_CURRENCY.has(r.iso_code)).map(r => ({ code: r.iso_code, name: currencyName(r.iso_code, r.name), englishName: r.name, symbol: r.symbol }));
}
async function getDailySnapshot(base: string): Promise<Snapshot> {
  checkCode(base);
  const [currencies, raw] = await Promise.all([getCurrencies(), fetchJson<RawRate[]>(`rates?base=${base}`)]);
  if (!currencies.some(c => c.code === base)) throw new FxError("暂不支持所选货币。", 404);
  const latest = raw.filter(r => validRate(r) && r.base === base && r.quote !== base && currencies.some(c => c.code === r.quote));
  if (!latest.length) throw new FxError("数据源暂未提供可用汇率。");
  const end = latest.reduce((date, r) => r.date > date ? r.date : date, latest[0].date);
  const [previousResult, historyResult] = await Promise.allSettled([
    fetchJson<RawRate[]>(`rates?base=${base}&date=${dateBefore(end, 1)}`),
    fetchJson<RawRate[]>(`rates?base=${base}&quotes=${COMMON.filter(c => c !== base).slice(0,12).join(",")}&from=${dateBefore(end, 14)}&to=${end}`),
  ]);
  const previousRows = previousResult.status === "fulfilled" ? previousResult.value.filter(validRate) : [];
  const history = historyResult.status === "fulfilled" ? historyResult.value.filter(validRate) : [];
  const historyAvailable = previousResult.status === "fulfilled";
  const quotes = latest.map(row => {
    const currency = currencies.find(c => c.code === row.quote)!;
    const points: Point[] = history.filter(h => h.base === base && h.quote === row.quote && h.date < row.date).sort((a,b) => a.date.localeCompare(b.date)).slice(-7).map(h => ({ date: h.date, rate: 1 / h.rate }));
    const previousRow = previousRows.find(p => p.quote === row.quote && p.base === base && p.date < row.date);
    const previous = points.at(-1) ?? (previousRow ? { date: previousRow.date, rate: 1 / previousRow.rate } : undefined), rate = 1 / row.rate;
    return { ...currency, date: row.date, rate, previousDate: previous?.date ?? null, change: previous ? (rate / previous.rate - 1) * 100 : null, points: [...points, { date: row.date, rate }] };
  });
  return { base, quotes, currencies, fetchedAt: new Date().toISOString(), source: DAILY_SOURCE, frequency: "daily", historyAvailable, setupRequired: true };
}
async function getDailyPair(from: string, to: string): Promise<PairRate> {
  checkCode(from); checkCode(to);
  const currencies = await getCurrencies();
  if (![from,to].every(code => currencies.some(c => c.code === code))) throw new FxError("暂不支持所选货币。", 404);
  if (from === to) return { from, to, rate: 1, date: new Date().toISOString().slice(0,10), fetchedAt: new Date().toISOString(), source: DAILY_SOURCE, frequency: "daily" };
  const rows = await fetchJson<RawRate[]>(`rates?base=${from}&quotes=${to}`);
  const row = rows.find(r => validRate(r) && r.base === from && r.quote === to);
  if (!row) throw new FxError("暂时没有这组货币的数据。", 404);
  return { from, to, rate: row.rate, date: row.date, fetchedAt: new Date().toISOString(), source: DAILY_SOURCE, frequency: "daily" };
}
function hourlyCurrencies(data: HourlyRates): Currency[] {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  return Object.keys(data.rates).filter(code => !NON_CURRENCY.has(code)).map(code => ({ code, name: currencyName(code), englishName: names.of(code) || code, symbol: code }));
}
function crossRate(data: HourlyRates, from: string, to: string) {
  if (!data.rates[from] || !data.rates[to] || NON_CURRENCY.has(from) || NON_CURRENCY.has(to)) throw new FxError("暂不支持所选货币。", 404);
  const rate = data.rates[to] / data.rates[from];
  if (!Number.isFinite(rate) || rate <= 0) throw new FxError("这组货币暂时没有有效报价。");
  return rate;
}
export async function getSnapshot(base: string): Promise<Snapshot> {
  checkCode(base);
  if (!hourlySource.configured()) return getDailySnapshot(base);
  const latest = await hourlySource.latest();
  crossRate(latest, base, base);
  const currencies = hourlyCurrencies(latest);
  const date = new Date(latest.timestamp * 1000).toISOString();
  const day = date.slice(0, 10);
  const [previousResult, trendResult] = await Promise.allSettled([
    hourlySource.previousDay(latest.timestamp),
    fetchJson<RawRate[]>(`rates?base=${base}&quotes=${COMMON.filter(c => c !== base).slice(0,12).join(",")}&from=${dateBefore(day, 14)}&to=${day}`),
  ]);
  const previous = previousResult.status === "fulfilled" && previousResult.value.timestamp < latest.timestamp ? previousResult.value : null;
  const trend = trendResult.status === "fulfilled" ? trendResult.value.filter(validRate) : [];
  const quotes = currencies.filter(c => c.code !== base).map(currency => {
    const rate = crossRate(latest, currency.code, base);
    const previousRate = previous && previous.rates[base] && previous.rates[currency.code] ? crossRate(previous, currency.code, base) : null;
    // Daily Frankfurter chart points remain a separate series. Never append an
    // OXR intraday price to it or use a different provider to calculate change.
    const points = trend.filter(r => r.base === base && r.quote === currency.code && r.date <= day).sort((a,b) => a.date.localeCompare(b.date)).slice(-7).map(r => ({ date: r.date, rate: 1 / r.rate }));
    return { ...currency, rate, date, previousDate: previousRate && previous ? new Date(previous.timestamp * 1000).toISOString() : null, change: previousRate ? (rate / previousRate - 1) * 100 : null, points };
  });
  return { base, quotes, currencies, fetchedAt: latest.fetchedAt, nextUpdateAt: latest.nextUpdateAt, source: HOURLY_SOURCE, frequency: "hourly", historyAvailable: previous !== null, setupRequired: false };
}
export async function getPair(from: string, to: string): Promise<PairRate> {
  checkCode(from); checkCode(to);
  if (!hourlySource.configured()) return getDailyPair(from, to);
  const latest = await hourlySource.latest();
  return { from, to, rate: crossRate(latest, from, to), date: new Date(latest.timestamp * 1000).toISOString(), fetchedAt: latest.fetchedAt, nextUpdateAt: latest.nextUpdateAt, source: HOURLY_SOURCE, frequency: "hourly" };
}
export async function getHistory(from: string, to: string, days: number): Promise<HistoryData> {
  checkCode(from); checkCode(to);
  if (![7,30,90,365].includes(days)) throw new FxError("请选择 7、30、90 或 365 天。", 400);
  const currencies = await getCurrencies();
  if (![from,to].every(code => currencies.some(c => c.code === code))) throw new FxError("暂不支持所选货币。", 404);
  if (from === to) return { from, to, days, points: [], fetchedAt: new Date().toISOString(), source: DAILY_SOURCE, frequency: "daily" };
  const today = new Date().toISOString().slice(0, 10);
  const data = await fetchJson<RawRate[]>(`rates?base=${from}&quotes=${to}&from=${dateBefore(today, days)}&to=${today}`);
  return { from, to, days, points: data.filter(r => validRate(r) && r.base === from && r.quote === to).sort((a,b) => a.date.localeCompare(b.date)).map(r => ({ date: r.date, rate: r.rate })), fetchedAt: new Date().toISOString(), source: DAILY_SOURCE, frequency: "daily" };
}
export function apiError(error: unknown) { const known = error instanceof FxError || error instanceof OxrError; return Response.json({ error: known ? error.message : "汇率服务暂时不可用，请稍后重试。" }, { status: known ? error.status : 502, headers: { "Cache-Control": "no-store" } }); }
