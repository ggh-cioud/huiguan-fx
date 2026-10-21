import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const output = path.resolve('outputs/market-tools-modules');
await fs.mkdir(output, { recursive: true });
for (const name of ['fx', 'fx-export', 'market-view']) {
  const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll('from "./fx"', 'from "./fx.mjs"');
  await fs.writeFile(path.join(output, `${name}.mjs`), code);
}
const { ratesCsv, historyCsv } = await import(pathToFileURL(path.join(output, 'fx-export.mjs')));
const { filterQuotes, staleQuoteCount } = await import(pathToFileURL(path.join(output, 'market-view.mjs')));
const now = Date.parse('2026-10-21T10:00:00Z');
const quote = (code, name, rate, change) => ({ code, name, englishName: code === 'USD' ? 'US Dollar' : code, symbol: code, rate, change, date: '2026-10-21T09:00:00.000Z', previousDate: null, points: [] });
const usd = quote('USD', '美元', 7.123456789, -1.23456789);
const eur = quote('EUR', '欧元', 8, 1);
const pln = quote('PLN', '波兰兹罗提', 1.8, null);
const quotes = [usd, eur, pln];
const snapshot = { base: 'CNY', quotes, currencies: [], fetchedAt: '2026-10-21T09:12:00.000Z', source: 'Open Exchange Rates', frequency: 'hourly', historyAvailable: false };
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }

// Parse fields instead of comparing the serializer's implementation to itself.
function parse(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i+1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\r' && input[i+1] === '\n' && !quoted) { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  assert.equal(quoted, false);
  return rows;
}

await check('Exports preserve quote direction, full precision and missing comparisons', () => {
  const rows = parse(ratesCsv(snapshot, quotes, now));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1].slice(0,5), ['USD', '美元', 'CNY', '7.123456789', '-1.23456789']);
  assert.equal(rows[1][6], '');
  assert.equal(rows[3][4], '');
});
await check('Exports identify source, publication time, fetch time and export time separately', () => {
  const row = parse(ratesCsv(snapshot, [usd], now))[1];
  assert.equal(row[5], usd.date);
  assert.equal(row[7], 'hourly');
  assert.equal(row[8], 'Open Exchange Rates');
  assert.equal(row[10], snapshot.fetchedAt);
  assert.equal(row[11], '2026-10-21T10:00:00.000Z');
});
await check('CSV quotes commas, quotes and line breaks without corrupting columns', () => {
  const name = '货币,名称 "示例"\r\n第二行';
  const rows = parse(ratesCsv(snapshot, [{ ...usd, name }], now));
  assert.equal(rows.length, 2); assert.equal(rows[1].length, 12); assert.equal(rows[1][1], name);
  assert.ok(ratesCsv(snapshot).startsWith('\uFEFF'));
});
await check('Source text cannot become an executable spreadsheet formula', () => {
  for (const name of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\t=1', '\n=1', '\ttext']) {
    assert.equal(parse(ratesCsv(snapshot, [{ ...usd, name }], now))[1][1], `'${name}`);
  }
});
await check('Export and screen freshness advance even when the quote is unchanged', () => {
  const boundary = Date.parse(usd.date) + 2*3600000;
  assert.equal(staleQuoteCount(quotes, boundary), 0);
  assert.equal(staleQuoteCount(quotes, boundary+1), 3);
  assert.equal(parse(ratesCsv(snapshot, [usd], boundary+1))[1][9], '是');
  assert.equal(staleQuoteCount([{ ...usd, date: 'invalid' }, { ...eur, date: '2027-01-01T00:00:00Z' }], now), 2);
});
await check('Daily quote freshness remains independent of hourly thresholds', () => {
  const daily = { ...usd, date: '2026-10-18' };
  assert.equal(staleQuoteCount([daily], now), 0);
  assert.equal(staleQuoteCount([daily], Date.parse('2026-10-22T00:00:00.001Z')), 1);
});
await check('Daily history exports never acquire hourly rates or hourly source labels', () => {
  const history = { from: 'USD', to: 'CNY', days: 7, points: [{ date:'2026-10-20', rate: 7.01234567 }], source: 'Frankfurter', frequency: 'daily', fetchedAt: snapshot.fetchedAt };
  const row = parse(historyCsv(history, now))[1];
  assert.deepEqual(row.slice(0,6), ['2026-10-20','USD','CNY','7.01234567','daily','Frankfurter']);
  assert.equal(parse(historyCsv({ ...history, points: [] }, now)).length, 1);
});
await check('Search covers Chinese, English and codes while respecting favorites', () => {
  assert.deepEqual(filterQuotes(quotes,'all',[],' 美元 ','default'), [usd]);
  assert.deepEqual(filterQuotes(quotes,'all',[],'dollar','default'), [usd]);
  assert.deepEqual(filterQuotes(quotes,'all',[],'pln','default'), [pln]);
  assert.deepEqual(filterQuotes(quotes,'favorites',['EUR'],'usd','default'), []);
  assert.deepEqual(filterQuotes(quotes,'common',[],'','default'), [usd,eur]);
});
await check('Sorting preserves input order and places missing changes last', () => {
  assert.deepEqual(filterQuotes(quotes,'all',[],'','change').map(q=>q.code), ['EUR','USD','PLN']);
  assert.deepEqual(filterQuotes(quotes,'all',[],'','rate-asc').map(q=>q.code), ['PLN','USD','EUR']);
  assert.deepEqual(quotes.map(q=>q.code), ['USD','EUR','PLN']);
});
await check('CSV includes the entire filtered result, not a paginated or unfiltered table', () => {
  const many = Array.from({length:30},(_,i)=>({...usd,name:`货币${i}`}));
  const selected = filterQuotes(many,'favorites',['USD'],'','rate-desc');
  assert.equal(parse(ratesCsv(snapshot, selected, now)).length, 31);
  assert.equal(parse(ratesCsv(snapshot, filterQuotes(quotes,'favorites',['EUR'],'','default'), now))[1][0], 'EUR');
  assert.equal(parse(ratesCsv(snapshot, [], now)).length, 1);
});
const report = { checkedAt: new Date().toISOString(), fixtureOnly: true, passed: checks.length, checks };
await fs.writeFile('outputs/market-tools-verification.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
