-- =============================================================================
-- 02_platform_admin.sql — Super Admin plateforme Soline
-- =============================================================================
-- À exécuter après init.sql (+ 01_voice_quota.sql si applicable).
--
-- Premier super admin (remplacer l'UUID par votre auth.users.id) :
--   insert into public.platform_admins (user_id) values ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');

-- ---------------------------------------------------------------------------
-- Super administrateurs plateforme
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null
);

comment on table public.platform_admins is 'Comptes autorisés à accéder à /admin (Super Admin Soline)';

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read
on public.platform_admins
for select
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Statut compte artisan (suspension / archivage)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists subscription_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'suspended'));

alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('active', 'past_due', 'canceled', 'trialing'));

comment on column public.profiles.account_status is 'active | suspended — contrôle d''accès SaaS';
comment on column public.profiles.deleted_at is 'Soft-delete : compte archivé par un super admin';
comment on column public.profiles.subscription_status is 'Statut paiement abonnement Soline (manuel jusqu''à Stripe Billing)';

create index if not exists profiles_account_status_idx on public.profiles (account_status)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Journal d'audit administratif
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_admin_user_id_idx
  on public.admin_audit_logs (admin_user_id, created_at desc);

comment on table public.admin_audit_logs is 'Historique des actions Super Admin';

alter table public.admin_audit_logs enable row level security;

-- Lecture réservée aux super admins (via JWT) ; écriture via service role côté serveur.
drop policy if exists admin_audit_logs_super_admin_read on public.admin_audit_logs;
create policy admin_audit_logs_super_admin_read
on public.admin_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Helper SQL (RLS / policies futures)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;
