import type { BrowserContext } from "@playwright/test";

// Deterministic test-only quotes. These fixtures are never imported by the app.
export async function mockMarket(context: BrowserContext, options: { holdDetails?: boolean; failDetails?: boolean } = {}) {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const values: Record<string, number> = { USD: 1, CNY: 7, EUR: .9, JPY: 150, GBP: .8 };
  const names: Record<string, [string, string]> = { USD: ["美元", "US Dollar"], CNY: ["人民币", "Chinese Yuan"], EUR: ["欧元", "Euro"], JPY: ["日元", "Japanese Yen"], GBP: ["英镑", "British Pound"] };
  const currencies = Object.keys(values).map(code => ({ code, name: names[code][0], englishName: names[code][1], symbol: code }));
  await context.route("**/api/**", async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    const now = Date.now(), date = new Date(now).toISOString(), previousDate = new Date(now - 86400000).toISOString();
    const common = { fetchedAt: date, nextUpdateAt: new Date(now + 3600000).toISOString(), source: "Open Exchange Rates · 小时参考汇率", frequency: "hourly" };
    const base = url.searchParams.get("base") || "CNY", from = url.searchParams.get("from") || "USD", to = url.searchParams.get("to") || "CNY";
    const points = (rate: number) => [3, 2, 1].map((days, index) => ({ date: new Date(now - days * 86400000).toISOString().slice(0, 10), rate: rate * (1 + index * .001) }));
    if (url.pathname === "/api/rates") {
      const details = url.searchParams.get("view") !== "quotes";
      if (details && options.holdDetails) await gate;
      if (details && options.failDetails) return route.fulfill({ status: 503, json: { error: "历史服务不可用" } });
      return route.fulfill({ json: { ...common, base, currencies, historyAvailable: details, setupRequired: false,
        quotes: currencies.filter(c => c.code !== base).map(currency => ({ ...currency, rate: values[base] / values[currency.code], date, previousDate: details ? previousDate : null, change: details ? .25 : null, points: details ? points(values[base] / values[currency.code]) : [] })) } });
    }
    if (url.pathname === "/api/quote") return route.fulfill({ json: { ...common, from, to, date, rate: values[to] / values[from] } });
    if (url.pathname === "/api/history") return route.fulfill({ json: { from, to, days: Number(url.searchParams.get("days")), points: points(values[to] / values[from]), fetchedAt: date, source: "Frankfurter · 央行综合参考汇率", frequency: "daily" } });
    return route.fulfill({ status: 404, json: { error: "Unexpected test request" } });
  });
  return { calls, release };
}
