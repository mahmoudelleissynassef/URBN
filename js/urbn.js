// URBN Platform - Core JS

// ============================================================
// DEMO STATE
// ============================================================
const DEMO_USER = {
  id: 'demo-001', name: 'Demo User', company: 'Acme Corp', email: 'demo@acmecorp.com',
  role: 'corporate_tenant', plan: 'professional', credits: 12,
  savedBuildings: ['b001', 'b005', 'b008'],
  introductions: [
    { buildingId: 'b001', unitId: 'u001a', status: 'introduced', date: '2026-03-01', protected: true },
  ],
  alerts: [{ market: 'cairo', submarket: 'New Cairo', minSize: 500, maxRent: 1400 }],
};

let currentUser = { ...DEMO_USER };
let demoRole = 'corporate_tenant'; // public | corporate_tenant | landlord | admin

// ============================================================
// NAVBAR INJECTION
// ============================================================
function injectNavbar(basePath = '') {
  const nav = document.querySelector('#navbar-placeholder');
  if (!nav) return;
  nav.innerHTML = `
  <nav class="navbar">
    <div class="navbar-inner">
      <a href="${basePath}index.html" class="navbar-logo">
        <div class="logo-mark">U</div>
        <div>
          <span>URBN</span>
          <span class="logo-sub">Corporate Office Intelligence</span>
        </div>
      </a>
      <div class="navbar-nav">
        <a href="${basePath}pages/search.html">Search</a>
        <div class="nav-dropdown">
          <a href="#">Markets ▾</a>
          <div class="nav-dropdown-menu">
            <a href="${basePath}pages/search.html?market=cairo">Cairo</a>
            <a href="${basePath}pages/search.html?market=dubai">Dubai</a>
            <a href="${basePath}pages/search.html?market=riyadh">Riyadh</a>
            <a href="${basePath}pages/search.html?market=nairobi">Nairobi</a>
            <a href="${basePath}pages/search.html?market=lagos">Lagos</a>
            <a href="${basePath}pages/search.html?market=johannesburg">Johannesburg</a>
          </div>
        </div>
        <a href="${basePath}pages/market-dashboard.html">Market Data</a>
        <a href="${basePath}pages/industrial.html">Industrial</a>
        <a href="${basePath}pages/managers.html">Managers</a>
        <a href="${basePath}pages/tools/stay-vs-go.html">Stay vs Go</a>
      </div>
      <div class="navbar-actions">
        <div class="credit-display">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span id="credit-count">${currentUser.credits}</span> credits
        </div>
        <span class="demo-badge">Demo Mode</span>
        <a href="${basePath}pages/dashboards/tenant.html" class="btn btn-ghost btn-sm">Dashboard</a>
        <a href="${basePath}pages/subscription.html" class="btn btn-primary btn-sm">Upgrade</a>
      </div>
    </div>
  </nav>`;
}

// ============================================================
// FOOTER INJECTION
// ============================================================
function injectFooter(basePath = '') {
  const footer = document.querySelector('#footer-placeholder');
  if (!footer) return;
  footer.innerHTML = `
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="brand-name">URBN</div>
          <p>Corporate office intelligence platform serving corporates, multinationals, and first-time market entrants across Africa & MENA.</p>
        </div>
        <div class="footer-col">
          <h4>Platform</h4>
          <ul>
            <li><a href="${basePath}pages/search.html">Search Offices</a></li>
            <li><a href="${basePath}pages/industrial.html">Industrial</a></li>
            <li><a href="${basePath}pages/market-dashboard.html">Market Analytics</a></li>
            <li><a href="${basePath}pages/managers.html">Managers</a></li>
            <li><a href="${basePath}pages/tools/stay-vs-go.html">Stay vs Go Tool</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="${basePath}pages/documents.html">Legal Documents</a></li>
            <li><a href="${basePath}pages/subscription.html">Pricing</a></li>
            <li><a href="${basePath}pages/dashboards/tenant.html">Dashboard</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Markets</h4>
          <ul>
            <li><a href="${basePath}pages/search.html?market=cairo">Cairo</a></li>
            <li><a href="${basePath}pages/search.html?market=dubai">Dubai</a></li>
            <li><a href="${basePath}pages/search.html?market=riyadh">Riyadh</a></li>
            <li><a href="${basePath}pages/search.html?market=lagos">Lagos</a></li>
            <li><a href="${basePath}pages/search.html?market=nairobi">Nairobi</a></li>
            <li><a href="${basePath}pages/search.html?market=johannesburg">Johannesburg</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 URBN PLATFORM · ALL RIGHTS RESERVED · DEAL PROTECTION SYSTEM</p>
        <p>DEMO MODE — NO REAL TRANSACTIONS</p>
      </div>
    </div>
  </footer>`;
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-icon ${type}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
    </div>
    <span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// SAVE / UNSAVE BUILDING
// ============================================================
function toggleSave(buildingId, btn) {
  const idx = currentUser.savedBuildings.indexOf(buildingId);
  if (idx > -1) {
    currentUser.savedBuildings.splice(idx, 1);
    btn.classList.remove('saved');
    btn.innerHTML = heartSVG(false);
    showToast('Removed from saved', 'info');
  } else {
    currentUser.savedBuildings.push(buildingId);
    btn.classList.add('saved');
    btn.innerHTML = heartSVG(true);
    showToast('Building saved to your list');
  }
}

function heartSVG(filled) {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="${filled ? '#c9a84c' : 'none'}" stroke="${filled ? '#c9a84c' : '#888'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
  if (e.target.classList.contains('modal-close')) {
    e.target.closest('.modal-overlay')?.classList.remove('open');
  }
});

// ============================================================
// TABS
// ============================================================
function initTabs(container) {
  const tabs = container.querySelectorAll('.tab-btn');
  const contents = container.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = container.querySelector(`#${tab.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });
}

// ============================================================
// URL PARAMS
// ============================================================
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function fmt(n) { return n?.toLocaleString() || '—'; }
function fmtRent(building) {
  return `${building.rentCurrency} ${fmt(building.rentMin)}–${fmt(building.rentMax)} / ${building.rentUnit}`;
}
function fmtAvail(building) {
  return `${fmt(building.availMin)}–${fmt(building.availMax)} sqm`;
}
function fmtGrade(grade) {
  if (grade === 'A+') return `<span class="badge badge-grade-aplus">Grade A+</span>`;
  return `<span class="badge badge-grade-a">Grade A</span>`;
}

// ============================================================
// BUILDING CARD RENDERER
// ============================================================
function renderBuildingCard(b, isPublic = false) {
  const name = isPublic ? b.anonName : b.name;
  const saved = currentUser.savedBuildings.includes(b.id);
  const market = URBN_DATA.markets.find(m => m.id === b.market);
  const unsplashImages = {
    'cairo': 'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?w=400&q=80',
    'dubai': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400&q=80',
    'riyadh': 'https://images.unsplash.com/photo-1586276393635-5ecd8a851acc?w=400&q=80',
    'casablanca': 'https://images.unsplash.com/photo-1569428034239-f9565e32e224?w=400&q=80',
    'nairobi': 'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=400&q=80',
    'lagos': 'https://images.unsplash.com/photo-1618523023100-7adc284d4f05?w=400&q=80',
    'johannesburg': 'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?w=400&q=80',
    'accra': 'https://images.unsplash.com/photo-1554118879-4e3c0b34c2f8?w=400&q=80',
    'addis': 'https://images.unsplash.com/photo-1568385247005-0d371d214e26?w=400&q=80',
    'amman': 'https://images.unsplash.com/photo-1553244977-ef09dd7706aa?w=400&q=80',
    'luanda': 'https://images.unsplash.com/photo-1574515944794-d6dedc7150de?w=400&q=80',
    'tunis': 'https://images.unsplash.com/photo-1569428034239-f9565e32e224?w=400&q=80',
    'capetown': 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=400&q=80',
  };
  const img = unsplashImages[b.market] || unsplashImages['cairo'];

  return `
  <div class="building-card" onclick="window.location.href='building.html?id=${b.id}'">
    <div class="building-card-image">
      <img src="${img}" alt="${name}" loading="lazy">
      <div class="building-card-image-overlay"></div>
      <div class="building-card-grade">${fmtGrade(b.grade)}</div>
      <button class="building-card-save ${saved ? 'saved' : ''}" onclick="event.stopPropagation();toggleSave('${b.id}',this)" title="Save">
        ${heartSVG(saved)}
      </button>
    </div>
    <div class="building-card-body">
      <div class="building-card-name">${name}</div>
      <div class="building-card-location">
        ${b.submarket} · ${market?.country || ''}
        ${isPublic ? '<span class="badge badge-market" style="margin-left:6px;font-size:9px">REGISTER TO UNLOCK</span>' : ''}
      </div>
      <div class="building-card-specs">
        <div class="building-card-spec">
          <div class="spec-value">${fmt(b.gla)} sqm</div>
          <div class="spec-label">Total GLA</div>
        </div>
        <div class="building-card-spec">
          <div class="spec-value">${fmt(b.floorplate)} sqm</div>
          <div class="spec-label">Floor Plate</div>
        </div>
        <div class="building-card-spec">
          <div class="spec-value">${b.floors}</div>
          <div class="spec-label">Floors</div>
        </div>
        <div class="building-card-spec">
          <div class="spec-value">${b.parking}</div>
          <div class="spec-label">Parking Ratio</div>
        </div>
      </div>
      <div class="building-card-footer">
        <div>
          <div class="building-card-rent">${fmtRent(b)}</div>
          <div class="building-card-avail">Avail: ${fmtAvail(b)}</div>
        </div>
        <div class="btn btn-dark btn-sm">View →</div>
      </div>
    </div>
  </div>`;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Init all tab containers
  document.querySelectorAll('[data-tabs]').forEach(initTabs);
});
