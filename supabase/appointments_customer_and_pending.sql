-- RDV vitrine : lien compte client + file d’attente inscription (exécuter après schema.sql)
-- Requiert SUPABASE_SERVICE_ROLE_KEY côté app pour la recherche par email et la file pending.

-- 1) Lien optionnel vers auth.users (fiche client / espace compte)
alter table public.appointments
  add column if not exists customer_user_id uuid references auth.users (id) on delete set null;

create index if not exists appointments_customer_user_id_idx
  on public.appointments (customer_user_id)
  where customer_user_id is not null;

-- 2) Lecture par le client connecté (ses RDV)
drop policy if exists "appointments_customer_read" on public.appointments;
create policy "appointments_customer_read"
on public.appointments
for select
to authenticated
using (customer_user_id = auth.uid());

-- 3) Politiques d’insertion (remplace l’insert public trop permissif)
drop policy if exists "appointments_public_insert" on public.appointments;

-- Invité anonyme : uniquement sans lien compte (rétrocompat / secours sans service role)
drop policy if exists "appointments_anon_insert_guest" on public.appointments;
create policy "appointments_anon_insert_guest"
on public.appointments
for insert
to anon
with check (customer_user_id is null);

-- Client connecté : doit renseigner son propre user id
drop policy if exists "appointments_authenticated_insert_own" on public.appointments;
create policy "appointments_authenticated_insert_own"
on public.appointments
for insert
to authenticated
with check (customer_user_id = auth.uid());

-- 4) Recherche user id par email (réservé au rôle service — jamais exposé à anon)
create or replace function public.lookup_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
stable
as $$
  select id
  from auth.users
  where lower(trim(email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.lookup_auth_user_id_by_email(text) from public;
grant execute on function public.lookup_auth_user_id_by_email(text) to service_role;

-- 5) File d’attente : RDV saisi avant création de compte (accès uniquement service_role)
create table if not exists public.pending_vitrine_appointments (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  start_time timestamptz not null,
  customer_name text not null,
  customer_email text not null,
  site_slug text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists pending_vitrine_appointments_expires_idx
  on public.pending_vitrine_appointments (expires_at);

alter table public.pending_vitrine_appointments enable row level security;
