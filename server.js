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
  '.csv': 'text/csv',
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

// Market -> local currency (mirror of data/data.js). Allowed quoting currencies
// per market = [local, USD] (+ EUR for XOF / Francophone West African markets).
// Keep in sync with allowedCurrencies() in js/urbn.js. No live FX.
const MARKET_CURRENCY = {
  cairo: 'EGP', dubai: 'AED', riyadh: 'SAR', casablanca: 'MAD', rabat: 'MAD',
  amman: 'JOD', tunis: 'TND', algiers: 'DZD', addis: 'ETB', nairobi: 'KES',
  accra: 'GHS', lagos: 'NGN', abuja: 'NGN', johannesburg: 'ZAR', capetown: 'ZAR', luanda: 'AOA',
};
const FRANCOPHONE_WA_MARKETS = ['dakar', 'abidjan', 'bamako', 'ouagadougou', 'lome', 'cotonou', 'niamey'];
function allowedCurrenciesForMarket(marketId) {
  const local = MARKET_CURRENCY[marketId];
  const out = [];
  if (local) out.push(local);
  out.push('USD');
  if (local === 'XOF' || FRANCOPHONE_WA_MARKETS.includes(marketId)) out.push('EUR');
  return out;
}

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
    const num = (x) => x !== '' && !isNaN(Number(x));
    const errs = [];
    if (!isCorporateEmail(email)) errs.push('email');
    if (type === 'access') { if (!company) errs.push('company'); if (!market) errs.push('market'); }
    if (type === 'market-scan') { if (!company) errs.push('company'); if (!market) errs.push('market'); if (!area) errs.push('area'); }
    if (type === 'list-building') {
      const offering = s(data.offeringType);
      const DESK_TYPES = ['Coworking desks', 'Serviced office suite'];
      const AREA_TYPES = ['Whole building', 'Full floor', 'Partial floor', 'Private office'];
      if (!name) errs.push('name');
      if (!company) errs.push('company');
      if (!s(data.title)) errs.push('title');
      if (!s(data.submitterType)) errs.push('submitterType');
      if (!building) errs.push('building');
      if (!market) errs.push('market');
      if (!s(data.district)) errs.push('district');
      if (!s(data.fitOut)) errs.push('fitOut');
      if (!offering) errs.push('offeringType');
      if (!num(s(data.rent))) errs.push('rent');
      if (!s(data.pricingBasis)) errs.push('pricingBasis');
      if (s(data.serviceCharge) && !num(s(data.serviceCharge))) errs.push('serviceCharge');
      // Currency must be allowed for the selected market.
      const cur = s(data.currency);
      if (!cur || !allowedCurrenciesForMarket(market).includes(cur)) errs.push('currency');
      if (DESK_TYPES.includes(offering) && !num(s(data.seats))) errs.push('seats');
      if (AREA_TYPES.includes(offering) && !num(area)) errs.push('area');
      // At least 3 uploaded photo paths (real uploads, not links).
      const photoCount = Array.isArray(data.photoPaths) ? data.photoPaths.filter(Boolean).length : 0;
      if (photoCount < 3) errs.push('photoPaths');
      if (data.consent !== true) errs.push('consent');
    }
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
    // Supply-side listings are held for verification before publishing.
    if (type === 'list-building') row.status = 'pending';

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

// Verify a Supabase access token and return the user (or null).
async function getAuthUser(token) {
  const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon || !token) return null;
  try {
    const r = await httpsRequest(`${base.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET', headers: { apikey: anon, Authorization: 'Bearer ' + token },
    });
    if (r.status < 200 || r.status >= 300) return null;
    return JSON.parse(r.body);
  } catch (e) { return null; }
}

function validateBatchRow(r) {
  const num = (x) => x !== '' && x != null && !isNaN(Number(x));
  const DESK = ['Coworking desks', 'Serviced office suite'];
  const AREA = ['Whole building', 'Full floor', 'Partial floor', 'Private office'];
  const errs = [];
  if (!r.building_name) errs.push('building_name');
  const marketOk = !!MARKET_CURRENCY[r.market] || FRANCOPHONE_WA_MARKETS.includes(r.market);
  if (!marketOk) errs.push('market');
  if (!r.offering_type) errs.push('offering_type');
  if (!r.fit_out) errs.push('fit_out');
  if (!num(r.asking_rent)) errs.push('asking_rent');
  if (!r.pricing_basis) errs.push('pricing_basis');
  if (marketOk && (!r.currency || !allowedCurrenciesForMarket(r.market).includes(r.currency))) errs.push('currency');
  if (DESK.includes(r.offering_type) && !num(r.desks)) errs.push('desks');
  if (AREA.includes(r.offering_type) && !num(r.unit_size_sqm)) errs.push('unit_size_sqm');
  if (r.service_charge && !num(r.service_charge)) errs.push('service_charge');
  return errs;
}

async function insertSupabaseTable(table, rowOrRows) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('supabase_env_missing');
  const payload = JSON.stringify(rowOrRows);
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`,
      Prefer: 'return=representation', 'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);
  if (r.status < 200 || r.status >= 300) throw new Error(`supabase_${r.status}:${r.body.slice(0, 300)}`);
  return JSON.parse(r.body || '[]');
}

// Batch listing upload: validate rows server-side, store as pending review.
function handleBatch(req, res) {
  const MAX = 2 * 1024 * 1024; // 2 MB
  let body = '', tooLarge = false;
  req.on('data', (c) => { if (body.length <= MAX) body += c; if (body.length > MAX) tooLarge = true; });
  req.on('end', async () => {
    if (tooLarge) return sendJson(res, 413, { ok: false, error: 'payload_too_large' });
    let data;
    try { data = JSON.parse(body || '{}'); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid_json' }); }

    const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const user = await getAuthUser(token);
    if (!user || !user.id) return sendJson(res, 401, { ok: false, error: 'not_authenticated' });

    const rows = Array.isArray(data.rows) ? data.rows.slice(0, 1000) : [];
    if (!rows.length) return sendJson(res, 400, { ok: false, error: 'no_rows' });

    const evaluated = rows.map((r, i) => ({ i, r, errs: validateBatchRow(r) }));
    const accepted = evaluated.filter((e) => e.errs.length === 0);
    const rejected = evaluated.filter((e) => e.errs.length > 0);

    // Look up the user's company (best-effort) so the batch is attributable.
    let companyId = null;
    try {
      const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const pr = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${user.id}&select=company_id`, {
        method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const arr = JSON.parse(pr.body || '[]'); companyId = (arr[0] && arr[0].company_id) || null;
    } catch (e) {}

    try {
      const batch = await insertSupabaseTable('listing_batches', {
        uploaded_by: user.id, company_id: companyId, filename: String(data.filename || '').slice(0, 300),
        rows_processed: rows.length, rows_accepted: accepted.length, rows_rejected: rejected.length,
        validation_errors: rejected.map((e) => ({ row: e.i + 1, errors: e.errs })),
        status: 'pending_review',
      });
      const batchId = Array.isArray(batch) ? batch[0].id : batch.id;
      if (evaluated.length) {
        await insertSupabaseTable('listing_batch_rows', evaluated.map((e) => ({
          batch_id: batchId, row_index: e.i + 1, raw: e.r,
          status: e.errs.length ? 'rejected' : 'pending_review', errors: e.errs,
        })));
      }
      return sendJson(res, 200, { ok: true, batchId, processed: rows.length, accepted: accepted.length, rejected: rejected.length });
    } catch (e) {
      console.error('[api/batch] store failed:', e.message);
      return sendJson(res, 502, { ok: false, error: 'storage_failed' });
    }
  });
}

// ── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/request') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleLeadRequest(req, res);
  }

  if (urlPath === '/api/batch') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleBatch(req, res);
  }

  // Public client config for the frontend. Exposes ONLY the Supabase URL and the
  // publishable/anon key (safe in the browser, protected by RLS). The service-role
  // key is never sent here.
  if (urlPath === '/api/config') {
    return sendJson(res, 200, {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    });
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
