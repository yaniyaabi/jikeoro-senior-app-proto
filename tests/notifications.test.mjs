import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(windows = []) {
  const handlers = {}, shown = [], opened = [];
  const self = {
    registration: { scope: 'https://example.com/jikeoro/', showNotification: async (...args) => shown.push(args) },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) },
    addEventListener: (name, callback) => { handlers[name] = callback; },
  };
  vm.runInNewContext(source, { self, URL });
  return { handlers, shown, opened };
}
async function event(handler, fields = {}) {
  let pending;
  handler({ ...fields, waitUntil: promise => { pending = promise; } });
  await pending;
}
test('background push shows supplied Korean text with only app-owned assets', async () => {
  const w = worker();
  await event(w.handlers.push, { data: { json: () => ({ title: '함께해요', body: '오늘 걸은 길은 어땠나요?', url: 'https://attacker.test/' }) } });
  assert.equal(w.shown[0][0], '함께해요');
  assert.equal(w.shown[0][1].body, '오늘 걸은 길은 어땠나요?');
  for (const asset of [w.shown[0][1].icon, w.shown[0][1].badge]) {
    const url = new URL(asset);
    assert.equal(url.origin, 'https://example.com');
    assert.equal(url.pathname, '/jikeoro/icon-192.png');
  }
  assert.equal(w.shown[0][1].tag, 'jikeoro-walking-reminder');
});
test('invalid push payload still displays a notification', async () => {
  const w = worker();
  await event(w.handlers.push, { data: { json: () => { throw new Error('invalid'); } } });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0][0], '지켜로와 함께해요!');
});
test('tapping opens reporting intent within the app scope', async () => {
  const w = worker();
  let closed = false;
  await event(w.handlers.notificationclick, { notification: { close: () => { closed = true; }, data: {} } });
  assert.ok(closed);
  const url = new URL(w.opened[0]);
  assert.equal(url.origin, 'https://example.com');
  assert.equal(url.pathname, '/jikeoro/');
  assert.equal(url.searchParams.get('from'), 'reminder');
});
test('tapping reuses an open app without navigating away from an unsaved draft', async () => {
  const messages = [];
  let focused = false;
  const w = worker([{ url: 'https://example.com/jikeoro/?v=17', focus: async () => { focused = true; }, postMessage: data => messages.push(data) }]);
  await event(w.handlers.notificationclick, { notification: { close() {}, data: {} } });
  assert.ok(focused);
  assert.equal(messages[0].type, 'OPEN_WALKING_REPORT');
  assert.equal(w.opened.length, 0);
});
test('test notifications open the app without starting a report', async () => {
  const w = worker();
  await event(w.handlers.notificationclick, { notification: { close() {}, data: { test: true } } });
  assert.equal(new URL(w.opened[0]).searchParams.has('from'), false);
});
