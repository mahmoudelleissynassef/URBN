# Landing-page hero slideshow images

The home hero background is a cross-fade slideshow. It pulls its images from the
`HERO_IMAGES` array in `index.html`.

## How to add your photos
1. Add image files to this folder named:
   `hero-1.webp`, `hero-2.webp`, `hero-3.webp`, `hero-4.webp`, `hero-5.webp`
   (any of `.webp`, `.jpg`, `.png` work — just match the extension in `index.html`).
2. For more than 5, add the file here and append its path to `HERO_IMAGES` in
   `index.html`.

## Recommendations
- Landscape, ~1920×1080 or wider, optimised (WebP ≤ ~300 KB each) for fast load.
- Slightly darker / higher-contrast images read best behind the white hero text.

## Notes
- The first `HERO_IMAGES` entry is a built-in remote fallback so the hero is never
  blank before your files are committed.
- Any image that fails to load is skipped automatically, so a missing file won't
  break the carousel.
