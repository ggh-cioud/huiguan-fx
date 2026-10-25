import { isOlderQuote, type HistoryData, type Quote, type Snapshot } from "./fx";
import { localizedCurrencyName, localizedSource, type Locale } from "./i18n";

type Cell = string | number | null;

// Keep numbers numeric; neutralize spreadsheet formulas in source-supplied text.
function cell(value: Cell): string {
  if (value === null) return '""';
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csv(rows: Cell[][]): string {
  // BOM and CRLF make Chinese text readable in spreadsheet applications.
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function ratesCsv(snapshot: Snapshot, quotes: Quote[] = snapshot.quotes, now = Date.now(), locale: Locale = "zh-CN"): string {
  const exportedAt = new Date(now).toISOString();
  return csv([
    locale === "en"
      ? ["Currency code", "Currency name", "Base currency", "Base currency per 1 foreign unit", "Change (%)", "Quote time (UTC or date)", "Comparison time (UTC or date)", "Frequency", "Source", "Stale", "Fetched at (UTC)", "Exported at (UTC)"]
      : ["外币代码", "货币名称", "基准货币", "1单位外币可兑换基准货币", "涨跌幅(%)", "报价时间(UTC或日期)", "对比报价时间(UTC或日期)", "更新频率", "数据源", "是否过期", "获取时间(UTC)", "导出时间(UTC)"],
    ...quotes.map(q => [q.code, localizedCurrencyName(q.code, locale, q), snapshot.base, q.rate, q.change, q.date, q.previousDate, snapshot.frequency, localizedSource(snapshot.source, locale), isOlderQuote(q.date, now) ? (locale === "en" ? "Yes" : "是") : (locale === "en" ? "No" : "否"), snapshot.fetchedAt, exportedAt]),
  ]);
}

export function historyCsv(history: HistoryData, now = Date.now(), locale: Locale = "zh-CN"): string {
  const exportedAt = new Date(now).toISOString();
  return csv([
    locale === "en"
      ? ["Quote date", "From currency", "To currency", "Target currency per 1 source unit", "Frequency", "Source", "Fetched at (UTC)", "Exported at (UTC)"]
      : ["报价日期", "持有货币", "目标货币", "1单位持有货币可兑换目标货币", "更新频率", "数据源", "获取时间(UTC)", "导出时间(UTC)"],
    ...history.points.map(p => [p.date, history.from, history.to, p.rate, history.frequency, localizedSource(history.source, locale), history.fetchedAt, exportedAt]),
  ]);
}
