import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../supabase/functions/walking-reminders/index.ts', import.meta.url), 'utf8').replace(/^import .*;$/gm, '');
function server(valid = true) {
  let handle, written;
  const admin = {
    auth: { getUser: async () => ({ data: { user: valid ? { id: 'resident-a' } : null }, error: null }) },
    from: table => ({ upsert: async data => { written = { table, data }; return { error: null }; } }),
  };
  const js = stripTypeScriptTypes(source);
  const context = vm.createContext({
    Deno: { env: { get: () => 'test' }, serve: callback => { handle = callback; } },
    createClient: () => admin, webpush: {}, Response, URL, Set,
  });
  vm.runInContext(js, context);
  return { request: async (body, token = 'valid') => handle(new Request('https://app.test/functions/v1/walking-reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  })), written: () => written, messageAt: iso => vm.runInContext(`walkingMessage(new Date('${iso}'))`, context) };
}
const subscription = { action: 'subscribe', endpoint: 'https://fcm.googleapis.com/test-subscription', hours: [19], keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
test('settings require a signed-in user', async () => {
  assert.equal((await server().request(subscription, '')).status, 401);
  assert.equal((await server(false).request(subscription)).status, 401);
});
test('arbitrary network targets and credentialed endpoints are rejected', async () => {
  for (const endpoint of ['http://127.0.0.1/', 'https://attacker.test/', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8080/x']) {
    assert.equal((await server().request({ ...subscription, endpoint })).status, 400);
  }
});
test('delivery hours are fixed even if an old client submits other hours', async () => {
  for (const hours of [[], [19,19], [1], [22], [8,13,19], ['19']]) {
    const app = server();
    assert.equal((await app.request({ ...subscription, hours })).status, 200);
    assert.equal(JSON.stringify(app.written().data.hours), '[11,19]');
  }
});
test('subscription owner always comes from verified JWT, never request body', async () => {
  const app = server();
  assert.equal((await app.request({ ...subscription, user_id: 'resident-b', hours: [19,13] })).status, 200);
  assert.equal(app.written().data.user_id, 'resident-a');
  assert.equal(JSON.stringify(app.written().data.hours), '[11,19]');
});
test('morning and evening messages follow Korea time regardless of UTC date', () => {
  const app = server();
  assert.equal(app.messageAt('2026-10-26T02:00:00Z').title, '오늘도 함께 걸어볼까요?');
  assert.equal(app.messageAt('2026-10-26T10:00:00Z').title, '오늘 보행은 어땠나요?');
});

test('one-off admin test requires the dispatch secret and at most two enabled devices', async () => {
  for (const count of [0, 1, 2, 3]) {
    let handle, sent = 0, subscriptionsRead = 0;
    const row = { endpoint: subscription.endpoint, p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
    const admin = { from: table => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: { public_key: 'public', private_key: 'private', dispatch_secret: 'secret' } }),
      limit: async () => { subscriptionsRead++; return { data: Array.from({ length: count }, () => row) }; },
    }) }) }) };
    const context = vm.createContext({
      Deno: { env: { get: () => 'test' }, serve: callback => { handle = callback; } },
      createClient: () => admin,
      webpush: { sendNotification: async (_subscription, payload) => { assert.equal(JSON.parse(payload).test, true); sent++; } },
      Response, URL, Set,
    });
    vm.runInContext(stripTypeScriptTypes(source), context);
    const request = secret => handle(new Request('https://app.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reminder-Secret': secret },
      body: JSON.stringify({ action: 'dispatch', test: true }),
    }));
    assert.equal((await request('wrong')).status, 401);
    assert.equal(subscriptionsRead, 0);
    assert.equal((await request('secret')).status, count >= 1 && count <= 2 ? 200 : 409);
    assert.equal(sent, count >= 1 && count <= 2 ? count : 0);
  }
});
