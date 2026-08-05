-- Orbit Artisan — Schéma de base (Supabase / Postgres)
-- À exécuter dans l'éditeur SQL Supabase.

create extension if not exists pgcrypto;

-- 1) Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type public.appointment_status as enum ('pending', 'confirmed', 'cancelled');
  end if;
end
$$;

-- 2) Tables

-- Profils "artisan" (liés à auth.users)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  business_name text not null,
  description text,
  logo_url text,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists profiles_user_id_idx on public.profiles (user_id);
create index if not exists profiles_slug_idx on public.profiles (slug);

-- Services proposés par l'artisan
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  duration integer not null, -- minutes
  price integer, -- en centimes (nullable si "sur devis")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_duration_positive check (duration > 0),
  constraint services_price_nonnegative check (price is null or price >= 0)
);

create index if not exists services_artisan_id_idx on public.services (artisan_id);

-- RDV pris sur le site vitrine
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  service_id uuid references public.services (id) on delete set null,
  start_time timestamptz not null,
  status public.appointment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_artisan_id_start_time_idx
  on public.appointments (artisan_id, start_time desc);
create index if not exists appointments_service_id_idx on public.appointments (service_id);

-- 3) updated_at triggers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at
before update on public.services
for each row execute procedure public.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
before update on public.appointments
for each row execute procedure public.set_updated_at();

-- 4) Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;

-- Profiles:
-- - Lecture publique minimale (pour `/site/[slug]`)
-- - Écriture uniquement par le propriétaire (auth)
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read"
on public.profiles
for select
to anon, authenticated
using (true);

drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_owner_write"
on public.profiles
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Services:
-- - Lecture publique (affichage vitrine)
-- - CRUD par le propriétaire du profil artisan
drop policy if exists "services_public_read" on public.services;
create policy "services_public_read"
on public.services
for select
to anon, authenticated
using (true);

drop policy if exists "services_owner_write" on public.services;
create policy "services_owner_write"
on public.services
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = services.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = services.artisan_id
      and p.user_id = auth.uid()
  )
);

-- Appointments:
-- - Création publique (prise de RDV)
-- - Lecture/MAJ/Annulation uniquement par le propriétaire
drop policy if exists "appointments_public_insert" on public.appointments;
create policy "appointments_public_insert"
on public.appointments
for insert
to anon, authenticated
with check (true);

drop policy if exists "appointments_owner_read" on public.appointments;
create policy "appointments_owner_read"
on public.appointments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = appointments.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "appointments_owner_write" on public.appointments;
create policy "appointments_owner_write"
on public.appointments
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = appointments.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = appointments.artisan_id
      and p.user_id = auth.uid()
  )
);

-- 5) Couleur vitrine (optionnelle, hex #RRGGBB — sinon déduction par mots-clés métier)
alter table public.profiles add column if not exists accent_color text;

alter table public.profiles drop constraint if exists profiles_accent_color_format;

alter table public.profiles
  add constraint profiles_accent_color_format check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  );

