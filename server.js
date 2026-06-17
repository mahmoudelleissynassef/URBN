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
// In-app, listing-centric requests (require a signed-in user + a building).
// Handled by the authenticated POST /api/listing-request, not the public form.
const IN_APP_REQUEST_TYPES = ['reveal-listing', 'site-visit', 'offer', 'introduction'];
const IN_APP_LABELS = {
  'reveal-listing': 'Building details request', 'site-visit': 'Site visit request',
  'offer': 'Offer', 'introduction': 'Introduction request',
};
const MEMBERSHIP_TIERS = ['free', 'starter', 'membership', 'enterprise'];

// Controlled vocab shared with the admin console + List Your Building form.
const REJECTION_REASONS = [
  'Duplicate listing', 'Insufficient building information', 'Missing or unclear photos',
  'Floorplan required', 'Rent or service charge missing', 'Unable to verify ownership/operator authority',
  'Building does not meet URBN quality criteria', 'Location or map pin unclear',
  'Suspicious or inconsistent information', 'Outside current market coverage', 'Other',
];
const AMENITY_OPTIONS = [
  '24/7 access', 'Reception / concierge', 'Security', 'CCTV', 'Elevators', 'Backup power / generator',
  'High-speed internet / fiber', 'Meeting rooms', 'Conference facilities', 'Pantry / kitchenette',
  'Cafeteria / F&B', 'Gym / wellness', 'Outdoor terrace', 'Business lounge', 'Prayer room', 'Parking',
  'EV charging', 'Bicycle parking', 'Showers / lockers', 'Disabled access', 'LEED / green certification',
  'Smart building systems', 'Other',
];
const PARKING_ARRANGEMENTS = ['free', 'paid', 'mixed', 'none'];
const PARKING_INCLUDED = ['yes', 'no', 'partially'];

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
    emailSection('Amenities & Parking',
      emailRow('Amenities', Array.isArray(data.amenities) ? data.amenities.join(', ') : data.amenities) +
      emailRow('Parking Spaces', data.parkingSpaces) + emailRow('Parking Arrangement', data.parkingArrangement) +
      emailRow('Included in Rent', data.parkingIncludedInRent) + emailRow('Price / Spot / Month', data.parkingPricePerSpot) +
      emailRow('Visitor Hourly Rate', data.visitorParkingHourly) + emailRow('Monthly Membership', data.parkingMonthlyMembership) +
      emailRow('Membership Price', data.parkingMonthlyMembershipPrice) + emailRow('Parking Notes', data.parkingNotes)) +
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
  const isUrl = (x) => /^https?:\/\/\S+$/i.test(String(x || '').trim());
  const DESK = ['Coworking desks', 'Serviced office suite'];
  const AREA = ['Whole building', 'Full floor', 'Partial floor', 'Private office'];
  const errs = [];
  // Required
  if (!r.building_name) errs.push('building_name');
  const marketOk = !!MARKET_CURRENCY[r.market] || FRANCOPHONE_WA_MARKETS.includes(r.market);
  if (!marketOk) errs.push('market');
  if (!r.submarket) errs.push('submarket');
  if (!r.offering_type) errs.push('offering_type');
  if (!r.fit_out) errs.push('fit_out');
  if (!num(r.asking_rent)) errs.push('asking_rent');
  if (marketOk && (!r.currency || !allowedCurrenciesForMarket(r.market).includes(r.currency))) errs.push('currency');
  if (!r.pricing_basis) errs.push('pricing_basis');
  // Conditional: traditional offerings need size_sqm; coworking/serviced need desks.
  if (DESK.includes(r.offering_type) && !num(r.desks)) errs.push('desks');
  if (AREA.includes(r.offering_type) && !num(r.size_sqm)) errs.push('size_sqm');
  // Numeric if present
  ['year_built', 'floors', 'building_height_m', 'total_gla_sqm', 'typical_floorplate_sqm', 'parking_ratio', 'size_sqm', 'desks', 'meeting_rooms', 'service_charge',
    'parking_spaces_available', 'parking_price_per_spot_month', 'visitor_parking_hourly_rate', 'parking_monthly_membership_price',
  ].forEach((k) => { if (r[k] && !num(r[k])) errs.push(k); });
  // Parking enums if present
  if (r.parking_arrangement && !PARKING_ARRANGEMENTS.includes(String(r.parking_arrangement).toLowerCase())) errs.push('parking_arrangement');
  if (r.parking_included_in_rent && !PARKING_INCLUDED.includes(String(r.parking_included_in_rent).toLowerCase())) errs.push('parking_included_in_rent');
  // URLs if present
  ['google_maps_url', 'main_photo_url'].forEach((k) => { if (r[k] && !isUrl(r[k])) errs.push(k); });
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

// ── Admin: service-role REST helpers + approval workflow ─────────────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function sbGet(pathWithQuery) {
  const base = process.env.SUPABASE_URL;
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/${pathWithQuery}`, { method: 'GET', headers: sbHeaders() });
  if (r.status < 200 || r.status >= 300) throw new Error(`sb_get_${r.status}:${r.body.slice(0, 200)}`);
  return JSON.parse(r.body || '[]');
}
async function sbPatch(table, query, patch) {
  const base = process.env.SUPABASE_URL, body = JSON.stringify(patch);
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/${table}?${query}`, { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation', 'Content-Length': Buffer.byteLength(body) } }, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`sb_patch_${r.status}:${r.body.slice(0, 200)}`);
  return JSON.parse(r.body || '[]');
}
async function sbUpsert(table, rows) {
  const base = process.env.SUPABASE_URL, body = JSON.stringify(rows);
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/${table}`, { method: 'POST', headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=representation', 'Content-Length': Buffer.byteLength(body) } }, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`sb_upsert_${r.status}:${r.body.slice(0, 200)}`);
  return JSON.parse(r.body || '[]');
}
async function isAdmin(userId) {
  if (!userId) return false;
  try { const rows = await sbGet(`admin_users?user_id=eq.${userId}&select=user_id`); return Array.isArray(rows) && rows.length > 0; }
  catch (e) { return false; }
}
function readJsonBody(req, max = 64 * 1024) {
  return new Promise((resolve) => {
    let body = '', tooLarge = false;
    req.on('data', (c) => { if (body.length <= max) body += c; if (body.length > max) tooLarge = true; });
    req.on('end', () => { if (tooLarge) return resolve(null); try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
const numOrNull = (x) => (x === '' || x == null || isNaN(Number(x))) ? null : Number(x);
const arrOrNull = (s) => { const a = String(s || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean); return a.length ? a : null; };
const dateOrNull = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim()) ? String(s).trim() : null;

// Auth user emails (GoTrue admin API, service role).
async function listAuthUsers() {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const r = await httpsRequest(`${base.replace(/\/$/, '')}/auth/v1/admin/users?per_page=1000`, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (r.status < 200 || r.status >= 300) return [];
    const j = JSON.parse(r.body); return j.users || (Array.isArray(j) ? j : []);
  } catch (e) { return []; }
}
function groupCount(arr, keyFn) {
  const m = {}; (arr || []).forEach((x) => { const k = keyFn(x); if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; }); return m;
}
function groupAgg(arr, keyFn, valFn) {
  const m = {}; (arr || []).forEach((x) => { const k = keyFn(x); const v = valFn(x); if (k == null || k === '' || v == null || isNaN(v)) return; (m[k] = m[k] || []).push(v); }); return m;
}
const sum = (a) => a.reduce((s, n) => s + n, 0);
const avg = (a) => a.length ? Math.round(sum(a) / a.length) : 0;

async function sendApprovalEmail(to, name, buildingName, approved, note) {
  if (!to) return;
  const from = process.env.NO_REPLY_FROM || process.env.LEAD_FROM;
  const title = approved ? 'Your listing has been approved' : 'Your listing was not approved';
  const badge = approved ? 'Approved' : 'Not Approved';
  const hi = name || 'there';
  const msg = approved
    ? `Good news — <strong>${escapeHtml(buildingName || 'your building')}</strong> has been verified and is now live on URBN Offices.`
    : `Thank you for your submission. <strong>${escapeHtml(buildingName || 'Your building')}</strong> was not approved at this time.${note ? ' Reason: ' + escapeHtml(note) : ''}`;
  const inner = `<tr><td style="padding:20px 24px 8px;"><p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(hi)},</p><p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">${msg}</p></td></tr>`;
  try {
    await sendResendEmail({
      subject: `URBN Offices — ${title}`, html: emailShell(title, badge, inner),
      text: `Hi ${hi},\n\n${approved ? (buildingName || 'Your building') + ' is now live on URBN Offices.' : (buildingName || 'Your building') + ' was not approved.' + (note ? ' Reason: ' + note : '')}\n\n— URBN Offices`,
      from, to,
    });
  } catch (e) { console.error('[admin] approval email failed:', e.message); }
}

async function sendMembershipDecisionEmail(to, name, tier, approved) {
  if (!to) return;
  const from = process.env.NO_REPLY_FROM || process.env.LEAD_FROM;
  const title = approved ? 'Your membership has been activated' : 'Your membership request update';
  const badge = approved ? 'Active' : 'Update';
  const hi = name || 'there';
  const msg = approved
    ? `Your <strong>${escapeHtml(tier || '')}</strong> membership is now active on URBN Offices.`
    : `Thank you. Your request for the <strong>${escapeHtml(tier || '')}</strong> tier was not approved at this time. Your current access is unchanged.`;
  const inner = `<tr><td style="padding:20px 24px 8px;"><p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(hi)},</p><p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">${msg}</p></td></tr>`;
  try { await sendResendEmail({ subject: `URBN Offices — ${title}`, html: emailShell(title, badge, inner), text: `Hi ${hi},\n\n${approved ? 'Your ' + (tier || '') + ' membership is now active.' : 'Your ' + (tier || '') + ' tier request was not approved.'}\n\n— URBN Offices`, from, to }); }
  catch (e) { console.error('[admin] membership email:', e.message); }
}

async function sendRevealDecisionEmail(to, buildingName, market, approved) {
  if (!to) return;
  const from = process.env.NO_REPLY_FROM || process.env.LEAD_FROM;
  const mkt = marketName(market) || market || '';
  const title = approved ? 'Building details unlocked' : 'Building details request update';
  const badge = approved ? 'Access granted' : 'Update';
  const msg = approved
    ? `Your request to view full details${buildingName ? ' for <strong>' + escapeHtml(buildingName) + '</strong>' : ''} has been approved. Sign in to URBN Offices to view the building name, location and full media.`
    : `Thank you. Your request to view full building details${mkt ? ' in ' + escapeHtml(mkt) : ''} was not approved at this time.`;
  const inner = `<tr><td style="padding:20px 24px 8px;"><p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi there,</p><p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">${msg}</p></td></tr>`;
  try { await sendResendEmail({ subject: `URBN Offices — ${title}`, html: emailShell(title, badge, inner), text: approved ? 'Your building details request was approved. Sign in to view full details.' : 'Your building details request was not approved.', from, to }); }
  catch (e) { console.error('[admin] reveal email:', e.message); }
}

// Approve a manual list-building request -> buildings + units + listing_media.
// existingBuildingId (optional): attach the unit to a building already in the
// inventory instead of creating a new one (admin "assign to existing building",
// or the uploader picked an existing building on the form).
async function approveRequestRow(row, adminId, existingBuildingId) {
  const p = row.payload || {}, now = new Date().toISOString();
  // Resolve target building: explicit arg > uploader's chosen building > new.
  let bId = existingBuildingId || p.existingBuildingId || null;
  if (bId) {
    // Verify it exists; if not, fall back to creating a new building.
    const found = await sbGet(`buildings?id=eq.${encodeURIComponent(bId)}&select=id`);
    if (!found.length) bId = null;
  }
  const attachOnly = !!bId;
  if (!attachOnly) {
    bId = 'b_' + row.id;
    await sbUpsert('buildings', [{
      id: bId, name: p.building || row.name || 'Untitled', market: row.market || p.market || null, submarket: p.district || null,
      address: p.address || null, google_maps_url: p.mapsUrl || null, grade: p.grade || null, image_url: p.mainPhotoUrl || null,
      building_height_m: numOrNull(p.buildingHeight), amenities: Array.isArray(p.amenities) ? p.amenities : arrOrNull(p.amenities),
      parking_spaces_available: numOrNull(p.parkingSpaces), parking_arrangement: p.parkingArrangement || null,
      parking_included_in_rent: p.parkingIncludedInRent || null, parking_price_per_spot_month: numOrNull(p.parkingPricePerSpot),
      visitor_parking_hourly_rate: numOrNull(p.visitorParkingHourly), parking_monthly_membership_available: p.parkingMonthlyMembership === true || p.parkingMonthlyMembership === 'yes' || null,
      parking_monthly_membership_price: numOrNull(p.parkingMonthlyMembershipPrice), parking_notes: p.parkingNotes || null,
      status: 'approved', submitted_by: p.submittedBy || null, request_id: row.id, approved_by: adminId, approved_at: now,
    }]);
  }
  await sbUpsert('units', [{
    id: 'u_' + row.id, building_id: bId, unit_floor: p.floor || null, size_sqm: numOrNull(p.area), offering_type: p.offeringType || null,
    fit_out: p.fitOut || null, desks: numOrNull(p.seats), meeting_rooms: null, asking_rent: numOrNull(p.rent), currency: p.currency || null,
    pricing_basis: p.pricingBasis || null, service_charge: numOrNull(p.serviceCharge), service_charge_basis: p.serviceChargeBasis || null,
    availability_date: dateOrNull(p.availabilityDate), min_term: p.minTerm || null, notes: row.message || p.message || null, status: 'approved', request_id: row.id,
  }]);
  const media = [];
  (Array.isArray(p.photoPaths) ? p.photoPaths : []).forEach((path, i) => media.push({ building_id: bId, bucket: p.mediaBucket || 'listing-media', path, kind: 'photo', uploaded_by: p.submittedBy || null, is_main: i === 0 }));
  if (p.floorplanPath) media.push({ building_id: bId, bucket: p.mediaBucket || 'listing-media', path: p.floorplanPath, kind: 'floorplan', uploaded_by: p.submittedBy || null });
  if (media.length) { try { await insertSupabaseTable('listing_media', media); } catch (e) { console.error('[admin] media:', e.message); } }
  await sbPatch('client_requests', `id=eq.${row.id}`, { status: 'approved', reviewed_by: adminId, reviewed_at: now });
}

// Approve a batch row (external media URLs) -> buildings + units + listing_media.
async function approveBatchRowRec(row, adminId) {
  const r = row.raw || {}, now = new Date().toISOString(), bId = 'b_' + row.id;
  await sbUpsert('buildings', [{
    id: bId, name: r.building_name || 'Untitled', market: r.market || null, submarket: r.submarket || null, address: r.address || null,
    google_maps_url: r.google_maps_url || null, grade: r.grade || null, year_built: numOrNull(r.year_built), floors: numOrNull(r.floors),
    total_gla_sqm: numOrNull(r.total_gla_sqm), typical_floorplate_sqm: numOrNull(r.typical_floorplate_sqm), parking_ratio: numOrNull(r.parking_ratio),
    certifications: arrOrNull(r.certifications), amenities: arrOrNull(r.amenities), image_url: r.main_photo_url || null,
    building_height_m: numOrNull(r.building_height_m),
    parking_spaces_available: numOrNull(r.parking_spaces_available), parking_arrangement: r.parking_arrangement || null,
    parking_included_in_rent: r.parking_included_in_rent || null, parking_price_per_spot_month: numOrNull(r.parking_price_per_spot_month),
    visitor_parking_hourly_rate: numOrNull(r.visitor_parking_hourly_rate),
    parking_monthly_membership_available: /^(yes|true)$/i.test(String(r.parking_monthly_membership_available || '')) || null,
    parking_monthly_membership_price: numOrNull(r.parking_monthly_membership_price), parking_notes: r.parking_notes || null,
    status: 'approved', approved_by: adminId, approved_at: now,
  }]);
  await sbUpsert('units', [{
    id: 'u_' + row.id, building_id: bId, unit_floor: r.unit_floor || null, size_sqm: numOrNull(r.size_sqm), offering_type: r.offering_type || null,
    fit_out: r.fit_out || null, desks: numOrNull(r.desks), meeting_rooms: numOrNull(r.meeting_rooms), asking_rent: numOrNull(r.asking_rent),
    currency: r.currency || null, pricing_basis: r.pricing_basis || null, service_charge: numOrNull(r.service_charge),
    service_charge_basis: r.service_charge_basis || null, availability_date: dateOrNull(r.availability_date), min_term: r.minimum_term || null, notes: r.notes || null, status: 'approved',
  }]);
  const media = [];
  if (r.main_photo_url) media.push({ url: r.main_photo_url, kind: 'photo' });
  for (let i = 1; i <= 5; i++) if (r['photo_url_' + i]) media.push({ url: r['photo_url_' + i], kind: 'photo' });
  for (let i = 1; i <= 2; i++) if (r['floorplan_url_' + i]) media.push({ url: r['floorplan_url_' + i], kind: 'floorplan' });
  media.forEach((m) => { m.building_id = bId; m.path = m.url; m.bucket = 'external'; });
  if (media.length) { try { await insertSupabaseTable('listing_media', media); } catch (e) { console.error('[admin] batch media:', e.message); } }
  await sbPatch('listing_batch_rows', `id=eq.${row.id}`, { status: 'approved' });
  try {
    const pending = await sbGet(`listing_batch_rows?batch_id=eq.${row.batch_id}&status=eq.pending_review&select=id`);
    if (Array.isArray(pending) && pending.length === 0) await sbPatch('listing_batches', `id=eq.${row.batch_id}`, { status: 'approved' });
  } catch (e) {}
}

function handleAdmin(req, res, urlPath) {
  (async () => {
    const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const user = await getAuthUser(token);
    if (!user || !user.id) return sendJson(res, 401, { ok: false, error: 'not_authenticated' });
    if (!(await isAdmin(user.id))) return sendJson(res, 403, { ok: false, error: 'not_admin' });
    try {
      if (req.method === 'GET' && urlPath === '/api/admin/me') return sendJson(res, 200, { ok: true, admin: true, email: user.email });
      if (req.method === 'GET' && urlPath === '/api/admin/pending-listings') {
        return sendJson(res, 200, { ok: true, listings: await sbGet(`client_requests?request_type=eq.list-building&status=in.(pending,new)&order=created_at.desc`) });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/listings') {
        const status = (req.url.split('status=')[1] || 'approved').split('&')[0];
        if (status === 'rejected') return sendJson(res, 200, { ok: true, listings: await sbGet(`client_requests?request_type=eq.list-building&status=eq.rejected&order=reviewed_at.desc`) });
        return sendJson(res, 200, { ok: true, buildings: await sbGet(`buildings?status=eq.approved&order=approved_at.desc`) });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/listing-batches') {
        return sendJson(res, 200, { ok: true, batches: await sbGet(`listing_batches?order=created_at.desc`), rows: await sbGet(`listing_batch_rows?order=row_index.asc`) });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/overview') {
        const len = async (q) => (await sbGet(q + (q.includes('?') ? '&' : '?') + 'select=id')).length;
        const [pendingListings, pendingBatchRows, approved, rejected, users, companies, pendingMembership, latest] = await Promise.all([
          len('client_requests?request_type=eq.list-building&status=in.(pending,new)'),
          len('listing_batch_rows?status=eq.pending_review'),
          len('buildings?status=eq.approved'),
          len('client_requests?request_type=eq.list-building&status=eq.rejected'),
          len('profiles'), len('companies'),
          len('client_requests?request_type=in.(membership,membership-change)&status=eq.pending'),
          sbGet('client_requests?order=created_at.desc&limit=8'),
        ]);
        return sendJson(res, 200, { ok: true, counts: { pendingListings, pendingBatchRows, approved, rejected, users, companies, pendingMembership }, latest });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/users') {
        const [profiles, companies, saved, reqs, authUsers] = await Promise.all([
          sbGet('profiles?select=*&order=created_at.desc'), sbGet('companies?select=id,name'),
          sbGet('saved_properties?select=user_id'), sbGet('client_requests?select=email'), listAuthUsers(),
        ]);
        const emailById = {}; authUsers.forEach((u) => { emailById[u.id] = u.email; });
        const compById = {}; companies.forEach((c) => { compById[c.id] = c.name; });
        const savedByUser = groupCount(saved, (s) => s.user_id);
        const reqByEmail = groupCount(reqs, (r) => (r.email || '').toLowerCase());
        const users = profiles.map((p) => { const email = emailById[p.id] || ''; return { id: p.id, email, full_name: p.full_name, company: compById[p.company_id] || '', user_type: p.user_type, requested_tier: p.requested_tier, created_at: p.created_at, requests: reqByEmail[email.toLowerCase()] || 0, saves: savedByUser[p.id] || 0 }; });
        return sendJson(res, 200, { ok: true, users });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/companies') {
        const [companies, members, subs, reqs, batches] = await Promise.all([
          sbGet('companies?select=*&order=created_at.desc'), sbGet('company_members?select=company_id'),
          sbGet('company_subscriptions?select=company_id,tier,status&order=created_at.desc'),
          sbGet('client_requests?select=company,request_type'), sbGet('listing_batches?select=company_id'),
        ]);
        const memberCount = groupCount(members, (m) => m.company_id), batchCount = groupCount(batches, (b) => b.company_id);
        const latestSub = {}; subs.forEach((s) => { if (!latestSub[s.company_id]) latestSub[s.company_id] = s; });
        const reqByName = groupCount(reqs, (r) => (r.company || '').toLowerCase());
        const listingByName = groupCount(reqs.filter((r) => r.request_type === 'list-building'), (r) => (r.company || '').toLowerCase());
        const out = companies.map((c) => ({ id: c.id, name: c.name, created_at: c.created_at, members: memberCount[c.id] || 0, tier: (latestSub[c.id] || {}).tier || '—', status: (latestSub[c.id] || {}).status || '—', requests: reqByName[(c.name || '').toLowerCase()] || 0, listings: listingByName[(c.name || '').toLowerCase()] || 0, batches: batchCount[c.id] || 0 }));
        return sendJson(res, 200, { ok: true, companies: out });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/membership-requests') {
        return sendJson(res, 200, { ok: true, requests: await sbGet('client_requests?request_type=in.(membership,membership-change)&order=created_at.desc') });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/analytics') {
        const [buildings, units, reqs, subs, saved, profiles, companies, revealGrants, capexRows] = await Promise.all([
          sbGet('buildings?status=eq.approved&select=*'), sbGet('units?status=eq.approved&select=*'),
          sbGet('client_requests?select=*&order=created_at.desc&limit=2000'), sbGet('company_subscriptions?select=company_id,tier,status&order=created_at.desc'),
          sbGet('saved_properties?select=user_id,building_id'), sbGet('profiles?select=id'), sbGet('companies?select=id'),
          sbGet('listing_access_grants?select=building_id,company_id,status').catch(() => []),
          sbGet('market_construction_costs?order=market.asc,effective_date.desc.nullslast,created_at.desc&select=market,effective_date,updated_at').catch(() => []),
        ]);
        const bById = {}; buildings.forEach((b) => { bById[b.id] = b; });
        const capexByMarket = {}; capexRows.forEach((c) => { if (!capexByMarket[c.market]) capexByMarket[c.market] = c.updated_at || c.effective_date; });
        const access = reqs.filter((r) => r.request_type === 'access'), scan = reqs.filter((r) => r.request_type === 'market-scan');
        const listReqs = reqs.filter((r) => r.request_type === 'list-building');
        const memReqs = reqs.filter((r) => r.request_type === 'membership' || r.request_type === 'membership-change');
        const rentByMarket = groupAgg(units, (u) => bById[u.building_id] ? bById[u.building_id].market : null, (u) => Number(u.asking_rent));
        const avgRentByMarket = {}, rentRangeByMarket = {};
        Object.keys(rentByMarket).forEach((k) => { avgRentByMarket[k] = avg(rentByMarket[k]); rentRangeByMarket[k] = [Math.min(...rentByMarket[k]), Math.max(...rentByMarket[k])]; });
        const latestSub = {}; subs.forEach((s) => { if (!latestSub[s.company_id]) latestSub[s.company_id] = s; });
        const companiesByTier = groupCount(Object.values(latestSub).filter((s) => s.status === 'active'), (s) => s.tier);
        const savedByBuilding = groupCount(saved, (s) => s.building_id);
        const mostSaved = Object.entries(savedByBuilding).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ building: (bById[id] || {}).name || id, market: (bById[id] || {}).market || '', saves: n }));
        return sendJson(res, 200, { ok: true, analytics: {
          supply: { approvedBuildings: buildings.length, approvedUnits: units.length, totalSqm: sum(units.map((u) => Number(u.size_sqm) || 0)), totalDesks: sum(units.map((u) => Number(u.desks) || 0)), listingsByMarket: groupCount(buildings, (b) => b.market), listingsBySubmarket: groupCount(buildings, (b) => b.submarket), listingsByOffering: groupCount(units, (u) => u.offering_type), avgRentByMarket, rentRangeByMarket, pendingBySource: groupCount(listReqs.filter((r) => r.status === 'pending' || r.status === 'new'), (r) => r.source_page) },
          demand: { accessByMarket: groupCount(access, (r) => r.market), scanByMarket: groupCount(scan, (r) => r.market), requestsByCompany: groupCount(reqs, (r) => r.company), latest: reqs.slice(0, 8).map((r) => ({ type: r.request_type, market: r.market, company: r.company, email: r.email, created_at: r.created_at })) },
          engagement: { mostSaved, totalSaves: saved.length, savedByMarket: groupCount(saved, (s) => (bById[s.building_id] || {}).market) },
          membership: { companiesByTier, pendingMembership: memReqs.filter((r) => r.status === 'pending').length, totalCompanies: companies.length, totalUsers: profiles.length },
          dataQuality: { buildingsMissingPhoto: buildings.filter((b) => !b.image_url).length, buildingsMissingMaps: buildings.filter((b) => !b.google_maps_url).length, unitsMissingRent: units.filter((u) => !u.asking_rent).length, unitsMissingServiceCharge: units.filter((u) => u.service_charge == null).length, buildingsNoUnits: buildings.filter((b) => !units.some((u) => u.building_id === b.id)).length, buildingsMissingAmenities: buildings.filter((b) => !Array.isArray(b.amenities) || !b.amenities.length).length, buildingsMissingParking: buildings.filter((b) => b.parking_spaces_available == null && !b.parking_arrangement).length },
          requests: {
            pendingByType: groupCount(reqs.filter((r) => r.status === 'pending' || r.status === 'new'), (r) => r.request_type),
            revealByBuilding: groupCount(reqs.filter((r) => r.request_type === 'reveal-listing'), (r) => (bById[(r.payload || {}).buildingId] || {}).name || (r.payload || {}).buildingId),
            revealByCompany: groupCount(reqs.filter((r) => r.request_type === 'reveal-listing'), (r) => r.company),
            siteVisitsByMarket: groupCount(reqs.filter((r) => r.request_type === 'site-visit'), (r) => r.market),
            offersByMarket: groupCount(reqs.filter((r) => r.request_type === 'offer'), (r) => r.market),
            introductions: reqs.filter((r) => r.request_type === 'introduction').length,
            grantsByStatus: groupCount(revealGrants, (g) => g.status),
            listingsApproved: listReqs.filter((r) => r.status === 'approved').length,
            listingsRejected: listReqs.filter((r) => r.status === 'rejected').length,
          },
          constructionCostsByMarket: capexByMarket,
        } });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/reveal-requests') {
        const grants = await sbGet('listing_access_grants?order=created_at.desc&select=*');
        const buildings = await sbGet('buildings?select=id,name,market,submarket');
        const bById = {}; buildings.forEach((b) => { bById[b.id] = b; });
        const authUsers = await listAuthUsers(); const emailById = {}; authUsers.forEach((u) => { emailById[u.id] = u.email; });
        return sendJson(res, 200, { ok: true, grants: grants.map((g) => ({ ...g, buildingName: (bById[g.building_id] || {}).name || g.building_id, market: (bById[g.building_id] || {}).market || '', userEmail: emailById[g.user_id] || '' })) });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/buildings') {
        const status = (req.url.split('status=')[1] || '').split('&')[0];
        const q = status ? `buildings?status=eq.${encodeURIComponent(status)}&order=created_at.desc&select=*` : 'buildings?order=created_at.desc&select=*';
        const buildings = await sbGet(q);
        const units = await sbGet('units?select=building_id');
        const cntByB = groupCount(units, (u) => u.building_id);
        return sendJson(res, 200, { ok: true, buildings: buildings.map((b) => ({ ...b, unitCount: cntByB[b.id] || 0 })) });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/building') {
        const id = (req.url.split('id=')[1] || '').split('&')[0];
        if (!id) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const building = (await sbGet(`buildings?id=eq.${encodeURIComponent(id)}&select=*`))[0];
        if (!building) return sendJson(res, 404, { ok: false, error: 'not_found' });
        const units = await sbGet(`units?building_id=eq.${encodeURIComponent(id)}&order=created_at.asc&select=*`);
        const mediaRows = await sbGet(`listing_media?building_id=eq.${encodeURIComponent(id)}&select=*`);
        const media = [];
        for (const m of mediaRows) { const url = await signStorageUrl(m.bucket, m.path, 3600); media.push({ ...m, signedUrl: url }); }
        return sendJson(res, 200, { ok: true, building, units, media });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/construction-costs') {
        return sendJson(res, 200, { ok: true, costs: await sbGet('market_construction_costs?order=market.asc,effective_date.desc.nullslast,created_at.desc&select=*') });
      }
      const body = await readJsonBody(req);
      if (!body) return sendJson(res, 400, { ok: false, error: 'invalid_json' });
      if (urlPath === '/api/admin/approve-listing') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        // Optional: attach to an existing inventory building chosen by the admin.
        await approveRequestRow(row, user.id, body.buildingId || null);
        await sendApprovalEmail(row.email, row.name, row.payload && row.payload.building, true);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/create-building') {
        const f = body.fields || {};
        if (!f.name || !f.market) return sendJson(res, 400, { ok: false, error: 'name_and_market_required' });
        const id = 'b_man_' + crypto.randomUUID();
        const rec = {
          id, name: String(f.name), market: String(f.market), submarket: f.submarket || null,
          address: f.address || null, google_maps_url: f.google_maps_url || null, grade: f.grade || null,
          year_built: numOrNull(f.year_built), floors: numOrNull(f.floors), building_height_m: numOrNull(f.building_height_m),
          total_gla_sqm: numOrNull(f.total_gla_sqm), typical_floorplate_sqm: numOrNull(f.typical_floorplate_sqm),
          certifications: arrOrNull(f.certifications), amenities: arrOrNull(f.amenities),
          parking_spaces_available: numOrNull(f.parking_spaces_available), parking_arrangement: f.parking_arrangement || null,
          parking_included_in_rent: f.parking_included_in_rent || null, parking_price_per_spot_month: numOrNull(f.parking_price_per_spot_month),
          visitor_parking_hourly_rate: numOrNull(f.visitor_parking_hourly_rate), parking_monthly_membership_price: numOrNull(f.parking_monthly_membership_price),
          parking_notes: f.parking_notes || null,
          status: (f.status === 'draft' || f.status === 'approved') ? f.status : 'approved',
          submitted_by: user.id, approved_by: user.id, approved_at: new Date().toISOString(),
        };
        const inserted = await insertSupabaseTable('buildings', rec);
        return sendJson(res, 200, { ok: true, id: (Array.isArray(inserted) && inserted[0] && inserted[0].id) || id });
      }
      if (urlPath === '/api/admin/archive-building') {
        if (!body.buildingId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        // Reversible: archive hides from public listings + pickers; data is kept.
        const status = body.restore ? 'approved' : 'archived';
        await sbPatch('buildings', `id=eq.${encodeURIComponent(body.buildingId)}`, { status });
        await sbPatch('units', `building_id=eq.${encodeURIComponent(body.buildingId)}`, { status });
        return sendJson(res, 200, { ok: true, status });
      }
      if (urlPath === '/api/admin/reject-listing') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        const reasonCode = REJECTION_REASONS.includes(body.reasonCode) ? body.reasonCode : (body.reasonCode ? 'Other' : null);
        const note = String(body.reason || body.note || '').slice(0, 500);
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reasonCode, review_note: note });
        const reasonText = [reasonCode, note].filter(Boolean).join(reasonCode && note ? ' — ' : '');
        await sendApprovalEmail(row.email, row.name, row.payload && row.payload.building, false, reasonText);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/approve-batch-row') {
        const row = (await sbGet(`listing_batch_rows?id=eq.${body.rowId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await approveBatchRowRec(row, user.id);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reject-batch-row') {
        const reasonCode = REJECTION_REASONS.includes(body.reasonCode) ? body.reasonCode : (body.reasonCode ? 'Other' : null);
        const note = String(body.reason || body.note || '').slice(0, 500);
        const errText = [reasonCode, note].filter(Boolean).join(' — ') || 'rejected by admin';
        await sbPatch('listing_batch_rows', `id=eq.${body.rowId}`, { status: 'rejected', review_reason: reasonCode, review_note: note, reviewed_by: user.id, reviewed_at: new Date().toISOString(), errors: [errText] });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/approve-valid-batch') {
        const rows = await sbGet(`listing_batch_rows?batch_id=eq.${body.batchId}&status=eq.pending_review&select=*`);
        let n = 0; for (const row of rows) { await approveBatchRowRec(row, user.id); n++; }
        return sendJson(res, 200, { ok: true, approved: n });
      }
      if (urlPath === '/api/admin/approve-membership') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        const p = row.payload || {}, tier = p.requestedTier || body.tier;
        if (p.companyId && tier) await sbUpsert('company_subscriptions', [{ company_id: p.companyId, tier, status: 'active', requested_by: user.id }]);
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() });
        await sendMembershipDecisionEmail(row.email, row.name, tier, true);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reject-membership') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: String(body.reason || '').slice(0, 500) });
        await sendMembershipDecisionEmail(row.email, row.name, (row.payload || {}).requestedTier, false);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/set-tier') {
        if (!body.companyId || !MEMBERSHIP_TIERS.includes(body.tier)) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        await sbUpsert('company_subscriptions', [{ company_id: body.companyId, tier: body.tier, status: 'active', requested_by: user.id }]);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/unpublish-building') {
        if (!body.buildingId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        await sbPatch('buildings', `id=eq.${body.buildingId}`, { status: String(body.status || 'draft') });
        await sbPatch('units', `building_id=eq.${body.buildingId}`, { status: String(body.status || 'draft') });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reopen-listing') {
        if (!body.requestId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'pending', review_note: null });
        return sendJson(res, 200, { ok: true });
      }
      // ── Reveal / listing access grants ───────────────────────────────────
      if (urlPath === '/api/admin/approve-reveal') {
        if (!body.grantId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const g = (await sbGet(`listing_access_grants?id=eq.${body.grantId}&select=*`))[0];
        if (!g) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await sbPatch('listing_access_grants', `id=eq.${body.grantId}`, { status: 'approved', granted_by: user.id, granted_at: new Date().toISOString(), expires_at: body.expiresAt || null, notes: String(body.notes || '').slice(0, 500) || null });
        if (g.request_id) await sbPatch('client_requests', `id=eq.${g.request_id}`, { status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() });
        try { const au = await listAuthUsers(); const u = au.find((x) => x.id === g.user_id); const b = (await sbGet(`buildings?id=eq.${encodeURIComponent(g.building_id)}&select=name,market`))[0] || {}; if (u && u.email) await sendRevealDecisionEmail(u.email, b.name, b.market, true); } catch (e) {}
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reject-reveal') {
        if (!body.grantId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const g = (await sbGet(`listing_access_grants?id=eq.${body.grantId}&select=*`))[0];
        if (!g) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await sbPatch('listing_access_grants', `id=eq.${body.grantId}`, { status: 'rejected', granted_by: user.id, notes: String(body.reason || '').slice(0, 500) || null });
        if (g.request_id) await sbPatch('client_requests', `id=eq.${g.request_id}`, { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: String(body.reason || '').slice(0, 500) });
        try { const au = await listAuthUsers(); const u = au.find((x) => x.id === g.user_id); const b = (await sbGet(`buildings?id=eq.${encodeURIComponent(g.building_id)}&select=name,market`))[0] || {}; if (u && u.email) await sendRevealDecisionEmail(u.email, b.name, b.market, false); } catch (e) {}
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/revoke-grant') {
        if (!body.grantId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        await sbPatch('listing_access_grants', `id=eq.${body.grantId}`, { status: 'revoked', notes: String(body.reason || '').slice(0, 500) || null });
        return sendJson(res, 200, { ok: true });
      }
      // ── Building / unit / media editing ──────────────────────────────────
      if (urlPath === '/api/admin/update-building') {
        if (!body.id) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const allowed = ['name', 'market', 'submarket', 'address', 'google_maps_url', 'grade', 'year_built', 'floors', 'building_height_m', 'total_gla_sqm', 'typical_floorplate_sqm', 'certifications', 'amenities', 'parking_spaces_available', 'parking_arrangement', 'parking_included_in_rent', 'parking_price_per_spot_month', 'visitor_parking_hourly_rate', 'parking_monthly_membership_available', 'parking_monthly_membership_price', 'parking_notes', 'image_url', 'status'];
        const fields = body.fields || {}; const patch = {};
        for (const k of allowed) if (k in fields) patch[k] = fields[k];
        if (!Object.keys(patch).length) return sendJson(res, 400, { ok: false, error: 'no_fields' });
        await sbPatch('buildings', `id=eq.${encodeURIComponent(body.id)}`, patch);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/update-unit') {
        if (!body.id) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const allowed = ['unit_floor', 'size_sqm', 'offering_type', 'fit_out', 'desks', 'meeting_rooms', 'asking_rent', 'currency', 'pricing_basis', 'service_charge', 'service_charge_basis', 'availability_date', 'min_term', 'notes', 'allocated_parking_spaces', 'parking_included', 'unit_parking_price', 'status'];
        const fields = body.fields || {}; const patch = {};
        for (const k of allowed) if (k in fields) patch[k] = fields[k];
        if (!Object.keys(patch).length) return sendJson(res, 400, { ok: false, error: 'no_fields' });
        await sbPatch('units', `id=eq.${encodeURIComponent(body.id)}`, patch);
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/set-media-flags') {
        if (!body.mediaId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const patch = {};
        ['is_public_safe', 'is_main', 'approved_for_public'].forEach((k) => { if (k in body) patch[k] = !!body[k]; });
        if (!Object.keys(patch).length) return sendJson(res, 400, { ok: false, error: 'no_fields' });
        if (patch.is_main === true && body.buildingId) await sbPatch('listing_media', `building_id=eq.${encodeURIComponent(body.buildingId)}&id=neq.${body.mediaId}`, { is_main: false });
        await sbPatch('listing_media', `id=eq.${body.mediaId}`, patch);
        return sendJson(res, 200, { ok: true });
      }
      // ── Construction / CAPEX inputs ──────────────────────────────────────
      if (urlPath === '/api/admin/save-construction-costs') {
        if (!body.market || !body.currency) return sendJson(res, 400, { ok: false, error: 'market_currency_required' });
        const numFields = ['shell_core_to_cat_a_per_sqm', 'cat_a_to_cat_b_per_sqm', 'fitout_basic_per_sqm', 'fitout_standard_per_sqm', 'fitout_premium_per_sqm', 'furniture_per_workstation', 'it_av_per_workstation', 'professional_fees_pct', 'contingency_pct', 'reinstatement_per_sqm', 'moving_cost_allowance'];
        const rec = { market: String(body.market), currency: String(body.currency), effective_date: dateOrNull(body.effective_date), notes: String(body.notes || '').slice(0, 1000) || null, updated_by: user.id, updated_at: new Date().toISOString() };
        numFields.forEach((k) => { rec[k] = numOrNull(body[k]); });
        const inserted = await insertSupabaseTable('market_construction_costs', rec);
        return sendJson(res, 200, { ok: true, id: Array.isArray(inserted) && inserted[0] ? inserted[0].id : null });
      }
      return sendJson(res, 404, { ok: false, error: 'unknown_admin_endpoint' });
    } catch (e) {
      console.error('[admin] error:', (e && e.stack) || e);
      return sendJson(res, 500, { ok: false, error: 'admin_error', detail: String((e && e.message) || e).slice(0, 200) });
    }
  })();
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

// ── Public listings (anonymized by default; reveal via access grants) ────────
// Sensitive identity (name, address, maps pin, operator/contact, raw photos,
// floorplans) is NEVER sent unless the caller has an approved listing_access_grant.
// Enforced server-side with the service role — the anon key cannot read these
// tables directly (RLS read policies were dropped in the prod-2 migration).
function anonLabel(b) {
  const mkt = marketName(b.market) || b.market || '';
  const g = b.grade ? ('Grade ' + String(b.grade).replace(/^grade\s*/i, '').toUpperCase()) : 'Verified';
  return `Verified ${g} Building${mkt ? ' — ' + mkt : ''}`;
}
function shapeListingServer(b, units, mediaByB, granted) {
  const sizes = units.map((u) => Number(u.size_sqm)).filter((n) => !isNaN(n) && n > 0);
  const rents = units.map((u) => Number(u.asking_rent)).filter((n) => !isNaN(n) && n > 0);
  const cur = (units.find((u) => u.currency) || {}).currency || '';
  const basis = (units.find((u) => u.pricing_basis) || {}).pricing_basis || '';
  const media = mediaByB[b.id] || [];
  const hasPublicImage = media.some((m) => m.approved_for_public);
  const label = anonLabel(b);
  return {
    id: b.id, revealed: !!granted, anonymized: !granted,
    name: granted ? b.name : label, label,
    market: b.market, submarket: b.submarket || '', grade: b.grade || 'A',
    gla: Number(b.total_gla_sqm) || 0, floorplate: Number(b.typical_floorplate_sqm) || 0,
    floors: Number(b.floors) || 0, yearBuilt: Number(b.year_built) || null,
    buildingHeight: b.building_height_m != null ? Number(b.building_height_m) : null,
    availMin: sizes.length ? Math.min(...sizes) : 0, availMax: sizes.length ? Math.max(...sizes) : 0,
    rentMin: rents.length ? Math.min(...rents) : 0, rentMax: rents.length ? Math.max(...rents) : 0,
    rentCurrency: cur, rentUnit: (basis || '').replace(/^per\s+/, ''),
    sustainability: Array.isArray(b.certifications) ? b.certifications : [],
    amenities: Array.isArray(b.amenities) ? b.amenities : [],
    parking: {
      spaces: b.parking_spaces_available != null ? Number(b.parking_spaces_available) : null,
      arrangement: b.parking_arrangement || '', includedInRent: b.parking_included_in_rent || '',
      pricePerSpotMonth: b.parking_price_per_spot_month != null ? Number(b.parking_price_per_spot_month) : null,
      visitorHourly: b.visitor_parking_hourly_rate != null ? Number(b.visitor_parking_hourly_rate) : null,
      monthlyMembership: !!b.parking_monthly_membership_available,
      monthlyMembershipPrice: b.parking_monthly_membership_price != null ? Number(b.parking_monthly_membership_price) : null,
      notes: granted ? (b.parking_notes || '') : '',
    },
    hasPublicImage, image: hasPublicImage ? ('/api/listing-image?b=' + encodeURIComponent(b.id)) : null,
    address: granted ? (b.address || '') : '', mapsUrl: granted ? (b.google_maps_url || '') : '',
    units: units.map((u) => ({ id: u.id, floor: u.unit_floor, size: Number(u.size_sqm) || 0, desks: Number(u.desks) || 0, meetingRooms: Number(u.meeting_rooms) || 0, rent: Number(u.asking_rent) || 0, type: u.offering_type, fitOut: u.fit_out || '' })),
  };
}
async function approvedGrantsFor(userId) {
  const set = new Set();
  if (!userId) return set;
  try {
    const grants = await sbGet(`listing_access_grants?user_id=eq.${userId}&status=eq.approved&select=building_id,expires_at`);
    const now = Date.now();
    grants.forEach((g) => { if (!g.expires_at || new Date(g.expires_at).getTime() > now) set.add(g.building_id); });
  } catch (e) {}
  return set;
}
// Create a short-lived signed URL for a private storage object (service role).
async function signStorageUrl(bucket, objectPath, expiresIn = 3600) {
  const base = process.env.SUPABASE_URL;
  if (!base || !bucket || !objectPath) return null;
  if (bucket === 'external') return objectPath; // batch rows store the public URL as the path
  try {
    const body = JSON.stringify({ expiresIn });
    const enc = String(objectPath).split('/').map(encodeURIComponent).join('/');
    const r = await httpsRequest(`${base.replace(/\/$/, '')}/storage/v1/object/sign/${bucket}/${enc}`, { method: 'POST', headers: { ...sbHeaders(), 'Content-Length': Buffer.byteLength(body) } }, body);
    if (r.status < 200 || r.status >= 300) return null;
    const j = JSON.parse(r.body || '{}');
    const signed = j.signedURL || j.signedUrl;
    return signed ? (base.replace(/\/$/, '') + '/storage/v1' + signed) : null;
  } catch (e) { return null; }
}

function handlePublicListings(req, res) {
  (async () => {
    try {
      const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      let grantedIds = new Set();
      if (token) { const user = await getAuthUser(token); if (user && user.id) grantedIds = await approvedGrantsFor(user.id); }
      const [buildings, units, media] = await Promise.all([
        sbGet('buildings?status=eq.approved&select=*'),
        sbGet('units?status=eq.approved&select=*'),
        // Isolated: if the media flag columns don't exist yet (pre-migration),
        // don't blank the whole listing set — just treat as no public images.
        sbGet('listing_media?select=building_id,approved_for_public,is_main').catch(() => []),
      ]);
      const unitsByB = {}; units.forEach((u) => { (unitsByB[u.building_id] = unitsByB[u.building_id] || []).push(u); });
      const mediaByB = {}; media.forEach((m) => { (mediaByB[m.building_id] = mediaByB[m.building_id] || []).push(m); });
      const out = buildings.map((b) => shapeListingServer(b, unitsByB[b.id] || [], mediaByB, grantedIds.has(b.id)));
      return sendJson(res, 200, { ok: true, buildings: out });
    } catch (e) { console.error('[api/listings]', e.message); return sendJson(res, 200, { ok: true, buildings: [] }); }
  })();
}

// 302 → signed URL of the public-safe main image. Only approved_for_public media
// is ever signed here, so no auth is required and nothing private leaks.
function handleListingImage(req, res) {
  (async () => {
    try {
      const u = new URL(req.url, 'http://x'); const bId = u.searchParams.get('b');
      if (!bId) { res.writeHead(400); return res.end(); }
      const media = await sbGet(`listing_media?building_id=eq.${encodeURIComponent(bId)}&approved_for_public=eq.true&select=bucket,path,is_main,created_at&order=is_main.desc,created_at.asc`);
      const m = media[0];
      if (!m) { res.writeHead(404); return res.end(); }
      const signed = await signStorageUrl(m.bucket, m.path, 3600);
      if (!signed) { res.writeHead(404); return res.end(); }
      res.writeHead(302, { Location: signed, 'Cache-Control': 'private, max-age=600' }); return res.end();
    } catch (e) { res.writeHead(404); return res.end(); }
  })();
}

// Full media gallery (signed URLs). Public-safe images for everyone; the complete
// set only for admins or users with an approved grant for that building.
function handleListingMedia(req, res) {
  (async () => {
    try {
      const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      const user = await getAuthUser(token);
      const u = new URL(req.url, 'http://x'); const bId = u.searchParams.get('b');
      if (!bId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
      let admin = false, granted = false;
      if (user && user.id) {
        admin = await isAdmin(user.id);
        if (!admin) { const set = await approvedGrantsFor(user.id); granted = set.has(bId); }
      }
      const canSeeAll = admin || granted;
      const filter = canSeeAll ? '' : '&approved_for_public=eq.true';
      const media = await sbGet(`listing_media?building_id=eq.${encodeURIComponent(bId)}&select=id,bucket,path,kind,is_main,approved_for_public${filter}`);
      const out = [];
      for (const m of media) { const url = await signStorageUrl(m.bucket, m.path, 3600); if (url) out.push({ id: m.id, kind: m.kind, isMain: !!m.is_main, publicSafe: !!m.approved_for_public, url }); }
      return sendJson(res, 200, { ok: true, media: out, revealed: canSeeAll });
    } catch (e) { return sendJson(res, 200, { ok: true, media: [], revealed: false }); }
  })();
}

// Branded emails for in-app listing requests (reveal / site-visit / offer / intro).
async function sendListingRequestEmails(type, info, payload, requestId, createdAt) {
  const requestsFrom = process.env.REQUESTS_FROM || process.env.LEAD_FROM;
  const noReplyFrom = process.env.NO_REPLY_FROM || process.env.LEAD_FROM;
  const label = IN_APP_LABELS[type] || 'Request';
  const mkt = marketName(info.market) || info.market || '';
  // Admin notification — admins may see the real building identity.
  const adminRows = emailRow('Type', label) + emailRow('User', info.name) + emailRow('Email', info.email) +
    emailRow('Company', info.company) + emailRow('Building', info.buildingName) + emailRow('Market', mkt) +
    (payload.unitId ? emailRow('Unit', payload.unitId) : '') +
    (payload.proposedDate ? emailRow('Proposed date/time', payload.proposedDate) : '') +
    (payload.offerAmount != null ? emailRow('Offer amount', String(payload.offerAmount)) : '') +
    (payload.offerTerms ? emailRow('Offer terms', payload.offerTerms) : '') +
    (Array.isArray(payload.requestedFields) && payload.requestedFields.length ? emailRow('Fields requested', payload.requestedFields.join(', ')) : '') +
    (payload.message ? emailRow('Message', payload.message) : '');
  const adminInner = emailSection(label, adminRows) + emailSection('Reference', emailRow('Reference', requestId) + emailRow('Building ID', payload.buildingId));
  try {
    await sendResendEmail({
      subject: `${label}: ${info.buildingName || ''} — ${info.company || info.email || ''}`,
      html: emailShell('New ' + label, type === 'offer' ? 'Offer' : 'Request', adminInner),
      text: `${label}\nUser: ${info.name || '—'} (${info.email || '—'})\nCompany: ${info.company || '—'}\nBuilding: ${info.buildingName || '—'}\nMarket: ${mkt}`,
      from: requestsFrom, replyTo: info.email || undefined,
    });
  } catch (e) { console.error('[listing-request] admin email:', e.message); }
  // User confirmation — anonymized, does NOT reveal the building identity.
  if (info.email) {
    const anon = `verified building${mkt ? ' in ' + mkt : ''}`;
    const uInner = `<tr><td style="padding:20px 24px 4px;"><p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(info.name || 'there')},</p><p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">We&#39;ve received your ${escapeHtml(label.toLowerCase())} for a ${escapeHtml(anon)}. Our team will review it and follow up shortly.</p></td></tr>` +
      emailSection('Your request', emailRow('Request', label) + emailRow('Market', mkt) + (payload.proposedDate ? emailRow('Proposed date/time', payload.proposedDate) : '') + (payload.offerAmount != null ? emailRow('Offer amount', String(payload.offerAmount)) : '')) +
      emailSection('Reference', emailRow('Reference', requestId) + emailRow('Submitted', createdAt || new Date().toISOString()));
    try { await sendResendEmail({ subject: `URBN Offices — ${label} received`, html: emailShell(label + ' received', 'Received', uInner), text: `Hi ${info.name || 'there'},\n\nWe received your ${label.toLowerCase()}. Our team will follow up shortly.\n\nReference: ${requestId || '—'}\n\n— URBN Offices`, from: noReplyFrom, to: info.email }); }
    catch (e) { console.error('[listing-request] user email:', e.message); }
  }
}

function handleListingRequest(req, res) {
  (async () => {
    const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const user = await getAuthUser(token);
    if (!user || !user.id) return sendJson(res, 401, { ok: false, error: 'not_authenticated' });
    const data = await readJsonBody(req);
    if (!data) return sendJson(res, 400, { ok: false, error: 'invalid_json' });
    const type = String(data.type || '');
    if (!IN_APP_REQUEST_TYPES.includes(type)) return sendJson(res, 400, { ok: false, error: 'invalid_type' });
    const buildingId = String(data.buildingId || '').slice(0, 200);
    if (!buildingId) return sendJson(res, 400, { ok: false, error: 'building_required' });
    try {
      const b = (await sbGet(`buildings?id=eq.${encodeURIComponent(buildingId)}&select=id,market,status,name`))[0];
      if (!b || b.status !== 'approved') return sendJson(res, 404, { ok: false, error: 'building_not_found' });
      const prof = (await sbGet(`profiles?id=eq.${user.id}&select=full_name,company_id`))[0] || {};
      let companyName = '';
      if (prof.company_id) { const c = (await sbGet(`companies?id=eq.${prof.company_id}&select=name`))[0]; companyName = (c && c.name) || ''; }
      const s = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v))).slice(0, 2000);
      const payload = {
        userId: user.id, companyId: prof.company_id || null, buildingId, unitId: s(data.unitId) || null,
        proposedDate: s(data.proposedDate) || null, offerAmount: data.offerAmount != null && data.offerAmount !== '' ? (Number(data.offerAmount) || null) : null,
        offerTerms: s(data.offerTerms) || null, requestedFields: Array.isArray(data.requestedFields) ? data.requestedFields.slice(0, 30).map((x) => String(x).slice(0, 60)) : null,
        message: s(data.message) || null,
      };
      const row = { request_type: type, source_page: s(data.sourcePage) || null, name: prof.full_name || null, email: user.email || null, company: companyName || null, market: b.market || null, message: payload.message, payload, status: 'pending' };
      const inserted = await insertSupabase(row);
      const requestId = (Array.isArray(inserted) && inserted[0] && inserted[0].id) || null;
      const createdAt = (Array.isArray(inserted) && inserted[0] && inserted[0].created_at) || null;
      if (type === 'reveal-listing') {
        try { await insertSupabaseTable('listing_access_grants', [{ user_id: user.id, company_id: prof.company_id || null, building_id: buildingId, unit_id: payload.unitId, request_id: requestId, status: 'requested' }]); }
        catch (e) { console.error('[listing-request] grant insert:', e.message); }
      }
      try { await sendListingRequestEmails(type, { name: prof.full_name, email: user.email, company: companyName, market: b.market, buildingName: b.name }, payload, requestId, createdAt); }
      catch (e) { console.error('[listing-request] email:', e.message); }
      return sendJson(res, 200, { ok: true, requestId });
    } catch (e) { console.error('[listing-request]', e.message); return sendJson(res, 500, { ok: false, error: 'server_error', detail: String(e.message || '').slice(0, 200) }); }
  })();
}

// Building inventory picker for the (signed-in) List Your Building form, so an
// uploader can attach a unit to a building already in inventory instead of
// re-entering its details. Requires authentication. Returns building-level
// descriptive fields used to prefill the form. Excludes archived buildings.
function handleBuildingsPicker(req, res) {
  (async () => {
    try {
      const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      const user = await getAuthUser(token);
      if (!user || !user.id) return sendJson(res, 401, { ok: false, error: 'not_authenticated' });
      const rows = await sbGet('buildings?status=eq.approved&order=name.asc&select=id,name,market,submarket,address,google_maps_url,grade,year_built,floors,building_height_m,total_gla_sqm,typical_floorplate_sqm,certifications,amenities,parking_spaces_available,parking_arrangement,parking_included_in_rent,parking_price_per_spot_month,visitor_parking_hourly_rate,parking_monthly_membership_price,parking_notes');
      return sendJson(res, 200, { ok: true, buildings: rows });
    } catch (e) { return sendJson(res, 200, { ok: true, buildings: [] }); }
  })();
}

// Latest construction-cost inputs per market (used by the Stay vs Go tool).
function handleConstructionCosts(req, res) {
  let market = null;
  (async () => {
    try {
      const u = new URL(req.url, 'http://x'); market = u.searchParams.get('market');
      if (market) {
        const rows = await sbGet(`market_construction_costs?market=eq.${encodeURIComponent(market)}&order=effective_date.desc.nullslast,created_at.desc&limit=1&select=*`);
        return sendJson(res, 200, { ok: true, market, costs: rows[0] || null });
      }
      const rows = await sbGet('market_construction_costs?order=market.asc,effective_date.desc.nullslast,created_at.desc&select=*');
      const latest = {}; rows.forEach((r) => { if (!latest[r.market]) latest[r.market] = r; });
      return sendJson(res, 200, { ok: true, costs: Object.values(latest) });
    } catch (e) { return sendJson(res, 200, { ok: true, costs: market ? null : [] }); }
  })();
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

  // Public/anonymized listings + controlled media + in-app listing requests.
  if (urlPath === '/api/listings') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handlePublicListings(req, res);
  }
  if (urlPath === '/api/buildings-picker') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleBuildingsPicker(req, res);
  }
  if (urlPath === '/api/listing-image') return handleListingImage(req, res);
  if (urlPath === '/api/listing-media') return handleListingMedia(req, res);
  if (urlPath === '/api/listing-request') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleListingRequest(req, res);
  }
  if (urlPath === '/api/construction-costs') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleConstructionCosts(req, res);
  }

  if (urlPath.startsWith('/api/admin/')) {
    return handleAdmin(req, res, urlPath);
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
      // Controlled vocab shared by the listing form + admin console.
      amenityOptions: AMENITY_OPTIONS,
      parkingArrangements: PARKING_ARRANGEMENTS,
      parkingIncluded: PARKING_INCLUDED,
      rejectionReasons: REJECTION_REASONS,
    });
  }

  // Path-based routing only. The whole app — public site, signed-in portal and
  // admin console — is served from the single main domain (urbnoffices.com).
  // There is NO subdomain/host-aware behavior: admin access is enforced
  // server-side via the admin_users lookup in the /api/admin layer, never by host.
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
