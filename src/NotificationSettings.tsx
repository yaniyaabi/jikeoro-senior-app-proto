import { useEffect, useRef, useState } from 'react';
import { allowNotifications, canNotify, currentSubscription, enableReminders, needsHomeScreen, pendingHours, readReminders, savePendingHours, REMINDER_HOURS } from './notifications';
import { shouldShowReminderPrompt } from './reminderPrompt';

export default function NotificationSettings({ open, ready, userId, onClose }: { open: boolean; ready: boolean; userId?: string; onClose: () => void }) {
  const [automaticOpen, setAutomaticOpen] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dismissed = useRef<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const visible = open || automaticOpen;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const hide = () => {
    dismissed.current = cycle;
    setAutomaticOpen(false);
    setError('');
    closeRef.current();
  };
  const hideRef = useRef(hide);
  hideRef.current = hide;

  // Long foreground returns count as a new opening; native permission dialogs do not.
  useEffect(() => {
    let hiddenAt = 0;
    const visibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= 60000) {
        hiddenAt = 0;
        setCycle(value => value + 1);
      }
    };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) setCycle(value => value + 1); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', pageshow);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pageshow', pageshow); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const check = async () => {
      const show = await shouldShowReminderPrompt({
        supported: canNotify(), needsInstall: needsHomeScreen(),
        permission: canNotify() ? Notification.permission : 'default',
        signedIn: Boolean(userId), pendingOptIn: Boolean(pendingHours()),
        dismissed: dismissed.current === cycle,
        enable: enableReminders, readState: readReminders, getSubscription: currentSubscription,
      });
      if (active) setAutomaticOpen(show);
    };
    void check();
    return () => { active = false; };
  }, [ready, userId, cycle]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primary.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) hideRef.current();
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keys); previous?.focus(); };
  }, [visible, busy]);

  if (!visible) return null;
  const installed = !needsHomeScreen();
  const supported = canNotify();
  const denied = supported && Notification.permission === 'denied';
  const helpOnly = !installed || !supported || denied;
  async function allow() {
    if (helpOnly) { hide(); return; }
    setBusy(true); setError('');
    try {
      await allowNotifications();
      if (userId) await enableReminders();
      else savePendingHours(REMINDER_HOURS);
      hide();
    } catch (e) {
      setError(e instanceof Error ? e.message : '알림을 허용하지 못했어요. 다시 시도해주세요.');
    } finally { setBusy(false); }
  }
  return <div className="notification-backdrop">
    <section className="notification-sheet notification-simple" role="dialog" aria-modal="true" aria-labelledby="notification-title" ref={panel}>
      <h2 id="notification-title">지켜로 알림을 받을까요?</h2>
      <p>오전 11시에는 함께 걷기를,<br />오후 7시에는 오늘 걸은 길을 돌아봐요.</p>
      {!installed ? <p className="notification-help">아이폰은 공유 버튼 → ‘홈 화면에 추가’ 후, 홈 화면의 지켜로에서 알림을 허용해주세요.</p>
        : !supported ? <p className="notification-help">이 브라우저는 알림을 지원하지 않아요. 휴대폰의 최신 Chrome 또는 Safari에서 열어주세요.</p>
        : denied ? <p className="notification-help">알림이 차단되어 있어요. 휴대폰 또는 브라우저의 지켜로 알림 설정에서 허용해주세요.</p> : null}
      {error && <p className="notification-message error" role="alert">{error}</p>}
      <button type="button" className="notification-primary" ref={primary} disabled={busy} onClick={() => void allow()}>{busy ? '확인하고 있어요…' : helpOnly ? '확인' : '알림 허용하기'}</button>
      {!helpOnly && <button type="button" className="notification-later" disabled={busy} onClick={hide}>나중에</button>}
      <p className="notification-caption">알림은 휴대폰 설정에서 언제든 끌 수 있어요.</p>
    </section>
  </div>;
}
