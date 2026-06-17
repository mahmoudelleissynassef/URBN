-- ============================================================================
-- Listings model: favorites key on the UNIT (listing), not the building.
-- Applied to production 2026-06-18. Safe/additive aside from re-keying the PK.
-- ============================================================================
alter table public.saved_properties drop constraint if exists saved_properties_pkey;
alter table public.saved_properties alter column building_id drop not null;
alter table public.saved_properties add column if not exists unit_id text references public.units(id) on delete cascade;
create unique index if not exists saved_properties_user_unit on public.saved_properties(user_id, unit_id);
-- Existing building-level saves (unit_id NULL) are ignored by the new unit-based
-- queries; no data was deleted.
