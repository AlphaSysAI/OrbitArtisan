-- =============================================================================
-- 74_ultra_plan_quote_quota.sql — Formule Ultra + quota de devis envoyés par mois
-- =============================================================================
-- Devis envoyés par mois civil (UTC), même grille que src/lib/billing/subscription-plans.ts :
--   Essentiel 50, Pro 100, Premium 200, Ultra illimité.
-- Les brouillons ne comptent pas : seul l'envoi (sent_at) consomme le quota.

-- 1) Formule Ultra acceptée partout où la formule est contrainte.
alter table public.profiles drop constraint if exists profiles_subscription_plan_check;
alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('base', 'pro', 'premium', 'ultra'));

alter table public.voice_overage_charges drop constraint if exists voice_overage_charges_plan_id_check;
alter table public.voice_overage_charges
  add constraint voice_overage_charges_plan_id_check
  check (plan_id in ('base', 'pro', 'premium', 'ultra'));

-- 2) Limite mensuelle de devis envoyés (null = illimité).
create or replace function public.plan_quotes_per_month(p_plan text)
returns integer
language sql immutable set search_path = public
as $$
  select case p_plan
    when 'base' then 50
    when 'pro' then 100
    when 'premium' then 200
    else null
  end
$$;

-- 3) Envoi d'un brouillon : contrôle du quota sous verrou (deux envois simultanés
--    ne peuvent pas dépasser la limite).
create or replace function public.send_quote_document(p_quote_id uuid, p_artisan_id uuid, p_expected_updated_at timestamptz default null)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  q public.quotes;
  v_materials bigint;
  v_limit integer;
  v_sent integer;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  select * into q from public.quotes
    where id = p_quote_id and artisan_id = p_artisan_id and status = 'draft'
      and (p_expected_updated_at is null or updated_at = p_expected_updated_at) for update;
  if not found then return null; end if;
  select coalesce(sum(line_total) filter (where not exclude_from_invoice), 0)
    into v_materials from public.quote_materials where quote_id = q.id;
  if q.grand_total <= 0 or q.grand_total <> q.labor_total + v_materials
    or (q.labor_total > 0 and not exists (select 1 from public.quote_services where quote_id = q.id)) then
    raise exception 'inconsistent_quote_total';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quote_quota:' || p_artisan_id::text, 0));
  select public.plan_quotes_per_month(subscription_plan) into v_limit
    from public.profiles where id = p_artisan_id;
  if v_limit is not null then
    select count(*) into v_sent from public.quotes
      where artisan_id = p_artisan_id
        and sent_at >= v_month_start
        and sent_at < v_month_start + interval '1 month';
    if v_sent >= v_limit then
      raise exception 'quote_monthly_limit_reached';
    end if;
  end if;

  update public.quotes set status = 'sent', sent_at = now() where id = q.id;
  return q.id;
end
$$;
revoke all on function public.send_quote_document(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.send_quote_document(uuid, uuid, timestamptz) to authenticated;
