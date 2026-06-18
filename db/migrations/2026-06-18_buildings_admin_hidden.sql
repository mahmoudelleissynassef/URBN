-- Soft admin-only visibility for the admin Buildings view. This does NOT affect
-- public visibility (public listings are gated by status='approved'); it only
-- hides clutter from the admin console. Recoverable (filter Hidden / All). Additive.
alter table buildings add column if not exists admin_hidden boolean not null default false;
create index if not exists idx_buildings_admin_hidden on buildings(admin_hidden);
