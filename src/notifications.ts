import { supabase, SUPABASE_URL } from './supabase';

export type ReminderState = { enabled: boolean; hours: number[] };
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/walking-reminders`;
const PENDING_KEY = 'jikeoro-reminder-pending';
export function needsHomeScreen() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone;
}
export function canNotify() {
  return window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}
export function permissionLabel() {
  if (needsHomeScreen()) return '설치 안내';
  if (!canNotify()) return '사용 안내';
  return Notification.permission === 'granted' ? '설정하기' : Notification.permission === 'denied' ? '설정 안내' : '허용하기';
}
async function registration() {
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('앱을 새로 열고 다시 시도해주세요.')), 12000)),
  ]);
}
export async function currentSubscription() {
  if (!canNotify()) return null;
  return await (await registration()).pushManager.getSubscription();
}
async function call(action: string, data: object = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인 후 알림을 설정해주세요.');
  const response = await fetch(FUNCTION_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '연결을 확인하고 다시 시도해주세요.');
  return result;
}
export async function readReminders(): Promise<ReminderState> {
  const subscription = await currentSubscription();
  if (!subscription) return { enabled: false, hours: [19] };
  return await call('status', { endpoint: subscription.endpoint });
}
export async function allowNotifications() {
  if (needsHomeScreen()) throw new Error('아이폰에서는 먼저 지켜로를 홈 화면에 추가해주세요.');
  if (!canNotify()) throw new Error('이 브라우저에서는 알림을 지원하지 않아요. 최신 Chrome 또는 Safari에서 열어주세요.');
  // Must run immediately from a user tap, before any network request.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? '휴대폰 또는 브라우저 설정에서 지켜로 알림을 허용해주세요.' : '알림을 허용하면 보행 알림을 받을 수 있어요.');
}
export function savePendingHours(hours: number[]) { localStorage.setItem(PENDING_KEY, JSON.stringify(hours)); }
export function pendingHours(): number[] | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
    return Array.isArray(value) && value.length >= 1 && value.length <= 2 && new Set(value).size === value.length && value.every(h => Number.isInteger(h) && h >= 8 && h <= 21) ? value : null;
  } catch { return null; }
}
export async function enableReminders(hours: number[]) {
  const response = await fetch(FUNCTION_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('알림 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  const { publicKey } = await response.json();
  const decoded = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
  const key = Uint8Array.from(decoded, c => c.charCodeAt(0));
  const worker = await registration();
  const existing = await worker.pushManager.getSubscription();
  const subscription = existing ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  try {
    const result = await call('subscribe', { ...subscription.toJSON(), hours });
    localStorage.removeItem(PENDING_KEY);
    return result as ReminderState;
  } catch (e) {
    if (!existing) await subscription.unsubscribe().catch(() => undefined);
    throw e;
  }
}
export async function disableReminders() {
  localStorage.removeItem(PENDING_KEY);
  const subscription = await currentSubscription();
  if (subscription) {
    await call('disable', { endpoint: subscription.endpoint });
    // Keep the browser subscription so disabled preferences remain discoverable.
  }
}
export async function testReminder() {
  const subscription = await currentSubscription();
  if (!subscription) throw new Error('먼저 알림 받기를 켜주세요.');
  await call('test', { endpoint: subscription.endpoint });
}

export async function stopRemindersOnLogout() {
  localStorage.removeItem(PENDING_KEY);
  const subscription = await currentSubscription();
  if (!subscription) return;
  try { await call('disable', { endpoint: subscription.endpoint }); }
  finally { await subscription.unsubscribe(); }
}
