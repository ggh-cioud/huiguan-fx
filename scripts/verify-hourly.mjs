import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// All data in this script is an isolated fixture; no live credentials/network.
const output = path.resolve('outputs/hourly-modules');
await fs.mkdir(output, { recursive: true });
for (const name of ['fx', 'oxr', 'fx-server']) {
  const code = ts.transpileModule(await fs.readFile(`lib/${name}.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll('from "./fx"', 'from "./fx.mjs"').replaceAll('from "./oxr"', 'from "./oxr.mjs"');
  await fs.writeFile(path.join(output, `${name}.mjs`), code);
}
const fx = await import(pathToFileURL(path.join(output, 'fx.mjs')));
const { createHourlySource } = await import(pathToFileURL(path.join(output, 'oxr.mjs')));
const fakeId = '0123456789abcdef0123456789abcdef';
let time = Date.parse('2026-09-10T10:12:00Z');
const names = [];
async function check(name, fn) { await fn(); names.push(name); }
const raw = (timestamp = Math.floor(time / fx.HOUR_MS) * 3600) => ({ base: 'USD', timestamp, rates: { USD: 1, CNY: 7, EUR: .875, JPY: 140, XAU: .0003 } });
function fixture(overrides = {}) { return createHourlySource({ appId: () => fakeId, now: () => time, storage: () => undefined, fetcher: async () => Response.json(raw()), ...overrides }); }

await check('Missing and malformed credentials fail before network access', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(raw()); };
  await assert.rejects(() => fixture({ appId: () => '', fetcher }).latest(), error => error.status === 503);
  await assert.rejects(() => fixture({ appId: () => 'bad', fetcher }).latest(), error => error.status === 503);
  assert.equal(calls, 0);
});
await check('Concurrent consumers and refreshes share one hourly USD request', async () => {
  let calls = 0;
  const source = fixture({ fetcher: async (url, options) => {
    calls++;
    assert.equal(String(url), 'https://openexchangerates.org/api/latest.json');
    assert.equal(options.headers.Authorization, `Token ${fakeId}`);
    assert.ok(!String(url).includes(fakeId));
    return Response.json(raw());
  } });
  const values = await Promise.all(Array.from({ length: 24 }, () => source.latest()));
  assert.equal(calls, 1);
  assert.equal(values[0].timestamp, Date.parse('2026-09-10T10:00:00Z') / 1000);
  assert.equal(values[0].nextUpdateAt, '2026-09-10T11:12:00.000Z');
  assert.ok(!JSON.stringify(values).includes(fakeId));
  time += fx.HOUR_MS - 1;
  assert.equal((await source.latest()).fetchedAt, values[0].fetchedAt);
  assert.equal(calls, 1);
  time++;
  assert.equal((await source.latest()).fetchedAt, new Date(time).toISOString());
  assert.equal(calls, 2);
});
await check('Persistent cache is reused after restart and isolated by credential', async () => {
  const disk = new Map(); let calls = 0;
  const storage = () => ({ open: async () => ({ match: async request => disk.get(request.url)?.clone(), put: async (request, response) => disk.set(request.url, response.clone()) }) });
  const fetcher = async () => { calls++; return Response.json(raw()); };
  const first = await fixture({ storage, fetcher }).latest();
  const second = await fixture({ storage, fetcher }).latest();
  assert.deepEqual(second, first); assert.equal(calls, 1);
  await fixture({ storage, fetcher, appId: () => '11111111111111111111111111111111' }).latest();
  assert.equal(calls, 2);
  assert.ok([...disk.keys()].every(key => !key.includes(fakeId)));
});
await check('Previous UTC day uses one whole-table historical request', async () => {
  let calls = 0;
  const source = fixture({ fetcher: async url => {
    calls++; assert.equal(String(url), 'https://openexchangerates.org/api/historical/2026-09-09.json');
    return Response.json(raw(Date.parse('2026-09-09T23:59:59Z') / 1000));
  } });
  await source.previousDay(Date.parse('2026-09-10T01:00:00Z') / 1000);
  await source.previousDay(Date.parse('2026-09-10T23:00:00Z') / 1000);
  assert.equal(calls, 1);
  await assert.rejects(() => fixture().previousDay(Date.parse('2026-09-10T01:00:00Z') / 1000), /历史对比报价日期不符/);
});
await check('Authentication, quota and network failures are explicit and throttled', async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    const source = fixture({ fetcher: async () => { calls++; return new Response('fixture error', { status }); } });
    const failures = await Promise.allSettled(Array.from({ length: 8 }, () => source.latest()));
    assert.ok(failures.every(result => result.status === 'rejected'));
    await assert.rejects(() => source.latest()); assert.equal(calls, 1);
    time += 300001;
    await assert.rejects(() => source.latest()); assert.equal(calls, 2);
  }
  await assert.rejects(() => fixture({ fetcher: async () => { throw new Error(fakeId); } }).latest(), error => !error.message.includes(fakeId));
});
await check('Corrupt rates, wrong base and future timestamps never enter the cache', async () => {
  for (const data of [null, { ...raw(), base: 'EUR' }, { ...raw(), timestamp: time / 1000 + 3600 }, { ...raw(), rates: { USD: 1, CNY: 0 } }, { ...raw(), rates: { USD: 1, CNY: null } }]) {
    await assert.rejects(() => fixture({ fetcher: async () => Response.json(data) }).latest(), /无效/);
  }
});
await check('Hourly alert freshness uses two hours and rejects future/invalid times', () => {
  const now = Date.parse('2026-09-10T10:00:00Z');
  const alert = { from: 'USD', to: 'CNY', direction: 'above', target: 7, triggeredAt: null };
  const quote = { from: 'USD', to: 'CNY', rate: 7, date: '2026-09-10T08:00:00.000Z', frequency: 'hourly' };
  assert.equal(fx.alertMatches(alert, quote, now), true);
  assert.equal(fx.alertMatches(alert, quote, now + 1), false);
  assert.equal(fx.alertMatches(alert, { ...quote, date: '2026-09-10T10:06:00.000Z' }, now), false);
  assert.equal(fx.alertMatches(alert, { ...quote, date: 'invalid' }, now), false);
  assert.equal(fx.alertMatches({ ...alert, triggeredAt: '2026-09-10' }, quote, now), false);
  assert.equal(fx.formatQuoteTime('2026-09-10T10:00:00.000Z'), '2026-09-10 18:00');
  assert.equal(fx.formatQuoteTime('2026-09-10'), '2026-09-10');
});

const realFetch = globalThis.fetch;
const savedId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
process.env.OPEN_EXCHANGE_RATES_APP_ID = fakeId;
const latestTime = Math.floor(Date.now() / fx.HOUR_MS) * 3600;
const previousDay = new Date(latestTime * 1000 - 86400000).toISOString().slice(0, 10);
const apiCalls = [];
globalThis.fetch = async input => {
  const url = new URL(String(input)); apiCalls.push(url.href);
  if (url.hostname === 'openexchangerates.org') {
    if (url.pathname.includes('historical')) return Response.json({ ...raw(Date.parse(`${previousDay}T23:59:59Z`) / 1000), rates: { USD: 1, CNY: 8, EUR: 1, JPY: 160 } });
    return Response.json(raw(latestTime));
  }
  if (url.pathname.endsWith('currencies')) return Response.json(['USD','CNY','EUR','JPY'].map(code => ({ iso_code: code, name: code, symbol: code })));
  const base = url.searchParams.get('base');
  const quote = url.searchParams.get('quotes').split(',')[0];
  return Response.json([{ base, quote, date: previousDay, rate: 10 }]);
};
try {
  const server = await import(pathToFileURL(path.join(output, 'fx-server.mjs')));
  let snapshot;
  await check('Lists, base switching, converter and alerts share the same snapshot', async () => {
    const [cny, usd, pair, inverse, identity] = await Promise.all([
      server.getSnapshot('CNY'), server.getSnapshot('USD'), server.getPair('EUR','CNY'), server.getPair('CNY','EUR'), server.getPair('CNY','CNY'),
    ]);
    snapshot = cny;
    assert.equal(cny.frequency, 'hourly'); assert.equal(cny.setupRequired, false);
    assert.equal(cny.quotes.find(q => q.code === 'USD').rate, 7);
    assert.equal(cny.quotes.find(q => q.code === 'EUR').rate, 8);
    assert.equal(usd.quotes.find(q => q.code === 'CNY').rate, 1 / 7);
    assert.equal(pair.rate, 8); assert.equal(pair.rate * inverse.rate, 1); assert.equal(identity.rate, 1);
    assert.equal(pair.date, new Date(latestTime * 1000).toISOString());
    assert.equal(pair.fetchedAt, cny.fetchedAt); assert.equal(pair.nextUpdateAt, usd.nextUpdateAt);
    assert.equal(apiCalls.filter(url => url.includes('latest.json')).length, 1);
    assert.equal(apiCalls.filter(url => url.includes('historical/')).length, 1);
    assert.ok(!JSON.stringify([cny,usd,pair]).includes(fakeId));
  });
  await check('Change compares OXR prior UTC close; daily charts do not mix sources', async () => {
    const usd = snapshot.quotes.find(q => q.code === 'USD');
    assert.equal(usd.change, -12.5);
    assert.equal(usd.previousDate, `${previousDay}T23:59:59.000Z`);
    assert.deepEqual(usd.points, [{ date: previousDay, rate: .1 }]);
    const history = await server.getHistory('USD','CNY',30);
    assert.equal(history.frequency, 'daily'); assert.match(history.source, /Frankfurter/);
    assert.equal(history.points[0].rate, 10);
  });
  await check('Unsupported codes and non-currency assets remain rejected', async () => {
    for (const code of ['ZZZ','XAU']) await assert.rejects(() => server.getPair(code,'USD'), error => error.status === 404);
    await assert.rejects(() => server.getPair('../','USD'), error => error.status === 400);
    await assert.rejects(() => server.getHistory('USD','CNY',2), error => error.status === 400);
  });
  await check('Configured provider failure does not silently fall back to daily rates', async () => {
    process.env.OPEN_EXCHANGE_RATES_APP_ID = '22222222222222222222222222222222';
    globalThis.fetch = async () => new Response('unavailable', { status: 401 });
    await assert.rejects(() => server.getPair('USD','CNY'), error => error.status === 503);
    const response = server.apiError(new Error(fakeId));
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes(fakeId));
  });
} finally {
  globalThis.fetch = realFetch;
  if (savedId === undefined) delete process.env.OPEN_EXCHANGE_RATES_APP_ID; else process.env.OPEN_EXCHANGE_RATES_APP_ID = savedId;
}
const report = { checkedAt: new Date().toISOString(), fixtureOnly: true, passed: names.length, checks: names };
await fs.writeFile('outputs/hourly-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
