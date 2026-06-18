-- Starter tier is scoped to a single market. Nullable text column on the
-- subscription; only consulted when tier = 'starter'. Safe/additive.
alter table company_subscriptions add column if not exists assigned_market text;
