// Starts the web and admin services locally and checks the three remaining features:
// menu, today's offer and table reservations.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const KEY = process.env.CI_ADMIN_KEY || 'smoke-admin-key';
const WEB = 'http://127.0.0.1:4186';
const ADMIN = 'http://127.0.0.1:4185';
const children = [];

const start = (cwd, port, extra = {}) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', RAILWAY_ENVIRONMENT_NAME: '',
      ARABISK_ADMIN_API_KEY: KEY, ARABISK_ADMIN_USERNAME: 'ci', ARABISK_ADMIN_PASSWORD: 'ci', ...extra },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  child.getLog = () => log;
  children.push(child);
  return child;
};

const waitFor = async (child, url) => {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`process exited early:\n${child.getLog()}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`not ready: ${url}\n${child.getLog()}`);
};

const json = (url, options = {}) => fetch(url, options).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const adminHeaders = { 'X-Arabisk-Admin-Key': KEY, 'Content-Type': 'application/json' };

try {
  const web = start('apps/web', 4186);
  await waitFor(web, `${WEB}/health`);
  const admin = start('apps/admin', 4185, { ARABISK_WEB_API_URL: WEB });
  await waitFor(admin, `${ADMIN}/health`);

  // pages
  for (const [path, marker] of [['/', 'today-offer'], ['/menu', 'category-view'], ['/menu/C001', 'grid'],
    ['/offers', 'offers-card'], ['/reservation', 'reservation-form'], ['/privacy', 'privacy']]) {
    const response = await fetch(WEB + path);
    assert.equal(response.status, 200, `${path} status`);
    assert.match(await response.text(), new RegExp(marker), `${path} content`);
  }
  for (const path of ['/cart', '/profile', '/events', '/memories']) {
    const text = await (await fetch(WEB + path)).text();
    assert.doesNotMatch(text, /app-cart|memories-strip/, `${path} must not serve a removed feature page`);
  }

  // menu
  const categories = await json(`${WEB}/api/categories`);
  assert.equal(categories.status, 200);
  assert.ok(categories.body.length > 0, 'categories exist');
  const products = await json(`${WEB}/api/products`);
  assert.equal(products.status, 200);
  assert.equal(products.body.length, 0, 'no products');

  // Removed public APIs are gone; customer data remains available only to authenticated admins.
  assert.equal((await fetch(`${WEB}/api/customers`)).status, 401, '/api/customers requires admin authentication');
  for (const path of ['/api/orders', '/api/experiences', '/api/revenue/summary', '/api/shams/status', '/api/promotions/install']) {
    assert.equal((await fetch(WEB + path)).status, 404, `${path} should be removed`);
  }

  // today's offer
  assert.equal((await json(`${WEB}/api/promotions/today`)).status, 200);
  assert.equal((await json(`${WEB}/api/admin/promotions/today`)).status, 401);
  const saved = await json(`${WEB}/api/admin/promotions/today`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ enabled: true, title: 'اختبار' }) });
  assert.equal(saved.status, 200);
  assert.equal((await json(`${WEB}/api/promotions/today`)).body.title, 'اختبار');

  // reservations
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const payload = { name: 'اختبار', phone: '0500000000', date, time: '20:00', guests: 2, idempotencyKey: 'smoke-1' };
  const created = await json(`${WEB}/api/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const again = await json(`${WEB}/api/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(again.body.id, created.body.id, 'idempotent');
  assert.equal((await json(`${WEB}/api/reservations`)).status, 401);
  const list = await json(`${WEB}/api/reservations`, { headers: adminHeaders });
  assert.equal(list.body.length, 1);
  const confirmed = await json(`${WEB}/api/reservations/${created.body.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'confirmed' }) });
  assert.equal(confirmed.body.status, 'confirmed');
  assert.equal((await json(`${WEB}/api/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);

  // admin
  assert.equal((await fetch(`${ADMIN}/login`)).status, 200);
  assert.equal((await fetch(`${ADMIN}/proxy/api/reservations`)).status, 401);

  console.log('Smoke test passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill();
}
