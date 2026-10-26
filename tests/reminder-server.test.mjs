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
  vm.runInNewContext(js, {
    Deno: { env: { get: () => 'test' }, serve: callback => { handle = callback; } },
    createClient: () => admin, webpush: {}, Response, URL, Set,
  });
  return { request: async (body, token = 'valid') => handle(new Request('https://app.test/functions/v1/walking-reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  })), written: () => written };
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
test('only one or two distinct daytime hours are accepted', async () => {
  for (const hours of [[], [19,19], [1], [22], [8,13,19], ['19']]) {
    assert.equal((await server().request({ ...subscription, hours })).status, 400);
  }
});
test('subscription owner always comes from verified JWT, never request body', async () => {
  const app = server();
  assert.equal((await app.request({ ...subscription, user_id: 'resident-b', hours: [19,13] })).status, 200);
  assert.equal(app.written().data.user_id, 'resident-a');
  assert.equal(JSON.stringify(app.written().data.hours), '[13,19]');
});
