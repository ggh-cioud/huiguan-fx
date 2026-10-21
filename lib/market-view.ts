import { COMMON, isOlderQuote, type Quote } from "./fx";

export type RateScope = "common" | "all" | "favorites";
export type RateSort = "default" | "rate-desc" | "rate-asc" | "change";

export function filterQuotes(quotes: Quote[], scope: string, favorites: string[], query: string, sort: string): Quote[] {
  const needle = query.trim().toLowerCase();
  const rows = quotes.filter(q => (scope === "all" || scope === "common" && COMMON.includes(q.code) || scope === "favorites" && favorites.includes(q.code)) && `${q.code} ${q.name} ${q.englishName}`.toLowerCase().includes(needle));
  if (sort === "rate-desc") rows.sort((a,b) => b.rate - a.rate);
  if (sort === "rate-asc") rows.sort((a,b) => a.rate - b.rate);
  if (sort === "change") rows.sort((a,b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  return rows;
}

export function staleQuoteCount(quotes: Quote[], now: number): number {
  return quotes.filter(q => isOlderQuote(q.date, now)).length;
}
