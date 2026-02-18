import crypto from 'crypto';
import { CONTROL_AUTH_USERNAME, CONTROL_AUTH_PASSWORD } from './config.js';

const SESSION_COOKIE = 'eidfaxi_control_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();

function now() {
  return Date.now();
}

function pruneSessions() {
  const t = now();
  for (const [token, expiresAt] of sessions.entries()) {
    if (expiresAt <= t) sessions.delete(token);
  }
}

function parseCookies(req) {
  const raw = req.header('cookie') || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return cookies[SESSION_COOKIE] || '';
}

function isAuthenticated(req) {
  pruneSessions();
  const token = getSessionToken(req);
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function renderLoginHtml(errorMessage = '') {
  const errorBlock = errorMessage
    ? `<div class="error">${errorMessage}</div>`
    : '';
  return `<!doctype html>
<html lang="is">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Eidfaxi Innskraning</title>
  <style>
    :root { --bg:#f3f4f6; --panel:#ffffff; --line:#d1d5db; --fg:#111827; --muted:#6b7280; --primary:#2563eb; --primaryDark:#1d4ed8; --danger:#b91c1c; }
    * { box-sizing:border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
    html,body { margin:0; min-height:100%; }
    body { min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg); }
    .card { width:min(420px, calc(100% - 28px)); background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:20px; }
    h1 { margin:0 0 6px; font-size:24px; }
    .muted { color:var(--muted); margin:0 0 14px; }
    label { display:block; margin:10px 0 6px; color:var(--muted); font-size:13px; font-weight:600; }
    input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:var(--fg); font-size:15px; }
    input:focus { outline:none; border-color:#93c5fd; box-shadow:0 0 0 3px rgba(147,197,253,.35); }
    button { width:100%; margin-top:14px; padding:11px; border:1px solid #1e40af; border-radius:8px; background:var(--primary); color:#fff; font-weight:600; font-size:15px; cursor:pointer; }
    button:hover { background:var(--primaryDark); }
    .error { margin-top:10px; color:var(--danger); font-size:14px; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/control/login">
    <h1>Eidfaxi Stjorn</h1>
    <p class="muted">Skráðu þig inn til að opna stjórnsíðu.</p>
    <label>Notandanafn</label>
    <input name="username" autocomplete="username" required />
    <label>Lykilorð</label>
    <input name="password" type="password" autocomplete="current-password" required />
    <button type="submit">Innskraning</button>
    ${errorBlock}
  </form>
</body>
</html>`;
}

export function requireControlSession(req, res, api = false) {
  if (isAuthenticated(req)) return true;
  if (api) {
    res.status(401).json({ error: 'Unauthorized' });
  } else {
    res.redirect('/control/login');
  }
  return false;
}

export function registerControlAuthRoutes(app) {
  app.get('/control/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderLoginHtml());
  });

  app.post('/control/login', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (
      username !== CONTROL_AUTH_USERNAME ||
      password !== CONTROL_AUTH_PASSWORD
    ) {
      res.status(401);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderLoginHtml('Rangt notandanafn eða lykilorð.'));
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, now() + SESSION_TTL_MS);
    setSessionCookie(res, token);
    res.redirect('/control');
  });

  app.post('/control/logout', (req, res) => {
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    res.redirect('/control/login');
  });
}
