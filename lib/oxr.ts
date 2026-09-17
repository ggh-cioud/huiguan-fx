import { HOUR_MS } from "./fx";

const API = "https://openexchangerates.org/api/";
const DAY_MS = 24 * HOUR_MS;
export const HOURLY_SOURCE = "Open Exchange Rates · 小时参考汇率";
export type HourlyRates = { timestamp: number; base: "USD"; rates: Record<string, number>; fetchedAt: string; nextUpdateAt: string };
export class OxrError extends Error { constructor(message: string, public status = 502) { super(message); } }
type Options = { appId?: () => string; now?: () => number; fetcher?: typeof fetch; storage?: () => CacheStorage | undefined };
type Entry = { expires: number; data?: HourlyRates; error?: OxrError };

// One USD snapshot serves every base, converter and alert. Never request a paid
// base/convert/time-series endpoint or attach the secret to a URL or response.
export function createHourlySource(options: Options = {}) {
  const appId = options.appId ?? (() => process.env.OPEN_EXCHANGE_RATES_APP_ID?.trim() ?? "");
  const now = options.now ?? (() => Date.now());
  const fetcher: typeof fetch = options.fetcher ?? ((...args) => fetch(...args));
  const storage = options.storage ?? (() => typeof caches === "undefined" ? undefined : caches);
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<HourlyRates>>();
  let currentId = "";
  let scope: Promise<string> | undefined;

  function configured() { return appId().length > 0; }
  function valid(data: unknown): data is HourlyRates {
    if (!data || typeof data !== "object") return false;
    const d = data as HourlyRates;
    return d.base === "USD" && Number.isInteger(d.timestamp) && d.timestamp > 0 && d.timestamp * 1000 <= now() + 300000 && !!d.rates && typeof d.rates === "object" && !Array.isArray(d.rates) && d.rates.USD === 1
      && Object.entries(d.rates).every(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0);
  }
  async function persistent(path: string, data?: HourlyRates): Promise<HourlyRates | undefined> {
    // Cache API survives local Worker restarts; the credential is never stored.
    // Failure here still leaves the shared in-memory throttle in effect.
    try {
      const store = storage();
      if (!store) return;
      scope ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(currentId)).then(buffer => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join(""));
      const key = new Request(`https://huiguan-cache.invalid/oxr-v1/${await scope}/${path}`);
      const disk = await store.open("huiguan-hourly-v1");
      if (data) {
        const ttl = Math.max(1, Math.floor((Date.parse(data.nextUpdateAt) - now()) / 1000));
        await disk.put(key, Response.json(data, { headers: { "Cache-Control": `max-age=${ttl}` } }));
      } else {
        const response = await disk.match(key);
        if (response) {
          const saved: unknown = await response.json();
          if (valid(saved) && Number.isFinite(Date.parse(saved.fetchedAt)) && Date.parse(saved.nextUpdateAt) > now()) return saved;
        }
      }
    } catch { /* Storage is optional; failed storage never supplies invented rates. */ }
  }
  async function load(path: string, ttl: number): Promise<HourlyRates> {
    const id = appId();
    if (!id) throw new OxrError("小时级数据尚未启用，请在本机配置 Open Exchange Rates App ID。", 503);
    if (!/^[a-f\d]{32}$/i.test(id)) throw new OxrError("App ID 格式不正确，应为 32 位字符。请检查本机配置后重启网站。", 503);
    if (currentId !== id) { currentId = id; scope = undefined; cache.clear(); inflight.clear(); }
    const existing = cache.get(path);
    if (existing && existing.expires > now()) {
      if (existing.error) throw existing.error;
      return existing.data!;
    }
    const active = inflight.get(path);
    if (active) return active;
    const task = (async () => {
      const saved = await persistent(path);
      if (saved) { cache.set(path, { data: saved, expires: Date.parse(saved.nextUpdateAt) }); return saved; }
      try {
        const response = await fetcher(`${API}${path}`, { headers: { Accept: "application/json", Authorization: `Token ${id}` }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new OxrError("小时级接口认证失败，请检查 App ID 和免费账户状态。", 503);
          if (response.status === 429) throw new OxrError("小时级接口额度或请求频率受限，请检查账户额度后重试。", 503);
          throw new OxrError("小时级数据源暂时无法连接，请稍后重试。");
        }
        const raw: unknown = await response.json();
        if (!valid(raw)) throw new OxrError("小时级数据源返回了无效的报价或时间。");
        if (path.startsWith("historical/") && new Date(raw.timestamp * 1000).toISOString().slice(0, 10) !== path.slice(11, 21)) throw new OxrError("历史对比报价日期不符。");
        const fetched = now();
        const data: HourlyRates = { base: "USD", timestamp: raw.timestamp, rates: raw.rates, fetchedAt: new Date(fetched).toISOString(), nextUpdateAt: new Date(fetched + ttl).toISOString() };
        if (cache.size > 8) cache.delete(cache.keys().next().value!);
        cache.set(path, { data, expires: fetched + ttl });
        await persistent(path, data);
        return data;
      } catch (error) {
        const safe = error instanceof OxrError ? error : new OxrError("小时级数据源暂时无法连接，请稍后重试。");
        // Coalesce failures too, so an outage or exhausted quota is not hammered.
        cache.set(path, { error: safe, expires: now() + 300000 });
        throw safe;
      }
    })().finally(() => inflight.delete(path));
    inflight.set(path, task);
    return task;
  }
  return {
    configured,
    latest: () => load("latest.json", HOUR_MS),
    previousDay: (timestamp: number) => load(`historical/${new Date(timestamp * 1000 - DAY_MS).toISOString().slice(0, 10)}.json`, 2 * DAY_MS),
  };
}

export const hourlySource = createHourlySource();
