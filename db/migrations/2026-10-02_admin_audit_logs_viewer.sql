-- Admin console "Audit log" viewer (GET /api/admin/audit-logs).
-- Additive + idempotent. DO NOT apply to production until reviewed.
--
-- admin_audit_logs already exists in production (written by writeAudit() in server.js since
-- Phase 7) but its DDL was never committed to db/migrations. The CREATE ... IF NOT EXISTS
-- below documents the expected shape and is a no-op where the table already exists; the
-- indexes are what the viewer needs (newest-first paging + the filter columns).
--
-- Access model: RLS ON with ZERO policies = deny-all to anon/authenticated. Only the server
-- (service-role key, behind Bearer + isAdmin) reads/writes it. No secrets are stored; the client IP
-- is a salted SHA-256 (ip_hash).

create table if not exists admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  action      text not null,
  actor_id    uuid,
  actor_email text,
  target_type text,
  target_ids  text[],
  count       integer,
  success     boolean not null default true,
  ip_hash     text,
  user_agent  text,
  metadata    jsonb
);

alter table admin_audit_logs enable row level security;   -- no policies on purpose (admin/server-only)

create index if not exists idx_admin_audit_logs_created_at  on admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_action      on admin_audit_logs (action, created_at desc);
create index if not exists idx_admin_audit_logs_target_type on admin_audit_logs (target_type, created_at desc);
create index if not exists idx_admin_audit_logs_actor_email on admin_audit_logs (lower(actor_email));
