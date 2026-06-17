// URBN Platform v5 — FT Editorial × JLL Institutional

// Client-side UI state only. NOT a logged-in user — real auth is Supabase
// (URBNAuth below). `saved` is hydrated from saved_properties when signed in.
const USER = { saved: [], intros: [], alerts: [] };

// ── Supabase Auth ────────────────────────────────────────
// Loads the Supabase JS client from CDN (no build step / npm needed) and reads
// the publishable anon key from /api/config. The service-role key is never used
// in the browser. Session persists in localStorage (per-origin).
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src; el.onload = () => resolve(); el.onerror = () => reject(new Error('script_load_failed'));
    document.head.appendChild(el);
  });
}

const URBNAuth = {
  client: null, session: null, user: null, _ready: null,
  init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      try { await loadScriptOnce('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'); }
      catch (e) { console.warn('[auth] supabase-js failed to load'); return this; }
      let cfg = {};
      try { cfg = await fetch('/api/config').then(r => r.json()); } catch (e) {}
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
        this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey,
          { auth: { persistSession: true, autoRefreshToken: true } });
        try {
          const { data } = await this.client.auth.getSession();
          this.session = (data && data.session) || null;
          this.user = (this.session && this.session.user) || null;
          this.client.auth.onAuthStateChange((_e, sess) => {
            URBNAuth.session = sess; URBNAuth.user = sess ? sess.user : null; updateAuthNav();
            URBNAuth.checkAdmin();
          });
          if (this.user) { hydrateSaved(); this.checkAdmin(); }
        } catch (e) {}
      } else {
        console.warn('[auth] Supabase not configured (set SUPABASE_URL + SUPABASE_ANON_KEY)');
      }
      return this;
    })();
    return this._ready;
  },
  admin: false,
  // Check admin status server-side (admin_users table) and reveal admin nav.
  async checkAdmin() {
    if (!this.user || !this.session) { this.admin = false; updateAdminNav(); return false; }
    try {
      const res = await fetch('/api/admin/me', { headers: { Authorization: 'Bearer ' + this.session.access_token } });
      const j = await res.json();
      this.admin = !!(j && j.admin);
    } catch (e) { this.admin = false; }
    updateAdminNav();
    return this.admin;
  },
  async signOut() {
    await this.init();
    if (this.client) { try { await this.client.auth.signOut(); } catch (e) {} }
    this.session = null; this.user = null; this.admin = false; updateAuthNav();
  },
  // Gate a page: resolves to the user, or redirects to sign-in.
  async requireAuth(redirect = '/sign-in') {
    await this.init();
    if (!this.user) { location.href = redirect + '?next=' + encodeURIComponent(location.pathname); return null; }
    return this.user;
  },
};

// Show signed-in vs signed-out nav items.
function updateAuthNav() {
  const signedIn = !!(typeof URBNAuth !== 'undefined' && URBNAuth.user);
  document.querySelectorAll('[data-auth="in"]').forEach(el => { el.style.display = signedIn ? '' : 'none'; });
  document.querySelectorAll('[data-auth="out"]').forEach(el => { el.style.display = signedIn ? 'none' : ''; });
  updateAdminNav();
}
// Admin nav links show only for verified admins (server-checked).
function updateAdminNav() {
  const show = !!(typeof URBNAuth !== 'undefined' && URBNAuth.user && URBNAuth.admin);
  document.querySelectorAll('[data-admin]').forEach(el => { el.style.display = show ? '' : 'none'; });
}

// Pull the user's saved building ids into USER.saved (best-effort).
async function hydrateSaved() {
  try {
    if (!URBNAuth.client || !URBNAuth.user) return;
    // Favorites are keyed on the unit (listing) now, not the building.
    const { data } = await URBNAuth.client.from('saved_properties').select('unit_id').eq('user_id', URBNAuth.user.id);
    if (Array.isArray(data)) { USER.saved = data.map(r => r.unit_id).filter(Boolean); }
  } catch (e) { /* table may not exist yet */ }
}

const IMG = {
  cairo:'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?w=600&q=80',
  dubai:'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80',
  riyadh:'https://images.unsplash.com/photo-1586276393635-5ecd8a851acc?w=600&q=80',
  casablanca:'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80',
  nairobi:'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=600&q=80',
  lagos:'https://images.unsplash.com/photo-1618523023100-7adc284d4f05?w=600&q=80',
  johannesburg:'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?w=600&q=80',
  accra:'https://images.unsplash.com/photo-1554118879-4e3c0b34c2f8?w=600&q=80',
  addis:'https://images.unsplash.com/photo-1568385247005-0d371d214e26?w=600&q=80',
  amman:'https://images.unsplash.com/photo-1553244977-ef09dd7706aa?w=600&q=80',
  luanda:'https://images.unsplash.com/photo-1574515944794-d6dedc7150de?w=600&q=80',
  tunis:'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80',
  capetown:'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=600&q=80',
};

// ── Nav ─────────────────────────────────────────────────
// All links use absolute, clean URLs (no ".html", no "/pages/..."). The `base`
// argument is kept for backward compatibility but ignored — every page is served
// from clean canonical routes on the single main domain.
function injectNav(base='') {
  const el = document.getElementById('nav-placeholder');
  if (!el) return;
  el.innerHTML = `
  <nav class="nav">
    <div class="nav-i">
      <a href="/" class="logo">
        <div class="logo-mark">U</div>
        <div>
          <span class="logo-text">URBN</span>
          <span class="logo-sub" style="text-transform:none;letter-spacing:.02em;">a Heirstone Consulting company</span>
        </div>
      </a>
      <div class="nav-links">
        <a href="/offices">Offices</a>
        <div class="nav-dd">
          <a href="/markets">Markets</a>
          <div class="nav-dd-panel">
            <a href="/offices-in-cairo">Cairo</a>
            <a href="/offices-in-nairobi">Nairobi</a>
            <a href="/offices-in-casablanca">Casablanca</a>
            <a href="/offices-in-accra">Accra</a>
            <a href="/offices-in-addis-ababa">Addis Ababa</a>
            <a href="/offices-in-johannesburg">Johannesburg</a>
            <a href="/offices-in-cape-town">Cape Town</a>
            <a href="/offices-in-kigali">Kigali</a>
            <a href="/offices-in-abidjan">Abidjan</a>
          </div>
        </div>
        <a href="/buildings">Buildings</a>
        <a href="/districts">Districts</a>
        <a href="/industrial">Industrial</a>
        <div class="nav-dd">
          <a href="/stay-vs-go">Tools</a>
          <div class="nav-dd-panel">
            <a href="/stay-vs-go">Stay vs Go</a>
            <a href="/market-scan">Market Scan</a>
            <a href="/insights">Insights</a>
            <a href="/saved" data-auth="in" style="display:none;">Saved Properties</a>
          </div>
        </div>
        <a href="/list-building">List Your Building</a>
        <a href="/pricing">Pricing</a>
        <div class="nav-sep"></div>
        <a href="/contact">Contact</a>
      </div>
      <div class="nav-right">
        <a href="/sign-in" class="btn btn-ghost btn-sm" data-auth="out">Sign In</a>
        <a href="/admin" class="btn btn-ghost btn-sm" data-admin style="display:none;">Admin</a>
        <a href="/dashboard" class="btn btn-ghost btn-sm" data-auth="in" style="display:none;">Dashboard</a>
        <a href="/account" class="btn btn-ghost btn-sm" data-auth="in" style="display:none;">Account</a>
        <button class="btn btn-ghost btn-sm" data-auth="in" style="display:none;" onclick="URBNAuth.signOut().then(()=>location.href='/')">Sign Out</button>
        <button class="btn btn-navy btn-sm" data-auth="out" onclick="openModal('access-modal')">Request Access</button>
      </div>
      <button class="nav-hamburger" id="nav-hamburger" onclick="toggleMobileNav()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-nav" id="mobile-nav">
    <a href="/offices">Offices</a>
    <a href="/markets">Markets</a>
    <a href="/offices-in-cairo">Cairo</a>
    <a href="/offices-in-nairobi">Nairobi</a>
    <a href="/offices-in-casablanca">Casablanca</a>
    <a href="/offices-in-accra">Accra</a>
    <a href="/offices-in-johannesburg">Johannesburg</a>
    <a href="/buildings">Buildings</a>
    <a href="/districts">Districts</a>
    <a href="/industrial">Industrial</a>
    <a href="/stay-vs-go">Stay vs Go</a>
    <a href="/insights">Insights</a>
    <a href="/list-building">List Your Building</a>
    <a href="/pricing">Pricing</a>
    <a href="/contact">Contact</a>
    <div class="mobile-nav-actions">
      <a href="/sign-in" class="btn btn-ghost btn-sm" data-auth="out">Sign In</a>
      <a href="/admin" class="btn btn-ghost btn-sm" data-admin style="display:none;">Admin</a>
      <a href="/dashboard" class="btn btn-ghost btn-sm" data-auth="in" style="display:none;">Dashboard</a>
      <a href="/account" class="btn btn-ghost btn-sm" data-auth="in" style="display:none;">Account</a>
      <button class="btn btn-ghost btn-sm" data-auth="in" style="display:none;" onclick="URBNAuth.signOut().then(()=>location.href='/')">Sign Out</button>
      <button class="btn btn-navy btn-sm" data-auth="out" onclick="toggleMobileNav();openModal('access-modal')">Request Access</button>
    </div>
  </div>`;
  injectAccessModal(base);
  updateAuthNav();
  URBNAuth.init().then(updateAuthNav);
}

// ── Mobile Nav Toggle ────────────────────────────────────
function toggleMobileNav() {
  const btn = document.getElementById('nav-hamburger');
  const menu = document.getElementById('mobile-nav');
  if (!btn || !menu) return;
  btn.classList.toggle('open');
  menu.classList.toggle('open');
}

// ── Footer ───────────────────────────────────────────────
function injectFooter(base='') {
  const el = document.getElementById('footer-placeholder');
  if (!el) return;
  el.innerHTML = `
  <footer class="footer">
    <div class="w">
      <div class="footer-grid">
        <div>
          <div class="footer-brand-name">URBN</div>
          <div class="footer-brand-sub">Corporate Office Intelligence</div>
          <p class="footer-brand-desc">Premium office discovery for corporate occupiers entering Africa & MENA. Verified listings. Protected introductions.</p>
        </div>
        <div class="fc">
          <div class="fc-title">Platform</div>
          <ul>
            <li><a href="/offices">Browse Offices</a></li>
            <li><a href="/markets">Markets</a></li>
            <li><a href="/buildings">Buildings</a></li>
            <li><a href="/districts">Districts</a></li>
            <li><a href="/industrial">Industrial</a></li>
            <li><a href="/stay-vs-go">Stay vs Go</a></li>
            <li><a href="/insights">Insights</a></li>
          </ul>
        </div>
        <div class="fc">
          <div class="fc-title">Offices by city</div>
          <ul>
            <li><a href="/offices-in-cairo">Offices in Cairo</a></li>
            <li><a href="/offices-in-nairobi">Offices in Nairobi</a></li>
            <li><a href="/offices-in-casablanca">Offices in Casablanca</a></li>
            <li><a href="/offices-in-accra">Offices in Accra</a></li>
            <li><a href="/offices-in-addis-ababa">Offices in Addis Ababa</a></li>
            <li><a href="/offices-in-johannesburg">Offices in Johannesburg</a></li>
            <li><a href="/offices-in-cape-town">Offices in Cape Town</a></li>
            <li><a href="/offices-in-kigali">Offices in Kigali</a></li>
            <li><a href="/offices-in-abidjan">Offices in Abidjan</a></li>
          </ul>
        </div>
        <div class="fc">
          <div class="fc-title">Company</div>
          <ul>
            <li><a href="/list-building">List Your Building</a></li>
            <li><a href="/pricing">Pricing</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/dashboard">Dashboard</a></li>
          </ul>
        </div>
        <div class="fc">
          <div class="fc-title">Legal</div>
          <ul>
            <li><a href="/terms">Terms of Use</a></li>
            <li><a href="/documents">Commission Agreement</a></li>
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/sign-in">Sign In</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-rule"></div>
      <div class="footer-bot">
        <p>© 2026 URBN Platform · Corporate Office Intelligence</p>
        <p>Dubai, UAE · All Rights Reserved</p>
      </div>
    </div>
  </footer>`;
}

// ── Access modal (injected on every page so "Request Access" works site-wide) ──
function injectAccessModal(base='') {
  if (document.getElementById('access-modal')) return; // never duplicate
  const markets = (typeof URBN_DATA !== 'undefined') ? URBN_DATA.markets.length : '';
  const modal = document.createElement('div');
  modal.className = 'mbg';
  modal.id = 'access-modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="mh"><div><div class="label mb12">Restricted Access</div><h3>Request Access</h3></div><div class="mx">X</div></div>
      <div class="mb" id="access-body">
        <p style="font-size:14px;color:var(--text-2);margin-bottom:20px;line-height:1.7;">Registering unlocks <strong style="color:var(--text);">full floor-by-floor availability, asking rents, and the ability to request protected introductions</strong> across all ${markets} markets. Credentials are issued to verified corporate tenants.</p>
        <div class="fg"><label class="fl">Corporate Email</label><input type="email" class="fi" id="reg-email" placeholder="you@company.com"><div class="fld-err" id="err-reg-email">Enter a valid corporate email address.</div></div>
        <div class="fg"><label class="fl">Company Name</label><input type="text" class="fi" id="reg-company" placeholder="Your company"><div class="fld-err" id="err-reg-company">Enter your company name.</div></div>
        <div class="fg"><label class="fl">Target Market</label><select class="fi fi-sel" id="reg-market"><option value="">Select market...</option></select><div class="fld-err" id="err-reg-market">Please select a target market.</div></div>
        <div class="fg"><label class="fl">Required Area (sqm)</label><input type="number" class="fi" id="reg-area" placeholder="e.g. 800"></div>
        <div class="hp-field" aria-hidden="true"><label>Do not fill this in<input type="text" id="reg-website" tabindex="-1" autocomplete="off"></label></div>
        <label class="consent">
          <input type="checkbox" id="reg-consent" required aria-required="true">
          <span>I agree to URBN processing these details to assess and grant access, per the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Use</a>.</span>
        </label>
        <div class="fld-err" id="err-reg-consent" style="margin-top:8px;">Please confirm you accept the Privacy Policy and Terms of Use.</div>
      </div>
      <div class="mf" id="access-actions">
        <button class="btn btn-ghost" onclick="closeModal('access-modal')">Cancel</button>
        <button class="btn btn-navy" onclick="submitAccess(this)">Submit Request</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const sel = document.getElementById('reg-market');
  if (sel && typeof URBN_DATA !== 'undefined') {
    URBN_DATA.markets.forEach(m => sel.innerHTML += `<option value="${m.id}">${m.name}, ${m.country}</option>`);
  }
}

async function submitAccess(btn) {
  if (botFilled('reg-website')) return; // honeypot

  const email = document.getElementById('reg-email').value.trim();
  const company = document.getElementById('reg-company').value.trim();
  const market = document.getElementById('reg-market').value;
  const area = document.getElementById('reg-area').value.trim();
  const consent = document.getElementById('reg-consent').checked;

  let ok = true;
  const emailOk = isCorporateEmail(email);
  fldErr('reg-email', 'err-reg-email', !emailOk);      ok = ok && emailOk;
  fldErr('reg-company', 'err-reg-company', !company);  ok = ok && !!company;
  fldErr('reg-market', 'err-reg-market', !market);     ok = ok && !!market;
  document.getElementById('err-reg-consent').classList.toggle('show', !consent); ok = ok && consent;

  if (!ok) { showToast('Please complete the highlighted fields.', 'error'); return; }

  setBtnBusy(btn, true);
  const result = await postRequest({
    requestType: 'access', sourcePage: location.pathname,
    website: document.getElementById('reg-website').value,
    email, company, market, area,
  });
  setBtnBusy(btn, false);

  if (!result.ok) {
    showToast('Submission failed — please try again.', 'error');
    let f = document.getElementById('access-fail');
    if (!f) { f = document.createElement('div'); f.id = 'access-fail'; f.className = 'fld-err show'; f.style.marginTop = '12px'; document.getElementById('access-actions').before(f); }
    f.innerHTML = requestFailHTML();
    return;
  }

  document.getElementById('access-body').innerHTML =
    `<div class="form-success"><h3>Request received</h3><p>Thank you. URBN will review your request and issue credentials to <strong style="color:var(--navy);">${email}</strong> within 24 business hours.</p></div>`;
  document.getElementById('access-actions').innerHTML =
    `<button class="btn btn-navy" onclick="closeModal('access-modal')">Close</button>`;
}

// ── Toast ────────────────────────────────────────────────
function showToast(msg, type='success') {
  let tc = document.querySelector('.tc');
  if (!tc) { tc = document.createElement('div'); tc.className='tc'; document.body.appendChild(tc); }
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-'+type : '');
  t.innerHTML=`<span class="tm">${msg}</span>`;
  tc.appendChild(t);
  setTimeout(()=>t.remove(),3800);
}
// Alias used across pages (building.html, market-scan.html, …)
function toast(msg, type) { return showToast(msg, type); }

// ── Form validation helpers ──────────────────────────────
function fldErr(inputId, errId, show) {
  const i = document.getElementById(inputId), e = document.getElementById(errId);
  if (i) i.classList.toggle('fi-err', !!show);
  if (e) e.classList.toggle('show', !!show);
}
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v||'').trim()); }
const FREE_EMAIL_DOMAINS = ['gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','icloud.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com'];
// A plausible corporate address: valid format and not a consumer webmail domain.
function isCorporateEmail(v) {
  if (!isEmail(v)) return false;
  return !FREE_EMAIL_DOMAINS.includes(v.trim().split('@')[1].toLowerCase());
}
// Honeypot: returns true if the hidden anti-spam field was filled (i.e. a bot).
function botFilled(id) { const el = document.getElementById(id); return !!(el && el.value.trim()); }

// ── Backend submission (POST /api/request) ───────────────
// Public fallback inbox shown if a submission can't reach the backend.
const REQUEST_FALLBACK_EMAIL = 'mahmoud.nassef@urbnoffices.com';
async function postRequest(payload) {
  try {
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let json = {};
    try { json = await res.json(); } catch (e) { /* non-JSON response */ }
    // Success only when the backend confirms the request was stored.
    return { ok: res.ok && json.ok === true, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { error: 'network' } };
  }
}
function requestFailHTML() {
  return `We couldn&#39;t submit your request just now. Please email <a href="mailto:${REQUEST_FALLBACK_EMAIL}">${REQUEST_FALLBACK_EMAIL}</a> and we&#39;ll pick it up directly.`;
}
function setBtnBusy(btn, busy, busyLabel = 'Sending…') {
  if (!btn) return;
  if (busy) { btn.dataset.prevLabel = btn.textContent; btn.disabled = true; btn.textContent = busyLabel; }
  else { btn.disabled = false; if (btn.dataset.prevLabel) btn.textContent = btn.dataset.prevLabel; }
}
function chipValues(containerId) {
  return [...document.querySelectorAll('#' + containerId + ' .chip.on')].map(c => c.textContent.trim());
}

// ── Allowed currencies per market ────────────────────────
// Each market allows its local currency + USD. Francophone West African (XOF)
// markets additionally allow EUR. No live FX — these are just the accepted
// quoting currencies. Server mirrors this in server.js (keep both in sync).
const FRANCOPHONE_WA_MARKETS = ['dakar', 'abidjan', 'bamako', 'ouagadougou', 'lome', 'cotonou', 'niamey'];
function allowedCurrencies(marketId) {
  const m = (typeof URBN_DATA !== 'undefined') ? URBN_DATA.markets.find(x => x.id === marketId) : null;
  const local = m ? m.currency : null;
  const out = [];
  if (local) out.push(local);
  out.push('USD');
  if (local === 'XOF' || FRANCOPHONE_WA_MARKETS.includes(marketId)) out.push('EUR');
  return [...new Set(out)];
}

// ── Save ─────────────────────────────────────────────────
function heartSVG(on) {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="${on?'var(--navy)':'none'}" stroke="${on?'var(--navy)':'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}
async function toggleSave(id,btn) {
  await URBNAuth.init();
  if (!URBNAuth.user) {
    showToast('Sign in to save properties to your shortlist', 'info');
    setTimeout(() => { location.href = '/sign-in?next=' + encodeURIComponent(location.pathname + location.search); }, 1100);
    return;
  }
  const adding = !USER.saved.includes(id);
  // Optimistic UI
  if (adding) { USER.saved.push(id); btn.classList.add('on'); }
  else { USER.saved.splice(USER.saved.indexOf(id), 1); btn.classList.remove('on'); }
  btn.innerHTML = heartSVG(USER.saved.includes(id));
  try {
    if (adding) {
      await URBNAuth.client.from('saved_properties').insert({ user_id: URBNAuth.user.id, unit_id: id });
      showToast('Added to shortlist');
    } else {
      await URBNAuth.client.from('saved_properties').delete().eq('user_id', URBNAuth.user.id).eq('unit_id', id);
      showToast('Removed from shortlist');
    }
  } catch (e) {
    showToast('Could not update shortlist — please try again', 'error');
  }
}

// ── Modal ────────────────────────────────────────────────
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
document.addEventListener('click',e=>{
  if(e.target.classList.contains('mbg'))e.target.classList.remove('open');
  if(e.target.classList.contains('mx'))e.target.closest('.mbg')?.classList.remove('open');
});

// ── Tabs ─────────────────────────────────────────────────
function initTabs(wrap) {
  const tabs=wrap.querySelectorAll('.tab'),panels=wrap.querySelectorAll('.tp');
  tabs.forEach(t=>t.addEventListener('click',()=>{
    tabs.forEach(x=>x.classList.remove('on'));panels.forEach(x=>x.classList.remove('on'));
    t.classList.add('on');wrap.querySelector('#'+t.dataset.t)?.classList.add('on');
  }));
}

// ── Helpers ──────────────────────────────────────────────
function p(n){return new URLSearchParams(window.location.search).get(n);}
function fmt(n){return n?.toLocaleString()||'—';}
function getImg(m){return IMG[m]||IMG.cairo;}
// Per-building image first (so distinct listings never share a landmark),
// falling back to the market image, then a neutral default.
function imgFor(b){
  if (b && b.image) return b.image; // real listing's own image
  if (b && typeof URBN_DATA!=='undefined' && URBN_DATA.buildingImages && URBN_DATA.buildingImages[b.id]) {
    return URBN_DATA.buildingImages[b.id];
  }
  return getImg(b && b.market);
}
function gradeTag(g){
  return `<span class="lc-grade-tag">${g==='A+'?'Grade A+':'Grade A'}</span>`;
}
// Inline grade badge (used on building detail + units view, not absolutely positioned)
function gradeB(g){
  return `<span class="badge badge-grade">${g==='A+'?'Grade A+':'Grade A'}</span>`;
}

// ── Parking display (handles new {spaces,arrangement} object or legacy ratio) ──
function parkingDatum(b) {
  const pk = b && b.parking;
  if (pk && typeof pk === 'object') {
    if (pk.spaces != null) return fmt(pk.spaces) + ' spaces';
    if (pk.arrangement) return pk.arrangement.charAt(0).toUpperCase() + pk.arrangement.slice(1);
    return '—';
  }
  return (pk != null && pk !== '') ? pk + ':1' : '—';
}
// Neutral market placeholder used when a listing has no admin-approved public
// image (keeps anonymized cards from exposing the real building).
function cardImg(b) { return imgFor(b); }

// ── Listing card ─────────────────────────────────────────
// Listings are anonymized by default — `b.name` is the verified label unless the
// viewer has an approved reveal grant (server-enforced; see /api/listings).
function renderCard(b, base='', opts={}) {
  const saved=USER.saved.includes(b.id);
  const mkt=URBN_DATA.markets.find(m=>m.id===b.market);
  const fallback = getImg(b.market);
  const blur = b.imageClear === false;   // free/anonymous viewers see a blurred tease
  return `
  <div class="lc" onclick="window.location.href='/building?id=${b.id}'">
    <div class="lc-img">
      <img src="${cardImg(b)}" onerror="this.onerror=null;this.src='${fallback}'" alt="${b.name}" loading="lazy"${blur?' style="filter:blur(18px);transform:scale(1.08);"':''}>
      <div class="lc-img-grad"></div>
      ${gradeTag(b.grade)}
      ${blur?`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;"><span style="background:rgba(28,46,74,.85);color:#fff;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;padding:5px 11px;border-radius:4px;">🔒 Upgrade to view</span></div>`:''}
      ${opts.noSave?'':`<button class="lc-save ${saved?'on':''}" onclick="event.stopPropagation();toggleSave('${b.id}',this);">${heartSVG(saved)}</button>`}
    </div>
    <div class="lc-body">
      <div class="lc-name">${b.name}</div>
      <div class="lc-district">${b.submarket} · ${mkt?.country||''}</div>
      <div class="lc-data">
        <div class="lc-datum">
          <div class="lc-d-val">${fmt(b.availMin)}–${fmt(b.availMax)} sqm</div>
          <div class="lc-d-key">Available Area</div>
        </div>
        <div class="lc-datum">
          <div class="lc-d-val">${fmt(b.floorplate)} sqm</div>
          <div class="lc-d-key">Floor Plate</div>
        </div>
        <div class="lc-datum">
          <div class="lc-d-val">${b.floors}</div>
          <div class="lc-d-key">Floors</div>
        </div>
        <div class="lc-datum">
          <div class="lc-d-val">${parkingDatum(b)}</div>
          <div class="lc-d-key">Parking</div>
        </div>
      </div>
      <div class="lc-foot">
        <div>
          <div class="lc-rent">${b.rentCurrency} ${fmt(b.rentMin)}–${fmt(b.rentMax)}</div>
          <div class="lc-rent-sub">${b.anonymized ? 'indicative / ' : 'per '}${b.rentUnit}</div>
        </div>
        <span class="btn btn-ghost btn-sm">${b.anonymized ? 'Details on request →' : 'View →'}</span>
      </div>
    </div>
  </div>`;
}

// ── Listing card (per UNIT — the public-facing, favoritable entity) ───────────
function renderListingCard(L, base='') {
  const saved = USER.saved.includes(L.id);
  const mkt = (typeof URBN_DATA !== 'undefined') ? URBN_DATA.markets.find(m => m.id === L.market) : null;
  const fallback = getImg(L.market);
  const blur = L.imageClear === false;
  const img = L.image || fallback;
  const usd = (L.rentUsd && L.rentCurrency && L.rentCurrency !== 'USD') ? ` <span style="color:var(--text-2);font-weight:400;">(~USD ${fmt(L.rentUsd)})</span>` : '';
  return `
  <div class="lc" onclick="window.location.href='/building?id=${L.buildingId}&u=${L.id}'">
    <div class="lc-img">
      <img src="${img}" onerror="this.onerror=null;this.src='${fallback}'" alt="${L.name}" loading="lazy"${blur?' style="filter:blur(18px);transform:scale(1.08);"':''}>
      <div class="lc-img-grad"></div>
      ${gradeTag(L.grade)}
      ${blur?`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;"><span style="background:rgba(28,46,74,.85);color:#fff;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;padding:5px 11px;border-radius:4px;">🔒 Upgrade to view</span></div>`:''}
      <button class="lc-save ${saved?'on':''}" onclick="event.stopPropagation();toggleSave('${L.id}',this);">${heartSVG(saved)}</button>
    </div>
    <div class="lc-body">
      <div class="lc-name">${L.name}</div>
      <div class="lc-district">${L.submarket||''} · ${mkt?.country||''}${L.offeringType?' · '+L.offeringType:''}</div>
      <div class="lc-data">
        <div class="lc-datum"><div class="lc-d-val">${fmt(L.size)} sqm</div><div class="lc-d-key">Size</div></div>
        <div class="lc-datum"><div class="lc-d-val">${L.floor||'—'}</div><div class="lc-d-key">Floor</div></div>
        <div class="lc-datum"><div class="lc-d-val">${L.desks?fmt(L.desks):'—'}</div><div class="lc-d-key">Desks</div></div>
        <div class="lc-datum"><div class="lc-d-val">${parkingDatum(L)}</div><div class="lc-d-key">Parking</div></div>
      </div>
      <div class="lc-foot">
        <div>
          <div class="lc-rent">${L.rentCurrency||''} ${fmt(L.rent)}${usd}</div>
          <div class="lc-rent-sub">${L.anonymized?'indicative / ':'per '}${L.rentUnit||'sqm'}</div>
        </div>
        <span class="btn btn-ghost btn-sm">${L.anonymized?'Details on request →':'View →'}</span>
      </div>
    </div>
  </div>`;
}

// ── In-app listing requests (reveal / site-visit / offer / introduction) ──────
// Requires sign-in. Posts to the authenticated /api/listing-request endpoint.
async function requestListingAction(type, buildingId, extra = {}) {
  await URBNAuth.init();
  if (!URBNAuth.user || !URBNAuth.session) {
    showToast('Sign in to continue', 'info');
    setTimeout(() => { location.href = '/sign-in?next=' + encodeURIComponent(location.pathname + location.search); }, 1000);
    return { ok: false, redirect: true };
  }
  try {
    const res = await fetch('/api/listing-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + URBNAuth.session.access_token },
      body: JSON.stringify({ type, buildingId, sourcePage: location.pathname, ...extra }),
    });
    let j = {}; try { j = await res.json(); } catch (e) {}
    return { ok: res.ok && j.ok === true, json: j };
  } catch (e) { return { ok: false, json: { error: 'network' } }; }
}

function renderAnonCard(b, base='') {
  const mkt=URBN_DATA.markets.find(m=>m.id===b.market);
  return `
  <div class="lc" onclick="openModal('access-modal')">
    <div class="lc-img">
      <img src="${imgFor(b)}" alt="${b.anonName}" loading="lazy">
      <div class="lc-img-grad"></div>
      ${gradeTag(b.grade)}
    </div>
    <div class="lc-body">
      <div class="lc-name">${b.anonName}</div>
      <div class="lc-district">${b.submarket} · ${mkt?.country||''}</div>
      <div class="lc-data">
        <div class="lc-datum">
          <div class="lc-d-val">${fmt(b.availMin)}–${fmt(b.availMax)} sqm</div>
          <div class="lc-d-key">Available Range</div>
        </div>
        <div class="lc-datum">
          <div class="lc-d-val">${fmt(b.floorplate)} sqm</div>
          <div class="lc-d-key">Floor Plate</div>
        </div>
        <div class="lc-datum">
          <div class="lc-d-val">${b.floors}</div>
          <div class="lc-d-key">Floors</div>
        </div>
        <div class="lc-datum">
          <div class="lc-d-val">${b.parking}:1</div>
          <div class="lc-d-key">Parking</div>
        </div>
      </div>
      <div class="lc-foot">
        <div>
          <div class="lc-rent">${b.rentCurrency} ${fmt(b.rentMin)}–${fmt(b.rentMax)}</div>
          <div class="lc-rent-sub">indicative / ${b.rentUnit}</div>
        </div>
        <span class="btn btn-outline btn-sm">Request Access →</span>
      </div>
    </div>
  </div>`;
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-tabs]').forEach(initTabs);
});
