# Per-page SEO checklist

The site is static `.html` with no shared head template, so each page must carry
its own meta. When adding or editing a page, confirm every item below. (Audit
issue 12: without a shared template, meta gaps repeat per page and drift out of sync.)

## Every page `<head>`
- [ ] Unique `<title>` written for the page's intent (`… — URBN`).
- [ ] `<meta name="description">` — bespoke, ~150 chars, describes the page.
- [ ] `<link rel="canonical" href="https://urbnoffices.com/…">` — absolute URL for this page.
- [ ] `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`.

## Public / shareable pages — also add
- [ ] Open Graph: `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image`.
- [ ] Twitter: `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:description`, `twitter:image`.
- [ ] Exactly one `<h1>` stating the page subject; heading levels nest without skipping.

## Private / auth pages (dashboards, login)
- [ ] `<meta name="robots" content="noindex">` instead of OG/Twitter tags.

## Site-wide files (keep in sync when pages are added/removed)
- [ ] `sitemap.xml` — add the new public URL.
- [ ] `robots.txt` — disallow any new private paths.

## Notes
- `og:image` currently reuses the hero photo. Replace with a branded 1200×630 share image before launch.
- A small build step or shared head include would remove the per-page duplication entirely; until then, use this checklist.
