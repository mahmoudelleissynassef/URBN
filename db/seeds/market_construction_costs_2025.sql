-- ============================================================================
-- Seed: market_construction_costs (applied to production 2026-06-17)
-- Sources & confidence (USD per m², office CAT-B fit-out unless noted):
--   nairobi      — Turner & Townsend Global Office Fit-Out Cost Guide 2025
--                  (premium US$1,329/m²); construction ~US$834/m² (T&T GCMI 2025). SOURCED
--   johannesburg — T&T 2025 South Africa high-spec US$1,864/m². SOURCED (SA regional)
--   capetown     — T&T 2025 SA high-spec US$1,864/m²; construction ~US$1,231/m². SOURCED (SA regional)
--   kigali       — construction ~US$979/m² (T&T GCMI 2025); fit-out INDICATIVE estimate
--   accra/abidjan/casablanca/cairo/addis — INDICATIVE estimates (no public city-level
--                  fit-out figure); benchmarked to regional averages. Edit in the admin
--                  Construction Costs tab as better data arrives.
-- Spec levels (basic/standard/premium), per-workstation, fees% and contingency% are
-- transparent derivations for the indicative Stay vs Go model, not vendor figures.
-- NOTE: re-running inserts duplicate rows (no unique key). Prefer the admin UI for
-- updates; this file documents the initial seed only.
-- ============================================================================
insert into public.market_construction_costs
(market, currency, effective_date, shell_core_to_cat_a_per_sqm, cat_a_to_cat_b_per_sqm, fitout_basic_per_sqm, fitout_standard_per_sqm, fitout_premium_per_sqm, furniture_per_workstation, it_av_per_workstation, professional_fees_pct, contingency_pct, reinstatement_per_sqm, notes)
values
('nairobi','USD','2025-06-01',598,997,731,997,1329,900,800,10,8,266,'Turner & Townsend Office Fit-Out Cost Guide 2025 (Nairobi premium US$1,329/m2); construction ~US$834/m2 (T&T GCMI 2025). Levels/per-workstation indicative. USD.'),
('johannesburg','USD','2025-06-01',839,1398,1025,1398,1864,1100,1000,10,8,373,'Turner & Townsend 2025 (South Africa high-spec US$1,864/m2). Levels/per-workstation indicative. USD.'),
('capetown','USD','2025-06-01',839,1398,1025,1398,1864,1100,1000,10,8,373,'T&T 2025 (SA high-spec US$1,864/m2); Cape Town construction ~US$1,231/m2 (T&T GCMI 2025). Indicative. USD.'),
('kigali','USD','2025-06-01',518,863,633,863,1150,900,800,10,8,230,'Construction ~US$979/m2 (T&T GCMI 2025); fit-out indicative estimate (East Africa benchmark). USD.'),
('accra','USD','2025-06-01',495,825,605,825,1100,900,850,10,8,220,'Indicative estimate; benchmarked to regional averages (Ghana import-driven cost base). USD.'),
('abidjan','USD','2025-06-01',450,750,550,750,1000,850,800,10,8,200,'Indicative estimate; benchmarked to West African averages. USD.'),
('casablanca','USD','2025-06-01',428,713,523,713,950,850,800,10,8,190,'Indicative estimate; benchmarked to North African / regional averages. USD.'),
('cairo','USD','2025-06-01',383,638,468,638,850,800,750,10,8,170,'Indicative estimate; benchmarked below regional average (Egypt EGP cost base). USD.'),
('addis','USD','2025-06-01',338,563,413,563,750,750,700,10,8,150,'Indicative estimate; benchmarked to lower East African cost base. USD.');
