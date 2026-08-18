-- =============================================================================
-- 03_trial_subscription.sql — Essai gratuit 15 jours + billing Stripe SaaS
-- =============================================================================
-- À exécuter après 02_platform_admin.sql.

-- Fin de période d'essai
alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

-- Identifiants Stripe Billing (abonnement SaaS Soline, distinct de Connect)
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_uidx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.profiles.trial_ends_at is 'Fin de l''essai gratuit (15 jours à l''inscription)';
comment on column public.profiles.stripe_customer_id is 'Client Stripe Billing SaaS';
comment on column public.profiles.stripe_subscription_id is 'Abonnement Stripe Billing SaaS actif';

-- Nouveaux profils : essai par défaut (plus actif)
alter table public.profiles alter column subscription_status set default 'trialing';

-- Rattrapage : comptes actifs sans abonnement Stripe ni date d'essai → essai 15 j depuis création
update public.profiles
set
  subscription_status = 'trialing',
  trial_ends_at = created_at + interval '15 days'
where
  subscription_status = 'active'
  and stripe_subscription_id is null
  and trial_ends_at is null
  and deleted_at is null;

-- Essai en cours sans date enregistrée
update public.profiles
set trial_ends_at = created_at + interval '15 days'
where
  subscription_status = 'trialing'
  and trial_ends_at is null
  and deleted_at is null;

-- Trigger : complète trial_ends_at à l'insertion si statut essai
create or replace function public.profiles_init_trial_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.trial_ends_at is null and new.subscription_status = 'trialing' then
    new.trial_ends_at := now() + interval '15 days';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_init_trial_on_insert on public.profiles;
create trigger profiles_init_trial_on_insert
  before insert on public.profiles
  for each row
  execute function public.profiles_init_trial_on_insert();
