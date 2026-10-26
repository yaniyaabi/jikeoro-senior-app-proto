import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/notifications.ts', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function client(session) {
  let unsubscribed = false, networkCalls = 0;
  const subscription = { endpoint: 'https://fcm.googleapis.com/test', unsubscribe: async () => { unsubscribed = true; } };
  const context = vm.createContext({
    SUPABASE_URL: 'https://example.test',
    supabase: { auth: { getSession: async () => ({ data: { session } }) } },
    window: { isSecureContext: true, Notification: {}, PushManager: {}, setTimeout: () => 0 },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }) } },
    localStorage: { removeItem() {} },
    fetch: async () => { networkCalls++; throw new Error('offline'); },
    AbortSignal,
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return { run: expression => vm.runInContext(expression, context), unsubscribed: () => unsubscribed, networkCalls: () => networkCalls };
}

test('signed-out clients cannot start push registration', async () => {
  const app = client(null);
  await assert.rejects(app.run('enableReminders()'), /로그인/);
  assert.equal(app.networkCalls(), 0);
});

test('logout removes device subscription even when server disable fails', async () => {
  for (const session of [null, { access_token: 'test' }]) {
    const app = client(session);
    await app.run('stopRemindersOnLogout()').catch(() => undefined);
    assert.equal(app.unsubscribed(), true);
  }
});
