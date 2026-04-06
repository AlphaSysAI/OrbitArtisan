-- Devis (quotes) — exécuter après supabase/schema.sql

-- Notes:
-- - On stocke les montants en centimes (cents).
-- - Le devis calcule automatiquement la main-d'oeuvre à partir de:
--   total_duration_minutes (somme des durées des prestations sélectionnées) et labor_rate_per_hour (taux horaire du profil).

create extension if not exists pgcrypto;

-- 0) Taux horaire (main d'oeuvre) sur le profil artisan
alter table public.profiles
  add column if not exists labor_rate_per_hour integer;

alter table public.profiles
  drop constraint if exists profiles_labor_rate_per_hour_nonneg;

alter table public.profiles
  add constraint profiles_labor_rate_per_hour_nonneg
  check (labor_rate_per_hour is null or labor_rate_per_hour >= 0);

-- 1) Statuts
do $$
begin
  if not exists (select 1 from pg_type where typname = 'quote_status') then
    create type public.quote_status as enum ('draft', 'sent', 'accepted', 'rejected');
  end if;
end
$$;

-- 2) Têtes de devis
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  customer_name text,
  customer_email text,
  status public.quote_status not null default 'draft',

  -- Calculs / snapshots (en centimes)
  labor_rate_per_hour integer,
  labor_duration_minutes integer not null default 0,
  labor_total integer not null default 0,
  materials_total integer not null default 0,
  grand_total integer not null default 0,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotes_artisan_id_idx on public.quotes (artisan_id);
create index if not exists quotes_customer_email_idx on public.quotes (customer_email);

-- 3) Lignes prestations
create table if not exists public.quote_services (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  service_title text not null,
  duration_minutes integer not null,
  unit_price integer,
  line_total integer,
  created_at timestamptz not null default now(),

  unique (quote_id, service_id)
);

create index if not exists quote_services_quote_id_idx on public.quote_services (quote_id);

-- 4) Lignes fournitures / matériaux
create table if not exists public.quote_materials (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  label text not null,
  quantity integer not null default 1,
  unit_price integer not null,
  line_total integer not null,
  created_at timestamptz not null default now(),

  constraint quote_materials_quantity_positive check (quantity > 0),
  constraint quote_materials_unit_price_nonneg check (unit_price >= 0)
);

create index if not exists quote_materials_quote_id_idx on public.quote_materials (quote_id);

-- 5) updated_at
drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
before update on public.quotes
for each row execute procedure public.set_updated_at();

-- 6) Row Level Security
alter table public.quotes enable row level security;
alter table public.quote_services enable row level security;
alter table public.quote_materials enable row level security;

-- quotes: CRUD uniquement pour l'artisan propriétaire
drop policy if exists quotes_owner_crud on public.quotes;
create policy quotes_owner_crud
on public.quotes
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = quotes.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = quotes.artisan_id
      and p.user_id = auth.uid()
  )
);

-- quote_services
drop policy if exists quote_services_owner_crud on public.quote_services;
create policy quote_services_owner_crud
on public.quote_services
for all
to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_services.quote_id
      and exists (
        select 1
        from public.profiles p
        where p.id = q.artisan_id
          and p.user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_services.quote_id
      and exists (
        select 1
        from public.profiles p
        where p.id = q.artisan_id
          and p.user_id = auth.uid()
      )
  )
);

-- quote_materials
drop policy if exists quote_materials_owner_crud on public.quote_materials;
create policy quote_materials_owner_crud
on public.quote_materials
for all
to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_materials.quote_id
      and exists (
        select 1
        from public.profiles p
        where p.id = q.artisan_id
          and p.user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_materials.quote_id
      and exists (
        select 1
        from public.profiles p
        where p.id = q.artisan_id
          and p.user_id = auth.uid()
      )
  )
);

