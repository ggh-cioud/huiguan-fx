import { isOlderQuote, type HistoryData, type Quote, type Snapshot } from "./fx";

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

export function ratesCsv(snapshot: Snapshot, quotes: Quote[] = snapshot.quotes, now = Date.now()): string {
  const exportedAt = new Date(now).toISOString();
  return csv([
    ["外币代码", "货币名称", "基准货币", "1单位外币可兑换基准货币", "涨跌幅(%)", "报价时间(UTC或日期)", "对比报价时间(UTC或日期)", "更新频率", "数据源", "是否过期", "获取时间(UTC)", "导出时间(UTC)"],
    ...quotes.map(q => [q.code, q.name, snapshot.base, q.rate, q.change, q.date, q.previousDate, snapshot.frequency, snapshot.source, isOlderQuote(q.date, now) ? "是" : "否", snapshot.fetchedAt, exportedAt]),
  ]);
}

export function historyCsv(history: HistoryData, now = Date.now()): string {
  const exportedAt = new Date(now).toISOString();
  return csv([
    ["报价日期", "持有货币", "目标货币", "1单位持有货币可兑换目标货币", "更新频率", "数据源", "获取时间(UTC)", "导出时间(UTC)"],
    ...history.points.map(p => [p.date, history.from, history.to, p.rate, history.frequency, history.source, history.fetchedAt, exportedAt]),
  ]);
}
