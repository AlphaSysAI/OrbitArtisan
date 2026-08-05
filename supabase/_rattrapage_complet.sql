-- =============================================================================
--  RATTRAPAGE COMPLET DES MIGRATIONS — Orbit Artisan
-- =============================================================================
--
--  Script unique amenant la base a l'etat courant du code, quel que soit son
--  etat de depart. Chaque operation est gardee : reexecuter ce fichier ne casse
--  rien et ne duplique rien.
--
--  UTILISATION
--    Coller l'integralite dans l'editeur SQL Supabase et executer en une fois.
--    Duree indicative : quelques secondes.
--
--  CE QUI EST INCLUS (dans l'ordre des dependances)
--    01  schema.sql .......................... profiles, services, appointments
--    02  add_accent_color.sql ............... profiles.accent_color
--    03  messages.sql ....................... customer_profiles, conversations, messages
--    04  quotes.sql ......................... quotes, quote_services, quote_materials
--    05  quotes_customer_link.sql ........... rattachement devis <-> client
--    06  appointments_customer_and_pending.sql  RDV lies au compte + file d'attente
--    07  invoices_and_quote_signature.sql ... invoices, invoice_lines, signature
--    08  platform_invitations.sql ........... invitations client / artisan
--    09  profile_contact_fields.sql ......... coordonnees postales
--    10  stripe_connect_express.sql ......... Stripe Connect
--    11  supplier_products.sql .............. catalogue fournisseur + achat direct
--    12  profile_trade.sql .................. secteur + metier de l'artisan
--    13  contacts_delete_policies.sql ....... suppression d'un contact client
--    14  embeddings ......................... passage 1536 -> 1024 SI NECESSAIRE
--
--  CE QUI EST VOLONTAIREMENT EXCLU
--    client_invitations.sql ......... marque DEPRECATED, remplace par le 08
--    migrate_client_invitations.sql . reprise de donnees de l'ancienne table ;
--                                     a executer separement UNIQUEMENT si
--                                     public.client_invitations existe chez vous
--    migrate_embeddings_mistral.sql . remplace par l'etape 14, conditionnelle :
--                                     le fichier d'origine effacait les embeddings
--                                     meme quand la base etait deja en 1024
--
--  A FAIRE APRES
--    - Verifier le resultat avec le bloc de controle en fin de fichier.
--    - Supprimer les 5 produits d'exemple du catalogue (etape 11) : leurs URL
--      pointent vers une page d'accueil, pas vers des fiches produit.
-- =============================================================================



-- =============================================================================
-- 01  SCHEMA DE BASE  --  source : supabase/schema.sql
-- =============================================================================


-- =============================================================================
-- 01  SCHEMA DE BASE  --  source : supabase/schema.sql
-- =============================================================================

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



-- =============================================================================
-- 02  COULEUR D'ACCENT  --  source : supabase/add_accent_color.sql
-- =============================================================================

-- À exécuter une fois si ta base existait avant l’ajout de accent_color
alter table public.profiles add column if not exists accent_color text;

alter table public.profiles drop constraint if exists profiles_accent_color_format;

alter table public.profiles
  add constraint profiles_accent_color_format check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  );


-- =============================================================================
-- 03  MESSAGERIE  --  source : supabase/messages.sql
-- =============================================================================

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
-- 04  DEVIS  --  source : supabase/quotes.sql
-- =============================================================================

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
-- 05  LIEN DEVIS <-> CLIENT  --  source : supabase/quotes_customer_link.sql
-- =============================================================================

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
-- 06  RDV CLIENT + FILE D'ATTENTE  --  source : supabase/appointments_customer_and_pending.sql
-- =============================================================================

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
-- 07  FACTURES ET SIGNATURE  --  source : supabase/invoices_and_quote_signature.sql
-- =============================================================================

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
-- 08  INVITATIONS PLATEFORME  --  source : supabase/platform_invitations.sql
-- =============================================================================

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
-- 09  COORDONNEES  --  source : supabase/profile_contact_fields.sql
-- =============================================================================

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
-- 10  STRIPE CONNECT  --  source : supabase/stripe_connect_express.sql
-- =============================================================================

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
-- 11  CATALOGUE FOURNISSEUR  --  source : supabase/supplier_products.sql
-- =============================================================================

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

-- ⚠️ PRODUITS D'EXEMPLE — A SUPPRIMER AVANT MISE EN SERVICE
--    Leurs URL pointent vers https://www.bricodepot.fr/ (page d'accueil), pas
--    vers des fiches produit. Si un artisan coche « achat direct » sur l'une de
--    ces lignes, le client recoit un lien vers un accueil.
--    Pour les retirer :  delete from public.supplier_products where sku like 'BD-%';
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
-- 12  METIER DE L'ARTISAN  --  source : supabase/profile_trade.sql
-- =============================================================================

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
-- 13  SUPPRESSION D'UN CONTACT  --  source : supabase/contacts_delete_policies.sql
-- =============================================================================

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
-- 14  EMBEDDINGS : PASSAGE vector(1536) -> vector(1024), UNIQUEMENT SI BESOIN
--     source : supabase/migrate_embeddings_mistral.sql (rendu conditionnel)
--     source : supabase/migrate_embeddings_mistral.sql (rendu conditionnel)
-- =============================================================================
--
-- L'etape 11 cree deja la colonne en vector(1024). Ce bloc ne sert qu'aux bases
-- installees du temps des embeddings OpenAI (1536). Le fichier d'origine
-- effacait les embeddings sans condition : ici, si la base est deja en 1024,
-- rien n'est touche.

do $emb$
begin
  if to_regclass('public.supplier_products') is null then
    raise notice 'Table supplier_products absente : etape 14 ignoree.';
    return;
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.supplier_products'::regclass
      and a.attname = 'embedding'
      and format_type(a.atttypid, a.atttypmod) = 'vector(1536)'
  ) then
    raise notice 'Embeddings en vector(1536) : conversion en vector(1024). Les vecteurs existants sont remis a zero, relancer scripts/seed-supplier-embeddings.ts.';
    execute 'drop index if exists supplier_products_embedding_idx';
    execute 'alter table public.supplier_products alter column embedding type vector(1024) using null';
    execute 'create index if not exists supplier_products_embedding_idx
             on public.supplier_products
             using ivfflat (embedding vector_cosine_ops)
             with (lists = 100)';
  else
    raise notice 'Embeddings deja en vector(1024) : rien a faire.';
  end if;
end
$emb$;


-- =============================================================================
--  CONTROLE FINAL — tout doit afficher « ok »
-- =============================================================================

with attendu(etape, objet, present) as (
  values
    ('01 schema',      'table profiles',            to_regclass('public.profiles') is not null),
    ('01 schema',      'table services',            to_regclass('public.services') is not null),
    ('01 schema',      'table appointments',        to_regclass('public.appointments') is not null),
    ('02 accent',      'profiles.accent_color',     exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='accent_color')),
    ('03 messagerie',  'table conversations',       to_regclass('public.conversations') is not null),
    ('03 messagerie',  'table messages',            to_regclass('public.messages') is not null),
    ('03 messagerie',  'table customer_profiles',   to_regclass('public.customer_profiles') is not null),
    ('04 devis',       'table quotes',              to_regclass('public.quotes') is not null),
    ('04 devis',       'table quote_materials',     to_regclass('public.quote_materials') is not null),
    ('05 lien devis',  'quotes.customer_user_id',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='customer_user_id')),
    ('06 rdv',         'appointments.customer_user_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='customer_user_id')),
    ('06 rdv',         'table pending_vitrine_appointments', to_regclass('public.pending_vitrine_appointments') is not null),
    ('07 factures',    'table invoices',            to_regclass('public.invoices') is not null),
    ('07 factures',    'table invoice_lines',       to_regclass('public.invoice_lines') is not null),
    ('08 invitations', 'table platform_invitations', to_regclass('public.platform_invitations') is not null),
    ('09 coordonnees', 'profiles.phone',            exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='phone')),
    ('10 stripe',      'profiles.stripe_transfers_enabled', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='stripe_transfers_enabled')),
    ('11 catalogue',   'table supplier_products',   to_regclass('public.supplier_products') is not null),
    ('11 catalogue',   'quote_materials.exclude_from_invoice', exists (select 1 from information_schema.columns where table_schema='public' and table_name='quote_materials' and column_name='exclude_from_invoice')),
    ('11 catalogue',   'quote_materials.supplier_url', exists (select 1 from information_schema.columns where table_schema='public' and table_name='quote_materials' and column_name='supplier_url')),
    ('12 metier',      'profiles.trade_category',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='trade_category')),
    ('12 metier',      'profiles.trade',            exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='trade')),
    ('13 suppression', 'policy conversations_delete_artisan', exists (select 1 from pg_policies where schemaname='public' and tablename='conversations' and policyname='conversations_delete_artisan')),
    ('13 suppression', 'policy appointments_owner_delete', exists (select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='appointments_owner_delete')),
    ('13 suppression', 'policy platform_invitations_delete_inviter', exists (select 1 from pg_policies where schemaname='public' and tablename='platform_invitations' and policyname='platform_invitations_delete_inviter')),
    ('14 embeddings',  'supplier_products.embedding en vector(1024)',
      exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.supplier_products')
              and a.attname='embedding' and format_type(a.atttypid, a.atttypmod)='vector(1024)'))
)
select case when present then 'ok' else 'MANQUANT' end as etat, etape, objet
from attendu
order by present asc, etape, objet;

-- Rappel : si public.client_invitations existe encore, executer ensuite
-- supabase/migrate_client_invitations.sql pour reprendre les anciennes donnees.
select case
  when to_regclass('public.client_invitations') is not null
    then 'client_invitations existe : executer migrate_client_invitations.sql'
  else 'client_invitations absente : rien a reprendre'
end as ancienne_table;
