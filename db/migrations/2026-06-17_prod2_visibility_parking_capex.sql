-- ============================================================================
-- URBN prod-2 migration — listing visibility/reveal, parking & amenities,
-- media flags, construction costs, review metadata.
-- 100% ADDITIVE + access tightening. No columns or data are dropped.
-- Safe to run more than once (IF NOT EXISTS / IF EXISTS guards throughout).
-- ============================================================================

-- ── A) Listing access grants (reveal model) ────────────────────────────────
create table if not exists public.listing_access_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  building_id text references public.buildings(id) on delete cascade,
  unit_id     uuid references public.units(id) on delete set null,
  request_id  uuid references public.client_requests(id) on delete set null,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz,
  expires_at  timestamptz,
  notes       text,
  status      text not null default 'requested'
              check (status in ('requested','approved','rejected','revoked')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_access_grants_user on public.listing_access_grants(user_id);
create index if not exists idx_access_grants_building on public.listing_access_grants(building_id);
alter table public.listing_access_grants enable row level security;
-- Users may read their own grants; all writes go through the server (service role).
drop policy if exists "read own grants" on public.listing_access_grants;
create policy "read own grants" on public.listing_access_grants
  for select using (auth.uid() = user_id);

-- ── F) Buildings: parking + detail columns ─────────────────────────────────
-- (year_built, floors, total_gla_sqm, typical_floorplate_sqm, grade,
--  certifications, amenities, address, google_maps_url, image_url already exist)
alter table public.buildings add column if not exists building_height_m numeric;
alter table public.buildings add column if not exists parking_spaces_available integer;
alter table public.buildings add column if not exists parking_arrangement text;            -- free | paid | mixed | none
alter table public.buildings add column if not exists parking_included_in_rent text;        -- yes | no | partially
alter table public.buildings add column if not exists parking_price_per_spot_month numeric;
alter table public.buildings add column if not exists visitor_parking_hourly_rate numeric;
alter table public.buildings add column if not exists parking_monthly_membership_available boolean;
alter table public.buildings add column if not exists parking_monthly_membership_price numeric;
alter table public.buildings add column if not exists parking_notes text;

-- ── E/F) Units: unit-level parking ─────────────────────────────────────────
alter table public.units add column if not exists allocated_parking_spaces integer;
alter table public.units add column if not exists parking_included boolean;
alter table public.units add column if not exists unit_parking_price numeric;

-- ── H) Listing media: public-safe / main / approved-for-public flags ───────
alter table public.listing_media add column if not exists is_public_safe boolean not null default false;
alter table public.listing_media add column if not exists is_main boolean not null default false;
alter table public.listing_media add column if not exists approved_for_public boolean not null default false;

-- ── C) Review metadata ─────────────────────────────────────────────────────
-- client_requests already has reviewed_by, reviewed_at, review_note.
alter table public.client_requests add column if not exists review_reason text;
-- listing_batch_rows needs full review metadata.
alter table public.listing_batch_rows add column if not exists review_reason text;
alter table public.listing_batch_rows add column if not exists review_note text;
alter table public.listing_batch_rows add column if not exists reviewed_by uuid references auth.users(id);
alter table public.listing_batch_rows add column if not exists reviewed_at timestamptz;

-- ── K) Market construction / CAPEX inputs ──────────────────────────────────
create table if not exists public.market_construction_costs (
  id                          uuid primary key default gen_random_uuid(),
  market                      text not null,
  currency                    text not null,
  effective_date              date,
  shell_core_to_cat_a_per_sqm numeric,
  cat_a_to_cat_b_per_sqm      numeric,
  fitout_basic_per_sqm        numeric,
  fitout_standard_per_sqm     numeric,
  fitout_premium_per_sqm      numeric,
  furniture_per_workstation   numeric,
  it_av_per_workstation       numeric,
  professional_fees_pct       numeric,
  contingency_pct             numeric,
  reinstatement_per_sqm       numeric,
  moving_cost_allowance       numeric,
  notes                       text,
  updated_by                  uuid references auth.users(id),
  updated_at                  timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);
create index if not exists idx_constr_costs_market on public.market_construction_costs(market, effective_date desc);
-- Managed by admin via the server (service role). RLS on, no public policy
-- (the Stay vs Go tool reads the latest-per-market through a server endpoint).
alter table public.market_construction_costs enable row level security;

-- ── A/H) Enforce server-side visibility: stop exposing full building/unit
--        rows directly to anon/authenticated. Anonymized data + reveals are
--        now served only through the server (service role) at /api/listings.
--        This drops READ POLICIES only — no table, column, or data is removed.
drop policy if exists "approved buildings public" on public.buildings;
drop policy if exists "approved units public"     on public.units;

-- ============================================================================
-- End of migration.
-- ============================================================================
