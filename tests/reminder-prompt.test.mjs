import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowReminderPrompt } from '../src/reminderPrompt.ts';

const configured = () => ({
  supported: true, needsInstall: false, permission: 'granted', signedIn: true,
  pendingOptIn: false, dismissed: false,
  enable: async () => { throw new Error('must not silently opt in'); },
  readState: async () => ({ enabled: true }), getSubscription: async () => ({}),
});
test('configured users see no startup popup', async () => {
  assert.equal(await shouldShowReminderPrompt(configured()), false);
});
test('unconfigured devices see a prompt on every new opening', async () => {
  const options = { ...configured(), permission: 'default' };
  assert.equal(await shouldShowReminderPrompt(options), true);
  assert.equal(await shouldShowReminderPrompt(options), true);
});
test('later suppresses repeated prompts in the same opening only', async () => {
  assert.equal(await shouldShowReminderPrompt({ ...configured(), permission: 'default', dismissed: true }), false);
  assert.equal(await shouldShowReminderPrompt({ ...configured(), permission: 'default', dismissed: false }), true);
});
test('permission alone is insufficient when the server subscription is disabled', async () => {
  assert.equal(await shouldShowReminderPrompt({ ...configured(), readState: async () => ({ enabled: false }) }), true);
});
test('existing browser subscription avoids a popup before login', async () => {
  assert.equal(await shouldShowReminderPrompt({ ...configured(), signedIn: false }), false);
});
test('explicit opt-in before login is completed silently after login', async () => {
  let enabled = false;
  assert.equal(await shouldShowReminderPrompt({ ...configured(), pendingOptIn: true, dismissed: true, enable: async () => { enabled = true; } }), false);
  assert.equal(enabled, true);
});
test('network failure does not nag an existing permitted device', async () => {
  assert.equal(await shouldShowReminderPrompt({ ...configured(), readState: async () => { throw new Error('offline'); } }), false);
});
