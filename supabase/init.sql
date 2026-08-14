-- =============================================================================
-- Soline — init.sql
-- =============================================================================
-- Schéma complet pour une base Supabase vierge.
-- Coller l'intégralité dans l'éditeur SQL Supabase et exécuter en une fois.
-- Idempotent : rejouable sans casser une base déjà initialisée.
--
-- Nouvelles évolutions : supabase/migration/NN_nom.sql (NN = ordre croissant)
-- =============================================================================


-- =============================================================================
 01  schema.sql
 =============================================================================

-- Soline — Schéma de base (Supabase / Postgres)
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


-- =============================================================================
 02  add_accent_color.sql
 =============================================================================

-- À exécuter une fois si ta base existait avant l’ajout de accent_color
alter table public.profiles add column if not exists accent_color text;

alter table public.profiles drop constraint if exists profiles_accent_color_format;

alter table public.profiles
  add constraint profiles_accent_color_format check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  );

-- =============================================================================
 03  messages.sql
 =============================================================================

-- Messagerie client ↔ artisan (exécuter après schema.sql / add_accent_color.sql)

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artisan_id, customer_user_id)
);

create index if not exists conversations_artisan_id_idx on public.conversations (artisan_id);
create index if not exists conversations_customer_user_id_idx on public.conversations (customer_user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_nonempty check (char_length(trim(body)) > 0)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute procedure public.set_updated_at();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists touch_conversation_on_message on public.messages;
create trigger touch_conversation_on_message
after insert on public.messages
for each row execute procedure public.touch_conversation_on_message();

alter table public.customer_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "customer_profiles_own" on public.customer_profiles;
create policy "customer_profiles_own"
on public.customer_profiles
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "conversations_select_participants" on public.conversations;
create policy "conversations_select_participants"
on public.conversations
for select
to authenticated
using (
  customer_user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = conversations.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists "conversations_insert_customer" on public.conversations;
create policy "conversations_insert_customer"
on public.conversations
for insert
to authenticated
with check (customer_user_id = auth.uid());

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
on public.messages
for select
to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
    and (
      c.customer_user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = c.artisan_id and p.user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
on public.messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
    and (
      c.customer_user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = c.artisan_id and p.user_id = auth.uid()
      )
    )
  )
);

-- =============================================================================
 04  quotes.sql
 =============================================================================

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


-- =============================================================================
 05  quotes_customer_link.sql
 =============================================================================

-- Lien devis ↔ client + email sur le profil client (exécuter après supabase/messages.sql et supabase/quotes.sql)

-- Email de contact (copie de l’email d’inscription, lisible par l’artisan via jointure profil)
alter table public.customer_profiles
  add column if not exists email text;

-- Lien optionnel vers la conversation et l’utilisateur client (pour envoi / historique)
alter table public.quotes
  add column if not exists customer_user_id uuid references auth.users (id) on delete set null;

alter table public.quotes
  add column if not exists conversation_id uuid references public.conversations (id) on delete set null;

create index if not exists quotes_customer_user_id_idx on public.quotes (customer_user_id);
create index if not exists quotes_conversation_id_idx on public.quotes (conversation_id);

-- Le client peut lire ses devis (sélection)
drop policy if exists quotes_customer_read on public.quotes;
create policy quotes_customer_read
on public.quotes
for select
to authenticated
using (customer_user_id = auth.uid());

-- L’artisan peut lire le profil client s’il existe une conversation avec lui (nom / email pour devis)
drop policy if exists customer_profiles_artisan_conversation_read on public.customer_profiles;
create policy customer_profiles_artisan_conversation_read
on public.customer_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    join public.profiles p on p.id = c.artisan_id
    where c.customer_user_id = customer_profiles.user_id
      and p.user_id = auth.uid()
  )
);

-- =============================================================================
 06  appointments_customer_and_pending.sql
 =============================================================================

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

-- =============================================================================
 07  appointments_phone.sql
 =============================================================================

-- Téléphone du client sur les rendez-vous, pour le bouton « appeler » côté artisan.
-- Rejouable. À exécuter dans l'éditeur SQL Supabase.

alter table public.appointments
  add column if not exists customer_phone text;

-- Même champ sur la file d'attente, pour ne pas perdre le numéro entre la
-- réservation d'un invité et la finalisation après inscription.
alter table public.pending_vitrine_appointments
  add column if not exists customer_phone text;

-- =============================================================================
 08  appointments_artisan_insert.sql
 =============================================================================

-- Création de RDV par l’artisan lui-même (app /app/rdv + assistant Soline).
-- Les policies existantes n’autorisent l’insert qu’au client (customer_user_id = auth.uid())
-- ou à un invité anonyme. L’artisan doit pouvoir créer un RDV sur SON planning.

drop policy if exists "appointments_owner_insert" on public.appointments;
create policy "appointments_owner_insert"
on public.appointments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = appointments.artisan_id
      and p.user_id = auth.uid()
  )
);

-- =============================================================================
 09  invoices_and_quote_signature.sql
 =============================================================================

-- Signature client sur devis + factures (exécuter après quotes_customer_link.sql)

-- 1) Champs signature / refus sur les devis
alter table public.quotes
  add column if not exists signed_at timestamptz;

alter table public.quotes
  add column if not exists signed_by_name text;

alter table public.quotes
  add column if not exists rejected_at timestamptz;

-- 2) Factures (une facture max par devis converti)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete restrict,
  customer_user_id uuid references auth.users (id) on delete set null,
  customer_name text,
  customer_email text,
  invoice_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  labor_total integer not null default 0,
  materials_total integer not null default 0,
  grand_total integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_quote_unique unique (quote_id)
);

create index if not exists invoices_artisan_id_idx on public.invoices (artisan_id);
create index if not exists invoices_customer_user_id_idx on public.invoices (customer_user_id);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_kind text not null check (line_kind in ('labor', 'service', 'material')),
  label text not null,
  quantity integer,
  unit_price integer,
  line_total integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row execute procedure public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists invoices_artisan_all on public.invoices;
create policy invoices_artisan_all
on public.invoices
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = invoices.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = invoices.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists invoices_customer_read on public.invoices;
create policy invoices_customer_read
on public.invoices
for select
to authenticated
using (customer_user_id = auth.uid());

drop policy if exists invoice_lines_artisan_via_invoice on public.invoice_lines;
create policy invoice_lines_artisan_via_invoice
on public.invoice_lines
for all
to authenticated
using (
  exists (
    select 1 from public.invoices i
    join public.profiles p on p.id = i.artisan_id
    where i.id = invoice_lines.invoice_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.invoices i
    join public.profiles p on p.id = i.artisan_id
    where i.id = invoice_lines.invoice_id and p.user_id = auth.uid()
  )
);

drop policy if exists invoice_lines_customer_read on public.invoice_lines;
create policy invoice_lines_customer_read
on public.invoice_lines
for select
to authenticated
using (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_lines.invoice_id and i.customer_user_id = auth.uid()
  )
);

-- 3) RPC sécurisées : le client ne peut pas modifier les montants à la main
create or replace function public.client_accept_quote(p_quote_id uuid, p_signer_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    raise exception 'invalid_signer';
  end if;

  update public.quotes
  set
    status = 'accepted',
    signed_at = now(),
    signed_by_name = trim(p_signer_name),
    rejected_at = null,
    updated_at = now()
  where id = p_quote_id
    and customer_user_id = auth.uid()
    and status = 'sent';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_acceptable';
  end if;
end;
$$;

create or replace function public.client_reject_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.quotes
  set
    status = 'rejected',
    rejected_at = now(),
    updated_at = now()
  where id = p_quote_id
    and customer_user_id = auth.uid()
    and status = 'sent';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_rejectable';
  end if;
end;
$$;

grant execute on function public.client_accept_quote(uuid, text) to authenticated;
grant execute on function public.client_reject_quote(uuid) to authenticated;

-- =============================================================================
 10  platform_invitations.sql
 =============================================================================

-- Invitations plateforme (client ou artisan) — exécuter après messages.sql
-- Si vous aviez déjà `client_invitations`, exécutez aussi migrate_client_invitations.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_invitation_status') then
    create type public.platform_invitation_status as enum ('pending', 'accepted', 'cancelled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_account_type') then
    create type public.platform_account_type as enum ('client', 'artisan');
  end if;
end
$$;

create table if not exists public.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  artisan_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  invited_name text,
  account_type public.platform_account_type not null default 'client',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status public.platform_invitation_status not null default 'pending',
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint platform_invitations_email_nonempty check (char_length(trim(email)) > 0)
);

create index if not exists platform_invitations_inviter_idx on public.platform_invitations (inviter_user_id);
create index if not exists platform_invitations_artisan_id_idx on public.platform_invitations (artisan_id);
create index if not exists platform_invitations_email_idx on public.platform_invitations (lower(email));

drop index if exists platform_invitations_pending_unique;
create unique index platform_invitations_pending_unique
  on public.platform_invitations (inviter_user_id, lower(email), account_type)
  where status = 'pending';

alter table public.platform_invitations enable row level security;

drop policy if exists platform_invitations_inviter_select on public.platform_invitations;
create policy platform_invitations_inviter_select
on public.platform_invitations
for select
to authenticated
using (inviter_user_id = auth.uid());

drop policy if exists platform_invitations_inviter_insert on public.platform_invitations;
create policy platform_invitations_inviter_insert
on public.platform_invitations
for insert
to authenticated
with check (inviter_user_id = auth.uid());

drop policy if exists platform_invitations_inviter_update on public.platform_invitations;
create policy platform_invitations_inviter_update
on public.platform_invitations
for update
to authenticated
using (inviter_user_id = auth.uid())
with check (inviter_user_id = auth.uid());

drop policy if exists platform_invitations_invitee_read on public.platform_invitations;
create policy platform_invitations_invitee_read
on public.platform_invitations
for select
to authenticated
using (
  accepted_user_id = auth.uid()
  or (
    status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

-- Conversations : artisan ↔ client lié par invitation client acceptée
-- Ces deux policies acceptaient aussi l'ancienne table client_invitations, pour les
-- bases antérieures à la bascule vers platform_invitations. Sur une base neuve cette
-- table n'existe pas et la création échouait (ERROR 42P01) : la branche héritée
-- n'est désormais ajoutée que si la table est réellement présente.
do $mig$
declare
  legacy_conv text := '';
  legacy_cp text := '';
begin
  if to_regclass('public.client_invitations') is not null then
    legacy_conv := $l$
        or exists (
          select 1 from public.client_invitations i
          where i.artisan_id = conversations.artisan_id
            and i.accepted_user_id = conversations.customer_user_id
            and i.status = 'accepted'
        )
    $l$;
    legacy_cp := $l$
      or exists (
        select 1
        from public.client_invitations i
        join public.profiles p on p.id = i.artisan_id
        where i.accepted_user_id = customer_profiles.user_id
          and i.status = 'accepted'
          and p.user_id = auth.uid()
      )
    $l$;
  end if;

  execute 'drop policy if exists conversations_insert_artisan_linked on public.conversations';
  execute format($f$
    create policy conversations_insert_artisan_linked
    on public.conversations
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = artisan_id and p.user_id = auth.uid()
      )
      and (
        exists (
          select 1 from public.platform_invitations i
          where i.artisan_id = conversations.artisan_id
            and i.accepted_user_id = conversations.customer_user_id
            and i.status = 'accepted'
            and i.account_type = 'client'
        )
        %s
        or exists (
          select 1 from public.quotes q
          where q.artisan_id = conversations.artisan_id
            and q.customer_user_id = conversations.customer_user_id
        )
      )
    )
  $f$, legacy_conv);

  execute 'drop policy if exists customer_profiles_artisan_invitation_read on public.customer_profiles';
  execute format($f$
    create policy customer_profiles_artisan_invitation_read
    on public.customer_profiles
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.platform_invitations i
        join public.profiles p on p.id = i.artisan_id
        where i.accepted_user_id = customer_profiles.user_id
          and i.status = 'accepted'
          and i.account_type = 'client'
          and p.user_id = auth.uid()
      )
      %s
      or exists (
        select 1
        from public.quotes q
        join public.profiles p on p.id = q.artisan_id
        where q.customer_user_id = customer_profiles.user_id
          and p.user_id = auth.uid()
      )
    )
  $f$, legacy_cp);
end
$mig$;

create or replace function public.accept_platform_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.platform_invitations%rowtype;
  v_conv_id uuid;
  v_user_email text;
  v_display text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select * into v_inv
  from public.platform_invitations
  where token = trim(p_token)
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select email into v_user_email from auth.users where id = v_uid;
  if v_user_email is null or lower(trim(v_user_email)) <> lower(trim(v_inv.email)) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  if v_inv.account_type = 'artisan' then
    if exists (select 1 from public.customer_profiles where user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'already_client');
    end if;

    update public.platform_invitations
    set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
    where id = v_inv.id;

    return jsonb_build_object('ok', true, 'account_type', 'artisan');
  end if;

  v_display := coalesce(
    nullif(trim(v_inv.invited_name), ''),
    split_part(v_user_email, '@', 1),
    'Client'
  );

  insert into public.customer_profiles (user_id, display_name, email)
  values (v_uid, v_display, v_user_email)
  on conflict (user_id) do update
  set
    email = coalesce(public.customer_profiles.email, excluded.email),
    display_name = case
      when public.customer_profiles.display_name in ('Client', '') then excluded.display_name
      else public.customer_profiles.display_name
    end;

  if v_inv.artisan_id is not null then
    insert into public.conversations (artisan_id, customer_user_id)
    values (v_inv.artisan_id, v_uid)
    on conflict (artisan_id, customer_user_id) do nothing
    returning id into v_conv_id;

    if v_conv_id is null then
      select id into v_conv_id
      from public.conversations
      where artisan_id = v_inv.artisan_id and customer_user_id = v_uid;
    end if;
  end if;

  update public.platform_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'account_type', 'client',
    'conversation_id', v_conv_id,
    'artisan_id', v_inv.artisan_id
  );
end;
$$;

grant execute on function public.accept_platform_invitation(text) to authenticated;

-- Compatibilité ancienne RPC
create or replace function public.accept_client_invitation(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.accept_platform_invitation(p_token);
$$;

grant execute on function public.accept_client_invitation(text) to authenticated;

-- =============================================================================
 11  profile_contact_fields.sql
 =============================================================================

-- Coordonnées personnelles (artisan + client) — exécuter dans Supabase SQL Editor

alter table public.profiles
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text;

alter table public.customer_profiles
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_customer_profiles_updated_at on public.customer_profiles;
create trigger set_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute procedure public.set_updated_at();

-- =============================================================================
 12  stripe_connect_express.sql
 =============================================================================

-- Stripe Connect Express (onboarding + paiement destination + payout)
-- Exécuter après supabase/schema.sql et après les scripts factures/devis.

-- Identifiant du compte Connect (Express) associé à l'artisan
alter table public.profiles
  add column if not exists stripe_account_id text;

-- Contrainte retiree puis reposee, pour que le script reste rejouable
-- (un simple `add constraint` echoue en 42P07 si elle existe deja).
alter table public.profiles
  drop constraint if exists profiles_stripe_account_unique;

alter table public.profiles
  add constraint profiles_stripe_account_unique unique (stripe_account_id);

-- Flags mis à jour via webhook Stripe (account.updated / capabilities)
alter table public.profiles
  add column if not exists stripe_transfers_enabled boolean not null default false;

alter table public.profiles
  add column if not exists stripe_payouts_enabled boolean not null default false;

alter table public.profiles
  add column if not exists stripe_account_updated_at timestamptz;


-- =============================================================================
 13  supplier_products.sql
 =============================================================================

-- Catalogue fournisseur (ex. Brico Dépôt) + recherche vectorielle
-- Exécuter dans l'éditeur SQL Supabase.

create extension if not exists vector;

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price numeric(10, 2) not null check (price >= 0),
  url text not null,
  sku text not null unique,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_products_sku_idx on public.supplier_products (sku);
create index if not exists supplier_products_embedding_idx
  on public.supplier_products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

drop trigger if exists set_supplier_products_updated_at on public.supplier_products;
create trigger set_supplier_products_updated_at
before update on public.supplier_products
for each row execute procedure public.set_updated_at();

-- Colonnes fournisseur sur les lignes matériaux de devis
alter table public.quote_materials
  add column if not exists supplier_product_id uuid references public.supplier_products (id) on delete set null;

alter table public.quote_materials
  add column if not exists supplier_url text;

alter table public.quote_materials
  add column if not exists supplier_sku text;

alter table public.quote_materials
  add column if not exists is_supplier_catalog boolean not null default false;

alter table public.quote_materials
  add column if not exists exclude_from_invoice boolean not null default false;

create index if not exists quote_materials_supplier_product_id_idx
  on public.quote_materials (supplier_product_id);

-- Lecture catalogue : artisans authentifiés
alter table public.supplier_products enable row level security;

drop policy if exists supplier_products_artisan_read on public.supplier_products;
create policy supplier_products_artisan_read
on public.supplier_products
for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid())
);

-- Recherche par similarité cosinus (appelée via RPC, security definer)
create or replace function public.match_supplier_products(
  query_embedding vector(1024),
  match_count int default 5,
  match_threshold float default 0.5
)
returns table (
  id uuid,
  title text,
  price numeric,
  url text,
  sku text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.id,
    sp.title,
    sp.price,
    sp.url,
    sp.sku,
    1 - (sp.embedding <=> query_embedding) as similarity
  from public.supplier_products sp
  where sp.embedding is not null
    and 1 - (sp.embedding <=> query_embedding) >= match_threshold
  order by sp.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_supplier_products(vector, int, float) to authenticated;

-- Exemples de produits (sans embedding — à indexer via script séparé)
insert into public.supplier_products (title, price, url, sku)
values
  ('Tuyau PVC évacuation diam. 32 mm longueur 2 m', 4.90, 'https://www.bricodepot.fr/', 'BD-PVC32-2M'),
  ('Colle PVC pression 500 ml', 6.50, 'https://www.bricodepot.fr/', 'BD-COLLE-PVC500'),
  ('Robinet mitigeur lavabo chromé', 39.90, 'https://www.bricodepot.fr/', 'BD-MIT-LAV-CHR'),
  ('Peinture acrylique blanche mat 10 L', 49.90, 'https://www.bricodepot.fr/', 'BD-PEINT-BLANC10'),
  ('Carrelage grès cérame 30x60 cm gris anthracite', 12.90, 'https://www.bricodepot.fr/', 'BD-CAR-3060-GA')
on conflict (sku) do nothing;

-- =============================================================================
 14  profile_trade.sql
 =============================================================================

-- Métier de l'artisan, en deux niveaux (secteur + métier).
-- Champs distincts de business_name, qui reste le nom commercial affiché
-- sur la vitrine, les factures et dans les échanges.
-- À exécuter dans l'éditeur SQL Supabase.

alter table public.profiles
  add column if not exists trade_category text;

alter table public.profiles
  add column if not exists trade text;

-- Les valeurs stockées sont les `id` de src/lib/trades/taxonomy.ts.
-- Volontairement sans contrainte d'énumération en base : la nomenclature évolue
-- côté application, et un métier retiré ne doit pas bloquer la mise à jour
-- d'un profil existant. La cohérence est validée à l'écriture (upsertProfile).

create index if not exists profiles_trade_category_idx
  on public.profiles (trade_category)
  where trade_category is not null;

create index if not exists profiles_trade_idx
  on public.profiles (trade)
  where trade is not null;

-- =============================================================================
 15  contacts_delete_policies.sql
 =============================================================================

-- Suppression d'un contact client par l'artisan.
-- Sans ces policies, un DELETE depuis le client utilisateur n'affecte AUCUNE ligne
-- (RLS bloque en silence, sans lever d'erreur) : la suppression semblerait réussir.
-- À exécuter dans l'éditeur SQL Supabase.

-- 1) L'artisan peut supprimer une conversation de son activité.
--    Les messages sont supprimés en cascade (messages.conversation_id ON DELETE CASCADE).
drop policy if exists "conversations_delete_artisan" on public.conversations;
create policy "conversations_delete_artisan"
on public.conversations
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = conversations.artisan_id
      and p.user_id = auth.uid()
  )
);

-- 2) L'artisan peut supprimer les rendez-vous de son activité.
drop policy if exists "appointments_owner_delete" on public.appointments;
create policy "appointments_owner_delete"
on public.appointments
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = appointments.artisan_id
      and p.user_id = auth.uid()
  )
);

-- 3) L'artisan peut supprimer les invitations qu'il a émises.
--    Nécessaire pour qu'un contact issu d'une invitation acceptée ne réapparaisse pas
--    après suppression (cf. listArtisanContacts, qui reconstruit les contacts
--    à partir des invitations acceptées).
--
--    Ignoré si la table n'existe pas encore (platform_invitations.sql non exécuté),
--    pour que les policies 1 et 2 s'appliquent quand même.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'platform_invitations'
  ) then
    execute 'drop policy if exists "platform_invitations_delete_inviter" on public.platform_invitations';
    execute $p$
      create policy "platform_invitations_delete_inviter"
      on public.platform_invitations
      for delete
      to authenticated
      using (inviter_user_id = auth.uid())
    $p$;
  else
    raise notice 'Table platform_invitations absente : policy ignoree. Executer platform_invitations.sql puis relancer ce script.';
  end if;
end
$$;

-- =============================================================================
 16  profiles_geolocation.sql
 =============================================================================

-- Géolocalisation des artisans + recherche par proximité.
-- Rejouable. À exécuter dans l'éditeur SQL Supabase.

-- 1) Coordonnées de l'adresse pro (renseignées via géocodage BAN à l'enregistrement)
alter table public.profiles
  add column if not exists latitude double precision;

alter table public.profiles
  add column if not exists longitude double precision;

-- Filtre partiel : seuls les profils géolocalisés sont indexés / cherchés.
create index if not exists profiles_geo_idx
  on public.profiles (latitude, longitude)
  where latitude is not null and longitude is not null;

-- 2) Recherche des artisans proches d'un point, pour un métier donné.
--    Distance par formule de haversine (rayon Terre 6371 km) — pas d'extension requise.
--    security definer : lecture publique volontaire (annuaire), colonnes non sensibles.
--    Le calcul de distance est fait dans une CTE pour pouvoir filtrer sur le rayon.
create or replace function public.search_artisans_nearby(
  p_lat double precision,
  p_lng double precision,
  p_trade text default null,
  p_radius_km double precision default 50,
  p_limit int default 50
)
returns table (
  id uuid,
  business_name text,
  slug text,
  trade_category text,
  trade text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with candidats as (
    select
      p.id,
      p.business_name,
      p.slug,
      p.trade_category,
      p.trade,
      p.city,
      p.postal_code,
      p.latitude,
      p.longitude,
      6371 * acos(
        least(1.0,
          cos(radians(p_lat)) * cos(radians(p.latitude))
          * cos(radians(p.longitude) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(p.latitude))
        )
      ) as distance_km
    from public.profiles p
    where p.latitude is not null
      and p.longitude is not null
      and (p_trade is null or p.trade = p_trade)
  )
  select *
  from candidats
  where distance_km <= greatest(1, p_radius_km)
  order by distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.search_artisans_nearby(double precision, double precision, text, double precision, int) to anon, authenticated;

-- =============================================================================
 17  voice_numbers.sql
 =============================================================================

-- Numéros vocaux pour les artisans
-- Table pour mapper les numéros de téléphone aux artisans
-- et activer/désactiver la vocal AI pour chaque artisan

create table if not exists public.artisan_voice_numbers (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null unique references public.profiles (id) on delete cascade,
  phone_e164 text not null unique, -- Format E.164: +33123456789
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artisan_voice_numbers_artisan_id_idx on public.artisan_voice_numbers (artisan_id);
create index if not exists artisan_voice_numbers_phone_e164_idx on public.artisan_voice_numbers (phone_e164);
create index if not exists artisan_voice_numbers_is_active_idx on public.artisan_voice_numbers (is_active);

-- RLS : les artisans peuvent voir et modifier leur propre numéro
alter table public.artisan_voice_numbers enable row level security;

drop policy if exists "voice_numbers_public_auth_read" on public.artisan_voice_numbers;
create policy "voice_numbers_public_auth_read"
on public.artisan_voice_numbers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "voice_numbers_owner_write" on public.artisan_voice_numbers;
create policy "voice_numbers_owner_write"
on public.artisan_voice_numbers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "voice_numbers_owner_insert" on public.artisan_voice_numbers;
create policy "voice_numbers_owner_insert"
on public.artisan_voice_numbers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "voice_numbers_owner_delete" on public.artisan_voice_numbers;
create policy "voice_numbers_owner_delete"
on public.artisan_voice_numbers
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

-- Trigger pour updated_at
drop trigger if exists set_voice_numbers_updated_at on public.artisan_voice_numbers;
create trigger set_voice_numbers_updated_at
before update on public.artisan_voice_numbers
for each row execute procedure public.set_updated_at();

-- =============================================================================
 18  lead_qualification.sql
 =============================================================================

-- Soline — Tunnel de pré-qualification par chatbot IA (leads).
-- À exécuter dans l'éditeur SQL Supabase, après schema.sql, messages.sql et profiles_geolocation.sql.
--
-- Principe de sécurité : le prospect n'a pas de compte. Il n'écrit JAMAIS en direct
-- dans les tables (aucune policy insert/update pour anon) : tout passe par des RPC
-- `security definer` authentifiées par un jeton opaque `leads.public_token`.

create extension if not exists pgcrypto;

-- =============================================================================
-- 1  TYPES
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type public.lead_source as enum ('direct', 'artisan_widget');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('new', 'estimated', 'matched', 'converted', 'expired');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_media_kind') then
    create type public.lead_media_kind as enum ('photo', 'video');
  end if;
end
$$;

-- =============================================================================
-- 2  ÉLIGIBILITÉ ARTISAN AU MATCHING
-- =============================================================================

-- Prérequis de profiles_geolocation.sql et profile_trade.sql. Recréés ici à
-- l'identique pour que ce script s'exécute seul ; sans effet s'ils existent déjà.
-- NB : la RPC search_artisans_nearby reste définie par profiles_geolocation.sql.
alter table public.profiles add column if not exists latitude double precision;
alter table public.profiles add column if not exists longitude double precision;
alter table public.profiles add column if not exists trade_category text;
alter table public.profiles add column if not exists trade text;

create index if not exists profiles_geo_idx
  on public.profiles (latitude, longitude)
  where latitude is not null and longitude is not null;

-- Pas d'abonnement SaaS aujourd'hui : simple interrupteur côté réglages artisan.
alter table public.profiles
  add column if not exists lead_matching_enabled boolean not null default true;

create index if not exists profiles_lead_matching_idx
  on public.profiles (trade)
  where lead_matching_enabled and latitude is not null and longitude is not null;

-- =============================================================================
-- 3  TABLES
-- =============================================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  -- Jeton porteur : seule preuve de propriété du prospect anonyme.
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  source public.lead_source not null default 'direct',
  -- Artisan dont le widget a généré le lead (cold-start), jamais un match.
  origin_artisan_id uuid references public.profiles (id) on delete set null,
  trade_category text,
  trade text,
  description text not null default '',
  latitude double precision,
  longitude double precision,
  address_label text,
  status public.lead_status not null default 'new',
  estimate_min integer,
  estimate_max integer,
  -- Analyse IA du besoin (nature, urgence, points techniques, temps estimé) :
  -- sert au chiffrage et sera relue par l'artisan côté back-office.
  ai_qualification jsonb,
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Rempli quand le prospect crée ou relie un compte client.
  claimed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Au-delà, les RPC refusent toute écriture. Le passage à status='expired'
  -- reste à planifier (pg_cron ou tâche applicative).
  expires_at timestamptz not null default (now() + interval '60 days'),
  constraint leads_description_len check (char_length(description) <= 4000),
  constraint leads_estimate_min_positive check (estimate_min is null or estimate_min >= 0),
  constraint leads_estimate_range check (
    estimate_max is null
    or estimate_max >= coalesce(estimate_min, 0)
  )
);

-- Colonne ajoutée après coup : garde le script rejouable sur une base existante.
alter table public.leads add column if not exists ai_qualification jsonb;

create index if not exists leads_status_created_at_idx
  on public.leads (status, created_at desc);

create index if not exists leads_claimed_by_idx
  on public.leads (claimed_by_user_id)
  where claimed_by_user_id is not null;

create index if not exists leads_origin_artisan_idx
  on public.leads (origin_artisan_id)
  where origin_artisan_id is not null;

create table if not exists public.lead_media (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- Chemin dans le bucket privé `lead-media`, convention : <lead_id>/<uuid>.<ext>
  storage_path text not null unique,
  kind public.lead_media_kind not null default 'photo',
  created_at timestamptz not null default now()
);

create index if not exists lead_media_lead_id_idx on public.lead_media (lead_id);

create table if not exists public.lead_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  distance_km double precision,
  rank smallint not null,
  -- Rempli quand le lead a été poussé dans la messagerie artisan ↔ client.
  conversation_id uuid references public.conversations (id) on delete set null,
  quote_draft_created boolean not null default false,
  created_at timestamptz not null default now(),
  constraint lead_matches_rank_range check (rank between 1 and 3),
  constraint lead_matches_unique_artisan unique (lead_id, artisan_id),
  constraint lead_matches_unique_rank unique (lead_id, rank)
);

create index if not exists lead_matches_artisan_idx
  on public.lead_matches (artisan_id, created_at desc);

-- =============================================================================
-- 4  TRIGGERS
-- =============================================================================

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row execute procedure public.set_updated_at();

-- =============================================================================
-- 5  HELPERS D'ACCÈS
-- =============================================================================

-- Un lead est visible par le prospect qui l'a rattaché à son compte
-- et par les 2-3 artisans matchés.
create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.leads l
      where l.id = p_lead_id
        and l.claimed_by_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.lead_matches m
      join public.profiles p on p.id = m.artisan_id
      where m.lead_id = p_lead_id
        and p.user_id = auth.uid()
    );
$$;

grant execute on function public.can_access_lead(uuid) to authenticated;

-- Lead actif retrouvé par son jeton porteur (usage interne aux RPC).
create or replace function public.lead_by_token(p_token text)
returns public.leads
language sql
stable
security definer
set search_path = public
as $$
  select l.*
  from public.leads l
  where l.public_token = p_token
    and l.status <> 'expired'
    and l.expires_at > now()
  limit 1;
$$;

revoke all on function public.lead_by_token(text) from public, anon, authenticated;

-- Identifiant seul, exposé au porteur du jeton : permet au serveur de construire
-- le chemin de téléversement <lead_id>/… sans faire confiance au navigateur.
create or replace function public.lead_id_from_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.leads l
  where l.public_token = p_token
    and l.status <> 'expired'
    and l.expires_at > now()
  limit 1;
$$;

grant execute on function public.lead_id_from_token(text) to anon, authenticated;

-- =============================================================================
-- 6  RLS
-- =============================================================================

alter table public.leads enable row level security;
alter table public.lead_media enable row level security;
alter table public.lead_matches enable row level security;

-- Aucune policy pour `anon` : le prospect passe exclusivement par les RPC.

drop policy if exists leads_participant_read on public.leads;
create policy leads_participant_read
on public.leads
for select
to authenticated
using (public.can_access_lead(id));

-- Le prospect devenu client peut corriger sa fiche. Le WITH CHECK l'empêche
-- seulement de se dé-rattacher ou de rattacher le lead à quelqu'un d'autre.
drop policy if exists leads_owner_update on public.leads;
create policy leads_owner_update
on public.leads
for update
to authenticated
using (claimed_by_user_id = auth.uid())
with check (claimed_by_user_id = auth.uid());

drop policy if exists lead_media_participant_read on public.lead_media;
create policy lead_media_participant_read
on public.lead_media
for select
to authenticated
using (public.can_access_lead(lead_id));

drop policy if exists lead_matches_participant_read on public.lead_matches;
create policy lead_matches_participant_read
on public.lead_matches
for select
to authenticated
using (public.can_access_lead(lead_id));

-- L'artisan matché met à jour SA ligne (conversation créée, devis préparé).
drop policy if exists lead_matches_artisan_update on public.lead_matches;
create policy lead_matches_artisan_update
on public.lead_matches
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = lead_matches.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = lead_matches.artisan_id
      and p.user_id = auth.uid()
  )
);

-- =============================================================================
-- 7  RPC — ÉCRITURES DU PROSPECT ANONYME (jeton porteur)
-- =============================================================================

-- Création du lead au premier message du chatbot.
create or replace function public.create_lead(
  p_source text default 'direct',
  p_origin_artisan_slug text default null,
  p_trade_category text default null,
  p_trade text default null,
  p_description text default '',
  p_lat double precision default null,
  p_lng double precision default null,
  p_address_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.lead_source;
  v_origin uuid;
  v_lead public.leads;
begin
  v_source := case when p_source = 'artisan_widget' then 'artisan_widget' else 'direct' end;

  if p_origin_artisan_slug is not null then
    select id into v_origin from public.profiles where slug = p_origin_artisan_slug;
  end if;

  insert into public.leads (
    source,
    origin_artisan_id,
    trade_category,
    trade,
    description,
    latitude,
    longitude,
    address_label
  )
  values (
    v_source,
    v_origin,
    nullif(trim(coalesce(p_trade_category, '')), ''),
    nullif(trim(coalesce(p_trade, '')), ''),
    left(coalesce(p_description, ''), 4000),
    p_lat,
    p_lng,
    nullif(trim(coalesce(p_address_label, '')), '')
  )
  returning * into v_lead;

  return jsonb_build_object(
    'lead_id', v_lead.id,
    'public_token', v_lead.public_token,
    'status', v_lead.status
  );
end;
$$;

grant execute on function public.create_lead(text, text, text, text, text, double precision, double precision, text) to anon, authenticated;

-- Enrichissement au fil de la conversation (besoin, métier, localisation).
create or replace function public.update_lead_brief(
  p_token text,
  p_description text default null,
  p_trade_category text default null,
  p_trade text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_address_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.status in ('converted', 'expired') then
    return jsonb_build_object('ok', false, 'error', 'lead_closed');
  end if;

  update public.leads
  set
    description = coalesce(left(p_description, 4000), description),
    trade_category = coalesce(nullif(trim(coalesce(p_trade_category, '')), ''), trade_category),
    trade = coalesce(nullif(trim(coalesce(p_trade, '')), ''), trade),
    latitude = coalesce(p_lat, latitude),
    longitude = coalesce(p_lng, longitude),
    address_label = coalesce(nullif(trim(coalesce(p_address_label, '')), ''), address_label)
  where id = v_lead.id;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.update_lead_brief(text, text, text, text, double precision, double precision, text) to anon, authenticated;

-- Coordonnées du prospect (facultatives tant qu'il n'a pas de compte).
create or replace function public.update_lead_contact(
  p_token text,
  p_name text default null,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.status in ('converted', 'expired') then
    return jsonb_build_object('ok', false, 'error', 'lead_closed');
  end if;

  update public.leads
  set
    contact_name = coalesce(nullif(trim(coalesce(p_name, '')), ''), contact_name),
    contact_email = coalesce(lower(nullif(trim(coalesce(p_email, '')), '')), contact_email),
    contact_phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), contact_phone)
  where id = v_lead.id;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.update_lead_contact(text, text, text, text) to anon, authenticated;

-- Fourchette indicative + analyse IA du besoin, calculées côté serveur.
-- L'ancienne signature à 3 arguments est supprimée : la garder créerait une
-- surcharge ambiguë à l'appel.
drop function if exists public.set_lead_estimate(text, integer, integer);

create or replace function public.set_lead_estimate(
  p_token text,
  p_min integer,
  p_max integer,
  p_qualification jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if p_min is null or p_max is null or p_min < 0 or p_max < p_min then
    return jsonb_build_object('ok', false, 'error', 'invalid_estimate');
  end if;

  update public.leads
  set
    estimate_min = p_min,
    estimate_max = p_max,
    ai_qualification = coalesce(p_qualification, ai_qualification),
    status = case when status = 'new' then 'estimated'::public.lead_status else status end
  where id = v_lead.id;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.set_lead_estimate(text, integer, integer, jsonb) to anon, authenticated;

-- Déclaration d'un média déjà téléversé dans le bucket privé.
create or replace function public.add_lead_media(
  p_token text,
  p_storage_path text,
  p_kind text default 'photo'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_kind public.lead_media_kind;
  v_count integer;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;

  -- Le chemin doit appartenir au dossier du lead : <lead_id>/<fichier>
  if split_part(p_storage_path, '/', 1) <> v_lead.id::text then
    return jsonb_build_object('ok', false, 'error', 'invalid_path');
  end if;

  select count(*) into v_count from public.lead_media where lead_id = v_lead.id;
  if v_count >= 6 then
    return jsonb_build_object('ok', false, 'error', 'too_many_media');
  end if;

  v_kind := case when p_kind = 'video' then 'video' else 'photo' end;

  insert into public.lead_media (lead_id, storage_path, kind)
  values (v_lead.id, p_storage_path, v_kind)
  on conflict (storage_path) do nothing;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.add_lead_media(text, text, text) to anon, authenticated;

-- =============================================================================
-- 8  RPC — MISE EN RELATION (2 à 3 artisans maximum)
-- =============================================================================

create or replace function public.match_lead_to_artisans(
  p_token text,
  p_radius_km double precision default 30,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_limit integer;
  v_rank smallint := 0;
  v_row record;
  v_origin record;
  v_out jsonb := '[]'::jsonb;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.latitude is null or v_lead.longitude is null then
    return jsonb_build_object('ok', false, 'error', 'missing_location');
  end if;

  -- Jamais plus de 3 artisans : pas de logique d'enchères.
  v_limit := greatest(1, least(coalesce(p_limit, 3), 3));

  -- Idempotent : le prospect anonyme ne peut pas relire lead_matches (RLS),
  -- on lui renvoie donc la sélection déjà figée plutôt qu'une erreur.
  if exists (select 1 from public.lead_matches where lead_id = v_lead.id) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'artisan_id', m.artisan_id,
          'business_name', p.business_name,
          'slug', p.slug,
          'distance_km', m.distance_km,
          'rank', m.rank
        )
        order by m.rank
      ),
      '[]'::jsonb
    )
    into v_out
    from public.lead_matches m
    join public.profiles p on p.id = m.artisan_id
    where m.lead_id = v_lead.id;

    return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'matches', v_out);
  end if;

  -- Widget ou QR code d'un artisan : c'est son prospect, il passe devant, quel
  -- que soit son métier exact. Tolérance de distance doublée, mais pas illimitée.
  if v_lead.origin_artisan_id is not null then
    select
      p.id,
      p.business_name,
      p.slug,
      6371 * acos(
        least(1.0,
          cos(radians(v_lead.latitude)) * cos(radians(p.latitude))
          * cos(radians(p.longitude) - radians(v_lead.longitude))
          + sin(radians(v_lead.latitude)) * sin(radians(p.latitude))
        )
      ) as distance_km
    into v_origin
    from public.profiles p
    where p.id = v_lead.origin_artisan_id
      and p.lead_matching_enabled
      and p.latitude is not null
      and p.longitude is not null;

    if found and v_origin.distance_km <= greatest(1, coalesce(p_radius_km, 30)) * 2 then
      v_rank := 1;

      insert into public.lead_matches (lead_id, artisan_id, distance_km, rank)
      values (v_lead.id, v_origin.id, round(v_origin.distance_km::numeric, 2), v_rank)
      on conflict do nothing;

      v_out := v_out || jsonb_build_object(
        'artisan_id', v_origin.id,
        'business_name', v_origin.business_name,
        'slug', v_origin.slug,
        'distance_km', round(v_origin.distance_km::numeric, 2),
        'rank', v_rank
      );
    end if;
  end if;

  for v_row in
    select *
    from (
      select
        p.id,
        p.business_name,
        p.slug,
        -- Le métier exact passe devant, la même catégorie sert de repli.
        case when v_lead.trade is not null and p.trade = v_lead.trade then 0 else 1 end as trade_rank,
        6371 * acos(
          least(1.0,
            cos(radians(v_lead.latitude)) * cos(radians(p.latitude))
            * cos(radians(p.longitude) - radians(v_lead.longitude))
            + sin(radians(v_lead.latitude)) * sin(radians(p.latitude))
          )
        ) as distance_km
      from public.profiles p
      where p.lead_matching_enabled
        and p.latitude is not null
        and p.longitude is not null
        and (v_lead.origin_artisan_id is null or p.id <> v_lead.origin_artisan_id)
        and (
          v_lead.trade is null
          or p.trade = v_lead.trade
          or (v_lead.trade_category is not null and p.trade_category = v_lead.trade_category)
        )
    ) candidats
    where candidats.distance_km <= greatest(1, coalesce(p_radius_km, 30))
    order by candidats.trade_rank asc, candidats.distance_km asc
    limit greatest(0, v_limit - v_rank)
  loop
    v_rank := v_rank + 1;
    insert into public.lead_matches (lead_id, artisan_id, distance_km, rank)
    values (v_lead.id, v_row.id, round(v_row.distance_km::numeric, 2), v_rank)
    on conflict do nothing;

    v_out := v_out || jsonb_build_object(
      'artisan_id', v_row.id,
      'business_name', v_row.business_name,
      'slug', v_row.slug,
      'distance_km', round(v_row.distance_km::numeric, 2),
      'rank', v_rank
    );
  end loop;

  if v_rank = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_artisan_nearby');
  end if;

  update public.leads set status = 'matched' where id = v_lead.id;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'matches', v_out);
end;
$$;

grant execute on function public.match_lead_to_artisans(text, double precision, integer) to anon, authenticated;

-- =============================================================================
-- 9  RPC — RATTACHEMENT À UN COMPTE CLIENT
-- =============================================================================

create or replace function public.claim_lead(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.claimed_by_user_id is not null and v_lead.claimed_by_user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  update public.leads
  set claimed_by_user_id = auth.uid()
  where id = v_lead.id;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.claim_lead(text) to authenticated;

-- =============================================================================
-- 10  STORAGE — BUCKET PRIVÉ `lead-media`
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-media',
  'lead-media',
  false,
  52428800, -- 50 Mo (photos + courte vidéo)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Le dossier doit correspondre à un lead actif : limite l'écriture aux prospects
-- ayant réellement démarré un tunnel. À terme, préférer une URL signée générée
-- avec la clé service role (SUPABASE_SERVICE_ROLE_KEY) : cette policy devient
-- alors inutile et peut être supprimée.
create or replace function public.lead_upload_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leads l
    where l.id::text = split_part(p_path, '/', 1)
      and l.status <> 'expired'
      and l.expires_at > now()
  );
$$;

grant execute on function public.lead_upload_allowed(text) to anon, authenticated;

drop policy if exists "lead_media_objects_insert" on storage.objects;
create policy "lead_media_objects_insert"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'lead-media'
  and public.lead_upload_allowed(name)
);

drop policy if exists "lead_media_objects_read" on storage.objects;
create policy "lead_media_objects_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lead-media'
  and exists (
    select 1
    from public.lead_media lm
    where lm.storage_path = storage.objects.name
      and public.can_access_lead(lm.lead_id)
  )
);

-- =============================================================================
 19  lead_dispatch.sql
 =============================================================================

-- Phase 4 — Envoi du lead qualifié aux artisans matchés.
-- À exécuter après lead_qualification.sql et messages.sql.
-- Rejouable.

-- =============================================================================
-- 1  STATUT « submitted » (contact renseigné + lead poussé aux artisans)
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'lead_status'
      and e.enumlabel = 'submitted'
  ) then
    alter type public.lead_status add value 'submitted';
  end if;
end
$$;

-- =============================================================================
-- 2  CONVERSATIONS LIÉES À UN LEAD (prospect sans compte obligatoire)
-- =============================================================================

alter table public.conversations
  add column if not exists lead_id uuid references public.leads (id) on delete set null;

create index if not exists conversations_lead_id_idx
  on public.conversations (lead_id)
  where lead_id is not null;

-- Un prospect anonyme : customer_user_id reste null jusqu'à claim (phase 5).
alter table public.conversations
  alter column customer_user_id drop not null;

alter table public.conversations
  drop constraint if exists conversations_participant_check;

alter table public.conversations
  add constraint conversations_participant_check
  check (customer_user_id is not null or lead_id is not null);

-- L'unicité artisan+client ne couvrait pas les leads : on la scinde.
alter table public.conversations
  drop constraint if exists conversations_artisan_id_customer_user_id_key;

create unique index if not exists conversations_artisan_customer_unique
  on public.conversations (artisan_id, customer_user_id)
  where customer_user_id is not null;

create unique index if not exists conversations_artisan_lead_unique
  on public.conversations (artisan_id, lead_id)
  where lead_id is not null;

-- =============================================================================
-- 3  MESSAGES — récap lead + pièces jointes
-- =============================================================================

alter table public.messages
  add column if not exists kind text not null default 'user';

alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('user', 'lead_recap'));

-- Récap système : pas d'émetteur auth.users.
alter table public.messages
  alter column sender_user_id drop not null;

alter table public.messages
  drop constraint if exists messages_sender_required;

alter table public.messages
  add constraint messages_sender_required
  check (sender_user_id is not null or kind = 'lead_recap');

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  kind text not null default 'photo' check (kind in ('photo', 'video', 'file')),
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  unique (message_id, storage_path)
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

drop policy if exists message_attachments_participant_read on public.message_attachments;
create policy message_attachments_participant_read
on public.message_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_attachments.message_id
      and (
        c.customer_user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = c.artisan_id and p.user_id = auth.uid()
        )
      )
  )
);

-- =============================================================================
-- 4  BROUILLON DE DEVIS STOCKÉ CÔTÉ SERVEUR (sessionStorage impossible ici)
-- =============================================================================

alter table public.lead_matches
  add column if not exists quote_draft jsonb;

-- =============================================================================
-- 5  LECTURE DES MÉDIAS LEAD PAR L'ARTISAN MATCHÉ
-- =============================================================================

drop policy if exists lead_media_artisan_read on storage.objects;
create policy lead_media_artisan_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lead-media'
  and exists (
    select 1
    from public.lead_media lm
    join public.lead_matches m on m.lead_id = lm.lead_id
    join public.profiles p on p.id = m.artisan_id
    where lm.storage_path = name
      and p.user_id = auth.uid()
  )
);

-- =============================================================================
-- 6  HELPER — retrouver un compte client existant par e-mail (usage interne)
-- =============================================================================

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where lower(trim(u.email)) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

-- Appel réservé au service role (dispatch serveur).
revoke all on function public.user_id_by_email(text) from public;
grant execute on function public.user_id_by_email(text) to service_role;

-- =============================================================================
-- 7  CLAIM LEAD — rattacher les conversations au compte client (phase 5)
-- =============================================================================

create or replace function public.claim_lead(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.claimed_by_user_id is not null and v_lead.claimed_by_user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  update public.leads
  set claimed_by_user_id = auth.uid()
  where id = v_lead.id;

  update public.conversations
  set customer_user_id = auth.uid()
  where lead_id = v_lead.id
    and customer_user_id is null;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.claim_lead(text) to authenticated;

-- =============================================================================
 20  lead_client_conversion.sql
 =============================================================================

-- Phase 5 — Conversion du lead en compte client.
-- À exécuter après lead_qualification.sql, lead_dispatch.sql et platform_invitations.sql.

-- =============================================================================
-- 1  LIER UNE INVITATION À UN LEAD
-- =============================================================================

alter table public.platform_invitations
  add column if not exists lead_id uuid references public.leads (id) on delete set null;

create index if not exists platform_invitations_lead_id_idx
  on public.platform_invitations (lead_id)
  where lead_id is not null;

drop index if exists platform_invitations_lead_pending_unique;
create unique index platform_invitations_lead_pending_unique
  on public.platform_invitations (lead_id)
  where status = 'pending' and lead_id is not null;

-- =============================================================================
-- 2  RPC — PRÉPARER L'INSCRIPTION CLIENT (sans bloquer l'envoi du lead)
-- =============================================================================

create or replace function public.create_lead_client_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lead public.leads;
  v_inviter uuid;
  v_artisan uuid;
  v_existing text;
  v_token text;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.contact_email is null or char_length(trim(v_lead.contact_email)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'need_email');
  end if;

  select i.token into v_existing
  from public.platform_invitations i
  where i.lead_id = v_lead.id
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'invite_token', v_existing,
      'email', v_lead.contact_email,
      'name', v_lead.contact_name,
      'reused', true
    );
  end if;

  v_artisan := v_lead.origin_artisan_id;
  if v_artisan is null then
    select m.artisan_id into v_artisan
    from public.lead_matches m
    where m.lead_id = v_lead.id
    order by m.rank
    limit 1;
  end if;

  if v_artisan is not null then
    select p.user_id into v_inviter
    from public.profiles p
    where p.id = v_artisan;
  end if;

  -- Sans artisan invitant (zone vide), le prospect pourra quand même claim le lead à l'inscription.
  if v_inviter is null then
    return jsonb_build_object(
      'ok', true,
      'invite_token', null,
      'email', v_lead.contact_email,
      'name', v_lead.contact_name,
      'reused', false,
      'claim_only', true
    );
  end if;

  insert into public.platform_invitations (
    inviter_user_id,
    artisan_id,
    email,
    invited_name,
    account_type,
    lead_id
  )
  values (
    v_inviter,
    v_artisan,
    lower(trim(v_lead.contact_email)),
    nullif(trim(coalesce(v_lead.contact_name, '')), ''),
    'client',
    v_lead.id
  )
  returning token into v_token;

  return jsonb_build_object(
    'ok', true,
    'invite_token', v_token,
    'email', v_lead.contact_email,
    'name', v_lead.contact_name,
    'reused', false
  );
exception
  when unique_violation then
    select i.token into v_existing
    from public.platform_invitations i
    where i.lead_id = v_lead.id and i.status = 'pending'
    limit 1;
    return jsonb_build_object(
      'ok', true,
      'invite_token', v_existing,
      'email', v_lead.contact_email,
      'name', v_lead.contact_name,
      'reused', true
    );
end;
$$;

grant execute on function public.create_lead_client_invitation(text) to anon, authenticated;

-- Aperçu public minimal pour préremplir l'inscription (jeton porteur = preuve).
create or replace function public.lead_signup_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'name', v_lead.contact_name,
    'email', v_lead.contact_email,
    'has_email', v_lead.contact_email is not null and char_length(trim(v_lead.contact_email)) > 0,
    'status', v_lead.status
  );
end;
$$;

grant execute on function public.lead_signup_preview(text) to anon, authenticated;

-- =============================================================================
-- 3  ACCEPTATION INVITATION — rattacher le lead et ses conversations
-- =============================================================================

create or replace function public.accept_platform_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.platform_invitations%rowtype;
  v_conv_id uuid;
  v_user_email text;
  v_display text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select * into v_inv
  from public.platform_invitations
  where token = trim(p_token)
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select email into v_user_email from auth.users where id = v_uid;
  if v_user_email is null or lower(trim(v_user_email)) <> lower(trim(v_inv.email)) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  if v_inv.account_type = 'artisan' then
    if exists (select 1 from public.customer_profiles where user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'already_client');
    end if;

    update public.platform_invitations
    set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
    where id = v_inv.id;

    return jsonb_build_object('ok', true, 'account_type', 'artisan');
  end if;

  v_display := coalesce(
    nullif(trim(v_inv.invited_name), ''),
    split_part(v_user_email, '@', 1),
    'Client'
  );

  insert into public.customer_profiles (user_id, display_name, email)
  values (v_uid, v_display, v_user_email)
  on conflict (user_id) do update
  set
    email = coalesce(public.customer_profiles.email, excluded.email),
    display_name = case
      when public.customer_profiles.display_name in ('Client', '') then excluded.display_name
      else public.customer_profiles.display_name
    end;

  if v_inv.lead_id is not null then
    update public.leads
    set
      claimed_by_user_id = v_uid,
      status = 'converted'::public.lead_status
    where id = v_inv.lead_id
      and (claimed_by_user_id is null or claimed_by_user_id = v_uid);

    update public.conversations
    set customer_user_id = v_uid
    where lead_id = v_inv.lead_id
      and customer_user_id is null;

    select c.id into v_conv_id
    from public.conversations c
    where c.lead_id = v_inv.lead_id
    order by c.updated_at desc
    limit 1;
  elsif v_inv.artisan_id is not null then
    insert into public.conversations (artisan_id, customer_user_id)
    values (v_inv.artisan_id, v_uid)
    on conflict (artisan_id, customer_user_id) do nothing
    returning id into v_conv_id;

    if v_conv_id is null then
      select id into v_conv_id
      from public.conversations
      where artisan_id = v_inv.artisan_id and customer_user_id = v_uid;
    end if;
  end if;

  update public.platform_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'account_type', 'client',
    'conversation_id', v_conv_id,
    'artisan_id', v_inv.artisan_id,
    'lead_id', v_inv.lead_id
  );
end;
$$;

grant execute on function public.accept_platform_invitation(text) to authenticated;

-- claim_lead : idempotent, lie toutes les conversations du lead.
create or replace function public.claim_lead(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lead public.leads;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.claimed_by_user_id is not null and v_lead.claimed_by_user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- L'e-mail du compte doit correspondre au contact du lead (si renseigné).
  if v_lead.contact_email is not null then
    if not exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(trim(u.email)) = lower(trim(v_lead.contact_email))
    ) then
      return jsonb_build_object('ok', false, 'error', 'email_mismatch');
    end if;
  end if;

  update public.leads
  set
    claimed_by_user_id = auth.uid(),
    status = 'converted'::public.lead_status
  where id = v_lead.id;

  update public.conversations
  set customer_user_id = auth.uid()
  where lead_id = v_lead.id
    and customer_user_id is null;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;

grant execute on function public.claim_lead(text) to authenticated;

-- =============================================================================
 21  einvoicing_en16931.sql
 =============================================================================

-- Facturation électronique 2026 — EN16931 / Factur-X
-- Champs légaux émetteur & client B2B, factures et lignes TVA.
-- Exécuter après : schema.sql, profile_contact_fields, invoices_and_quote_signature.sql
-- Idempotent : rejouable sans erreur.

-- ---------------------------------------------------------------------------
-- 1) Types énumérés
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_operation_type') then
    create type public.invoice_operation_type as enum (
      'livraison_biens',
      'prestation_services',
      'mixte'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'vat_collection_nature') then
    create type public.vat_collection_nature as enum (
      'on_delivery',  -- TVA exigible à la livraison (débits)
      'on_payment'    -- TVA exigible à l'encaissement
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'e_invoicing_status') then
    create type public.e_invoicing_status as enum (
      'DRAFT',
      'DEPOSITED',
      'APPROVED',
      'REJECTED',
      'PAID'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Entité légale — émetteur (profiles / artisan)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists siren text,
  add column if not exists siret text,
  add column if not exists vat_number text,
  add column if not exists naf_code text,
  add column if not exists country_code char(2) not null default 'FR',
  add column if not exists trade_register_number text;

alter table public.profiles drop constraint if exists profiles_siren_format;
alter table public.profiles
  add constraint profiles_siren_format
  check (siren is null or siren ~ '^\d{9}$');

alter table public.profiles drop constraint if exists profiles_siret_format;
alter table public.profiles
  add constraint profiles_siret_format
  check (siret is null or siret ~ '^\d{14}$');

alter table public.profiles drop constraint if exists profiles_siret_matches_siren;
alter table public.profiles
  add constraint profiles_siret_matches_siren
  check (siret is null or siren is null or left(siret, 9) = siren);

alter table public.profiles drop constraint if exists profiles_naf_code_format;
alter table public.profiles
  add constraint profiles_naf_code_format
  check (naf_code is null or naf_code ~ '^\d{2}\.\d{2}[A-Z]$');

alter table public.profiles drop constraint if exists profiles_country_code_format;
alter table public.profiles
  add constraint profiles_country_code_format
  check (country_code ~ '^[A-Z]{2}$');

comment on column public.profiles.siren is 'SIREN (9 chiffres) — émetteur facture électronique';
comment on column public.profiles.siret is 'SIRET (14 chiffres) — établissement émetteur';
comment on column public.profiles.vat_number is 'Numéro TVA intracommunautaire (ex. FR12345678901)';
comment on column public.profiles.naf_code is 'Code NAF/APE (ex. 43.22A)';
comment on column public.profiles.address_line1 is 'Voie (adresse structurée EN16931)';
comment on column public.profiles.address_line2 is 'Complément d''adresse';
comment on column public.profiles.trade_register_number is 'Immatriculation RCS ou RM';

-- ---------------------------------------------------------------------------
-- 3) Entité légale — client B2B (customer_profiles)
-- ---------------------------------------------------------------------------

alter table public.customer_profiles
  add column if not exists siren text,
  add column if not exists siret text,
  add column if not exists vat_number text,
  add column if not exists naf_code text,
  add column if not exists country_code char(2) not null default 'FR',
  add column if not exists trade_register_number text;

alter table public.customer_profiles drop constraint if exists customer_profiles_siren_format;
alter table public.customer_profiles
  add constraint customer_profiles_siren_format
  check (siren is null or siren ~ '^\d{9}$');

alter table public.customer_profiles drop constraint if exists customer_profiles_siret_format;
alter table public.customer_profiles
  add constraint customer_profiles_siret_format
  check (siret is null or siret ~ '^\d{14}$');

alter table public.customer_profiles drop constraint if exists customer_profiles_siret_matches_siren;
alter table public.customer_profiles
  add constraint customer_profiles_siret_matches_siren
  check (siret is null or siren is null or left(siret, 9) = siren);

alter table public.customer_profiles drop constraint if exists customer_profiles_naf_code_format;
alter table public.customer_profiles
  add constraint customer_profiles_naf_code_format
  check (naf_code is null or naf_code ~ '^\d{2}\.\d{2}[A-Z]$');

alter table public.customer_profiles drop constraint if exists customer_profiles_country_code_format;
alter table public.customer_profiles
  add constraint customer_profiles_country_code_format
  check (country_code ~ '^[A-Z]{2}$');

comment on column public.customer_profiles.siren is 'SIREN client B2B (9 chiffres)';
comment on column public.customer_profiles.siret is 'SIRET client B2B (14 chiffres)';

-- ---------------------------------------------------------------------------
-- 4) Factures — métadonnées e-invoicing
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists operation_type public.invoice_operation_type not null default 'prestation_services',
  add column if not exists vat_on_debits boolean not null default false,
  add column if not exists vat_collection_nature public.vat_collection_nature not null default 'on_delivery',
  add column if not exists e_invoicing_status public.e_invoicing_status not null default 'DRAFT';

create index if not exists invoices_e_invoicing_status_idx
  on public.invoices (e_invoicing_status);

comment on column public.invoices.status is 'Statut métier app (draft/sent/paid) — distinct du flux PDP';
comment on column public.invoices.e_invoicing_status is 'Statut flux facturation électronique (PPF/PDP)';
comment on column public.invoices.operation_type is 'Nature globale : biens, services ou mixte';
comment on column public.invoices.vat_on_debits is 'Option TVA sur les débits (art. 269 CGI)';
comment on column public.invoices.vat_collection_nature is 'Exigibilité TVA : livraison ou encaissement';

-- ---------------------------------------------------------------------------
-- 5) Lignes de facture — TVA explicite par ligne
-- ---------------------------------------------------------------------------

alter table public.invoice_lines
  add column if not exists vat_rate numeric(5, 2),
  add column if not exists vat_exemption_reason text,
  add column if not exists vat_category_code text;

-- Rétrocompat : lignes existantes sans TVA → taux standard FR 20 %
update public.invoice_lines
set vat_rate = 20.00
where vat_rate is null;

alter table public.invoice_lines
  alter column vat_rate set default 20.00;

alter table public.invoice_lines
  alter column vat_rate set not null;

alter table public.invoice_lines
  alter column vat_category_code set default 'S';

update public.invoice_lines
set vat_category_code = 'S'
where vat_category_code is null;

alter table public.invoice_lines
  alter column vat_category_code set not null;

alter table public.invoice_lines drop constraint if exists invoice_lines_vat_rate_range;
alter table public.invoice_lines
  add constraint invoice_lines_vat_rate_range
  check (vat_rate >= 0 and vat_rate <= 100);

alter table public.invoice_lines drop constraint if exists invoice_lines_vat_category_code_format;
alter table public.invoice_lines
  add constraint invoice_lines_vat_category_code_format
  check (vat_category_code ~ '^[A-Z]{1,3}$');

alter table public.invoice_lines drop constraint if exists invoice_lines_exemption_when_zero;
alter table public.invoice_lines
  add constraint invoice_lines_exemption_when_zero
  check (
    vat_rate > 0
    or (vat_exemption_reason is not null and length(trim(vat_exemption_reason)) > 0)
  );

comment on column public.invoice_lines.vat_rate is 'Taux TVA ligne (%, ex. 20.00, 10.00, 5.50, 0.00)';
comment on column public.invoice_lines.vat_exemption_reason is 'Motif exonération si taux = 0 % (EN16931 VATEX)';
comment on column public.invoice_lines.vat_category_code is 'Catégorie TVA UN/ECE 5305 (S, AA, E, Z, …)';

-- =============================================================================
 22  invoice_finalization_routing.sql
 =============================================================================

-- File d'attente e-reporting (B2C) + champs de finalisation facture
-- Exécuter après supabase/einvoicing_en16931.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'e_reporting_queue_status') then
    create type public.e_reporting_queue_status as enum (
      'pending',
      'batched',
      'submitted',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_emission_flow') then
    create type public.invoice_emission_flow as enum (
      'e_invoicing',
      'e_reporting'
    );
  end if;
end
$$;

-- Finalisation & routage d'émission
alter table public.invoices
  add column if not exists finalized_at timestamptz,
  add column if not exists emission_flow public.invoice_emission_flow,
  add column if not exists pa_submission_id text,
  add column if not exists pa_submission_status text;

create index if not exists invoices_finalized_at_idx
  on public.invoices (artisan_id, finalized_at desc)
  where finalized_at is not null;

comment on column public.invoices.finalized_at is 'Horodatage de finalisation (émission)';
comment on column public.invoices.emission_flow is 'e_invoicing (B2B) ou e_reporting (B2C)';
comment on column public.invoices.pa_submission_id is 'Identifiant retour Plateforme Agréée';
comment on column public.invoices.pa_submission_status is 'Statut soumission PA (queued, accepted, …)';

-- Métadonnées B2C en attente de transmission groupée
create table if not exists public.e_reporting_queue (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  status public.e_reporting_queue_status not null default 'pending',
  payload jsonb not null,
  reporting_period date,
  submitted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint e_reporting_queue_invoice_unique unique (invoice_id)
);

create index if not exists e_reporting_queue_status_idx
  on public.e_reporting_queue (status, created_at);

create index if not exists e_reporting_queue_artisan_id_idx
  on public.e_reporting_queue (artisan_id);

drop trigger if exists set_e_reporting_queue_updated_at on public.e_reporting_queue;
create trigger set_e_reporting_queue_updated_at
before update on public.e_reporting_queue
for each row execute procedure public.set_updated_at();

alter table public.e_reporting_queue enable row level security;

drop policy if exists e_reporting_queue_artisan_read on public.e_reporting_queue;
create policy e_reporting_queue_artisan_read
on public.e_reporting_queue
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = e_reporting_queue.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists e_reporting_queue_artisan_insert on public.e_reporting_queue;
create policy e_reporting_queue_artisan_insert
on public.e_reporting_queue
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = e_reporting_queue.artisan_id and p.user_id = auth.uid()
  )
);

comment on table public.e_reporting_queue is 'File e-reporting B2C — transmission groupée périodique administration';

-- =============================================================================
 23  pa_webhook_status.sql
 =============================================================================

-- Webhook Plateforme Agréée : statuts fiscaux étendus + motif de rejet
-- Exécuter après supabase/invoice_finalization_routing.sql

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'e_invoicing_status' and e.enumlabel = 'RECEIVED_BY_PLATFORM'
  ) then
    alter type public.e_invoicing_status add value 'RECEIVED_BY_PLATFORM';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'e_invoicing_status' and e.enumlabel = 'TRANSMITTED'
  ) then
    alter type public.e_invoicing_status add value 'TRANSMITTED';
  end if;
end
$$;

alter table public.invoices
  add column if not exists e_invoicing_rejection_reason text,
  add column if not exists e_invoicing_status_updated_at timestamptz,
  add column if not exists payment_received_at timestamptz;

comment on column public.invoices.e_invoicing_rejection_reason is 'Motif de rejet PA (REFUSED/REJECTED)';
comment on column public.invoices.e_invoicing_status_updated_at is 'Dernière MAJ statut fiscal PA';
comment on column public.invoices.payment_received_at is 'Encaissement remonté par la PA (e-reporting TVA)';

-- Journal des événements webhook PA (audit + idempotence légère)
create table if not exists public.pa_webhook_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices (id) on delete set null,
  pa_submission_id text,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists pa_webhook_events_invoice_id_idx on public.pa_webhook_events (invoice_id);
create index if not exists pa_webhook_events_submission_idx on public.pa_webhook_events (pa_submission_id);

alter table public.pa_webhook_events enable row level security;

comment on table public.pa_webhook_events is 'Audit des callbacks Plateforme Agréée';

-- =============================================================================
 24  voice_quota.sql
 =============================================================================

alter table public.profiles
  add column if not exists subscription_plan text not null default 'base',
  add column if not exists voice_minutes_included integer not null default 0,
  add column if not exists voice_minutes_used integer not null default 0,
  add column if not exists voice_minutes_overdue integer not null default 0,
  add column if not exists billing_cycle_reset_at timestamptz;

alter table public.profiles drop constraint if exists profiles_subscription_plan_check;
alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('base', 'pro', 'premium'));

alter table public.profiles drop constraint if exists profiles_voice_minutes_included_nonnegative;
alter table public.profiles
  add constraint profiles_voice_minutes_included_nonnegative
  check (voice_minutes_included >= 0);

alter table public.profiles drop constraint if exists profiles_voice_minutes_used_nonnegative;
alter table public.profiles
  add constraint profiles_voice_minutes_used_nonnegative
  check (voice_minutes_used >= 0);

alter table public.profiles drop constraint if exists profiles_voice_minutes_overdue_nonnegative;
alter table public.profiles
  add constraint profiles_voice_minutes_overdue_nonnegative
  check (voice_minutes_overdue >= 0);

comment on column public.profiles.voice_minutes_included is 'Quota mensuel Soline (minutes entières) selon le plan actif';
comment on column public.profiles.voice_minutes_used is 'Minutes consommées sur le cycle de facturation courant';
comment on column public.profiles.voice_minutes_overdue is 'Minutes consommées au-delà du quota inclus';
comment on column public.profiles.billing_cycle_reset_at is 'Prochaine remise à zéro du compteur (sync Stripe)';

create table if not exists public.voice_call_logs (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  twilio_call_sid text not null,
  from_number text not null,
  to_number text not null,
  status text not null,
  duration_seconds integer not null default 0,
  minutes_billed integer not null default 0,
  created_at timestamptz not null default now(),
  constraint voice_call_logs_twilio_call_sid_unique unique (twilio_call_sid),
  constraint voice_call_logs_duration_nonnegative check (duration_seconds >= 0),
  constraint voice_call_logs_minutes_billed_nonnegative check (minutes_billed >= 0)
);

create index if not exists voice_call_logs_artisan_id_idx on public.voice_call_logs (artisan_id);
create index if not exists voice_call_logs_created_at_idx on public.voice_call_logs (artisan_id, created_at desc);

alter table public.voice_call_logs enable row level security;

drop policy if exists voice_call_logs_artisan_read on public.voice_call_logs;
create policy voice_call_logs_artisan_read
on public.voice_call_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = voice_call_logs.artisan_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.process_twilio_voice_call_status(
  p_artisan_id uuid,
  p_twilio_call_sid text,
  p_from_number text,
  p_to_number text,
  p_status text,
  p_duration_seconds integer,
  p_minutes_billed integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_included integer;
  v_used integer;
  v_overdue integer;
begin
  insert into public.voice_call_logs (
    artisan_id,
    twilio_call_sid,
    from_number,
    to_number,
    status,
    duration_seconds,
    minutes_billed
  )
  values (
    p_artisan_id,
    p_twilio_call_sid,
    p_from_number,
    p_to_number,
    p_status,
    greatest(coalesce(p_duration_seconds, 0), 0),
    greatest(coalesce(p_minutes_billed, 0), 0)
  )
  on conflict (twilio_call_sid) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select voice_minutes_included, voice_minutes_used, voice_minutes_overdue
    into v_included, v_used, v_overdue
    from public.profiles
    where id = p_artisan_id;

    return jsonb_build_object(
      'duplicate', true,
      'minutes_billed', 0,
      'voice_minutes_included', coalesce(v_included, 0),
      'voice_minutes_used', coalesce(v_used, 0),
      'voice_minutes_overdue', coalesce(v_overdue, 0)
    );
  end if;

  if coalesce(p_minutes_billed, 0) > 0 then
    update public.profiles
    set
      voice_minutes_used = voice_minutes_used + p_minutes_billed,
      voice_minutes_overdue = greatest(0, voice_minutes_used + p_minutes_billed - voice_minutes_included),
      updated_at = now()
    where id = p_artisan_id
    returning voice_minutes_included, voice_minutes_used, voice_minutes_overdue
    into v_included, v_used, v_overdue;
  else
    select voice_minutes_included, voice_minutes_used, voice_minutes_overdue
    into v_included, v_used, v_overdue
    from public.profiles
    where id = p_artisan_id;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'minutes_billed', coalesce(p_minutes_billed, 0),
    'voice_minutes_included', coalesce(v_included, 0),
    'voice_minutes_used', coalesce(v_used, 0),
    'voice_minutes_overdue', coalesce(v_overdue, 0)
  );
end;
$$;

revoke all on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) from public;
grant execute on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) to service_role;

-- =============================================================================
-- Contrôle post-init (lecture seule)
-- =============================================================================

with attendu(etape, objet, present) as (
  values
    ('01', 'profiles', to_regclass('public.profiles') is not null),
    ('03', 'customer_profiles', to_regclass('public.customer_profiles') is not null),
    ('04', 'quotes', to_regclass('public.quotes') is not null),
    ('07', 'invoices', to_regclass('public.invoices') is not null),
    ('10', 'platform_invitations', to_regclass('public.platform_invitations') is not null),
    ('13', 'supplier_products', to_regclass('public.supplier_products') is not null),
    ('16', 'profiles.latitude', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='latitude')),
    ('17', 'artisan_voice_numbers', to_regclass('public.artisan_voice_numbers') is not null),
    ('18', 'leads', to_regclass('public.leads') is not null),
    ('21', 'invoices.e_invoicing_status', exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='e_invoicing_status')),
    ('22', 'e_reporting_queue', to_regclass('public.e_reporting_queue') is not null),
    ('23', 'pa_webhook_events', to_regclass('public.pa_webhook_events') is not null),
    ('24', 'voice_call_logs', to_regclass('public.voice_call_logs') is not null)
)
select case when present then 'ok' else 'MANQUANT' end as etat, etape, objet
from attendu
order by present asc, etape;

