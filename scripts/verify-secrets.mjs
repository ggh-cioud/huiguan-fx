import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFile } from 'node:process';

loadEnvFile('.env.local');
const secret = process.env.OPEN_EXCHANGE_RATES_APP_ID?.trim();
assert.ok(secret && /^[a-f\d]{32}$/i.test(secret), 'A valid local App ID is required');
const checks = [];
async function filesIn(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const lists = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(folder, entry.name)) : [path.join(folder, entry.name)]));
  return lists.flat();
}
for (const folder of ['dist/client', 'dist/server']) {
  for (const file of await filesIn(folder)) {
    const data = await fs.readFile(file);
    assert.ok(!data.includes(Buffer.from(secret)), `Secret must not occur in build output: ${file}`);
  }
  checks.push(`App ID is absent from ${folder}`);
}
for (const route of ['/', '/api/rates?base=CNY', '/api/quote?from=USD&to=CNY']) {
  const response = await fetch(`http://127.0.0.1:5173${route}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(secret), `App ID must not occur in response: ${route}`);
  checks.push(`App ID is absent from response ${route}`);
}
const report = { checkedAt: new Date().toISOString(), passed: checks.length, checks };
await fs.writeFile('outputs/secret-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
