import { useEffect, useRef, useState } from 'react';
import { allowNotifications, canNotify, disableReminders, enableReminders, needsHomeScreen, pendingHours, readReminders, savePendingHours, testReminder } from './notifications';

export default function NotificationSettings({ open, userId, onClose }: { open: boolean; userId?: string; onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState<number[]>([19]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!userId || !canNotify()) return;
    let active = true;
    const init = async () => {
      try {
        const pending = pendingHours();
        const state = pending && Notification.permission === 'granted' ? await enableReminders(pending) : await readReminders();
        if (active) { setEnabled(state.enabled); setHours(state.hours); }
      } catch { if (active && open) { setFailure(true); setMessage('알림 설정을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.'); } }
    };
    void init();
    return () => { active = false; };
  }, [userId, open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keys); previous?.focus(); };
  }, [open, busy, onClose]);
  if (!open) return null;
  const installed = !needsHomeScreen();
  const supported = canNotify();
  const denied = supported && Notification.permission === 'denied';
  async function save() {
    setBusy(true); setMessage(''); setFailure(false);
    try {
      if (new Set(hours).size !== hours.length) throw new Error('두 알림 시간을 서로 다르게 골라주세요.');
      await allowNotifications();
      if (!userId) {
        savePendingHours(hours);
        setMessage('알림을 허용했어요. 로그인하면 선택한 시간으로 알림 받기를 완료할게요.');
      } else {
        const state = await enableReminders(hours);
        setEnabled(state.enabled);
        setMessage('알림 설정을 저장했어요. 아래에서 테스트 알림도 받아보세요.');
      }
    } catch (e) { setFailure(true); setMessage(e instanceof Error ? e.message : '알림을 설정하지 못했어요. 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setFailure(false); setMessage('');
    try { await disableReminders(); setEnabled(false); setMessage('이 기기의 보행 알림을 껐어요.'); }
    catch { setFailure(true); setMessage('알림을 끄지 못했어요. 연결을 확인하고 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setFailure(false); setMessage('');
    try { await testReminder(); setMessage('테스트 알림을 보냈어요. 휴대폰 알림 목록을 확인해주세요.'); }
    catch (e) { setFailure(true); setMessage(e instanceof Error ? e.message : '테스트 알림을 보내지 못했어요.'); }
    finally { setBusy(false); }
  }
  return <div className="notification-backdrop">
    <section className="notification-sheet" role="dialog" aria-modal="true" aria-labelledby="notification-title" ref={panel}>
      <button type="button" className="notification-close" aria-label="알림 설정 닫기" onClick={onClose} ref={close} disabled={busy}>×</button>
      <p className="notification-eyebrow">지켜로와 함께해요</p>
      <h2 id="notification-title">알림 설정</h2>
      <p>오늘 걸으신 길을 돌아볼 수 있도록<br />하루 한두 번 알려드릴게요.</p>
      <div className="notification-example"><strong>지켜로와 함께해요!</strong><span>오늘 걸으신 길은 어땠나요?<br />위험한 곳이 있었다면 알려주세요.</span></div>
      {!installed ? <div className="notification-help"><strong>아이폰에서는 홈 화면에 추가해주세요.</strong><p>브라우저의 공유 버튼 → ‘홈 화면에 추가’를 누른 뒤, 홈 화면의 지켜로를 열고 알림을 허용해주세요.</p></div>
        : !supported ? <div className="notification-help"><strong>이 브라우저는 알림을 지원하지 않아요.</strong><p>휴대폰의 최신 Chrome 또는 Safari에서 지켜로를 열어주세요.</p></div>
        : denied ? <div className="notification-help"><strong>휴대폰에서 알림이 차단되어 있어요.</strong><p>아이폰은 설정 → 알림 → 지켜로에서, 안드로이드는 브라우저의 사이트 설정 → 알림에서 허용한 뒤 다시 열어주세요.</p></div> : null}
      <fieldset disabled={busy}><legend>하루에 몇 번 받을까요?</legend><div className="notification-frequency">{[1, 2].map(count => <button type="button" key={count} aria-pressed={hours.length === count} className={hours.length === count ? 'active' : ''} onClick={() => setHours(count === 1 ? [hours[hours.length - 1]] : [hours[0] === 13 ? 10 : 13, hours[0]])}>하루 {count === 1 ? '한' : '두'} 번</button>)}</div></fieldset>
      <fieldset disabled={busy}><legend>알림 시간 <small>한국 시간</small></legend><div className="notification-times">{hours.map((hour, index) => <label key={index}><span>{hours.length === 1 ? '매일' : `${index + 1}번째 알림`}</span><select aria-label={`${index + 1}번째 알림 시간`} value={hour} onChange={e => setHours(values => values.map((v, i) => i === index ? Number(e.target.value) : v))}>{Array.from({ length: 14 }, (_, i) => i + 8).map(h => <option key={h} value={h}>{h < 12 ? '오전' : '오후'} {h % 12 || 12}시</option>)}</select></label>)}</div></fieldset>
      {message && <p className={`notification-message ${failure ? 'error' : ''}`} role={failure ? 'alert' : 'status'}>{message}</p>}
      <button type="button" className="notification-primary" disabled={busy || !installed || !supported || denied} onClick={() => void save()}>{busy ? '확인하고 있어요…' : enabled ? '알림 시간 저장하기' : '알림 받기'}</button>
      {enabled && userId && <div className="notification-secondary"><button type="button" disabled={busy} onClick={() => void test()}>테스트 알림 받기</button><button type="button" disabled={busy} onClick={() => void turnOff()}>알림 끄기</button></div>}
      <p className="notification-caption">선택 사항이며 언제든 끌 수 있어요.<br />휴대폰 설정이나 네트워크에 따라 알림이 늦게 도착할 수 있어요.</p>
    </section>
  </div>;
}
