import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const output = path.resolve('outputs/domain-modules');
await fs.mkdir(output, { recursive: true });
for (const name of ['fx', 'oxr', 'fx-server']) {
  const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll('from "./fx"', 'from "./fx.mjs"').replaceAll('from "./oxr"', 'from "./oxr.mjs"');
  await fs.writeFile(path.join(output, `${name}.mjs`), compiled);
}
const fx = await import(pathToFileURL(path.join(output, 'fx.mjs')));
const realFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async input => {
  const url = new URL(String(input)); calls.push(url.href);
  const base = url.searchParams.get('base');
  if (url.pathname.endsWith('currencies')) return Response.json(['CNY','USD','JPY','GBP','EUR'].map(code=>({iso_code:code,name:code,symbol:code})));
  if (base === 'GBP') return new Response('Unavailable', { status: 503 });
  if (base === 'EUR') return Response.json([]);
  const old = [{date:'2026-09-09',base:'CNY',quote:'USD',rate:.1},{date:'2026-09-09',base:'CNY',quote:'JPY',rate:8}];
  const latest = [{date:'2026-09-10',base:'CNY',quote:'USD',rate:.125},{date:'2026-09-10',base:'CNY',quote:'JPY',rate:10},{date:'2026-09-10',base:'CNY',quote:'EUR',rate:0}];
  if (url.searchParams.has('date')) return Response.json(old);
  if (url.searchParams.has('from')) return Response.json([...latest,...old]);
  return Response.json(latest);
};
const checks = [];
async function check(name, fn) { await fn();checks.push(name); }
try {
  const server = await import(pathToFileURL(path.join(output, 'fx-server.mjs')));
  await check('Conversion supports zero, rejects negative/overflow, preserves precision', ()=>{
    assert.equal(fx.convertAmount(1000,6.7),6700); assert.equal(fx.convertAmount(0,6.7),0);
    assert.equal(fx.convertAmount(-1,6.7),null);assert.equal(fx.convertAmount(1,0),null);assert.equal(fx.convertAmount(Number.MAX_VALUE,2),null);
  });
  const snapshot = await server.getSnapshot('CNY');
  await check('Overview displays foreign-to-base rates and inverted percentage change',()=>{
    const usd=snapshot.quotes.find(q=>q.code==='USD');assert.equal(usd.rate,8);assert.ok(Math.abs(usd.change-(-20))<1e-10);assert.equal(usd.previousDate,'2026-09-09');
    assert.equal(snapshot.base,'CNY');assert.equal(snapshot.frequency,'daily');assert.equal(snapshot.quotes.length,2);assert.equal(usd.points.at(-1).rate,8);
  });
  await check('Server cache reuses validated snapshots without duplicate upstream requests',async()=>{const count=calls.length;await server.getSnapshot('CNY');assert.equal(calls.length,count);});
  await check('Invalid codes and unsupported currencies fail deliberately',async()=>{
    await assert.rejects(()=>server.getPair('../','USD'),e=>e.status===400);await assert.rejects(()=>server.getPair('ZZZ','USD'),e=>e.status===404);
    await assert.rejects(()=>server.getPair('EUR','USD'),e=>e.status===404);
  });
  await check('History is chronological and invalid periods are rejected',async()=>{
    const h=await server.getHistory('CNY','USD',30);assert.deepEqual(h.points.map(p=>p.date),['2026-09-09','2026-09-10']);assert.deepEqual(h.points.map(p=>p.rate),[.1,.125]);
    await assert.rejects(()=>server.getHistory('USD','CNY',2),e=>e.status===400);
  });
  await check('Upstream outage is explicit and never replaced with a fake rate',async()=>{await assert.rejects(()=>server.getPair('GBP','CNY'),e=>e.status===502);});
  await check('Identity conversion requires a supported currency',async()=>{assert.equal((await server.getPair('CNY','CNY')).rate,1);await assert.rejects(()=>server.getPair('ZZZ','ZZZ'),e=>e.status===404);});
  await check('Alert boundaries, pair isolation, stale data and one-time triggering',()=>{
    const now=Date.parse('2026-09-10T10:00:00Z');
    const alert={id:'test',from:'USD',to:'CNY',direction:'above',target:7,createdAt:'2026-09-10',triggeredAt:null};
    const quote={from:'USD',to:'CNY',rate:7,date:'2026-09-10',fetchedAt:'2026-09-10'};
    assert.equal(fx.alertMatches(alert,quote,now),true);assert.equal(fx.alertMatches(alert,{...quote,rate:6.9},now),false);
    assert.equal(fx.alertMatches({...alert,direction:'below'},quote,now),true);assert.equal(fx.alertMatches({...alert,direction:'below'},{...quote,rate:7.1},now),false);
    assert.equal(fx.alertMatches(alert,{...quote,date:'2026-09-01'},now),false);assert.equal(fx.alertMatches(alert,{...quote,from:'EUR'},now),false);
    assert.equal(fx.alertMatches(alert,{...quote,date:'invalid'},now),false);assert.equal(fx.alertMatches(alert,{...quote,date:'2027-01-01'},now),false);
    assert.equal(fx.alertMatches({...alert,triggeredAt:'2026-09-10T09:00:00Z'},quote,now),false);
  });
  const result={checkedAt:new Date().toISOString(),passed:checks.length,checks};
  await fs.writeFile('outputs/domain-verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {globalThis.fetch=realFetch;}
