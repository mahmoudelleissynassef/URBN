# Construction-cost sources & datestamps

Source PDFs live **outside the repo** at `C:\Dev\Construction Costs\<Country>\*.pdf`
(not committed — they're large third-party reports). Drop each country's report
into its folder. **The "latest" report is determined by the reporting period
printed *inside* the file, not by the filename** (e.g. the Egypt file is named
`…-4q-…` but the cover states *Q3/Q4 2025*).

Figures are stored in the Supabase `market_construction_costs` table (latest row
per market wins, ordered by `effective_date`) and surfaced on the Stay vs Go page,
which shows the "prices as of" datestamp and the source for the selected market.
Edit/refresh via the admin **Construction Costs** tab.

## What's loaded now

| Market | effective_date | Source | Notes |
|---|---|---|---|
| Cairo (Egypt) | 2025-12-01 (Q4 2025) | **Gleeds Egypt Construction Market Report Q3/Q4 2025** | Gleeds report is a materials/items price index (rebar EGP 30,700–34,200/t; OPC cement >EGP 3,600/t; USD≈EGP 48.08; VAT 14%) — no headline office fit-out/m². Per-m² fit-out stored is an **indicative estimate**, not a Gleeds figure. |
| Nairobi (Kenya) | 2025-06-01 | Turner & Townsend Office Fit-Out Cost Guide 2025 | Premium fit-out US$1,329/m²; construction ~US$834/m² (GCMI 2025). |
| Johannesburg / Cape Town (South Africa) | 2025-06-01 | Turner & Townsend 2025 | SA high-spec fit-out US$1,864/m²; Cape Town construction ~US$1,231/m². |
| Kigali (Rwanda) | 2025-06-01 | T&T GCMI 2025 (construction ~US$979/m²) | Fit-out is an indicative East-Africa benchmark. |
| Accra, Abidjan, Casablanca, Addis Ababa | 2025-06-01 | Indicative estimates | No per-city public fit-out source yet — replace when a PDF/report is supplied. |

## To add or update a market
1. Put the report PDF in `C:\Dev\Construction Costs\<Country>\`.
2. Open it, read the reporting **period from inside the file**.
3. Enter the figures + that period (as `effective_date`) in the admin
   **Construction Costs** tab (or add an `insert` to the seed file).
Only data points actually used are recorded here (figures/dates with attribution) —
the source reports themselves are not reproduced.
