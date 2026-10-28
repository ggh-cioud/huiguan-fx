import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const output = path.resolve('outputs/query-modules');
await fs.mkdir(output, { recursive: true });
for (const name of ['fx', 'i18n', 'conversion', 'query-state', 'oxr', 'fx-server']) {
  const code = ts.transpileModule(await fs.readFile(`lib/${name}.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"');
  await fs.writeFile(path.join(output, `${name}.mjs`), code);
}
const { estimateConversion, decimalInput } = await import(pathToFileURL(path.join(output, 'conversion.mjs')));
const { DEFAULT_QUERY, restoreQuery, readSharedQuery, shareQueryUrl } = await import(pathToFileURL(path.join(output, 'query-state.mjs')));
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
const basic = { amount: '1000', mode: 'send', feePercent: '0', fixedFee: '0', spreadPercent: '0' };
await check('Zero-cost conversion retains reference-rate precision', () => {
  assert.deepEqual(estimateConversion(basic, 7), { paid: 1000, received: 7000, fee: 0, effectiveRate: 7 });
  assert.equal(estimateConversion({ ...basic, amount: '0' }, 7).received, 0);
});
await check('Fees use source currency and spread reduces the rate', () => {
  const result = estimateConversion({ ...basic, feePercent: '2', fixedFee: '10', spreadPercent: '1' }, 7);
  assert.equal(result.fee, 30); assert.ok(Math.abs(result.received - 6722.1) < 1e-9);
  assert.ok(Math.abs(result.effectiveRate - 6.93) < 1e-12);
});
await check('Target amount inversion recovers the payment without rounding the calculation', () => {
  const costs = { ...basic, feePercent: '2', fixedFee: '10', spreadPercent: '1' };
  const result = estimateConversion({ ...costs, amount: '6722.1', mode: 'receive' }, 7);
  assert.ok(Math.abs(result.paid - 1000) < 1e-9);
  assert.ok(Math.abs(estimateConversion({ ...costs, amount: String(result.paid) }, 7).received - 6722.1) < 1e-9);
  assert.equal(estimateConversion({ ...costs, amount: '0', mode: 'receive' }, 7).received, 0);
});
await check('Invalid costs, insufficient payment and overflow never produce a misleading result', () => {
  for (const value of ['', '-1', 'NaN', 'Infinity', '0x10', '1e999']) assert.equal(decimalInput(value), null);
  for (const changed of [{ feePercent: '100' }, { spreadPercent: '100' }, { fixedFee: '1001' }, { amount: '-1' }, { amount: '1e308' }]) assert.equal(estimateConversion({ ...basic, ...changed }, 7), null);
  assert.equal(estimateConversion(basic, 0), null);
});
await check('Saved query restoration validates each field and preserves a distinct chart pair', () => {
  assert.deepEqual(restoreQuery(null), DEFAULT_QUERY);
  const query = restoreQuery({ base: 'USD', selected: 'USD', from: '<script>', days: 10, amount: '-1', spreadPercent: '100', mode: 'wrong' });
  assert.equal(query.selected, 'EUR'); assert.equal(query.from, 'USD'); assert.equal(query.days, 30); assert.equal(query.amount, '1000'); assert.equal(query.spreadPercent, '0'); assert.equal(query.mode, 'send');
});
await check('Shared queries round-trip all settings without leaking unrelated URL or local data', () => {
  const query = { ...DEFAULT_QUERY, from: 'EUR', days: 90, amount: '6722.1', mode: 'receive', feePercent: '2', fixedFee: '10', spreadPercent: '1' };
  const url = new URL(shareQueryUrl('https://example.test/?private=discard#rates', query, 'en'));
  assert.equal(url.search, ''); assert.deepEqual(readSharedQuery(url.hash), { query, locale: 'en' });
  assert.equal(readSharedQuery('#history'), null); assert.equal(readSharedQuery('#q=2'), null);
  assert.equal(shareQueryUrl(url.href, { ...query, amount: '' }, 'en'), null);
  assert.equal(readSharedQuery('#q=1&amount=Infinity&from=%3Cscript%3E').query.amount, '1000');
  assert.equal(readSharedQuery(`#q=1&amount=${'9'.repeat(2000)}`), null);
});

const realFetch = globalThis.fetch, oldId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
const calls = [];
const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
const oxr = { timestamp: Math.floor(now / 1000), base: 'USD', rates: { USD: 1, CNY: 7, EUR: .9 } };
globalThis.fetch = async input => {
  const url = String(input); calls.push(url);
  if (url.includes('latest.json')) return Response.json(oxr);
  if (url.includes('/historical/')) return Response.json({ ...oxr, timestamp: Math.floor((now - 86400000) / 1000) });
  if (url.endsWith('/currencies')) return Response.json([{ iso_code: 'USD', name: 'US Dollar' }, { iso_code: 'CNY', name: 'Chinese Yuan' }]);
  if (url.includes('&from=') || url.includes('&date=')) return Response.json([]);
  return Response.json([{ base: 'CNY', quote: 'USD', date: day, rate: 1 / 7 }]);
};
try {
  process.env.OPEN_EXCHANGE_RATES_APP_ID = '0'.repeat(32); // Non-secret fixture credential.
  const { getSnapshot } = await import(pathToFileURL(path.join(output, 'fx-server.mjs')));
  await check('Hourly quick quotes do not request or wait for historical providers', async () => {
    const snapshot = await getSnapshot('CNY', false);
    assert.equal(snapshot.quotes.find(q => q.code === 'USD').rate, 7);
    assert.equal(snapshot.quotes[0].change, null); assert.deepEqual(snapshot.quotes[0].points, []);
    assert.equal(calls.length, 1); assert.ok(calls[0].endsWith('latest.json'));
    await getSnapshot('CNY');
    assert.equal(calls.filter(url => url.endsWith('latest.json')).length, 1);
    assert.ok(calls.some(url => url.includes('/historical/')));
  });
  await check('Daily quick quotes keep their source and defer historical requests too', async () => {
    process.env.OPEN_EXCHANGE_RATES_APP_ID = ''; calls.length = 0;
    const snapshot = await getSnapshot('CNY', false);
    assert.equal(snapshot.frequency, 'daily'); assert.equal(snapshot.quotes[0].rate, 7);
    assert.ok(calls.every(url => !url.includes('&from=') && !url.includes('&date=')));
  });
} finally {
  globalThis.fetch = realFetch;
  if (oldId === undefined) delete process.env.OPEN_EXCHANGE_RATES_APP_ID; else process.env.OPEN_EXCHANGE_RATES_APP_ID = oldId;
}
const report = { checkedAt: new Date().toISOString(), fixtureOnly: true, passed: checks.length, checks };
await fs.writeFile('outputs/query-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
