// Read-only check used before publishing a client to GitHub Pages.
const configured = process.env.VITE_API_BASE_URL;
if (!configured) throw new Error('Set JIKEORO_API_BASE_URL to the current public lab-server URL.');
const base = new URL(configured);
if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('JIKEORO_API_BASE_URL must be an HTTPS origin without a path or credentials.');
}
const health = await fetch(new URL('/health', base), {signal: AbortSignal.timeout(15000)});
if (!health.ok) throw new Error(`Lab-server health check failed (${health.status}).`);
const status = await health.json();
if (['server', 'database', 'nas'].some(key => status[key] !== 'ok')) {
  throw new Error('The lab server, database and NAS must all be connected before publishing.');
}
const origin = 'https://yaniyaabi.github.io';
const preflight = await fetch(new URL('/api/reports', base), {
  method: 'OPTIONS', signal: AbortSignal.timeout(15000), headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type,x-file-name,x-media-kind,x-media-id',
  },
});
if (!preflight.ok || preflight.headers.get('access-control-allow-origin') !== origin) {
  throw new Error('The lab server must allow this GitHub Pages origin before publishing.');
}
const allowed = (preflight.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(',').map(s => s.trim());
if (['authorization', 'content-type', 'x-file-name', 'x-media-kind', 'x-media-id'].some(h => !allowed.includes(h))) {
  throw new Error('The lab server does not allow all photo-upload headers.');
}
console.log('Public lab server, DB, NAS and GitHub Pages upload access: OK');
