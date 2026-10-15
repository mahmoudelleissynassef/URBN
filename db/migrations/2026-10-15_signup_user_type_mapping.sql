-- Fix: public sign-up failed with HTTP 500 for 3 of the 8 "You are a" options.
--
-- pages/signup.html sends user_type values landlord_owner / coworking_operator /
-- serviced_office_operator, but the user_type enum only has
-- occupier, broker, developer, landlord, operator, advisor, other. handle_new_user()
-- cast the raw value straight to user_type, so the cast threw
-- (invalid input value for enum user_type) and GoTrue rolled back the whole sign-up.
--
-- This replaces the trigger function only (no schema change, reversible):
--   * maps the form's values onto the existing enum labels
--   * an unknown user_type falls back to 'other' and an unknown tier to 'free',
--     so a bad metadata value can never block a sign-up again
-- The user's exact choice is still kept in auth.users.raw_user_meta_data->>'user_type'.
-- Everything after the two casts is unchanged.
--
-- Dry-run on production 2026-10-15 inside a rolled-back transaction: coworking_operator,
-- landlord_owner, serviced_office_operator, occupier, an unknown value and an empty value
-- all created company + profile + owner membership + subscription.
-- Rollback: the previous body was identical except the two casts were
--   t := coalesce((new.raw_user_meta_data->>'requested_tier')::sub_tier, 'free');
--   utype := coalesce((new.raw_user_meta_data->>'user_type')::user_type, 'occupier');

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  cid uuid;
  t sub_tier;
  utype user_type;
  raw_type text := lower(nullif(trim(new.raw_user_meta_data->>'user_type'), ''));
  raw_tier text := lower(nullif(trim(new.raw_user_meta_data->>'requested_tier'), ''));
begin
  raw_type := case raw_type
    when 'landlord_owner' then 'landlord'
    when 'coworking_operator' then 'operator'
    when 'serviced_office_operator' then 'operator'
    else raw_type
  end;
  if raw_type is null then
    utype := 'occupier';
  elsif exists (select 1 from pg_enum where enumtypid = 'public.user_type'::regtype and enumlabel = raw_type) then
    utype := raw_type::user_type;
  else
    utype := 'other';
  end if;

  if raw_tier is not null and exists (select 1 from pg_enum where enumtypid = 'public.sub_tier'::regtype and enumlabel = raw_tier) then
    t := raw_tier::sub_tier;
  else
    t := 'free';
  end if;

  insert into public.companies (name, created_by)
  values (coalesce(new.raw_user_meta_data->>'company', 'My Company'), new.id)
  returning id into cid;

  insert into public.profiles (id, full_name, job_title, user_type, company_id, requested_tier, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'job_title',
    utype,
    cid,
    t,
    new.raw_user_meta_data->>'phone'
  );

  insert into public.company_members (company_id, user_id, role)
  values (cid, new.id, 'owner');

  insert into public.company_subscriptions (company_id, tier, status, requested_by)
  values (cid, t, case when t = 'free' then 'active'::sub_status else 'requested'::sub_status end, new.id);

  return new;
end;
$function$;
