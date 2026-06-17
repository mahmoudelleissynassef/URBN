// ── URBN listings data layer ─────────────────────────────────────────────────
// Default (staging/production): only APPROVED Supabase listings are shown.
// Static dummy listings from data/data.js appear ONLY when SHOW_DEMO_LISTINGS is
// enabled (via /api/config). If there are no approved listings, pages show a
// clean empty state — never fake inventory or fake counts.

function shapeBuilding(b, units) {
  const sizes = units.map(u => Number(u.size_sqm)).filter(n => !isNaN(n) && n > 0);
  const rents = units.map(u => Number(u.asking_rent)).filter(n => !isNaN(n) && n > 0);
  const cur = (units.find(u => u.currency) || {}).currency || '';
  const basis = (units.find(u => u.pricing_basis) || {}).pricing_basis || '';
  return {
    id: b.id, name: b.name, market: b.market, submarket: b.submarket || '',
    grade: b.grade || 'A', gla: Number(b.total_gla_sqm) || 0,
    floorplate: Number(b.typical_floorplate_sqm) || 0, floors: Number(b.floors) || 0,
    parking: Number(b.parking_ratio) || 0, yearBuilt: Number(b.year_built) || null,
    availMin: sizes.length ? Math.min(...sizes) : 0, availMax: sizes.length ? Math.max(...sizes) : 0,
    rentMin: rents.length ? Math.min(...rents) : 0, rentMax: rents.length ? Math.max(...rents) : 0,
    rentCurrency: cur, rentUnit: (basis || '').replace(/^per\s+/, ''),
    sustainability: Array.isArray(b.certifications) ? b.certifications : [],
    amenities: Array.isArray(b.amenities) ? b.amenities : [],
    image: b.image_url || null, mapsUrl: b.google_maps_url || '',
    units: units.map(u => ({
      id: u.id, floor: u.unit_floor, size: Number(u.size_sqm) || 0, desks: Number(u.desks) || 0,
      meetingRooms: Number(u.meeting_rooms) || 0, rent: Number(u.asking_rent) || 0, type: u.offering_type,
    })),
  };
}

const URBN_LISTINGS = {
  _ready: null, demo: false, loaded: false, buildings: [],
  load() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      let cfg = {};
      try { cfg = await fetch('/api/config').then(r => r.json()); } catch (e) {}
      this.demo = cfg.showDemoListings === true;
      if (this.demo) {
        this.buildings = (typeof URBN_DATA !== 'undefined' && URBN_DATA.buildings) ? URBN_DATA.buildings : [];
        this.loaded = true; return this.buildings;
      }
      // Real listings come from the server, ANONYMIZED by default. Sensitive
      // identity (name, address, maps pin, operator, raw photos) is only included
      // for buildings the signed-in user has an approved reveal grant for — the
      // server enforces this with the service role (the anon key cannot read the
      // buildings/units tables directly). We pass the access token when signed in.
      try {
        let headers = {};
        if (typeof URBNAuth !== 'undefined') {
          await URBNAuth.init();
          if (URBNAuth.session && URBNAuth.session.access_token) headers.Authorization = 'Bearer ' + URBNAuth.session.access_token;
        }
        const j = await fetch('/api/listings', { headers }).then(r => r.json());
        this.buildings = (j && Array.isArray(j.buildings)) ? j.buildings : [];
      } catch (e) { this.buildings = []; }
      this.loaded = true;
      return this.buildings;
    })();
    return this._ready;
  },
  find(id) { return this.buildings.find(b => b.id === id); },
  byMarket(m) { return this.buildings.filter(b => b.market === m); },
  count(m) { return m ? this.byMarket(m).length : this.buildings.length; },
};

// Shared empty state for listing surfaces.
function listingsEmptyState(base = '../', marketLabel) {
  const where = marketLabel ? ` in ${marketLabel}` : '';
  return `<div style="grid-column:1/-1;text-align:center;padding:64px 24px;color:var(--text-2);">
    <div style="font-family:var(--fd);font-size:26px;color:var(--text);margin-bottom:10px;">No verified buildings are live${where} yet</div>
    <p style="max-width:460px;margin:0 auto 22px;line-height:1.7;">Request a market scan and we’ll build you a verified shortlist, or submit a building for review.</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <a href="${base}pages/market-scan.html" class="btn btn-navy">Request Market Scan →</a>
      <a href="${base}pages/list-building.html" class="btn btn-outline">List Your Building</a>
    </div>
  </div>`;
}
