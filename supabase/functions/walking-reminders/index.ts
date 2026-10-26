import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const origin = 'https://yaniyaabi.github.io';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-reminder-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
function walkingMessage(now: Date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour === 11
    ? { title: '오늘도 함께 걸어볼까요?', body: '지켜로와 함께 안전한 하루를 시작해요. 걸으면서 발견한 위험을 알려주세요.' }
    : { title: '오늘 보행은 어땠나요?', body: '하루를 마무리하며 오늘 걸으신 길을 돌아봐요. 위험한 곳이 있었다면 지켜로에 알려주세요.' };
}
function safeEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const u = new URL(value);
    const h = u.hostname;
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (h === 'fcm.googleapis.com' || h === 'updates.push.services.mozilla.com' || h.endsWith('.push.services.mozilla.com') ||
       h === 'web.push.apple.com' || h.endsWith('.notify.windows.com'));
  } catch { return false; }
}
async function config() {
  let { data, error } = await admin.from('walking_push_config').select('*').eq('id', true).single();
  if (error || !data) throw new Error('config unavailable');
  if (!data.public_key) {
    const pair = webpush.generateVAPIDKeys();
    const { error: updateError } = await admin.from('walking_push_config').update({
      public_key: pair.publicKey, private_key: pair.privateKey,
    }).eq('id', true).is('public_key', null);
    if (updateError) throw updateError;
    ({ data, error } = await admin.from('walking_push_config').select('*').eq('id', true).single());
    if (error || !data) throw new Error('config unavailable');
  }
  return data;
}
async function send(row: { endpoint: string; p256dh: string; auth: string }, keys: { public_key: string; private_key: string }, test = false) {
  if (!safeEndpoint(row.endpoint)) throw new Error('invalid push endpoint');
  return await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
    JSON.stringify(test ? { title: '지켜로 알림이 준비됐어요', body: '이렇게 알림을 받아요. 오늘도 안전하게 걸으세요!', test: true } : walkingMessage()), {
      TTL: 3600, urgency: 'normal',
      vapidDetails: { subject: 'https://yaniyaabi.github.io/jikeoro-senior-app-proto/', publicKey: keys.public_key, privateKey: keys.private_key },
      timeout: 10000,
    });
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    if (request.method === 'GET') {
      const c = await config();
      return reply({ publicKey: c.public_key });
    }
    if (request.method !== 'POST') return reply({ error: '지원하지 않는 요청입니다.' }, 405);
    if (Number(request.headers.get('content-length') ?? 0) > 16000) return reply({ error: '요청이 너무 큽니다.' }, 413);
    const raw = await request.text();
    if (raw.length > 16000) return reply({ error: '요청이 너무 큽니다.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: '요청을 확인해주세요.' }, 400); }
    if (body.action === 'dispatch') {
      const c = await config();
      if (request.headers.get('X-Reminder-Secret') !== c.dispatch_secret) return reply({ error: '인증이 필요합니다.' }, 401);
      let delivered = 0, failed = 0;
      // Bound work per run; repeated cron calls pick up the remaining claimed-free rows.
      for (let batch = 0; batch < 5; batch++) {
        const { data: rows, error } = await admin.rpc('claim_walking_push', { batch_size: 100 });
        if (error) throw error;
        if (!rows?.length) break;
        for (let i = 0; i < rows.length; i += 10) await Promise.all(rows.slice(i, i + 10).map(async (row) => {
          try { await send(row, c); delivered++; }
          catch (e) {
            failed++;
            if ([404, 410].includes(e.statusCode)) await admin.from('walking_push_subscriptions').update({ enabled: false }).eq('id', row.id);
          }
        }));
      }
      return reply({ delivered, failed });
    }
    const bearer = request.headers.get('Authorization')?.replace(/^Bearer /i, '');
    if (!bearer) return reply({ error: '로그인 후 알림을 설정해주세요.' }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !auth.user) return reply({ error: '로그인 후 다시 시도해주세요.' }, 401);
    if (!safeEndpoint(body.endpoint)) return reply({ error: '알림 기기 정보를 확인해주세요.' }, 400);
    const owner = () => admin.from('walking_push_subscriptions').select('*').eq('endpoint', body.endpoint).eq('user_id', auth.user.id).maybeSingle();
    if (body.action === 'status') {
      const { data, error } = await owner();
      if (error) throw error;
      return reply({ enabled: data?.enabled ?? false, hours: [11, 19] });
    }
    if (body.action === 'disable') {
      const { error } = await admin.from('walking_push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() }).eq('endpoint', body.endpoint).eq('user_id', auth.user.id);
      if (error) throw error;
      return reply({ enabled: false });
    }
    if (body.action === 'subscribe') {
      const hours = [11, 19];
      const k = body.keys;
      if (typeof k?.p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(k.p256dh) || typeof k?.auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(k.auth)) return reply({ error: '알림 기기 정보를 확인해주세요.' }, 400);
      const { error } = await admin.from('walking_push_subscriptions').upsert({
        user_id: auth.user.id, endpoint: body.endpoint, p256dh: k.p256dh, auth: k.auth,
        hours: [...hours].sort((a, b) => a - b), enabled: true, updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return reply({ enabled: true, hours });
    }
    if (body.action === 'test') {
      const { data: row, error } = await owner();
      if (error) throw error;
      if (!row?.enabled) return reply({ error: '먼저 알림 받기를 켜주세요.' }, 400);
      const { data: claimed, error: claimError } = await admin.from('walking_push_subscriptions')
        .update({ last_test_at: new Date().toISOString() }).eq('id', row.id)
        .or(`last_test_at.is.null,last_test_at.lt.${new Date(Date.now() - 60000).toISOString()}`).select('id');
      if (claimError) throw claimError;
      if (!claimed?.length) return reply({ error: '테스트 알림은 1분 뒤 다시 보낼 수 있어요.' }, 429);
      try { await send(row, await config(), true); }
      catch (e) {
        if ([404, 410].includes(e.statusCode)) await admin.from('walking_push_subscriptions').update({ enabled: false }).eq('id', row.id);
        return reply({ error: '기기로 보내지 못했어요. 알림을 껐다가 다시 켜주세요.' }, 502);
      }
      return reply({ sent: true });
    }
    return reply({ error: '지원하지 않는 요청입니다.' }, 400);
  } catch {
    return reply({ error: '알림 설정을 처리하지 못했어요. 잠시 후 다시 시도해주세요.' }, 503);
  }
});
