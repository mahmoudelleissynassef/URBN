# URBN — Security posture & hardening notes

_Last updated: Phase 7 security hardening._

This document records the security model, what was hardened, how to query the
audit log, and the concrete plan for tightening the Content-Security-Policy.

## Trust & data model
- **Server** (`server.js`, single Node `http` server) holds the only privileged
  credential, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never sent to the browser).
- **Browser** receives only `SUPABASE_ANON_KEY` via `GET /api/config`. The anon key
  is safe in the client because **Row Level Security (RLS) is enabled on every
  table**. Protected tables (`buildings`, `units`, `market_construction_costs`)
  have **zero policies = deny-all** to anon/authenticated, so the public cannot read
  them directly — all listing/identity data is exposed only through the
  server-filtered `GET /api/listings`, which strips protected fields.
- RLS policies on user-scoped tables are own-row only
  (`admin_users` = `user_id=auth.uid()`, `client_requests` = own email,
  `listing_access_grants`/`saved_properties`/`profiles` = own rows,
  company tables = membership-scoped).
- **Admin** endpoints (`/api/admin/*`) require a valid Supabase JWT whose user is in
  `admin_users` (`getAuthUser` → `isAdmin`). Non-admins get 401/403 server-side.

## Hardened in Phase 7
- **Stored XSS:** all user-controlled fields (building name, submarket, address,
  parking notes, amenities, certifications, floor, offering type, map URL) are now
  output-encoded with `escHtml()` in `renderCard`/`renderListingCard`/`renderAnonCard`
  (`js/urbn.js`) and `pages/building.html`. The map-pin URL is also protocol-checked
  (only `http(s):` links render). Admin dashboard already used `esc()`.
- **Error leakage:** API errors no longer return raw PostgREST/Postgres messages
  (`detail:` removed); full errors stay in server logs only.
- **CSP + headers:** enforced `Content-Security-Policy` with a tight third-party
  allowlist; added `Cross-Origin-Opener-Policy: same-origin` and HSTS `preload`.
- **Audit log:** `admin_audit_logs` table + `writeAudit()` on every destructive/
  sensitive admin action.
- **Admin rate-limiting:** 100 admin writes/min/IP; 12/min on `delete-buildings`.
- **SRI:** Leaflet + markercluster `<script>/<link>` carry `integrity` (SHA-384) +
  `crossorigin`.
- **Uploads:** the `listing-media` storage bucket is **private** and now restricts
  `allowed_mime_types` to `image/jpeg|jpg|png|webp` + `application/pdf`
  (size limit 2 MB, enforced by Supabase). Hard-delete removes storage files
  best-effort; a storage failure never blocks the DB delete.

## Audit log — how to query
```sql
-- recent admin actions
select created_at, action, actor_email, target_type, target_ids, count, success, metadata
from admin_audit_logs order by created_at desc limit 100;
-- all deletes
select * from admin_audit_logs where action='building.delete' order by created_at desc;
```
Actions: `building.hide|unhide|delete`, `listing.approve|reject`,
`batch.approve_row|reject_row|approve_all`, `reveal.approve|reject`,
`membership.approve|reject|set_tier`. The table is RLS-deny-all (server-only);
no secrets stored; client IP is salted-SHA256 hashed (`ip_hash`), not raw.

## CSP — current policy and the path to "strict"
Current (enforced) — locks external origins, but still allows `'unsafe-inline'`
for `script-src`/`style-src` because the site uses inline `<script>` blocks and
inline `on*` handlers throughout:
```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self';
form-action 'self'; frame-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com;
style-src  'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;
img-src    'self' data: blob: https://*.basemaps.cartocdn.com https://images.unsplash.com https://*.supabase.co;
font-src   'self' data: https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://open.er-api.com;
```
This already blocks injection of **external** scripts/frames, clickjacking, and
base-tag hijack. The remaining weakness is `'unsafe-inline'` on scripts (inline
XSS would still run) — mitigated for now by the `escHtml` output-encoding above.

### Refactor plan to remove `'unsafe-inline'` (strict, nonce-based CSP)
Order of work (each step is independently shippable and testable):
1. **Externalize inline `<script>` blocks.** Each page (`index.html`, `pages/*.html`)
   has a trailing `<script>…</script>` with page logic. Move each into a per-page
   file (e.g. `js/pages/search.js`) loaded with `<script src defer>`. ~20 pages.
2. **Remove inline `on*` handlers.** The codebase uses `onclick="…"`,
   `onchange="…"`, `oninput="…"`, `onmouseover="…"`, `onerror="…"` extensively
   (nav, cards, modals, filters, admin). Replace with `addEventListener` wired by
   `data-*` attributes + event delegation. This is the largest item — the injected
   chrome (`injectNav`/`injectFooter`/card renderers in `js/urbn.js`) and the admin
   dashboard are the densest. `<img onerror>` fallbacks can move to a delegated
   `error` listener or a CSS background fallback.
3. **Add a per-request nonce.** Generate a random nonce per response, inject it into
   the (now external) script tags, and change CSP to
   `script-src 'self' 'nonce-…' https://cdn.jsdelivr.net https://unpkg.com` and
   `style-src 'self' 'nonce-…' https://fonts.googleapis.com https://unpkg.com`
   (inline styles also need externalizing or a nonce/hashing pass — there are many
   inline `style="…"` attributes; those are NOT blocked by `style-src` unsafe-inline
   removal only if you also drop `'unsafe-inline'` from style-src — keep style-src
   `'unsafe-inline'` until inline styles are refactored, since they are low XSS risk).
4. **Verify** maps, Supabase auth, fonts, all forms, the access modal and the admin
   dashboard against the strict policy in **report-only** mode first
   (`Content-Security-Policy-Report-Only`), watch the console for violations, then
   flip to enforcing.

**Risk/effort:** Step 2 is the bulk (hundreds of inline handlers) and touches every
interactive surface — do it page-group by page-group with QA between. Until then the
current enforced CSP + output encoding is the pragmatic, production-safe posture.

## Third-party / CDN dependencies
| Resource | From | Use | Executes JS? | Control |
|---|---|---|---|---|
| `@supabase/supabase-js@2` | jsDelivr | auth + DB client | yes | version **range** → SRI not possible; **recommend pinning** an exact 2.x + SRI, or self-host |
| Leaflet 1.9.4 | unpkg | map | yes | pinned + **SRI added** |
| Leaflet.markercluster 1.5.3 | unpkg | clustering | yes | pinned + **SRI added** |
| Google Fonts CSS/woff2 | googleapis/gstatic | fonts | no | could self-host to drop the dependency |
| CARTO basemap tiles | cartocdn | map tiles | no (images) | n/a |
| Unsplash | images.unsplash.com | hero/OG image | no (images) | could self-host |

## Remaining risks / recommended manual work
- **HIGH/none open** after this pass for the audited surface.
- **MEDIUM:** `'unsafe-inline'` scripts (see refactor plan); pin+SRI (or self-host)
  the Supabase client; consider self-hosting Leaflet/Google-Fonts to remove
  third-party script/CSS execution entirely.
- **LOW:** no malware/virus scanning on uploads (private bucket + mime allowlist +
  size cap mitigate; add a scanner — e.g. a Supabase Edge Function calling
  ClamAV/an AV API — if untrusted uploads grow). The `listing-media` 2 MB size limit
  is below the 8 MB the upload form advertises — reconcile (raise the bucket limit or
  lower the form copy). Two legacy same-named `rateLimited()` functions exist; the
  3-arg one wins via hoisting — harmless but worth deduping.
- **Professional pen-test recommended** before a high-value launch: auth/session
  handling, Supabase RLS policy fuzzing, the reveal-grant flow, and the upload
  pipeline are the highest-value targets.
