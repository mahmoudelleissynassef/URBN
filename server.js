const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

// ── Lead capture: POST /api/request ──────────────────────────────────────────
// Stores each submission in Supabase (source of truth) and notifies via Resend.
// All credentials come from environment variables — never hardcoded.
const MAX_BODY = 10 * 1024;          // 10 KB payload cap
const RL_WINDOW_MS = 60 * 1000;      // rate-limit window
const RL_MAX = 5;                    // max submissions per IP per window
const rateBuckets = new Map();       // ip -> [timestamps]

const REQUEST_TYPES = {
  'access': 'Request Access',
  'market-scan': 'Market Scan',
  'list-building': 'List Your Building',
};

function rateLimited(ip) {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  hits.push(now);
  rateBuckets.set(ip, hits);
  return hits.length > RL_MAX;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Minimal HTTPS JSON request helper (built-in, zero dependencies).
function httpsRequest(urlStr, { method = 'POST', headers = {} }, payload) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('bad_url')); }
    const req = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers },
      (resp) => {
        let data = '';
        resp.on('data', (c) => { data += c; });
        resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function insertSupabase(row) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_REQUESTS_TABLE || 'client_requests';
  if (!base || !key) throw new Error('supabase_env_missing');
  const payload = JSON.stringify(row);
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);
  if (r.status < 200 || r.status >= 300) throw new Error(`supabase_${r.status}:${r.body.slice(0, 300)}`);
  return JSON.parse(r.body || '[]');
}

async function sendResendEmail({ subject, text, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM;
  const to = process.env.LEAD_TO;
  if (!key || !from || !to) throw new Error('resend_env_missing');
  const body = JSON.stringify({
    from, to: [to], subject, text, html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  const r = await httpsRequest('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`resend_${r.status}:${r.body.slice(0, 300)}`);
  return JSON.parse(r.body || '{}');
}

function handleLeadRequest(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: 'rate_limited' });

  let body = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    if (body.length <= MAX_BODY) body += chunk;
    if (body.length > MAX_BODY) tooLarge = true;
  });
  req.on('error', () => { if (!res.headersSent) sendJson(res, 400, { ok: false, error: 'read_error' }); });
  req.on('end', async () => {
    if (tooLarge) return sendJson(res, 413, { ok: false, error: 'payload_too_large' });

    let data;
    try { data = JSON.parse(body || '{}'); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid_json' }); }

    // Honeypot: a filled hidden field means a bot. Accept silently, store nothing.
    if (data.website && String(data.website).trim() !== '') return sendJson(res, 200, { ok: true });

    const type = String(data.requestType || '');
    if (!REQUEST_TYPES[type]) return sendJson(res, 400, { ok: false, error: 'invalid_request_type' });

    const s = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v))).slice(0, 2000);
    const name = s(data.name), email = s(data.email), company = s(data.company);
    const phone = s(data.phone), market = s(data.market), area = s(data.area);
    const message = s(data.message), building = s(data.building);

    // Server-side validation (mirrors the client; never trust the client).
    const errs = [];
    if (!isEmail(email)) errs.push('email');
    if (type === 'access') { if (!company) errs.push('company'); if (!market) errs.push('market'); }
    if (type === 'market-scan') { if (!company) errs.push('company'); if (!market) errs.push('market'); if (!area) errs.push('area'); }
    if (type === 'list-building') { if (!name) errs.push('name'); if (!company) errs.push('company'); if (!building) errs.push('building'); if (!market) errs.push('market'); }
    if (errs.length) return sendJson(res, 400, { ok: false, error: 'validation', fields: errs });

    // Everything else (minus control/honeypot keys) is preserved in the jsonb payload.
    const { website, requestType, sourcePage, ...rest } = data;
    const payload = {};
    for (const [k, v] of Object.entries(rest)) {
      payload[k] = typeof v === 'string' ? v.slice(0, 4000) : v;
    }

    const ipHash = ip ? crypto.createHash('sha256').update((process.env.IP_HASH_SALT || '') + ip).digest('hex') : null;

    const row = {
      request_type: type,
      source_page: s(data.sourcePage) || null,
      name: name || null,
      email: email || null,
      company: company || null,
      phone: phone || null,
      market: market || null,
      area: area || null,
      message: message || null,
      payload,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
      ip_hash: ipHash,
    };

    // 1) Store in Supabase. This is the source of truth — failure is a hard error.
    try {
      await insertSupabase(row);
    } catch (e) {
      console.error('[api/request] supabase insert failed:', e.message);
      return sendJson(res, 502, { ok: false, error: 'storage_failed' });
    }

    // 2) Notify via Resend. The request is already saved, so an email failure is
    //    a partial success — log it and still return ok so the lead is not lost.
    let emailDelivered = true;
    try {
      const label = REQUEST_TYPES[type];
      const fields = { Name: name, Email: email, Company: company, Phone: phone, Market: market, Area: area, Building: building, Message: message };
      const rows = Object.entries(fields).filter(([, v]) => v);
      const text = `New ${label} request\n\n` +
        rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
        `\n\nFull submission:\n${JSON.stringify(payload, null, 2)}`;
      const html = `<h2>New ${label} request</h2>` +
        `<table cellpadding="6" style="border-collapse:collapse">` +
        rows.map(([k, v]) => `<tr><td style="font-weight:bold">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('') +
        `</table><pre style="background:#f4f4f4;padding:12px">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
      await sendResendEmail({
        subject: `New ${label} request — ${company || name || email}`,
        text, html, replyTo: email || undefined,
      });
    } catch (e) {
      emailDelivered = false;
      console.error('[api/request] resend email failed (request was stored):', e.message);
    }

    return sendJson(res, 200, { ok: true, stored: true, emailDelivered });
  });
}

// ── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/request') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleLeadRequest(req, res);
  }

  let reqPath = urlPath;
  if (reqPath === '/') reqPath = '/index.html';
  let filePath = path.join(__dirname, reqPath);
  if (!path.extname(filePath)) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 — Not Found</h1>');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`URBN Platform running on port ${PORT}`));
