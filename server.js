const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
  '.csv': 'text/csv', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webp': 'image/webp',
};

// ── Clean URL routing ────────────────────────────────────────────────────────
// Every page is reachable at a short, extensionless, canonical URL (no ".html",
// no "/pages/..."). The clean path is served internally (200, URL unchanged);
// the underlying file path and any ".html" URL 301-redirect to the clean one so
// there is a single canonical URL per page (good for SEO, no duplicate content).
const ROUTES = {
  '/': '/index.html',
  '/offices': '/pages/search.html',
  '/search': '/pages/search.html',
  '/markets': '/pages/markets.html',
  '/buildings': '/pages/buildings.html',
  '/building': '/pages/building.html',
  '/districts': '/pages/districts.html',
  '/stay-vs-go': '/pages/stay-vs-go.html',
  '/list-building': '/pages/list-building.html',
  '/batch-upload': '/pages/operator/batch-upload.html',
  '/pricing': '/pages/subscription.html',
  '/market-scan': '/pages/market-scan.html',
  '/contact': '/pages/contact.html',
  '/sign-in': '/pages/signin.html',
  '/sign-up': '/pages/signup.html',
  '/account': '/pages/account.html',
  '/saved': '/pages/saved.html',
  '/dashboard': '/pages/dashboards/tenant.html',
  '/admin': '/pages/dashboards/admin.html',
  '/terms': '/pages/terms.html',
  '/privacy': '/pages/privacy.html',
  '/cookies': '/pages/cookies.html',
  '/data-request': '/pages/data-request.html',
  '/documents': '/pages/documents.html',
  // SEO city landing pages
  '/offices-in-cairo': '/pages/markets/cairo.html',
  '/offices-in-addis-ababa': '/pages/markets/addis-ababa.html',
  '/offices-in-casablanca': '/pages/markets/casablanca.html',
  '/offices-in-abidjan': '/pages/markets/abidjan.html',
  '/offices-in-accra': '/pages/markets/accra.html',
  '/offices-in-nairobi': '/pages/markets/nairobi.html',
  '/offices-in-kigali': '/pages/markets/kigali.html',
  '/offices-in-johannesburg': '/pages/markets/johannesburg.html',
  '/offices-in-cape-town': '/pages/markets/cape-town.html',
  // Insights / advisory content
  '/insights': '/pages/insights/index.html',
  '/insights/cost-of-office-space-in-cairo': '/pages/insights/cost-of-office-space-in-cairo.html',
  '/insights/cost-of-office-space-in-addis-ababa': '/pages/insights/cost-of-office-space-in-addis-ababa.html',
  '/insights/cost-of-office-space-in-casablanca': '/pages/insights/cost-of-office-space-in-casablanca.html',
  '/insights/cost-of-office-space-in-abidjan': '/pages/insights/cost-of-office-space-in-abidjan.html',
  '/insights/cost-of-office-space-in-accra': '/pages/insights/cost-of-office-space-in-accra.html',
  '/insights/cost-of-office-space-in-nairobi': '/pages/insights/cost-of-office-space-in-nairobi.html',
  '/insights/cost-of-office-space-in-kigali': '/pages/insights/cost-of-office-space-in-kigali.html',
  '/insights/cost-of-office-space-in-johannesburg': '/pages/insights/cost-of-office-space-in-johannesburg.html',
  '/insights/cost-of-office-space-in-cape-town': '/pages/insights/cost-of-office-space-in-cape-town.html',
};
// Reverse map (file path -> canonical clean path) for 301 redirects. The first
// clean route that points to a file wins as its canonical URL.
const ROUTE_REVERSE = (() => {
  const r = {};
  for (const [clean, file] of Object.entries(ROUTES)) { if (!(file in r)) r[file] = clean; }
  return r;
})();

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
  'privacy-request': 'Data / Privacy Request',
};
// Data-subject request kinds for the GDPR data-request form (/data-request).
const PRIVACY_REQUEST_KINDS = {
  'access': 'Access my data',
  'correction': 'Correct my data',
  'deletion': 'Delete my data / account',
  'withdraw-consent': 'Withdraw consent',
  'object-restrict': 'Object to / restrict processing',
  'question': 'General privacy question',
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
  dakar: 'Dakar', abidjan: 'Abidjan', kigali: 'Kigali',
};
function marketName(id) { return MARKET_NAMES[id] || (id ? String(id) : ''); }
const FRANCOPHONE_WA_MARKETS = ['dakar', 'abidjan', 'bamako', 'ouagadougou', 'lome', 'cotonou', 'niamey'];
// Accept market as a case-insensitive id ("Cairo" -> "cairo") or display name
// ("Cape Town" -> "capetown"); returns the canonical id (or the lowercased input).
function normalizeMarket(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return s;
  if (MARKET_CURRENCY[s] || FRANCOPHONE_WA_MARKETS.includes(s)) return s;
  for (const id in MARKET_NAMES) { if (MARKET_NAMES[id].toLowerCase() === s) return id; }
  return s;
}
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
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding' };
  // Gzip larger JSON payloads (e.g. /api/listings ~400KB -> ~50KB) when accepted.
  if (res._acceptsGzip && body.length > 1024) {
    const gz = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(status, headers);
    return res.end(gz);
  }
  res.writeHead(status, headers);
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

// ── Notification recipient resolution ────────────────────────────────────────
// Single source of truth for where internal notifications go. Each chain ends in
// generic SUPPORT_EMAIL / CONTACT_EMAIL tiers so notifications still have a valid
// recipient even when the dedicated vars are not configured.
//   Admin / upload : ADMIN_NOTIFICATION_EMAIL → LEAD_TO → SUPPORT_EMAIL → CONTACT_EMAIL
//   Privacy / data : PRIVACY_CONTACT_EMAIL → (admin chain above)
const envVal = (v) => { const x = process.env[v]; return (x && String(x).trim()) ? String(x).trim() : ''; };
function adminRecipient() {
  return envVal('ADMIN_NOTIFICATION_EMAIL') || envVal('LEAD_TO') || envVal('SUPPORT_EMAIL') || envVal('CONTACT_EMAIL');
}
function privacyRecipient() {
  return envVal('PRIVACY_CONTACT_EMAIL') || adminRecipient();
}
// Owner/founder notifications (new signup, subscription activated, weekly recap).
// Prefers the configured admin chain; falls back to the owner address so these
// always land even if no *_EMAIL env var is set on the host.
const OWNER_FALLBACK_EMAIL = 'mahmoud.nassef@urbnoffices.com';
function ownerRecipient() { return adminRecipient() || OWNER_FALLBACK_EMAIL; }
// Send a branded internal notification to the site owner. Best-effort — never
// throws into the caller (owner alerts must not break the underlying action).
async function notifyOwner(subject, badge, innerRowsHtml, title) {
  try {
    const inner = `<tr><td style="padding:8px 0 2px;"></td></tr>` + innerRowsHtml;
    const html = emailShell(title || subject, badge, inner, true);
    await sendResendEmail({
      subject, html, text: subject,
      from: process.env.REQUESTS_FROM || process.env.LEAD_FROM,
      to: ownerRecipient(),
    });
    return true;
  } catch (e) { console.error('[notifyOwner]', e.message); return false; }
}

async function sendResendEmail({ subject, text, html, replyTo, from, to }) {
  const key = process.env.RESEND_API_KEY;
  const fromAddr = from || process.env.LEAD_FROM;
  // Admin/internal notifications (no explicit `to`) resolve through the admin chain.
  // User-facing mail (confirmations) passes `to` explicitly.
  const toAddr = to || adminRecipient();
  if (!key || !fromAddr) throw new Error('resend_env_missing:credentials');
  if (!toAddr) {
    // No recipient anywhere in the chain — never crash the request; warn loudly so
    // it surfaces in logs and the admin dashboard diagnostic.
    console.warn('[email] WARNING: no notification recipient configured (set ADMIN_NOTIFICATION_EMAIL or LEAD_TO). Email NOT sent — subject:', subject);
    throw new Error('resend_env_missing:recipient');
  }
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
// internal=true → admin/internal notifications only (adds a "do not forward" footer).
// Default (external) is used for all user-facing confirmations, which must NEVER
// carry the internal footer. ASCII-only footer text to avoid any encoding issues.
function emailShell(headerTitle, badge, inner, internal = false) {
  const footer = internal
    ? 'URBN internal notification - do not forward externally.'
    : 'This is an automated message from URBN Offices.';
  return `<div style="background:#F7F8F9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;width:100%;background:#ffffff;border:1px solid #E6E8EB;border-radius:6px;overflow:hidden;">
      <tr><td style="background:#243A5E;padding:20px 24px;">
        <div style="color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(headerTitle)}</div>
        ${badge ? `<div style="margin-top:8px;"><span style="display:inline-block;background:#C2A36B;color:#1C2E4A;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:3px;">${escapeHtml(badge)}</span></div>` : ''}
      </td></tr>
      ${inner}
      <tr><td style="padding:14px 24px;background:#F7F8F9;color:#9CA3AF;font-size:11px;border-top:1px solid #E6E8EB;">${footer}</td></tr>
    </table>
  </div>`;
}
function rawPayloadRow(payload) {
  return `<tr><td style="padding:6px 24px 18px;"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Raw payload (technical)</div><pre style="background:#F0F1F3;border:1px solid #E6E8EB;padding:10px;font-size:10px;color:#6B7280;white-space:pre-wrap;word-break:break-word;border-radius:4px;margin:0;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre></td></tr>`;
}

// Human-readable summary of a unit's facilities object {feature:true, bathrooms_count, other_note}.
function formatUnitAmenities(ua) {
  if (!ua || typeof ua !== 'object') return '';
  const parts = [];
  Object.keys(ua).forEach((k) => {
    if (k === 'bathrooms_count' || k === 'other_note') return;
    if (ua[k] === true) parts.push((k === 'Bathrooms' && ua.bathrooms_count != null) ? `Bathrooms (${ua.bathrooms_count})` : k);
  });
  if (ua.other_note) parts.push('Other: ' + ua.other_note);
  return parts.join(', ');
}
function buildListingEmail(data, payload, requestId, createdAt) {
  const mkt = marketName(data.market) || (data.market || '');
  const building = data.building || '(no name)';
  const uploader = data.name || data.email || 'A user';
  const toExisting = !!(data.existingBuildingId || payload && payload.existingBuildingId);
  const subject = toExisting
    ? `${uploader} added a new space to an existing building — ${building} (${mkt || 'no market'})`
    : `${uploader} uploaded a new building — ${building} (${mkt || 'no market'})`;
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
      (toExisting ? emailRow('Submission type', '<strong>New space for an existing building</strong> — building details unchanged; only the unit/space below is new.', true) : emailRow('Submission type', 'New building')) +
      emailRow('Building', data.building) + emailRow('Market', mkt) + emailRow('District', data.district) +
      emailRow('Google Maps', mapsCell, true) + emailRow('Floor / Range', data.floor)) +
    emailSection('Space & Offering',
      emailRow('Fit-out Condition', data.fitOut) + emailRow('Offering Type', data.offeringType) +
      emailRow('Area (sqm)', data.area) + emailRow('Desks / Seats', data.seats) +
      emailRow('Unit facilities', formatUnitAmenities(data.unitAmenities))) +
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
      emailRow('Review', '<a href="https://urbnoffices.com/admin?tab=pending" style="color:#243A5E;">Open in admin console &rarr;</a>', true) +
      emailRow('Supabase Request ID', requestId) + emailRow('Source Page', data.sourcePage) + emailRow('Submitted', ts)) +
    rawPayloadRow(payload);

  const html = emailShell('New List Your Building Request', 'Pending Review', inner, true);
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

// opts.title overrides the header (use when label already ends in a noun like
// "Request" to avoid "... Request Request"); opts.heading overrides the section
// label; opts.badge sets the header badge. Always an internal/admin email.
function buildGenericEmail(label, fields, payload, opts = {}) {
  const title = opts.title || ('New ' + label + ' Request');
  const heading = opts.heading || (label + ' Details');
  const entries = Object.entries(fields).filter(([, v]) => v != null && v !== '');
  const inner = emailSection(heading, entries.map(([k, v]) => emailRow(k, v)).join('')) + (payload ? rawPayloadRow(payload) : '');
  const html = emailShell(title, opts.badge || null, inner, true);
  const text = `${title.toUpperCase()}\n\n` + entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  return { html, text };
}

function buildMembershipAdminEmail(data, payload) {
  const inner = emailSection('Membership Request',
    emailRow('Name', data.name) + emailRow('Email', data.email) + emailRow('Company', data.company) +
    emailRow('Current Tier', data.currentTier) + emailRow('Requested Tier', data.requestedTier)) + rawPayloadRow(payload);
  return {
    subject: `Membership request: ${data.requestedTier || '?'} — ${data.company || data.email || ''}`,
    html: emailShell('New Membership Request', 'Membership Requested', inner, true),
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
  if (type === 'privacy-request') {
    const kind = (PRIVACY_REQUEST_KINDS && PRIVACY_REQUEST_KINDS[data.requestKind]) || data.requestKind || '';
    return emailRow('Request type', kind) + emailRow('Name', data.name) + emailRow('Email', data.email) +
      (data.company ? emailRow('Company', data.company) : '') +
      (data.message ? emailRow('Message', data.message) : '');
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
    'privacy-request': { thing: 'a data / privacy request', title: 'Privacy request received', badge: 'Received' },
  };
  const m = map[type] || map['access'];
  const hi = name || (data && data.name) || 'there';
  // ASCII-safe body copy (HTML uses &#39; for the apostrophe; plain text uses ').
  const bodyHtml = type === 'privacy-request'
    ? 'Thanks, we&#39;ve received your data / privacy request. Our team will review it and follow up if needed.'
    : `You&#39;ve recently submitted ${escapeHtml(m.thing)} through URBN Offices. Below are the details of your request. Our team will review it and follow up shortly.`;
  const bodyText = type === 'privacy-request'
    ? "Thanks, we've received your data / privacy request. Our team will review it and follow up if needed."
    : `You've recently submitted ${m.thing} through URBN Offices. Our team will review it and follow up shortly.`;
  const intro = `<tr><td style="padding:20px 24px 4px;">
    <p style="font-size:14px;color:#111418;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(hi)},</p>
    <p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0;">${bodyHtml}</p>
  </td></tr>`;
  const inner = intro + emailSection('Your Request', userDetailRows(type, data)) +
    emailSection('Reference', emailRow('Reference', requestId) + emailRow('Submitted', createdAt || new Date().toISOString()));
  const html = emailShell(m.title, m.badge, inner);
  const text = `Hi ${hi},\n\n${bodyText}\n\nReference: ${requestId || '-'}\nSubmitted: ${createdAt || new Date().toISOString()}\n\n- URBN Offices`;
  return { subject: `URBN Offices - ${m.title}`, html, text };
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
    // Data-subject requests may legitimately come from a personal email, so we
    // only require a syntactically valid address; everything else needs corporate.
    if (type === 'privacy-request') { if (!isEmail(email)) errs.push('email'); }
    else if (!isCorporateEmail(email)) errs.push('email');
    if (type === 'privacy-request') {
      if (!PRIVACY_REQUEST_KINDS[s(data.requestKind)]) errs.push('requestKind');
      if (data.privacyConsent !== true) errs.push('privacyConsent');
    }
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
      return sendJson(res, 502, { ok: false, error: 'storage_failed' }); // full error in server logs only
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
      let adminMail, adminFrom, adminTo;
      if (type === 'list-building') {
        adminMail = buildListingEmail(data, payload, requestId, createdAt);
        adminFrom = listingsFrom;
      } else if (type === 'membership' || type === 'membership-change') {
        adminMail = buildMembershipAdminEmail({ name, email, company, currentTier: data.currentTier, requestedTier: data.requestedTier }, payload);
        adminFrom = requestsFrom;
      } else if (type === 'privacy-request') {
        const kind = PRIVACY_REQUEST_KINDS[s(data.requestKind)] || s(data.requestKind);
        const fields = {
          'Request type': kind, Name: name, Email: email, Company: company, Message: message,
          'Reference ID': requestId, 'Submitted': createdAt,
        };
        const g = buildGenericEmail(label, fields, payload, { title: 'New Data / Privacy Request', heading: 'Data / Privacy Request', badge: 'Privacy' });
        adminMail = { subject: `Data / Privacy request (${kind}) - ${name || email}`, html: g.html, text: g.text };
        adminFrom = requestsFrom;
        // Route data-subject requests through the privacy chain (PRIVACY_CONTACT_EMAIL
        // → admin chain). undefined only if nothing is configured anywhere.
        adminTo = privacyRecipient() || undefined;
      } else {
        const fields = { Name: name, Email: email, Company: company, Phone: phone, Market: marketName(market) || market, Area: area, Building: building, Message: message };
        const g = buildGenericEmail(label, fields, payload);
        adminMail = { subject: `New ${label} request — ${company || name || email}`, html: g.html, text: g.text };
        adminFrom = requestsFrom;
      }
      await sendResendEmail({ subject: adminMail.subject, text: adminMail.text, html: adminMail.html, replyTo: email || undefined, from: adminFrom, to: adminTo });

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
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server_error' });
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

// A row describes a UNIT (vs a building-only row) when it carries any unit data.
// Building-only rows can be uploaded without pricing; units cannot.
function rowHasUnit(r) {
  const num = (x) => x !== '' && x != null && !isNaN(Number(x));
  return !!(r.offering_type || r.unit_floor || num(r.size_sqm) || num(r.desks) || num(r.asking_rent) || r.pricing_basis);
}
function validateBatchRow(r) {
  const num = (x) => x !== '' && x != null && !isNaN(Number(x));
  const isUrl = (x) => /^https?:\/\/\S+$/i.test(String(x || '').trim());
  const DESK = ['Coworking desks', 'Serviced office suite'];
  const AREA = ['Whole building', 'Full floor', 'Partial floor', 'Private office'];
  const errs = [];
  // Required (building level)
  if (!r.building_name) errs.push('building_name');
  const market = normalizeMarket(r.market);
  const marketOk = !!MARKET_CURRENCY[market] || FRANCOPHONE_WA_MARKETS.includes(market);
  if (!marketOk) errs.push('market');
  if (!r.submarket) errs.push('submarket');
  // Unit-level requirements only apply when the row actually describes a unit.
  if (rowHasUnit(r)) {
    if (!r.offering_type) errs.push('offering_type');
    if (!r.fit_out) errs.push('fit_out');
    if (!num(r.asking_rent)) errs.push('asking_rent');
    if (marketOk && (!r.currency || !allowedCurrenciesForMarket(market).includes(r.currency))) errs.push('currency');
    if (!r.pricing_basis) errs.push('pricing_basis');
    // Conditional: traditional offerings need size_sqm; coworking/serviced need desks.
    if (DESK.includes(r.offering_type) && !num(r.desks)) errs.push('desks');
    if (AREA.includes(r.offering_type) && !num(r.size_sqm)) errs.push('size_sqm');
  }
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
// Hard DELETE rows. Returns the deleted rows (Prefer: return=representation).
async function sbDelete(table, query) {
  const base = process.env.SUPABASE_URL;
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: { ...sbHeaders(), Prefer: 'return=representation' } });
  if (r.status < 200 || r.status >= 300) throw new Error(`sb_delete_${r.status}:${r.body.slice(0, 200)}`);
  return JSON.parse(r.body || '[]');
}
// Best-effort removal of storage objects (so deleting a building doesn't orphan
// its photos/floorplans). Non-fatal — a storage failure never blocks the DB delete.
async function deleteStorageObjects(bucket, paths) {
  const base = process.env.SUPABASE_URL;
  if (!base || !bucket || bucket === 'external' || !Array.isArray(paths) || !paths.length) return;
  try {
    const body = JSON.stringify({ prefixes: paths });
    await httpsRequest(`${base.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}`, { method: 'DELETE', headers: { ...sbHeaders(), 'Content-Length': Buffer.byteLength(body) } }, body);
  } catch (e) { console.error('[storage delete]', e.message); }
}
// Append-only audit trail for admin destructive/sensitive actions. Best-effort —
// a logging failure must NEVER block or fail the underlying action. Stores no
// secrets; the client IP is salted-hashed (not stored raw).
async function writeAudit(req, user, action, opts = {}) {
  try {
    const ip = clientIp(req);
    const ipHash = (ip && ip !== 'unknown') ? crypto.createHash('sha256').update((process.env.IP_HASH_SALT || '') + ip).digest('hex') : null;
    const ids = Array.isArray(opts.targetIds) ? opts.targetIds.filter(Boolean).slice(0, 1000).map(String) : null;
    await insertSupabaseTable('admin_audit_logs', {
      action,
      actor_id: (user && user.id) || null,
      actor_email: (user && user.email) || null,
      target_type: opts.targetType || null,
      target_ids: ids,
      count: (opts.count != null) ? opts.count : (ids ? ids.length : null),
      success: opts.success !== false,
      ip_hash: ipHash,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
      metadata: opts.metadata || null,
    });
  } catch (e) { console.error('[audit] write failed:', e.message); }
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
const isUuidStr = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
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
// Admin-create a CONFIRMED auth user (no password). The DB trigger handle_new_user
// builds the company/profile/membership/subscription from user_metadata. Returns
// { ok, status, user, body }. Service-role key is used server-side only.
async function createAuthUser(email, metadata) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('supabase_env_missing');
  const body = JSON.stringify({ email, email_confirm: true, user_metadata: metadata || {} });
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, 'Content-Length': Buffer.byteLength(body) },
  }, body);
  let parsed = null; try { parsed = JSON.parse(r.body || '{}'); } catch (e) {}
  return { ok: r.status >= 200 && r.status < 300, status: r.status, user: parsed && (parsed.id ? parsed : parsed.user) || null, body: r.body };
}
// Generate a password-set link (recovery) for an invited user, to be emailed via
// our own Resend pipeline (keeps email routing consistent; no Supabase SMTP needed).
async function generateRecoveryLink(email, redirectTo) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('supabase_env_missing');
  const body = JSON.stringify({ type: 'recovery', email, redirect_to: redirectTo });
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (r.status < 200 || r.status >= 300) return null;
  let j = null; try { j = JSON.parse(r.body || '{}'); } catch (e) {}
  return (j && (j.action_link || (j.properties && j.properties.action_link))) || null;
}
// Hard-delete an auth user (GoTrue admin API, service role). The FK from
// profiles → auth.users cascades the profile; company/subscription rows are
// shared and intentionally left intact. Returns true on success.
async function deleteAuthUser(userId) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !userId) return false;
  const r = await httpsRequest(`${base.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.status >= 200 && r.status < 300;
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
    availability_date: dateOrNull(p.availabilityDate), min_term: p.minTerm || null, notes: row.message || p.message || null,
    unit_amenities: (p.unitAmenities && typeof p.unitAmenities === 'object') ? p.unitAmenities : null,
    status: 'approved', request_id: row.id,
  }]);
  const media = [];
  (Array.isArray(p.photoPaths) ? p.photoPaths : []).forEach((path, i) => media.push({ building_id: bId, bucket: p.mediaBucket || 'listing-media', path, kind: 'photo', uploaded_by: p.submittedBy || null, is_main: i === 0 }));
  if (p.floorplanPath) media.push({ building_id: bId, bucket: p.mediaBucket || 'listing-media', path: p.floorplanPath, kind: 'floorplan', uploaded_by: p.submittedBy || null });
  if (media.length) { try { await insertSupabaseTable('listing_media', media); } catch (e) { console.error('[admin] media:', e.message); } }
  await sbPatch('client_requests', `id=eq.${row.id}`, { status: 'approved', reviewed_by: adminId, reviewed_at: now });
}

// Approve a batch row (external media URLs) -> buildings + units + listing_media.
// Stable building id from a grouping key, so multiple unit-rows of the SAME
// building collapse into one building (instead of one building per row). Uses an
// explicit `building_ref` column when present, else building_name|market|submarket.
function buildingKeyId(r) {
  const key = (r.building_ref && String(r.building_ref).trim())
    || [r.building_name, r.market, r.submarket].map((x) => String(x || '').trim().toLowerCase()).join('|');
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (((h * 33) ^ key.charCodeAt(i)) >>> 0);
  return 'b_' + h.toString(36);
}
async function approveBatchRowRec(row, adminId) {
  const r = row.raw || {}, now = new Date().toISOString();
  // If the row carries an existing building_id / unit_id (e.g. from an exported
  // inventory CSV that was edited in Excel), upsert THOSE records — so a re-upload
  // updates in place instead of creating duplicates. Otherwise create new.
  const bId = (r.building_id && String(r.building_id).trim()) || buildingKeyId(r);
  const uId = (r.unit_id && String(r.unit_id).trim()) || ('u_' + row.id);
  await sbUpsert('buildings', [{
    id: bId, name: r.building_name || 'Untitled', market: normalizeMarket(r.market) || null, submarket: r.submarket || null, address: r.address || null,
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
  // Only create a unit when the row actually describes one — building-only rows
  // (no pricing/unit data) add the building alone; units/prices can be added later.
  if (rowHasUnit(r)) {
    await sbUpsert('units', [{
      id: uId, building_id: bId, unit_floor: r.unit_floor || null, size_sqm: numOrNull(r.size_sqm), offering_type: r.offering_type || null,
      fit_out: r.fit_out || null, desks: numOrNull(r.desks), meeting_rooms: numOrNull(r.meeting_rooms), asking_rent: numOrNull(r.asking_rent),
      currency: r.currency || null, pricing_basis: r.pricing_basis || null, service_charge: numOrNull(r.service_charge),
      service_charge_basis: r.service_charge_basis || null, availability_date: dateOrNull(r.availability_date), min_term: r.minimum_term || null, notes: r.notes || null, status: 'approved',
    }]);
  }
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
      if (req.method === 'GET' && urlPath === '/api/admin/email-config') {
        // Diagnostic: report which email env vars EXIST (boolean only — never values).
        const has = (v) => !!envVal(v);
        return sendJson(res, 200, { ok: true,
          present: {
            RESEND_API_KEY: has('RESEND_API_KEY'),
            LEAD_FROM: has('LEAD_FROM'), LEAD_TO: has('LEAD_TO'),
            ADMIN_NOTIFICATION_EMAIL: has('ADMIN_NOTIFICATION_EMAIL'),
            PRIVACY_CONTACT_EMAIL: has('PRIVACY_CONTACT_EMAIL'),
            SUPPORT_EMAIL: has('SUPPORT_EMAIL'), CONTACT_EMAIL: has('CONTACT_EMAIL'),
            LISTINGS_FROM: has('LISTINGS_FROM'), REQUESTS_FROM: has('REQUESTS_FROM'), NO_REPLY_FROM: has('NO_REPLY_FROM'),
          },
          // Effective routing readiness (no addresses revealed).
          canSendEmail: has('RESEND_API_KEY') && has('LEAD_FROM'),
          adminRecipientConfigured: !!adminRecipient(),
          privacyRecipientConfigured: !!privacyRecipient(),
        });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/pending-listings') {
        const listings = await sbGet(`client_requests?request_type=eq.list-building&status=in.(pending,new)&order=created_at.desc`);
        // Sign the uploaded photos/floorplan so the reviewer can SEE them (they
        // live in a private bucket and there are no listing_media rows pre-approval).
        for (const L of listings) {
          const p = L.payload || {}; const bucket = p.mediaBucket || 'listing-media'; const media = [];
          for (const path of (Array.isArray(p.photoPaths) ? p.photoPaths : [])) { const url = await signStorageUrl(bucket, path, 3600); if (url) media.push({ kind: 'photo', url }); }
          if (p.floorplanPath) { const url = await signStorageUrl(bucket, p.floorplanPath, 3600); if (url) media.push({ kind: 'floorplan', url }); }
          L.media = media;
        }
        return sendJson(res, 200, { ok: true, listings });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/listings') {
        const status = (req.url.split('status=')[1] || 'approved').split('&')[0];
        if (status === 'rejected') return sendJson(res, 200, { ok: true, listings: await sbGet(`client_requests?request_type=eq.list-building&status=eq.rejected&order=reviewed_at.desc`) });
        return sendJson(res, 200, { ok: true, buildings: await sbGet(`buildings?status=eq.approved&order=approved_at.desc`) });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/export-listings') {
        // Export the full inventory as a CSV that round-trips through the bulk
        // uploader: same columns as the import template, plus building_id / unit_id
        // so an edited re-upload UPDATES the same records instead of duplicating.
        const EXPORT_COLS = ['building_id', 'unit_id', 'building_ref', 'building_name', 'market', 'submarket', 'address', 'google_maps_url', 'grade', 'year_built', 'floors', 'building_height_m', 'total_gla_sqm', 'typical_floorplate_sqm', 'parking_ratio', 'parking_spaces_available', 'parking_arrangement', 'parking_included_in_rent', 'parking_price_per_spot_month', 'visitor_parking_hourly_rate', 'parking_monthly_membership_available', 'parking_monthly_membership_price', 'parking_notes', 'certifications', 'amenities', 'main_photo_url', 'unit_floor', 'size_sqm', 'offering_type', 'fit_out', 'desks', 'meeting_rooms', 'asking_rent', 'currency', 'pricing_basis', 'service_charge', 'service_charge_basis', 'availability_date', 'minimum_term', 'notes'];
        const csvCell = (v) => { if (v == null) return ''; let s = Array.isArray(v) ? v.join(';') : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const allB = await sbGet('buildings?order=market.asc,name.asc');
        const allU = await sbGet('units?order=building_id.asc,unit_floor.asc');
        const uByB = {}; allU.forEach((u) => { (uByB[u.building_id] = uByB[u.building_id] || []).push(u); });
        const bFields = (b) => ({ building_id: b.id, unit_id: '', building_ref: b.id, building_name: b.name, market: b.market, submarket: b.submarket, address: b.address, google_maps_url: b.google_maps_url, grade: b.grade, year_built: b.year_built, floors: b.floors, building_height_m: b.building_height_m, total_gla_sqm: b.total_gla_sqm, typical_floorplate_sqm: b.typical_floorplate_sqm, parking_ratio: b.parking_ratio, parking_spaces_available: b.parking_spaces_available, parking_arrangement: b.parking_arrangement, parking_included_in_rent: b.parking_included_in_rent, parking_price_per_spot_month: b.parking_price_per_spot_month, visitor_parking_hourly_rate: b.visitor_parking_hourly_rate, parking_monthly_membership_available: b.parking_monthly_membership_available ? 'yes' : 'no', parking_monthly_membership_price: b.parking_monthly_membership_price, parking_notes: b.parking_notes, certifications: b.certifications, amenities: b.amenities, main_photo_url: b.image_url });
        const rows = [];
        for (const b of allB) {
          const us = uByB[b.id] || [];
          if (!us.length) { rows.push(bFields(b)); continue; }
          for (const u of us) rows.push(Object.assign(bFields(b), { unit_id: u.id, unit_floor: u.unit_floor, size_sqm: u.size_sqm, offering_type: u.offering_type, fit_out: u.fit_out, desks: u.desks, meeting_rooms: u.meeting_rooms, asking_rent: u.asking_rent, currency: u.currency, pricing_basis: u.pricing_basis, service_charge: u.service_charge, service_charge_basis: u.service_charge_basis, availability_date: u.availability_date, minimum_term: u.min_term, notes: u.notes }));
        }
        const csv = [EXPORT_COLS.join(',')].concat(rows.map((r) => EXPORT_COLS.map((c) => csvCell(r[c])).join(','))).join('\n');
        return sendJson(res, 200, { ok: true, csv, count: rows.length });
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
        const [profiles, companies, saved, reqs, authUsers, subs, admins, buildings, units] = await Promise.all([
          sbGet('profiles?select=*&order=created_at.desc'), sbGet('companies?select=id,name'),
          sbGet('saved_properties?select=user_id'), sbGet('client_requests?select=email'), listAuthUsers(),
          sbGet('company_subscriptions?select=company_id,tier,status,assigned_market,notes&order=created_at.desc'),
          sbGet('admin_users?select=user_id'), sbGet('buildings?select=id,submitted_by'), sbGet('units?select=building_id'),
        ]);
        const emailById = {}; const authById = {}; authUsers.forEach((u) => { emailById[u.id] = u.email; authById[u.id] = u; });
        const compById = {}; companies.forEach((c) => { compById[c.id] = c.name; });
        const adminSet = new Set((admins || []).map((a) => a.user_id));
        // Listings a user added: buildings they submitted, plus the units inside them.
        const unitsByBuilding = groupCount(units, (u) => u.building_id);
        const bCountByUser = {}, uCountByUser = {};
        (buildings || []).forEach((b) => {
          if (!b.submitted_by) return;
          bCountByUser[b.submitted_by] = (bCountByUser[b.submitted_by] || 0) + 1;
          uCountByUser[b.submitted_by] = (uCountByUser[b.submitted_by] || 0) + (unitsByBuilding[b.id] || 0);
        });
        // Newest ACTIVE subscription per company = the effective tier (matches
        // getUserEntitlements). Falls back to newest row if none active yet.
        const activeSub = {}, anySub = {};
        subs.forEach((s) => {
          if (!anySub[s.company_id]) anySub[s.company_id] = s;
          if (s.status === 'active' && !activeSub[s.company_id]) activeSub[s.company_id] = s;
        });
        const savedByUser = groupCount(saved, (s) => s.user_id);
        const reqByEmail = groupCount(reqs, (r) => (r.email || '').toLowerCase());
        const users = profiles.map((p) => {
          const email = emailById[p.id] || '';
          const sub = activeSub[p.company_id] || anySub[p.company_id] || null;
          const au = authById[p.id] || {};
          return { id: p.id, email, full_name: p.full_name, phone: p.phone || '', company: compById[p.company_id] || '', company_id: p.company_id || null,
            user_type: p.user_type, requested_tier: p.requested_tier, created_at: p.created_at,
            tier: sub ? sub.tier : 'free', tier_status: sub ? sub.status : null, assigned_market: (sub && sub.assigned_market) || null, notes: (sub && sub.notes) || '',
            is_admin: adminSet.has(p.id), last_sign_in_at: au.last_sign_in_at || null,
            buildings_added: bCountByUser[p.id] || 0, units_added: uCountByUser[p.id] || 0,
            requests: reqByEmail[email.toLowerCase()] || 0, saves: savedByUser[p.id] || 0 };
        });
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
      if (req.method === 'GET' && urlPath === '/api/admin/units') {
        // Every unit, with its building context — admin-only (full identity is fine here).
        const [units, buildings] = await Promise.all([
          sbGet('units?select=*&order=created_at.desc'),
          sbGet('buildings?select=id,name,market,submarket,grade'),
        ]);
        const bById = {}; buildings.forEach((b) => { bById[b.id] = b; });
        const out = units.map((u) => {
          const b = bById[u.building_id] || {};
          const source = String(u.id || '').indexOf('u_imp_') === 0 ? 'import' : (u.request_id ? 'submission' : 'admin');
          return {
            id: u.id, building_id: u.building_id, building: b.name || '', market: b.market || '', submarket: b.submarket || '', grade: b.grade || '',
            floor: u.unit_floor || '', size: u.size_sqm != null ? Number(u.size_sqm) : null, desks: u.desks != null ? Number(u.desks) : null,
            meetingRooms: u.meeting_rooms != null ? Number(u.meeting_rooms) : null, rent: u.asking_rent != null ? Number(u.asking_rent) : null,
            currency: u.currency || '', pricingBasis: u.pricing_basis || '', fitOut: u.fit_out || '', offeringType: u.offering_type || '',
            serviceCharge: u.service_charge != null ? Number(u.service_charge) : null, serviceChargeBasis: u.service_charge_basis || '',
            availabilityDate: u.availability_date || '', minTerm: u.min_term || '', notes: u.notes || '',
            status: u.status || '', amenities: u.unit_amenities || null, source, created_at: u.created_at, updated_at: u.updated_at,
          };
        });
        // Buildings reference for the edit modal's reassignment dropdown.
        const blist = buildings.map((b) => ({ id: b.id, name: b.name || '', market: b.market || '', submarket: b.submarket || '' }));
        return sendJson(res, 200, { ok: true, units: out, buildings: blist });
      }
      if (req.method === 'GET' && urlPath === '/api/admin/analytics') {
        const [buildings, units, reqs, subs, saved, profiles, companies, revealGrants, capexRows] = await Promise.all([
          sbGet('buildings?status=eq.approved&select=*'), sbGet('units?status=eq.approved&select=*'),
          sbGet('client_requests?select=*&order=created_at.desc&limit=2000'), sbGet('company_subscriptions?select=company_id,tier,status&order=created_at.desc'),
          sbGet('saved_properties?select=user_id,building_id'), sbGet('profiles?select=id'), sbGet('companies?select=id'),
          sbGet('listing_access_grants?select=building_id,company_id,status').catch(() => []),
          sbGet('market_construction_costs?order=market.asc,effective_date.desc.nullslast,created_at.desc&select=market,effective_date,updated_at').catch(() => []),
        ]);
        // Building view/click tracking (raw opens + unique sessions). Separate query
        // so an empty/absent table never breaks the rest of analytics.
        const views = await sbGet('building_views?select=building_id,session_hash,created_at&order=created_at.desc&limit=50000').catch(() => []);
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
        // Building clicks/views: total opens, unique sessions per building, last 7 days.
        const weekAgoIso = new Date(Date.now() - 7 * 864e5).toISOString();
        const viewsByBuilding = groupCount(views, (v) => v.building_id);
        const uniqSets = {}; views.forEach((v) => { (uniqSets[v.building_id] = uniqSets[v.building_id] || new Set()).add(v.session_hash || v.created_at); });
        const mostViewed = Object.entries(viewsByBuilding).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => ({ building: (bById[id] || {}).name || id, market: (bById[id] || {}).market || '', views: n, uniqueViews: (uniqSets[id] || new Set()).size }));
        const viewsLast7 = views.filter((v) => v.created_at && v.created_at >= weekAgoIso).length;
        return sendJson(res, 200, { ok: true, analytics: {
          supply: { approvedBuildings: buildings.length, approvedUnits: units.length, totalSqm: sum(units.map((u) => Number(u.size_sqm) || 0)), totalDesks: sum(units.map((u) => Number(u.desks) || 0)), listingsByMarket: groupCount(buildings, (b) => b.market), listingsBySubmarket: groupCount(buildings, (b) => b.submarket), listingsByOffering: groupCount(units, (u) => u.offering_type), avgRentByMarket, rentRangeByMarket, pendingBySource: groupCount(listReqs.filter((r) => r.status === 'pending' || r.status === 'new'), (r) => r.source_page) },
          demand: { accessByMarket: groupCount(access, (r) => r.market), scanByMarket: groupCount(scan, (r) => r.market), requestsByCompany: groupCount(reqs, (r) => r.company), latest: reqs.slice(0, 8).map((r) => ({ type: r.request_type, market: r.market, company: r.company, email: r.email, created_at: r.created_at })) },
          engagement: { mostSaved, totalSaves: saved.length, savedByMarket: groupCount(saved, (s) => (bById[s.building_id] || {}).market),
            mostViewed, totalViews: views.length, viewsLast7 },
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
        // Resolve who uploaded the building + each unit (listing). Building has
        // submitted_by (auth id); units carry request_id → the original request.
        const au = await listAuthUsers(); const emailById = {}; au.forEach((u) => { emailById[u.id] = u.email; });
        building.uploaderEmail = emailById[building.submitted_by] || null;
        const reqIds = [...new Set(units.map((u) => u.request_id).filter(Boolean))];
        const reqById = {};
        if (reqIds.length) { try { (await sbGet(`client_requests?id=in.(${reqIds.join(',')})&select=id,email,name`)).forEach((r) => { reqById[r.id] = r; }); } catch (e) {} }
        units.forEach((u) => { const r = reqById[u.request_id]; u.uploaderEmail = (r && r.email) || building.uploaderEmail || null; u.uploaderName = (r && r.name) || null; });
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
        await writeAudit(req, user, 'listing.approve', { targetType: 'request', targetIds: [String(body.requestId)], metadata: { buildingId: body.buildingId || null } });
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
      if (urlPath === '/api/admin/set-building-hidden') {
        // Admin-only soft visibility in the admin Buildings view. Does NOT touch
        // status, so public listings are unaffected. Reversible (filter Hidden/All).
        const ids = Array.isArray(body.buildingIds) ? body.buildingIds.filter(Boolean) : (body.buildingId ? [body.buildingId] : []);
        if (!ids.length) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const hidden = body.hidden === true;
        let n = 0;
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          try { await sbPatch('buildings', `id=in.(${chunk.map((x) => encodeURIComponent(x)).join(',')})`, { admin_hidden: hidden }); n += chunk.length; }
          catch (e) { console.error('[admin/set-building-hidden]', e.message); }
        }
        await writeAudit(req, user, hidden ? 'building.hide' : 'building.unhide', { targetType: 'building', targetIds: ids, count: n });
        return sendJson(res, 200, { ok: true, updated: n, hidden });
      }
      if (urlPath === '/api/admin/delete-buildings') {
        // HARD delete (irreversible). FK ON DELETE CASCADE removes the buildings'
        // units, listing_media rows and reveal grants; unit cascade removes
        // saved_properties; grants.unit_id is SET NULL — so no orphaned rows.
        // The server only ever deletes the EXPLICIT ids sent (no blanket wildcard).
        const ids = Array.isArray(body.buildingIds) ? [...new Set(body.buildingIds.filter(Boolean).map(String))] : [];
        if (!ids.length) return sendJson(res, 400, { ok: false, error: 'no_ids' });
        if (ids.length > 1000) return sendJson(res, 400, { ok: false, error: 'too_many' });
        // Defense-in-depth: deleting more than one building requires the typed token.
        if (ids.length > 1 && body.confirm !== 'DELETE') return sendJson(res, 400, { ok: false, error: 'confirm_required' });
        const idList = ids.map(encodeURIComponent).join(',');
        // Remove storage files first (best-effort) so they don't orphan after the
        // listing_media rows cascade away.
        try {
          const mediaRows = await sbGet(`listing_media?building_id=in.(${idList})&select=bucket,path`).catch(() => []);
          const byBucket = {};
          mediaRows.forEach((m) => { if (m.bucket && m.path && m.bucket !== 'external') (byBucket[m.bucket] = byBucket[m.bucket] || []).push(m.path); });
          for (const bk of Object.keys(byBucket)) await deleteStorageObjects(bk, byBucket[bk]);
        } catch (e) { console.error('[delete-buildings] storage cleanup:', e.message); }
        let deleted = 0;
        try {
          const rows = await sbDelete('buildings', `id=in.(${idList})`);
          deleted = Array.isArray(rows) ? rows.length : 0;
        } catch (e) {
          console.error('[delete-buildings]', e.message);
          await writeAudit(req, user, 'building.delete', { targetType: 'building', targetIds: ids, success: false, metadata: { bulk: ids.length > 1 } });
          return sendJson(res, 502, { ok: false, error: 'delete_failed' });
        }
        await writeAudit(req, user, 'building.delete', { targetType: 'building', targetIds: ids, count: deleted, metadata: { bulk: ids.length > 1 } });
        return sendJson(res, 200, { ok: true, deleted });
      }
      if (urlPath === '/api/admin/delete-units') {
        // HARD delete of UNITS only — the building row is never touched. FK cascade
        // removes saved_properties for the unit; grants.unit_id is SET NULL.
        // listing_media is building-scoped, so building photos are unaffected.
        const ids = Array.isArray(body.unitIds) ? [...new Set(body.unitIds.filter(Boolean).map(String))] : [];
        if (!ids.length) return sendJson(res, 400, { ok: false, error: 'no_ids' });
        if (ids.length > 1000) return sendJson(res, 400, { ok: false, error: 'too_many' });
        if (ids.length > 1 && body.confirm !== 'DELETE') return sendJson(res, 400, { ok: false, error: 'confirm_required' });
        const idList = ids.map(encodeURIComponent).join(',');
        let deleted = 0;
        try { const rows = await sbDelete('units', `id=in.(${idList})`); deleted = Array.isArray(rows) ? rows.length : 0; }
        catch (e) {
          console.error('[delete-units]', e.message);
          await writeAudit(req, user, 'unit.delete', { targetType: 'unit', targetIds: ids, success: false, metadata: { bulk: ids.length > 1 } });
          return sendJson(res, 502, { ok: false, error: 'delete_failed' });
        }
        await writeAudit(req, user, 'unit.delete', { targetType: 'unit', targetIds: ids, count: deleted, metadata: { bulk: ids.length > 1 } });
        return sendJson(res, 200, { ok: true, deleted });
      }
      if (urlPath === '/api/admin/reject-listing') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        const reasonCode = REJECTION_REASONS.includes(body.reasonCode) ? body.reasonCode : (body.reasonCode ? 'Other' : null);
        const note = String(body.reason || body.note || '').slice(0, 500);
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reasonCode, review_note: note });
        const reasonText = [reasonCode, note].filter(Boolean).join(reasonCode && note ? ' — ' : '');
        await sendApprovalEmail(row.email, row.name, row.payload && row.payload.building, false, reasonText);
        await writeAudit(req, user, 'listing.reject', { targetType: 'request', targetIds: [String(body.requestId)], metadata: { reason: reasonCode } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/approve-batch-row') {
        const row = (await sbGet(`listing_batch_rows?id=eq.${body.rowId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await approveBatchRowRec(row, user.id);
        await writeAudit(req, user, 'batch.approve_row', { targetType: 'batch_row', targetIds: [String(body.rowId)] });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reject-batch-row') {
        const reasonCode = REJECTION_REASONS.includes(body.reasonCode) ? body.reasonCode : (body.reasonCode ? 'Other' : null);
        const note = String(body.reason || body.note || '').slice(0, 500);
        const errText = [reasonCode, note].filter(Boolean).join(' — ') || 'rejected by admin';
        await sbPatch('listing_batch_rows', `id=eq.${body.rowId}`, { status: 'rejected', review_reason: reasonCode, review_note: note, reviewed_by: user.id, reviewed_at: new Date().toISOString(), errors: [errText] });
        await writeAudit(req, user, 'batch.reject_row', { targetType: 'batch_row', targetIds: [String(body.rowId)], metadata: { reason: reasonCode } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/approve-valid-batch') {
        const rows = await sbGet(`listing_batch_rows?batch_id=eq.${body.batchId}&status=eq.pending_review&select=*`);
        let n = 0; for (const row of rows) { await approveBatchRowRec(row, user.id); n++; }
        await writeAudit(req, user, 'batch.approve_all', { targetType: 'batch', targetIds: [String(body.batchId)], count: n });
        return sendJson(res, 200, { ok: true, approved: n });
      }
      if (urlPath === '/api/admin/approve-membership') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        const p = row.payload || {}, tier = p.requestedTier || body.tier;
        // Starter is single-market — carry the requested (or admin-overridden) market
        // onto the activated subscription so entitlements scope correctly.
        const assignedMarket = tier === 'starter' ? (normalizeMarket(body.assignedMarket || p.assignedMarket) || null) : null;
        if (p.companyId && tier) await sbUpsert('company_subscriptions', [{ company_id: p.companyId, tier, status: 'active', assigned_market: assignedMarket, requested_by: user.id }]);
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() });
        await sendMembershipDecisionEmail(row.email, row.name, tier, true);
        await notifyOwner('URBN: subscription activated — ' + (tier || 'tier'), 'Subscription',
          emailSection('Subscription activated', emailRow('Tier', tier) + emailRow('Company', row.company || (p.companyName || '')) + emailRow('Contact', row.name) + emailRow('Email', row.email) + emailRow('Market', assignedMarket || 'all') + emailRow('Via', 'Approved membership request')),
          'Subscription activated');
        await writeAudit(req, user, 'membership.approve', { targetType: 'request', targetIds: [String(body.requestId)], metadata: { companyId: p.companyId || null, tier, assignedMarket } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reject-membership') {
        const row = (await sbGet(`client_requests?id=eq.${body.requestId}&select=*`))[0];
        if (!row) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: String(body.reason || '').slice(0, 500) });
        await sendMembershipDecisionEmail(row.email, row.name, (row.payload || {}).requestedTier, false);
        await writeAudit(req, user, 'membership.reject', { targetType: 'request', targetIds: [String(body.requestId)] });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/set-membership-status') {
        // Non-terminal workflow markers (contacted / paid / back-to-pending). Does NOT
        // change the subscription — approve-membership is the only thing that activates
        // a tier. Used while an admin chases payment outside the platform.
        const ALLOWED = ['pending', 'contacted', 'paid'];
        if (!body.requestId || !ALLOWED.includes(body.status)) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        await sbPatch('client_requests', `id=eq.${body.requestId}`, { status: body.status, reviewed_by: user.id, reviewed_at: new Date().toISOString() });
        if (body.status === 'paid') {
          const r2 = (await sbGet(`client_requests?id=eq.${body.requestId}&select=name,email,company,payload`).catch(() => []))[0] || {};
          await notifyOwner('URBN: marked paid — ' + (r2.company || r2.email || 'member'), 'Payment',
            emailSection('Marked paid', emailRow('Company', r2.company || '') + emailRow('Contact', r2.name || '') + emailRow('Email', r2.email || '') + emailRow('Tier', (r2.payload || {}).requestedTier || '')),
            'Payment marked');
        }
        await writeAudit(req, user, 'membership.status', { targetType: 'request', targetIds: [String(body.requestId)], metadata: { status: body.status } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/set-tier') {
        if (!body.companyId || !MEMBERSHIP_TIERS.includes(body.tier)) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        // Starter is scoped to one market; admin can set which. Cleared for other tiers.
        const assignedMarket = body.tier === 'starter' ? (normalizeMarket(body.assignedMarket) || null) : null;
        const notes = String(body.notes || '').slice(0, 1000) || null;
        await sbUpsert('company_subscriptions', [{ company_id: body.companyId, tier: body.tier, status: 'active', assigned_market: assignedMarket, notes, requested_by: user.id }]);
        // Owner alert only when moving onto a PAID tier (not free/downgrades).
        if (body.tier !== 'free') {
          const co = (await sbGet(`companies?id=eq.${encodeURIComponent(body.companyId)}&select=name`).catch(() => []))[0] || {};
          await notifyOwner('URBN: subscription set to ' + body.tier, 'Subscription',
            emailSection('Tier set by admin', emailRow('Tier', body.tier) + emailRow('Company', co.name || body.companyId) + emailRow('Market', assignedMarket || 'all') + emailRow('Via', 'Admin set-tier')),
            'Subscription set');
        }
        await writeAudit(req, user, 'membership.set_tier', { targetType: 'company', targetIds: [String(body.companyId)], metadata: { tier: body.tier, assignedMarket, hasNotes: !!notes } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/invite-user') {
        // Admin invites a real Supabase auth user. createAuthUser (service-role,
        // server-only) makes a CONFIRMED user; the DB trigger builds the
        // company/profile/membership/subscription from metadata. We then activate
        // the chosen tier and email a password-set link via Resend.
        const USER_TYPES = ['occupier', 'broker', 'developer', 'landlord', 'operator', 'advisor', 'other'];
        const email = String(body.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(res, 400, { ok: false, error: 'invalid_email' });
        const tier = MEMBERSHIP_TIERS.includes(body.tier) ? body.tier : 'free';
        const userType = USER_TYPES.includes(body.userType) ? body.userType : 'occupier';
        const assignedMarket = tier === 'starter' ? (normalizeMarket(body.assignedMarket) || null) : null;
        if (tier === 'starter' && !assignedMarket) return sendJson(res, 400, { ok: false, error: 'market_required' });
        const meta = {
          full_name: String(body.name || '').slice(0, 200),
          company: String(body.company || '').slice(0, 200) || 'My Company',
          job_title: String(body.jobTitle || '').slice(0, 200),
          user_type: userType,
          requested_tier: tier,
        };
        let created;
        try { created = await createAuthUser(email, meta); }
        catch (e) { return sendJson(res, 502, { ok: false, error: 'create_failed' }); }
        if (!created.ok) {
          // 422 = already registered. Surface a clear, non-leaky error.
          const code = (created.status === 422 || /already/i.test(created.body || '')) ? 'user_exists' : 'create_failed';
          await writeAudit(req, user, 'user.invite', { targetType: 'user', success: false, metadata: { email, reason: code } });
          return sendJson(res, created.status === 422 ? 409 : 502, { ok: false, error: code });
        }
        const newUserId = created.user && created.user.id;
        // The trigger ran synchronously; read the company it created.
        let companyId = null;
        try { const prof = (await sbGet(`profiles?id=eq.${newUserId}&select=company_id`))[0]; companyId = prof && prof.company_id; } catch (e) {}
        // Activate the chosen tier (trigger leaves paid tiers as 'requested').
        if (companyId && tier !== 'free') {
          try { await sbUpsert('company_subscriptions', [{ company_id: companyId, tier, status: 'active', assigned_market: assignedMarket, notes: String(body.notes || '').slice(0, 1000) || null, requested_by: user.id }]); } catch (e) {}
        } else if (companyId && (body.notes)) {
          try { await sbUpsert('company_subscriptions', [{ company_id: companyId, tier: 'free', status: 'active', notes: String(body.notes).slice(0, 1000), requested_by: user.id }]); } catch (e) {}
        }
        // Email a password-set link via Resend (our pipeline, not Supabase SMTP).
        let emailSent = false, emailError = null;
        try {
          const link = await generateRecoveryLink(email, 'https://urbnoffices.com/sign-in');
          if (link) {
            const hi = meta.full_name ? escapeHtml(meta.full_name.split(' ')[0]) : 'there';
            const inner = `<tr><td style="padding:22px 24px;color:#374151;font-size:14px;line-height:1.7;">` +
              `<p style="margin:0 0 14px;">Hi ${hi},</p>` +
              `<p style="margin:0 0 14px;">An account has been created for you on <strong>URBN Offices</strong>${tier !== 'free' ? ` with <strong>${escapeHtml(tier)}</strong> access` : ''}. Set your password to sign in:</p>` +
              `<p style="margin:0 0 18px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#243A5E;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;">Set your password &rarr;</a></p>` +
              `<p style="margin:0;font-size:12px;color:#6B7280;">If you didn’t expect this, you can ignore this email. The link expires for security.</p>` +
              `</td></tr>`;
            const html = emailShell('You’ve been invited to URBN Offices', 'Invitation', inner, false);
            await sendResendEmail({ subject: 'Your URBN Offices account — set your password', html, text: `Set your password to access URBN Offices: ${link}`, from: process.env.NO_REPLY_FROM || process.env.LEAD_FROM, to: email });
            emailSent = true;
          } else { emailError = 'link_failed'; }
        } catch (e) { emailError = 'email_failed'; }
        await writeAudit(req, user, 'user.invite', { targetType: 'user', targetIds: newUserId ? [String(newUserId)] : null, metadata: { email, tier, assignedMarket, emailSent } });
        return sendJson(res, 200, { ok: true, userId: newUserId, companyId, tier, emailSent, emailError });
      }
      if (urlPath === '/api/admin/import-units') {
        // Bulk-attach units to EXISTING buildings. This NEVER inserts or updates a
        // building row — it cannot create duplicates or overwrite building details.
        // Match by building_id, else by name|market|submarket (case-insensitive).
        // dryRun (default true) previews matches/errors without writing.
        const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
        if (!rows.length) return sendJson(res, 400, { ok: false, error: 'no_rows' });
        const dryRun = body.dryRun !== false;
        const buildings = await sbGet('buildings?select=id,name,market,submarket');
        const byId = {}, byKey = {};
        buildings.forEach((b) => {
          byId[String(b.id)] = b;
          const k = [b.name, b.market, b.submarket].map((x) => String(x || '').trim().toLowerCase()).join('|');
          (byKey[k] = byKey[k] || []).push(b);
        });
        const hash = (s) => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = (((h * 33) ^ s.charCodeAt(i)) >>> 0); return h.toString(36); };
        const results = [], toInsert = [];
        let matched = 0, unmatched = 0, ambiguous = 0, invalid = 0;
        rows.forEach((r, i) => {
          const idx = (r._row != null) ? r._row : (i + 1);
          let b = null, reason = '';
          const bid = r.building_id && String(r.building_id).trim();
          if (bid && byId[bid]) b = byId[bid];
          else if (bid && !byId[bid]) reason = 'building_id not found';
          else {
            const k = [r.building_name, normalizeMarket(r.market) || r.market, r.submarket].map((x) => String(x || '').trim().toLowerCase()).join('|');
            const m = byKey[k] || [];
            if (m.length === 1) b = m[0];
            else if (m.length === 0) reason = 'no matching building (name + market + submarket)';
            else reason = 'multiple matching buildings — add building_id';
          }
          if (!b) { if (reason.indexOf('multiple') === 0) { ambiguous++; results.push({ row: idx, status: 'ambiguous', building: r.building_name || bid || '', reason }); } else { unmatched++; results.push({ row: idx, status: 'unmatched', building: r.building_name || bid || '', reason }); } return; }
          if (!rowHasUnit(r)) { invalid++; results.push({ row: idx, status: 'invalid', building: b.name, reason: 'no unit data (size / rent / floor / offering)' }); return; }
          matched++;
          const uId = (r.unit_id && String(r.unit_id).trim()) || ('u_imp_' + hash(b.id + '|' + (r.unit_floor || '') + '|' + (r.size_sqm || '') + '|' + (r.offering_type || '')));
          let unitAmen = null;
          if (r.unit_amenities && String(r.unit_amenities).trim()) { try { const parsed = JSON.parse(r.unit_amenities); if (parsed && typeof parsed === 'object') unitAmen = parsed; } catch (e) {} }
          toInsert.push({ id: uId, building_id: b.id, unit_floor: r.unit_floor || null, size_sqm: numOrNull(r.size_sqm), offering_type: r.offering_type || null, fit_out: r.fit_out || null, desks: numOrNull(r.desks), meeting_rooms: numOrNull(r.meeting_rooms), asking_rent: numOrNull(r.asking_rent), currency: r.currency || null, pricing_basis: r.pricing_basis || null, service_charge: numOrNull(r.service_charge), service_charge_basis: r.service_charge_basis || null, availability_date: dateOrNull(r.availability_date), min_term: r.minimum_term || null, notes: r.notes || null, unit_amenities: unitAmen, status: 'approved' });
          results.push({ row: idx, status: 'ok', building: b.name, reason: '' });
        });
        let inserted = 0;
        if (!dryRun && toInsert.length) {
          for (let i = 0; i < toInsert.length; i += 200) {
            const chunk = toInsert.slice(i, i + 200);
            try { await sbUpsert('units', chunk); inserted += chunk.length; } catch (e) { console.error('[import-units]', e.message); }
          }
          await writeAudit(req, user, 'units.import', { targetType: 'unit', count: inserted, metadata: { matched, unmatched, ambiguous, invalid } });
        }
        return sendJson(res, 200, { ok: true, dryRun, summary: { total: rows.length, matched, unmatched, ambiguous, invalid, inserted }, results: results.slice(0, 2000) });
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
        await writeAudit(req, user, 'reveal.approve', { targetType: 'grant', targetIds: [String(body.grantId)], metadata: { buildingId: g.building_id, grantedTo: g.user_id } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/reject-reveal') {
        if (!body.grantId) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const g = (await sbGet(`listing_access_grants?id=eq.${body.grantId}&select=*`))[0];
        if (!g) return sendJson(res, 404, { ok: false, error: 'not_found' });
        await sbPatch('listing_access_grants', `id=eq.${body.grantId}`, { status: 'rejected', granted_by: user.id, notes: String(body.reason || '').slice(0, 500) || null });
        if (g.request_id) await sbPatch('client_requests', `id=eq.${g.request_id}`, { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: String(body.reason || '').slice(0, 500) });
        try { const au = await listAuthUsers(); const u = au.find((x) => x.id === g.user_id); const b = (await sbGet(`buildings?id=eq.${encodeURIComponent(g.building_id)}&select=name,market`))[0] || {}; if (u && u.email) await sendRevealDecisionEmail(u.email, b.name, b.market, false); } catch (e) {}
        await writeAudit(req, user, 'reveal.reject', { targetType: 'grant', targetIds: [String(body.grantId)], metadata: { buildingId: g.building_id, grantedTo: g.user_id } });
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
        // Edit ONE unit. Never touches the building row (building reassignment only
        // changes units.building_id after verifying the target exists). The
        // units_set_updated_at trigger bumps updated_at automatically.
        if (!body.id) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const fields = body.fields || {}, patch = {};
        const NUM = ['size_sqm', 'desks', 'meeting_rooms', 'asking_rent', 'service_charge', 'allocated_parking_spaces', 'unit_parking_price'];
        const TEXT = ['unit_floor', 'fit_out', 'pricing_basis', 'service_charge_basis', 'min_term', 'notes'];
        const OFFERINGS = ['Whole building', 'Full floor', 'Partial floor', 'Private office', 'Coworking desks', 'Serviced office suite', 'Coworking / Flexible workspace'];
        const STATUSES = ['draft', 'pending_review', 'approved', 'rejected'];
        for (const k of NUM) if (k in fields) {
          if (fields[k] === '' || fields[k] == null) { patch[k] = null; continue; }
          const v = Number(fields[k]); if (isNaN(v)) return sendJson(res, 400, { ok: false, error: 'invalid_number' }); patch[k] = v;
        }
        for (const k of TEXT) if (k in fields) patch[k] = (fields[k] == null || fields[k] === '') ? null : String(fields[k]).slice(0, 2000);
        if ('parking_included' in fields) patch.parking_included = !!fields.parking_included;
        if ('offering_type' in fields) { const v = fields.offering_type; if (v && OFFERINGS.indexOf(v) < 0) return sendJson(res, 400, { ok: false, error: 'invalid_offering' }); patch.offering_type = v || null; }
        if ('status' in fields) { if (!STATUSES.includes(fields.status)) return sendJson(res, 400, { ok: false, error: 'invalid_status' }); patch.status = fields.status; }
        if ('currency' in fields) { const v = String(fields.currency || '').toUpperCase(); if (v && !/^[A-Z]{3}$/.test(v)) return sendJson(res, 400, { ok: false, error: 'invalid_currency' }); patch.currency = v || null; }
        if ('availability_date' in fields) patch.availability_date = dateOrNull(fields.availability_date);
        if ('unit_amenities' in fields) {
          let ua = fields.unit_amenities;
          if (typeof ua === 'string') { if (ua.trim() === '') ua = null; else { try { ua = JSON.parse(ua); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid_amenities' }); } } }
          if (ua != null && typeof ua !== 'object') return sendJson(res, 400, { ok: false, error: 'invalid_amenities' });
          patch.unit_amenities = ua;
        }
        if ('building_id' in fields && fields.building_id) {
          const found = await sbGet(`buildings?id=eq.${encodeURIComponent(fields.building_id)}&select=id`);
          if (!found.length) return sendJson(res, 400, { ok: false, error: 'building_not_found' });
          patch.building_id = String(fields.building_id);
        }
        if (!Object.keys(patch).length) return sendJson(res, 400, { ok: false, error: 'no_fields' });
        await sbPatch('units', `id=eq.${encodeURIComponent(body.id)}`, patch);
        await writeAudit(req, user, 'unit.update', { targetType: 'unit', targetIds: [String(body.id)], metadata: { fields: Object.keys(patch) } });
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
      // ── User management: admin rights / delete / email / password reset ──────
      if (urlPath === '/api/admin/set-admin') {
        const uid = String(body.userId || '');
        if (!isUuidStr(uid)) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        const makeAdmin = body.makeAdmin === true;
        // Never let an admin strip their OWN rights — avoids accidental lockout.
        if (!makeAdmin && uid === user.id) return sendJson(res, 400, { ok: false, error: 'cannot_self_demote' });
        if (makeAdmin) await sbUpsert('admin_users', [{ user_id: uid }]);
        else await sbDelete('admin_users', `user_id=eq.${uid}`);
        await writeAudit(req, user, 'user.set_admin', { targetType: 'user', targetIds: [uid], metadata: { makeAdmin } });
        return sendJson(res, 200, { ok: true, isAdmin: makeAdmin });
      }
      if (urlPath === '/api/admin/delete-user') {
        const uid = String(body.userId || '');
        if (!isUuidStr(uid)) return sendJson(res, 400, { ok: false, error: 'bad_request' });
        if (uid === user.id) return sendJson(res, 400, { ok: false, error: 'cannot_delete_self' });
        const okDel = await deleteAuthUser(uid);
        // Best-effort app-row cleanup (profile normally cascades via FK; be safe).
        try { await sbDelete('admin_users', `user_id=eq.${uid}`); } catch (e) {}
        try { await sbDelete('profiles', `id=eq.${uid}`); } catch (e) {}
        await writeAudit(req, user, 'user.delete', { targetType: 'user', targetIds: [uid], success: okDel });
        if (!okDel) return sendJson(res, 502, { ok: false, error: 'delete_failed' });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/email-user') {
        // Recipient by userId (preferred) or explicit email.
        let toEmail = String(body.email || '').trim().toLowerCase();
        if (!toEmail && isUuidStr(String(body.userId || ''))) {
          const au = await listAuthUsers(); toEmail = (au.find((u) => u.id === body.userId) || {}).email || '';
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) return sendJson(res, 400, { ok: false, error: 'invalid_email' });
        const subject = String(body.subject || '').slice(0, 200).trim();
        const message = String(body.message || '').slice(0, 5000).trim();
        if (!subject || !message) return sendJson(res, 400, { ok: false, error: 'subject_and_message_required' });
        const inner = `<tr><td style="padding:22px 24px;color:#374151;font-size:14px;line-height:1.7;">${escapeHtml(message).replace(/\n/g, '<br>')}</td></tr>`;
        const html = emailShell(subject, null, inner, false);
        try {
          await sendResendEmail({ subject, html, text: message, from: process.env.NO_REPLY_FROM || process.env.LEAD_FROM, to: toEmail, replyTo: ownerRecipient() });
        } catch (e) { await writeAudit(req, user, 'user.email', { targetType: 'user', success: false, metadata: { toEmail } }); return sendJson(res, 502, { ok: false, error: 'email_failed' }); }
        await writeAudit(req, user, 'user.email', { targetType: 'user', metadata: { toEmail, subject } });
        return sendJson(res, 200, { ok: true });
      }
      if (urlPath === '/api/admin/send-password-reset') {
        let toEmail = String(body.email || '').trim().toLowerCase();
        if (!toEmail && isUuidStr(String(body.userId || ''))) {
          const au = await listAuthUsers(); toEmail = (au.find((u) => u.id === body.userId) || {}).email || '';
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) return sendJson(res, 400, { ok: false, error: 'invalid_email' });
        const link = await generateRecoveryLink(toEmail, 'https://urbnoffices.com/sign-in');
        if (!link) return sendJson(res, 502, { ok: false, error: 'link_failed' });
        const inner = `<tr><td style="padding:22px 24px;color:#374151;font-size:14px;line-height:1.7;">` +
          `<p style="margin:0 0 14px;">A password reset was requested for your <strong>URBN Offices</strong> account. Set a new password below:</p>` +
          `<p style="margin:0 0 18px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#243A5E;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;">Set a new password &rarr;</a></p>` +
          `<p style="margin:0;font-size:12px;color:#6B7280;">If you didn’t request this, you can safely ignore this email. The link expires for security.</p>` +
          `</td></tr>`;
        const html = emailShell('Reset your URBN Offices password', 'Password reset', inner, false);
        try {
          await sendResendEmail({ subject: 'Reset your URBN Offices password', html, text: `Set a new password: ${link}`, from: process.env.NO_REPLY_FROM || process.env.LEAD_FROM, to: toEmail });
        } catch (e) { return sendJson(res, 502, { ok: false, error: 'email_failed' }); }
        await writeAudit(req, user, 'user.password_reset', { targetType: 'user', metadata: { toEmail } });
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 404, { ok: false, error: 'unknown_admin_endpoint' });
    } catch (e) {
      console.error('[admin] error:', (e && e.stack) || e);
      return sendJson(res, 500, { ok: false, error: 'admin_error' });
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
        const sum = emailSection('Bulk upload', emailRow('Uploaded By', user.email) + emailRow('Filename', data.filename) +
          emailRow('Rows Processed', String(rows.length)) + emailRow('Accepted', String(accepted.length)) +
          emailRow('Rejected', String(rejected.length)) + emailRow('Status', 'pending_review') +
          emailRow('Review', '<a href="https://urbnoffices.com/admin?tab=batches" style="color:#243A5E;">Open in admin console &rarr;</a>', true));
        const errSec = rejected.length ? emailSection('Validation Errors (first 20)',
          rejected.slice(0, 20).map((e) => emailRow('Row ' + (e.i + 1), e.errs.join(', '))).join('')) : '';
        await sendResendEmail({
          subject: `${user.email} uploaded ${accepted.length} listing${accepted.length === 1 ? '' : 's'} (bulk) — pending review`,
          html: emailShell('New Batch Upload', 'Pending Review', sum + errSec, true),
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
  const g = b.grade ? ('Grade ' + String(b.grade).replace(/^grade\s*/i, '').toUpperCase()) : '';
  return `Verified ${g ? g + ' ' : ''}Building${mkt ? ' — ' + mkt : ''}`;
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
    unitCount: Array.isArray(units) ? units.length : 0,
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
    units: units.map((u) => ({ id: u.id, floor: u.unit_floor, size: Number(u.size_sqm) || 0, desks: Number(u.desks) || 0, meetingRooms: Number(u.meeting_rooms) || 0, rent: Number(u.asking_rent) || 0, type: u.offering_type, fitOut: u.fit_out || '', amenities: u.unit_amenities || null, pricingBasis: u.pricing_basis || '', currency: u.currency || '' })),
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
// Is the user on a paid tier? (active company_subscription that isn't 'free')
async function isPayingUser(userId) {
  if (!userId) return false;
  try {
    const prof = (await sbGet(`profiles?id=eq.${userId}&select=company_id`))[0];
    if (!prof || !prof.company_id) return false;
    const subs = await sbGet(`company_subscriptions?company_id=eq.${prof.company_id}&status=eq.active&select=tier`);
    return subs.some((s) => s.tier && String(s.tier).toLowerCase() !== 'free');
  } catch (e) { return false; }
}

// ── Entitlements: the single source of truth for tier-based access ────────────
// Reveal grants (real identity) are handled separately and are tier-INDEPENDENT.
const TIER_REVEAL_CAP = { free: 1, starter: 5, membership: 25, enterprise: 100000 };
async function getUserEntitlements(userId, isAdminFlag) {
  if (isAdminFlag) {
    return { tier: 'admin', isAdmin: true, unitDetail: true, markets: 'all', stayVsGo: true, saveCap: null, revealCap: 100000, assignedMarket: null };
  }
  let tier = 'free', assignedMarket = null;
  if (userId) {
    try {
      const prof = (await sbGet(`profiles?id=eq.${userId}&select=company_id`))[0];
      if (prof && prof.company_id) {
        const subs = await sbGet(`company_subscriptions?company_id=eq.${prof.company_id}&status=eq.active&select=tier,assigned_market&order=created_at.desc`);
        const active = subs.find((s) => s.tier && String(s.tier).toLowerCase() !== 'free') || subs[0];
        if (active) { tier = String(active.tier || 'free').toLowerCase(); assignedMarket = active.assigned_market || null; }
      }
    } catch (e) { /* default to free */ }
  }
  const paid = tier === 'starter' || tier === 'membership' || tier === 'enterprise';
  // Starter sees full detail in ONE assigned market; Membership/Enterprise = all.
  const markets = tier === 'starter' ? (assignedMarket ? [assignedMarket] : []) : 'all';
  return {
    tier, isAdmin: false,
    unitDetail: paid,                                  // Free: anonymized cards only
    markets,                                            // Starter: [assignedMarket]; else 'all'
    stayVsGo: paid,                                     // Free: disabled
    saveCap: tier === 'free' ? 5 : null,                // null = unlimited
    revealCap: TIER_REVEAL_CAP[tier] != null ? TIER_REVEAL_CAP[tier] : 1,
    assignedMarket,
  };
}
function entMarketAllowed(ent, market) {
  if (!ent) return false;
  if (ent.markets === 'all') return true;
  return Array.isArray(ent.markets) && ent.markets.includes(market);
}
// Per-building gate: unit detail (size/floor/desks/rent/offering/fit-out) + clear
// photos. A reveal grant OR an entitled+market-allowed tier unlocks unit detail.
function canViewUnitDetails(ent, market, granted) {
  return !!granted || (!!ent && ent.unitDetail && entMarketAllowed(ent, market));
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

// ── FX: USD-base rates, cached for the day ───────────────────────────────────
// ECB reference rates don't cover most of our African currencies, so we use a
// free no-key USD-base feed (ExchangeRate-API open endpoint). Cached in-process.
let FX_CACHE = { rates: null, date: null, at: 0 };
async function getFx() {
  const TWELVE_H = 12 * 60 * 60 * 1000;
  if (FX_CACHE.rates && (Date.now() - FX_CACHE.at) < TWELVE_H) return FX_CACHE;
  try {
    const r = await httpsRequest('https://open.er-api.com/v6/latest/USD', { method: 'GET', headers: {} });
    if (r.status >= 200 && r.status < 300) {
      const j = JSON.parse(r.body || '{}');
      if (j && j.rates) FX_CACHE = { rates: j.rates, date: (j.time_last_update_utc || '').slice(0, 16) || null, at: Date.now() };
    }
  } catch (e) { /* keep stale cache on failure */ }
  return FX_CACHE;
}
// Convert a local amount to USD (rates[CUR] = local units per 1 USD).
function toUsd(amount, cur, rates) {
  if (!amount || !cur || !rates) return null;
  if (cur === 'USD') return Math.round(amount);
  const rate = rates[cur];
  return rate ? Math.round(amount / rate) : null;
}

// Public building view/click tracking. Fire-and-forget: writes one building_views
// row via the service role. An optional bearer resolves viewer_id; a salted
// IP+UA+day session hash gives light per-day dedup so analytics can show unique
// sessions vs raw opens. Always answers 204 and never surfaces an error — a bad
// or unknown building_id (FK violation) is simply swallowed.
function handleTrackView(req, res) {
  readJsonBody(req, 2048).then(async (body) => {
    try {
      const buildingId = body && String(body.buildingId || '').trim();
      const source = (body && ['detail', 'card', 'map'].includes(body.source)) ? body.source : 'detail';
      if (buildingId && buildingId.length <= 128) {
        let viewerId = null;
        const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        if (token) { try { const u = await getAuthUser(token); viewerId = (u && u.id) || null; } catch (e) {} }
        const ip = clientIp(req);
        const day = new Date().toISOString().slice(0, 10);
        const session_hash = crypto.createHash('sha256').update((process.env.IP_HASH_SALT || '') + ip + String(req.headers['user-agent'] || '') + day).digest('hex').slice(0, 32);
        await insertSupabaseTable('building_views', { building_id: buildingId, viewer_id: viewerId, session_hash, source });
      }
    } catch (e) { /* tracking must never surface errors */ }
    res.writeHead(204); res.end();
  });
}

let ANON_LISTINGS_CACHE = { at: 0, payload: null };  // anon /api/listings, 60s TTL
function handlePublicListings(req, res) {
  (async () => {
    try {
      const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      // Anonymous responses are identical for everyone — serve a short-lived cache
      // instead of rebuilding the ~400KB payload from 3 DB queries on every request.
      if (!token && ANON_LISTINGS_CACHE.payload && (Date.now() - ANON_LISTINGS_CACHE.at) < 60000) {
        return sendJson(res, 200, ANON_LISTINGS_CACHE.payload);
      }
      let grantedIds = new Set(), admin = false, userId = null;
      if (token) { const user = await getAuthUser(token); if (user && user.id) { userId = user.id; admin = await isAdmin(user.id); if (!admin) grantedIds = await approvedGrantsFor(user.id); } }
      const ent = await getUserEntitlements(userId, admin);
      const [buildings, units, media] = await Promise.all([
        sbGet('buildings?status=eq.approved&select=*'),
        sbGet('units?status=eq.approved&select=*'),
        // Include path/bucket/kind so revealed/admin viewers get the real photo.
        sbGet('listing_media?select=building_id,bucket,path,kind,approved_for_public,is_main').catch(() => []),
      ]);
      const unitsByB = {}; units.forEach((u) => { (unitsByB[u.building_id] = unitsByB[u.building_id] || []).push(u); });
      const mediaByB = {}; media.forEach((m) => { (mediaByB[m.building_id] = mediaByB[m.building_id] || []).push(m); });
      const out = [];
      for (const b of buildings) {
        // Admin-hidden buildings are excluded from ALL public responses (list, map,
        // clusters, visible-area list, building detail, counts) for every viewer —
        // server-side, NULL-safe. Admins recover/unhide them in the admin console
        // (/api/admin/buildings) which intentionally still returns hidden rows.
        if (b.admin_hidden) continue;
        const granted = admin || grantedIds.has(b.id);   // admins see full identity everywhere
        const shaped = shapeListingServer(b, unitsByB[b.id] || [], mediaByB, granted);
        if (granted) {
          // Reveal the real main photo (signed) rather than the public-safe-only endpoint.
          const ms = (mediaByB[b.id] || []).filter((m) => m.kind !== 'floorplan');
          const main = ms.find((m) => m.is_main) || ms.find((m) => m.approved_for_public) || ms[0];
          if (main && main.path) { const url = await signStorageUrl(main.bucket, main.path, 3600); if (url) shaped.image = url; }
        }
        // Unit detail (size/floor/desks/rent/offering/fit-out) + clear photos are
        // gated by entitlement (or a reveal grant). Free / out-of-market viewers get
        // anonymized cards with the price + unit fields STRIPPED server-side.
        const unitOk = canViewUnitDetails(ent, b.market, granted);
        shaped.imageClear = unitOk;
        shaped.unitLocked = !unitOk;
        if (!unitOk) {
          shaped.rentMin = null; shaped.rentMax = null; shaped.availMin = null; shaped.availMax = null;
          shaped.unitCount = (shaped.units || []).length;
          shaped.units = (shaped.units || []).map((u) => ({ id: u.id, locked: true }));
        }
        out.push(shaped);
      }
      // Per-unit LISTINGS — the public-facing entity (favorited & compared). Each
      // listing is one approved unit, flattened with its building's context.
      const fx = await getFx();
      const listings = [];
      out.forEach((b) => {
        (b.units || []).forEach((u) => {
          // Anonymized card fields are always present; unit detail + price are only
          // included when the building isn't unit-locked for this viewer.
          const base = {
            id: u.id, buildingId: b.id, name: b.name, label: b.label, revealed: b.revealed, anonymized: b.anonymized,
            market: b.market, submarket: b.submarket, grade: b.grade, image: b.image, imageClear: b.imageClear,
            hasPublicImage: b.hasPublicImage, unitLocked: !!b.unitLocked,
            // floorplate is building-level PUBLIC data (shown on anonymized cards), so it
            // is included even for locked listings — lets the floor-plate filter work for
            // everyone without exposing protected unit sizes.
            floorplate: b.floorplate,
          };
          if (b.unitLocked) { listings.push(base); return; }
          listings.push(Object.assign(base, {
            amenities: b.amenities, parking: b.parking, sustainability: b.sustainability,
            address: b.address, mapsUrl: b.mapsUrl, floors: b.floors, floorplate: b.floorplate,
            yearBuilt: b.yearBuilt, buildingHeight: b.buildingHeight, gla: b.gla,
            floor: u.floor, size: u.size, desks: u.desks, meetingRooms: u.meetingRooms, offeringType: u.type, fitOut: u.fitOut, unitAmenities: u.amenities,
            // The unit's OWN pricing basis (per sqm / per desk / per unit) drives the
            // Stay-vs-Go math — never the building-level rentUnit, which can be wrong
            // for a building that mixes per-sqm and per-desk units.
            pricingBasis: u.pricingBasis || b.rentUnit, unitCurrency: u.currency || b.rentCurrency,
            rent: u.rent, rentCurrency: u.currency || b.rentCurrency, rentUnit: b.rentUnit, rentUsd: toUsd(u.rent, u.currency || b.rentCurrency, fx.rates),
          }));
        });
      });
      const payload = { ok: true, buildings: out, listings, fx: { base: 'USD', date: fx.date, source: 'ExchangeRate-API (open)', rates: fx.rates || null } };
      if (!token) ANON_LISTINGS_CACHE = { at: Date.now(), payload };   // cache the anon result (60s)
      return sendJson(res, 200, payload);
    } catch (e) { console.error('[api/listings]', e.message); return sendJson(res, 200, { ok: true, buildings: [], listings: [] }); }
  })();
}

// The frontend's view of the current user's entitlements (for locked states,
// caps and gating). Identity reveal is per-building and not included here.
function handleEntitlements(req, res) {
  (async () => {
    try {
      const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      const user = await getAuthUser(token);
      if (!user || !user.id) {
        return sendJson(res, 200, { ok: true, authenticated: false, tier: 'anon', unitDetail: false, stayVsGo: false, saveCap: 5, revealCap: 0, revealUsed: 0, markets: [], assignedMarket: null });
      }
      const admin = await isAdmin(user.id);
      const ent = await getUserEntitlements(user.id, admin);
      let revealUsed = 0;
      if (user.email) {
        try {
          const now = new Date();
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
          const used = await sbGet(`client_requests?email=eq.${encodeURIComponent(user.email)}&request_type=in.(reveal-listing,site-visit,offer,introduction)&created_at=gte.${encodeURIComponent(monthStart)}&select=id`);
          revealUsed = Array.isArray(used) ? used.length : 0;
        } catch (e) {}
      }
      return sendJson(res, 200, { ok: true, authenticated: true, tier: ent.tier, isAdmin: ent.isAdmin, unitDetail: ent.unitDetail, stayVsGo: ent.stayVsGo, saveCap: ent.saveCap, revealCap: ent.revealCap, revealUsed, markets: ent.markets, assignedMarket: ent.assignedMarket });
    } catch (e) { return sendJson(res, 200, { ok: true, authenticated: false, tier: 'anon', unitDetail: false, stayVsGo: false, saveCap: 5, revealCap: 0, revealUsed: 0, markets: [], assignedMarket: null }); }
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
      html: emailShell('New ' + label, type === 'offer' ? 'Offer' : 'Request', adminInner, true),
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

      // Tier-based monthly cap on reveal / site-visit / offer / introduction requests.
      const reqAdmin = await isAdmin(user.id);
      const ent = await getUserEntitlements(user.id, reqAdmin);
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      if (user.email) {
        try {
          const used = await sbGet(`client_requests?email=eq.${encodeURIComponent(user.email)}&request_type=in.(reveal-listing,site-visit,offer,introduction)&created_at=gte.${encodeURIComponent(monthStart)}&select=id`);
          if (Array.isArray(used) && used.length >= ent.revealCap) {
            return sendJson(res, 429, { ok: false, error: 'limit_reached', cap: ent.revealCap, used: used.length, tier: ent.tier });
          }
        } catch (e) { /* fail open on count errors */ }
      }
      // Prevent duplicate reveal requests for the same building (pending or approved).
      if (type === 'reveal-listing') {
        try {
          const dup = await sbGet(`listing_access_grants?user_id=eq.${user.id}&building_id=eq.${encodeURIComponent(buildingId)}&status=in.(requested,approved)&select=id`);
          if (Array.isArray(dup) && dup.length) return sendJson(res, 409, { ok: false, error: 'already_requested' });
        } catch (e) {}
      }

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
    } catch (e) { console.error('[listing-request]', e.message); return sendJson(res, 500, { ok: false, error: 'server_error' }); }
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
      // Include a display name so consumers (Stay vs Go) can label markets that
      // aren't in the client-side market list (e.g. Kigali, Abidjan).
      const costs = Object.values(latest).map((r) => ({ ...r, marketName: marketName(r.market) }));
      return sendJson(res, 200, { ok: true, costs });
    } catch (e) { return sendJson(res, 200, { ok: true, costs: market ? null : [] }); }
  })();
}

// ── Server ───────────────────────────────────────────────────────────────────
// ── Lightweight in-memory rate limiter (single-instance; per-IP, sliding window) ──
// Anti-spam/brute baseline. For multi-instance scale, move to Redis/edge — TODO.
const RL = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (RL.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  RL.set(key, arr);
  if (RL.size > 5000) { for (const [k, v] of RL) { if (!v.length || now - v[v.length - 1] > windowMs) RL.delete(k); } }
  return arr.length > max;
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

const server = http.createServer((req, res) => {
  res._acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  // Baseline security headers.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Content-Security-Policy. This is a real, enforced policy that locks third-party
  // origins to a tight allowlist (defends against injected EXTERNAL scripts/frames,
  // clickjacking, base-tag hijack). script-src/style-src still allow 'unsafe-inline'
  // because the site uses inline <script> blocks + on* handlers throughout — removing
  // that needs the nonce refactor documented in SECURITY.md. Stored-XSS is mitigated
  // separately by output-encoding all user content (escHtml) at render time.
  //   third parties: jsDelivr (Supabase client) + unpkg (Leaflet) = scripts;
  //   Google Fonts (style) + gstatic (font); CARTO tiles + Unsplash + Supabase = img;
  //   Supabase (REST/auth/realtime) + ExchangeRate-API = connect.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "frame-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://images.unsplash.com https://*.supabase.co",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://open.er-api.com",
  ].join('; '));

  const urlPath = req.url.split('?')[0];

  // Anti-spam: cap POSTs to sensitive write endpoints per IP (30/min). Auth and
  // per-tier monthly caps are enforced separately inside the handlers.
  if (req.method === 'POST' && /^\/api\/(request|listing-request|batch)$/.test(urlPath)) {
    if (rateLimited('post:' + clientIp(req) + ':' + urlPath, 30, 60000)) {
      return sendJson(res, 429, { ok: false, error: 'rate_limited' });
    }
  }
  // Defense-in-depth on admin writes: even with a valid admin token, cap mutation
  // rate per IP (100/min general; 12/min on the irreversible delete endpoint) so a
  // compromised/leaked admin token can't mass-mutate or mass-delete in a burst.
  if (req.method === 'POST' && /^\/api\/admin\//.test(urlPath)) {
    const ip = clientIp(req);
    if (rateLimited('admin:' + ip, 100, 60000)) return sendJson(res, 429, { ok: false, error: 'rate_limited' });
    if (/^\/api\/admin\/(delete-buildings|delete-user)$/.test(urlPath) && rateLimited('admindel:' + ip, 12, 60000)) {
      return sendJson(res, 429, { ok: false, error: 'rate_limited' });
    }
  }

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
  if (urlPath === '/api/entitlements') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return handleEntitlements(req, res);
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
  if (urlPath === '/api/track-view') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    // Light per-IP cap; over-limit is silently dropped (204) so it never blocks browsing.
    if (rateLimited('view:' + clientIp(req), 120, 60000)) { res.writeHead(204); return res.end(); }
    return handleTrackView(req, res);
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

  // Clean-URL routing (single canonical URL per page; no subdomains/host logic).
  let reqPath = urlPath;
  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  // 1) Canonical clean route → serve the underlying file directly (URL stays clean).
  if (ROUTES[reqPath]) {
    reqPath = ROUTES[reqPath];
  } else {
    // 2) Legacy/underlying path that has a cleaner canonical → 301 to it.
    //    Covers "/pages/..." paths and any "/x.html" (strip .html and retry).
    let canonical = ROUTE_REVERSE[reqPath];
    if (!canonical && reqPath.endsWith('.html')) {
      const stripped = reqPath.slice(0, -5);
      canonical = ROUTE_REVERSE[reqPath] || (ROUTES[stripped] ? stripped : (stripped === '/index' ? '/' : stripped));
    }
    if (canonical && canonical !== urlPath) {
      res.writeHead(301, { Location: canonical + search });
      return res.end();
    }
    // 3) Fallback: serve extensionless paths by appending .html.
    if (reqPath === '/') reqPath = '/index.html';
  }

  let filePath = path.join(__dirname, reqPath);
  if (!path.extname(filePath)) filePath += '.html';

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<h1>404 — Not Found</h1>');
    }
    const ext = path.extname(filePath);
    const type = mimeTypes[ext] || 'application/octet-stream';
    const total = stat.size;
    // Cache-Control: media/fonts long, code short (fast propagation on deploy), HTML revalidate.
    const cache = ['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.webp'].includes(ext)
      ? 'public, max-age=86400'
      : (ext === '.css' || ext === '.js') ? 'public, max-age=600'
      : (ext === '.html' ? 'no-cache' : 'public, max-age=300');
    // Range support (HTTP 206) — required for <video>/<audio> streaming & seeking.
    const range = req.headers['range'];
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? total - parseInt(m[2], 10) : parseInt(m[1], 10);
      let end = m[2] === '' || parseInt(m[2], 10) >= total ? total - 1 : parseInt(m[2], 10);
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' });
        return res.end();
      }
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': total, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

// ── Background jobs: signup alerts + weekly recap (Thu 10:00 Africa/Cairo) ─────
// Railway runs a single always-on Node process, so we schedule in-process with
// setInterval and persist watermarks in app_job_state — a restart never double-
// sends. Every job is best-effort and wrapped in try/catch.
async function getJobState(key) {
  try { const rows = await sbGet(`app_job_state?key=eq.${encodeURIComponent(key)}&select=value`); return (rows[0] && rows[0].value) || null; }
  catch (e) { return null; }
}
async function setJobState(key, value) {
  try { await sbUpsert('app_job_state', [{ key, value, updated_at: new Date().toISOString() }]); } catch (e) {}
}
// Cairo wall-clock parts via Intl — handles Egypt's DST switches automatically.
function cairoNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: parseInt(get('hour'), 10), weekday: get('weekday') };
}
// Poll GoTrue for new sign-ups since the last watermark and alert the owner.
async function pollNewSignups() {
  try {
    const users = await listAuthUsers();
    if (!Array.isArray(users) || !users.length) return;
    const state = await getJobState('signup_watermark');
    const watermark = state && state.last;
    const maxCreated = users.reduce((m, u) => (u.created_at && u.created_at > m ? u.created_at : m), '');
    // First run ever: record the newest user but DON'T email the whole backlog.
    if (!watermark) { await setJobState('signup_watermark', { last: maxCreated || new Date().toISOString() }); return; }
    const fresh = users.filter((u) => u.created_at && u.created_at > watermark).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    if (!fresh.length) return;
    let profById = {};
    try { const ids = fresh.map((u) => u.id).filter(Boolean); if (ids.length) (await sbGet(`profiles?id=in.(${ids.join(',')})&select=id,full_name,phone,user_type`)).forEach((p) => { profById[p.id] = p; }); } catch (e) {}
    for (const u of fresh) {
      const p = profById[u.id] || {}; const md = u.user_metadata || {};
      await notifyOwner('URBN: new sign-up — ' + (u.email || 'user'), 'New sign-up',
        emailSection('New account', emailRow('Email', u.email) + emailRow('Name', p.full_name || md.full_name || '') + emailRow('Type', p.user_type || md.user_type || '') + emailRow('Phone', p.phone || '') + emailRow('Signed up', u.created_at)),
        'New sign-up');
    }
    await setJobState('signup_watermark', { last: fresh[fresh.length - 1].created_at });
  } catch (e) { console.error('[pollNewSignups]', e.message); }
}
// Once per Thursday at 10:00 Cairo, email the owner a 7-day recap.
async function maybeSendWeeklyRecap() {
  try {
    const { date, hour, weekday } = cairoNowParts();
    if (weekday !== 'Thu' || hour !== 10) return;
    const state = await getJobState('weekly_recap');
    if (state && state.lastDate === date) return;
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [newUsers, reqs, subs, buildings, views] = await Promise.all([
      sbGet(`profiles?created_at=gte.${weekAgo}&select=id`).catch(() => []),
      sbGet(`client_requests?created_at=gte.${weekAgo}&select=request_type,status`).catch(() => []),
      sbGet(`company_subscriptions?created_at=gte.${weekAgo}&select=tier,status`).catch(() => []),
      sbGet(`buildings?created_at=gte.${weekAgo}&select=id,status`).catch(() => []),
      sbGet(`building_views?created_at=gte.${weekAgo}&select=building_id`).catch(() => []),
    ]);
    const reqByType = groupCount(reqs, (r) => r.request_type);
    const activated = subs.filter((s) => s.status === 'active').length;
    const viewsByB = groupCount(views, (v) => v.building_id);
    let bNames = {};
    try { const topIds = Object.keys(viewsByB); if (topIds.length) (await sbGet(`buildings?id=in.(${topIds.join(',')})&select=id,name`)).forEach((b) => { bNames[b.id] = b.name; }); } catch (e) {}
    const topViewed = Object.entries(viewsByB).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `${escapeHtml(bNames[id] || id)} — ${n}`).join('<br>') || '—';
    const reqLines = Object.entries(reqByType).map(([t, n]) => emailRow(t, n)).join('') || emailRow('Requests', 0);
    const inner =
      emailSection('This week at a glance', emailRow('New sign-ups', newUsers.length) + emailRow('New requests', reqs.length) + emailRow('Subscriptions activated', activated) + emailRow('New buildings', buildings.length) + emailRow('Building views', views.length)) +
      emailSection('Requests by type', reqLines) +
      emailSection('Most viewed buildings (7d)', `<tr><td style="padding:6px 0;color:#111418;font-size:13px;">${topViewed}</td></tr>`);
    const sent = await notifyOwner('URBN weekly recap — ' + date, 'Weekly recap', inner, 'Weekly recap');
    if (sent) await setJobState('weekly_recap', { lastDate: date, at: new Date().toISOString() });
  } catch (e) { console.error('[weeklyRecap]', e.message); }
}
function startBackgroundJobs() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return; // no-op locally
  setTimeout(() => { pollNewSignups(); setInterval(pollNewSignups, 3 * 60 * 1000); }, 25000);
  setTimeout(() => { maybeSendWeeklyRecap(); setInterval(maybeSendWeeklyRecap, 10 * 60 * 1000); }, 40000);
}

server.listen(PORT, () => { console.log(`URBN Platform running on port ${PORT}`); startBackgroundJobs(); });
