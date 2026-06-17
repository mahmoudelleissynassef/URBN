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
const MAX_BODY = 64 * 1024;          // 64 KB payload cap (listing payloads + file paths)
const RL_WINDOW_MS = 60 * 1000;      // rate-limit window
const RL_MAX = 12;                   // max submissions per IP per window
const rateBuckets = new Map();       // ip -> [timestamps]

const REQUEST_TYPES = {
  'access': 'Request Access',
  'market-scan': 'Market Scan',
  'list-building': 'List Your Building',
  'membership': 'Membership Request',
  'membership-change': 'Membership Change',
};
const MEMBERSHIP_TIERS = ['free', 'starter', 'membership', 'enterprise'];

// Market -> local currency (mirror of data/data.js). Allowed quoting currencies
// per market = [local, USD] (+ EUR for XOF / Francophone West African markets).
// Keep in sync with allowedCurrencies() in js/urbn.js. No live FX.
const MARKET_CURRENCY = {
  cairo: 'EGP', dubai: 'AED', riyadh: 'SAR', casablanca: 'MAD', rabat: 'MAD',
  amman: 'JOD', tunis: 'TND', algiers: 'DZD', addis: 'ETB', nairobi: 'KES',
  accra: 'GHS', lagos: 'NGN', abuja: 'NGN', johannesburg: 'ZAR', capetown: 'ZAR', luanda: 'AOA',
};
const MARKET_NAMES = {
  cairo: 'Cairo', dubai: 'Dubai', riyadh: 'Riyadh', casablanca: 'Casablanca', rabat: 'Rabat',
  amman: 'Amman', tunis: 'Tunis', algiers: 'Algiers', addis: 'Addis Ababa', nairobi: 'Nairobi',
  accra: 'Accra', lagos: 'Lagos', abuja: 'Abuja', johannesburg: 'Johannesburg', capetown: 'Cape Town', luanda: 'Luanda',
  dakar: 'Dakar', abidjan: 'Abidjan',
};
function marketName(id) { return MARKET_NAMES[id] || (id ? String(id) : ''); }
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
// Mirror of isCorporateEmail() in js/urbn.js — keep the two in sync.
const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com'];
function isCorporateEmail(v) {
  if (!isEmail(v)) return false;
  return !FREE_EMAIL_DOMAINS.includes(v.trim().split('@')[1].toLowerCase());
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

async function sendResendEmail({ subject, text, html, replyTo, from, to }) {
  const key = process.env.RESEND_API_KEY;
  const fromAddr = from || process.env.LEAD_FROM;
  const toAddr = to || process.env.LEAD_TO;
  if (!key || !fromAddr || !toAddr) throw new Error('resend_env_missing');
  const body = JSON.stringify({
    from: fromAddr, to: [toAddr], subject, text, html,
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

// ── Internal notification email builders ─────────────────────────────────────
function emailRow(label, value, isHtml) {
  const v = (value == null || value === '') ? '—' : (isHtml ? value : escapeHtml(String(value)));
  return `<tr><td style="padding:6px 16px 6px 0;color:#6B7280;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111418;font-size:13px;word-break:break-word;">${v}</td></tr>`;
}
function emailSection(title, rowsHtml) {
  return `<tr><td style="padding:18px 24px 2px;"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#243A5E;border-bottom:1px solid #E6E8EB;padding-bottom:6px;margin-bottom:8px;">${escapeHtml(title)}</div><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rowsHtml}</table></td></tr>`;
}
function emailShell(headerTitle, badge, inner) {
  return `<div style="background:#F7F8F9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;width:100%;background:#ffffff;border:1px solid #E6E8EB;border-radius:6px;overflow:hidden;">
      <tr><td style="background:#243A5E;padding:20px 24px;">
        <div style="color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(headerTitle)}</div>
        ${badge ? `<div style="margin-top:8px;"><span style="display:inline-block;background:#C2A36B;color:#1C2E4A;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:3px;">${escapeHtml(badge)}</span></div>` : ''}
      </td></tr>
      ${inner}
      <tr><td style="padding:14px 24px;background:#F7F8F9;color:#9CA3AF;font-size:11px;border-top:1px solid #E6E8EB;">URBN internal notification · do not forward externally.</td></tr>
    </table>
  </div>`;
}
function rawPayloadRow(payload) {
  return `<tr><td style="padding:6px 24px 18px;"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Raw payload (technical)</div><pre style="background:#F0F1F3;border:1px solid #E6E8EB;padding:10px;font-size:10px;color:#6B7280;white-space:pre-wrap;word-break:break-word;border-radius:4px;margin:0;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre></td></tr>`;
}

function buildListingEmail(data, payload, requestId, createdAt) {
  const mkt = marketName(data.market) || (data.market || '');
  const building = data.building || '(no name)';
  const subject = `New listing submission: ${building} — ${mkt || '(no market)'} — Pending Review`;
  const photoPaths = Array.isArray(data.photoPaths) ? data.photoPaths : [];
  const floorplanYN = data.floorplanPath ? 'Yes' : 'No';
  const bucket = data.mediaBucket || 'listing-media';
  const ts = createdAt || new Date().toISOString();
  const mapsCell = data.mapsUrl ? `<a href="${escapeHtml(String(data.mapsUrl))}" style="color:#243A5E;">${escapeHtml(String(data.mapsUrl))}</a>` : '—';
  const emailCell = data.email ? `<a href="mailto:${escapeHtml(String(data.email))}" style="color:#243A5E;">${escapeHtml(String(data.email))}</a>` : '—';

  const inner =
    emailSection('Submitter Details',
      emailRow('Name', data.name) + emailRow('Email', emailCell, true) + emailRow('Company', data.company) +
      emailRow('Job Title', data.title) + emailRow('Submitter Type', data.submitterType)) +
    emailSection('Building & Location',
      emailRow('Building', data.building) + emailRow('Market', mkt) + emailRow('District', data.district) +
      emailRow('Google Maps', mapsCell, true) + emailRow('Floor / Range', data.floor)) +
    emailSection('Space & Offering',
      emailRow('Fit-out Condition', data.fitOut) + emailRow('Offering Type', data.offeringType) +
      emailRow('Area (sqm)', data.area) + emailRow('Desks / Seats', data.seats)) +
    emailSection('Commercials',
      emailRow('Asking Rent', data.rent) + emailRow('Currency', data.currency) + emailRow('Pricing Basis', data.pricingBasis) +
      emailRow('Service Charge', data.serviceCharge) + emailRow('Service Charge Basis', data.serviceChargeBasis) +
      emailRow('Availability Date', data.availabilityDate) + emailRow('Minimum Term', data.minTerm)) +
    emailSection('Media',
      emailRow('Photos Uploaded', String(photoPaths.length)) + emailRow('Floorplan Uploaded', floorplanYN) + emailRow('Storage Bucket', bucket)) +
    emailSection('Storage Paths',
      (photoPaths.length ? photoPaths.map((p, i) => emailRow('Photo ' + (i + 1), p)).join('') : emailRow('Photos', '—')) +
      (data.floorplanPath ? emailRow('Floorplan', data.floorplanPath) : '')) +
    emailSection('Notes', emailRow('Notes', data.message)) +
    emailSection('System',
      emailRow('Supabase Request ID', requestId) + emailRow('Source Page', data.sourcePage) + emailRow('Submitted', ts)) +
    rawPayloadRow(payload);

  const html = emailShell('New List Your Building Request', 'Pending Review', inner);
  const line = (k, v) => `${k}: ${(v == null || v === '') ? '—' : v}`;
  const text = [
    'NEW LIST YOUR BUILDING REQUEST — PENDING REVIEW', '',
    'SUBMITTER', line('Name', data.name), line('Email', data.email), line('Company', data.company), line('Job Title', data.title), line('Submitter Type', data.submitterType), '',
    'BUILDING & LOCATION', line('Building', data.building), line('Market', mkt), line('District', data.district), line('Google Maps', data.mapsUrl), line('Floor / Range', data.floor), '',
    'SPACE & OFFERING', line('Fit-out Condition', data.fitOut), line('Offering Type', data.offeringType), line('Area (sqm)', data.area), line('Desks / Seats', data.seats), '',
    'COMMERCIALS', line('Asking Rent', data.rent), line('Currency', data.currency), line('Pricing Basis', data.pricingBasis), line('Service Charge', data.serviceCharge), line('Service Charge Basis', data.serviceChargeBasis), line('Availability Date', data.availabilityDate), line('Minimum Term', data.minTerm), '',
    'MEDIA', line('Photos Uploaded', String(photoPaths.length)), line('Floorplan Uploaded', floorplanYN), line('Storage Bucket', bucket),
    'Storage paths:', ...(photoPaths.length ? photoPaths.map((p, i) => '  - photo ' + (i + 1) + ': ' + p) : ['  - none']),
    ...(data.floorplanPath ? ['  - floorplan: ' + data.floorplanPath] : []), '',
    'NOTES', (data.message || '—'), '',
    'SYSTEM', line('Supabase Request ID', requestId), line('Source Page', data.sourcePage), line('Submitted', ts),
  ].join('\n');
  return { subject, html, text };
}

function buildGenericEmail(label, fields, payload) {
  const entries = Object.entries(fields).filter(([, v]) => v);
  const inner = emailSection(label + ' Details', entries.map(([k, v]) => emailRow(k, v)).join('')) + rawPayloadRow(payload);
  const html = emailShell('New ' + label + ' Request', null, inner);
  const text = `NEW ${label.toUpperCase()} REQUEST\n\n` + entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  return { html, text };
}

function buildMembershipAdminEmail(data, payload) {
  const inner = emailSection('Membership Request',
    emailRow('Name', data.name) + emailRow('Email', data.email) + emailRow('Company', data.company) +
    emailRow('Current Tier', data.currentTier) + emailRow('Requested Tier', data.requestedTier)) + rawPayloadRow(payload);
  return {
    subject: `Membership request: ${data.requestedTier || '?'} — ${data.company || data.email || ''}`,
    html: emailShell('New Membership Request', 'Membership Requested', inner),
    text: `NEW MEMBERSHIP REQUEST\n\nName: ${data.name || '—'}\nEmail: ${data.email || '—'}\nCompany: ${data.company || '—'}\nCurrent Tier: ${data.currentTier || '—'}\nRequested Tier: ${data.requestedTier || '—'}`,
  };
}

// Short "what you submitted" rows shown in the user confirmation email.
function userDetailRows(type, data) {
  const mkt = marketName(data.market) || data.market || '';
  if (type === 'list-building') {
    return emailRow('Building', data.building) + emailRow('Market', mkt) + emailRow('Offering', data.offeringType) +
      emailRow('Asking Rent', [data.rent, data.currency, data.pricingBasis].filter(Boolean).join(' ')) +
      emailRow('Photos Uploaded', Array.isArray(data.photoPaths) ? String(data.photoPaths.length) : '0');
  }
  if (type === 'market-scan') {
    return emailRow('Market', mkt) + emailRow('Required Area (sqm)', data.area) + emailRow('Sector', data.sector) + emailRow('Timeline', data.timeline);
  }
  if (type === 'membership' || type === 'membership-change') {
    return emailRow('Current Tier', data.currentTier) + emailRow('Requested Tier', data.requestedTier);
  }
  return emailRow('Company', data.company) + emailRow('Market', mkt) + emailRow('Required Area (sqm)', data.area);
}

// User-facing confirmation email (always from NO_REPLY_FROM).
function buildUserConfirmation(type, data, name, requestId, createdAt) {
  const map = {
    'access':        { thing: 'a request', title: 'Request received', badge: 'Received' },
    'market-scan':   { thing: 'a market scan request', title: 'Market scan request received', badge: 'Received' },
    'list-building': { thing: 'a building', title: 'Listing submitted for review', badge: 'Pending Review' },
    'membership':    { thing: 'a membership change', title: 'Membership request received', badge: 'Membership Requested' },
    'membership-change': { thing: 'a membership change', title: 'Membership request received', badge: 'Membership Requested' },
    'batch':         { thing: 'a batch upload', title: 'Batch upload received', badge: 'Pending Review' },
  };
  const m = map[type] || map['access'];
  const hi = name || (data && data.name) || 'there';
  const intro = `<tr><td style="padding:20px 24px 4px;">
    <p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(hi)},</p>
    <p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">You&#39;ve recently submitted ${escapeHtml(m.thing)} through URBN Offices. Below are the details of your request. Our team will review it and follow up shortly.</p>
  </td></tr>`;
  const inner = intro + emailSection('Your Request', userDetailRows(type, data)) +
    emailSection('Reference', emailRow('Reference', requestId) + emailRow('Submitted', createdAt || new Date().toISOString()));
  const html = emailShell(m.title, m.badge, inner);
  const text = `Hi ${hi},\n\nYou've recently submitted ${m.thing} through URBN Offices. Our team will review it and follow up shortly.\n\nReference: ${requestId || '—'}\nSubmitted: ${createdAt || new Date().toISOString()}\n\n— URBN Offices`;
  return { subject: `URBN Offices — ${m.title}`, html, text };
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
    try {

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
    if (type === 'membership' || type === 'membership-change') {
      if (!MEMBERSHIP_TIERS.includes(s(data.requestedTier))) errs.push('requestedTier');
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
    // Supply-side listings and membership changes are held for manual review.
    if (type === 'list-building' || type === 'membership' || type === 'membership-change') row.status = 'pending';

    // 1) Store in Supabase. This is the source of truth — failure is a hard error.
    let requestId = null, createdAt = null;
    try {
      const inserted = await insertSupabase(row);
      if (Array.isArray(inserted) && inserted[0]) { requestId = inserted[0].id || null; createdAt = inserted[0].created_at || null; }
    } catch (e) {
      console.error('[api/request] supabase insert failed:', e.message);
      return sendJson(res, 502, { ok: false, error: 'storage_failed', detail: String(e.message || '').slice(0, 300) });
    }

    // 2) Notify via Resend. The request is already saved, so an email failure is
    //    a partial success — log it and still return ok so the lead is not lost.
    let emailDelivered = true;
    try {
      const label = REQUEST_TYPES[type];
      const listingsFrom = process.env.LISTINGS_FROM || process.env.LEAD_FROM;
      const requestsFrom = process.env.REQUESTS_FROM || process.env.LEAD_FROM;
      const noReplyFrom = process.env.NO_REPLY_FROM || process.env.LEAD_FROM;

      // (a) Internal admin notification to LEAD_TO, from the routed sender.
      let adminMail, adminFrom;
      if (type === 'list-building') {
        adminMail = buildListingEmail(data, payload, requestId, createdAt);
        adminFrom = listingsFrom;
      } else if (type === 'membership' || type === 'membership-change') {
        adminMail = buildMembershipAdminEmail({ name, email, company, currentTier: data.currentTier, requestedTier: data.requestedTier }, payload);
        adminFrom = requestsFrom;
      } else {
        const fields = { Name: name, Email: email, Company: company, Phone: phone, Market: marketName(market) || market, Area: area, Building: building, Message: message };
        const g = buildGenericEmail(label, fields, payload);
        adminMail = { subject: `New ${label} request — ${company || name || email}`, html: g.html, text: g.text };
        adminFrom = requestsFrom;
      }
      await sendResendEmail({ subject: adminMail.subject, text: adminMail.text, html: adminMail.html, replyTo: email || undefined, from: adminFrom });

      // (b) User confirmation to the submitter, from no-reply.
      if (email) {
        const u = buildUserConfirmation(type, data, name, requestId, createdAt);
        try { await sendResendEmail({ subject: u.subject, text: u.text, html: u.html, from: noReplyFrom, to: email }); }
        catch (e2) { console.error('[api/request] user confirmation email failed:', e2.message); }
      }
    } catch (e) {
      emailDelivered = false;
      console.error('[api/request] resend email failed (request was stored):', e.message);
    }

    return sendJson(res, 200, { ok: true, stored: true, emailDelivered });
    } catch (e) {
      console.error('[api/request] handler error:', (e && e.stack) || e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server_error', detail: String((e && e.message) || e).slice(0, 200) });
    }
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
  // Photo / floorplan URLs are optional but must be valid URLs if present.
  const isUrl = (x) => /^https?:\/\/\S+$/i.test(String(x || '').trim());
  for (let i = 1; i <= 5; i++) { const u = r['photo_url_' + i]; if (u && !isUrl(u)) errs.push('photo_url_' + i); }
  for (let i = 1; i <= 2; i++) { const u = r['floorplan_url_' + i]; if (u && !isUrl(u)) errs.push('floorplan_url_' + i); }
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
      // Notify admin (listings sender) + confirm to the uploader (no-reply).
      try {
        const sum = emailSection('Batch', emailRow('Filename', data.filename) + emailRow('Uploaded By', user.email) +
          emailRow('Rows Processed', String(rows.length)) + emailRow('Accepted', String(accepted.length)) +
          emailRow('Rejected', String(rejected.length)) + emailRow('Status', 'pending_review'));
        const errSec = rejected.length ? emailSection('Validation Errors (first 20)',
          rejected.slice(0, 20).map((e) => emailRow('Row ' + (e.i + 1), e.errs.join(', '))).join('')) : '';
        await sendResendEmail({
          subject: `Batch upload: ${data.filename || 'listings'} — ${accepted.length}/${rows.length} accepted — Pending Review`,
          html: emailShell('New Batch Upload', 'Pending Review', sum + errSec),
          text: `BATCH UPLOAD — PENDING REVIEW\nFile: ${data.filename}\nUploaded by: ${user.email}\nProcessed: ${rows.length} · Accepted: ${accepted.length} · Rejected: ${rejected.length}`,
          from: process.env.LISTINGS_FROM || process.env.LEAD_FROM, replyTo: user.email,
        });
        const userInner = `<tr><td style="padding:20px 24px 4px;"><p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(user.email)},</p><p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">You&#39;ve recently submitted a batch upload through URBN Offices. Our team will review it and follow up shortly.</p></td></tr>` +
          emailSection('Your Batch', emailRow('Filename', data.filename) + emailRow('Rows Accepted', String(accepted.length)) + emailRow('Rows Rejected', String(rejected.length)) + emailRow('Status', 'pending_review'));
        await sendResendEmail({
          subject: 'URBN Offices — Batch upload received',
          html: emailShell('Batch upload received', 'Pending Review', userInner),
          text: `Hi,\n\nYour batch upload (${data.filename}) was received: ${accepted.length} of ${rows.length} rows accepted, pending review.\n\n— URBN Offices`,
          from: process.env.NO_REPLY_FROM || process.env.LEAD_FROM, to: user.email,
        });
      } catch (e) { console.error('[api/batch] email failed:', e.message); }

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
      // Dummy/static listings are OFF by default; only the public approved
      // Supabase listings show unless this is explicitly enabled.
      showDemoListings: String(process.env.SHOW_DEMO_LISTINGS || '').toLowerCase() === 'true',
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
