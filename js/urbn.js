// URBN Platform v5 — FT Editorial × JLL Institutional

const USER = {
  id: 'demo', name: 'Demo User', company: 'Acme Corporation',
  email: 'demo@acmecorp.com', role: 'corporate_tenant', plan: 'membership',
  saved: ['b001', 'b005', 'b008'],
  intros: [{ bid: 'b001', uid: 'u001a', date: '2026-03-01', status: 'introduced' }],
  alerts: [{ market: 'cairo', sub: 'New Cairo', minSz: 500, maxRent: 1400 }],
};

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
function injectNav(base='') {
  const el = document.getElementById('nav-placeholder');
  if (!el) return;
  el.innerHTML = `
  <nav class="nav">
    <div class="nav-i">
      <a href="${base}index.html" class="logo">
        <div class="logo-mark">U</div>
        <div>
          <span class="logo-text">URBN</span>
          <span class="logo-sub">Office Intelligence</span>
        </div>
      </a>
      <div class="nav-links">
        <a href="${base}pages/search.html">Offices</a>
        <div class="nav-dd">
          <a href="#">Markets</a>
          <div class="nav-dd-panel">
            <a href="${base}pages/search.html?m=cairo">Cairo</a>
            <a href="${base}pages/search.html?m=dubai">Dubai</a>
            <a href="${base}pages/search.html?m=riyadh">Riyadh</a>
            <a href="${base}pages/search.html?m=lagos">Lagos</a>
            <a href="${base}pages/search.html?m=nairobi">Nairobi</a>
            <a href="${base}pages/search.html?m=johannesburg">Johannesburg</a>
            <a href="${base}pages/search.html?m=casablanca">Casablanca</a>
          </div>
        </div>
        <a href="${base}pages/buildings.html">Buildings</a>
        <a href="${base}pages/districts.html">Districts</a>
        <a href="${base}pages/industrial.html">Industrial</a>
        <div class="nav-sep"></div>
        <a href="${base}pages/market-scan.html">Contact</a>
      </div>
      <div class="nav-right">
        <a href="${base}pages/dashboards/tenant.html" class="btn btn-ghost btn-sm">Dashboard</a>
        <a href="${base}pages/market-scan.html" class="btn btn-navy btn-sm">Request Access</a>
      </div>
      <button class="nav-hamburger" id="nav-hamburger" onclick="toggleMobileNav()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-nav" id="mobile-nav">
    <a href="${base}pages/search.html">Offices</a>
    <a href="${base}pages/search.html?m=cairo">Cairo</a>
    <a href="${base}pages/search.html?m=dubai">Dubai</a>
    <a href="${base}pages/search.html?m=riyadh">Riyadh</a>
    <a href="${base}pages/search.html?m=lagos">Lagos</a>
    <a href="${base}pages/search.html?m=nairobi">Nairobi</a>
    <a href="${base}pages/search.html?m=johannesburg">Johannesburg</a>
    <a href="${base}pages/search.html?m=casablanca">Casablanca</a>
    <a href="${base}pages/buildings.html">Buildings</a>
    <a href="${base}pages/districts.html">Districts</a>
    <a href="${base}pages/industrial.html">Industrial</a>
    <a href="${base}pages/market-scan.html">Contact</a>
    <div class="mobile-nav-actions">
      <a href="${base}pages/dashboards/tenant.html" class="btn btn-ghost btn-sm">Dashboard</a>
      <a href="${base}pages/market-scan.html" class="btn btn-navy btn-sm">Request Access</a>
    </div>
  </div>`;
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
            <li><a href="${base}pages/search.html">Browse Offices</a></li>
            <li><a href="${base}pages/buildings.html">Buildings</a></li>
            <li><a href="${base}pages/districts.html">Districts</a></li>
            <li><a href="${base}pages/industrial.html">Industrial</a></li>
            <li><a href="${base}pages/market-scan.html">Market Scan</a></li>
          </ul>
        </div>
        <div class="fc">
          <div class="fc-title">Markets</div>
          <ul>
            <li><a href="${base}pages/search.html?m=cairo">Cairo</a></li>
            <li><a href="${base}pages/search.html?m=dubai">Dubai</a></li>
            <li><a href="${base}pages/search.html?m=riyadh">Riyadh</a></li>
            <li><a href="${base}pages/search.html?m=lagos">Lagos</a></li>
            <li><a href="${base}pages/search.html?m=nairobi">Nairobi</a></li>
            <li><a href="${base}pages/search.html?m=johannesburg">Johannesburg</a></li>
          </ul>
        </div>
        <div class="fc">
          <div class="fc-title">Company</div>
          <ul>
            <li><a href="${base}pages/dashboards/tenant.html">Dashboard</a></li>
            <li><a href="${base}pages/managers.html">Contacts</a></li>
            <li><a href="${base}pages/subscription.html">Access & Pricing</a></li>
            <li><a href="${base}pages/tools/stay-vs-go.html">Stay vs Go</a></li>
          </ul>
        </div>
        <div class="fc">
          <div class="fc-title">Legal</div>
          <ul>
            <li><a href="${base}pages/documents.html">Terms of Use</a></li>
            <li><a href="${base}pages/documents.html">Commission Agreement</a></li>
            <li><a href="${base}pages/documents.html">Privacy Policy</a></li>
            <li><a href="${base}pages/login.html">Sign In</a></li>
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

// ── Toast ────────────────────────────────────────────────
function showToast(msg) {
  let tc = document.querySelector('.tc');
  if (!tc) { tc = document.createElement('div'); tc.className='tc'; document.body.appendChild(tc); }
  const t = document.createElement('div');
  t.className='toast';
  t.innerHTML=`<span class="tm">${msg}</span>`;
  tc.appendChild(t);
  setTimeout(()=>t.remove(),3800);
}

// ── Save ─────────────────────────────────────────────────
function heartSVG(on) {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="${on?'var(--navy)':'none'}" stroke="${on?'var(--navy)':'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}
function toggleSave(id,btn) {
  const i=USER.saved.indexOf(id);
  if(i>-1){USER.saved.splice(i,1);btn.classList.remove('on');showToast('Removed from shortlist');}
  else{USER.saved.push(id);btn.classList.add('on');showToast('Added to shortlist');}
  btn.innerHTML=heartSVG(USER.saved.includes(id));
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
function gradeTag(g){
  return `<span class="lc-grade-tag">${g==='A+'?'Grade A+':'Grade A'}</span>`;
}

// ── Listing card ─────────────────────────────────────────
function renderCard(b, base='') {
  const saved=USER.saved.includes(b.id);
  const mkt=URBN_DATA.markets.find(m=>m.id===b.market);
  return `
  <div class="lc" onclick="window.location.href='${base}pages/building.html?id=${b.id}'">
    <div class="lc-img">
      <img src="${getImg(b.market)}" alt="${b.name}" loading="lazy">
      <div class="lc-img-grad"></div>
      ${gradeTag(b.grade)}
      <button class="lc-save ${saved?'on':''}" onclick="event.stopPropagation();toggleSave('${b.id}',this);">${heartSVG(saved)}</button>
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
          <div class="lc-d-val">${b.parking}:1</div>
          <div class="lc-d-key">Parking</div>
        </div>
      </div>
      <div class="lc-foot">
        <div>
          <div class="lc-rent">${b.rentCurrency} ${fmt(b.rentMin)}–${fmt(b.rentMax)}</div>
          <div class="lc-rent-sub">per ${b.rentUnit}</div>
        </div>
        <span class="btn btn-ghost btn-sm">View →</span>
      </div>
    </div>
  </div>`;
}

function renderAnonCard(b, base='') {
  const mkt=URBN_DATA.markets.find(m=>m.id===b.market);
  return `
  <div class="lc" onclick="openModal('access-modal')">
    <div class="lc-img">
      <img src="${getImg(b.market)}" alt="${b.anonName}" loading="lazy">
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
