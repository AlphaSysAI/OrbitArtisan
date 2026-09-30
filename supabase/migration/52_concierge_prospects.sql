-- 52 — Conciergerie / apport d'affaires (back-office Super Admin uniquement).
--
-- Prospects artisans NON inscrits, importés d'annuaires publics, contactés À LA MAIN
-- par l'admin quand un chantier de leur zone n'a pas trouvé 3 artisans inscrits.
-- Minimisation RGPD : uniquement ce qui sert au matching local (nom commercial,
-- métier, téléphone pro, commune, coordonnées). Pas d'e-mail, d'avis, de dirigeant.
-- Aucune policy RLS : lecture/écriture exclusivement par le service role (admin).

create table if not exists public.prospect_artisans (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  trade text not null,              -- id de la nomenclature (src/lib/trades/taxonomy.ts)
  trade_category text not null,
  phone text not null,              -- E.164 (+33…)
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  status text not null default 'new',
  notes text,
  opt_out boolean not null default false,
  source text,                      -- nom du fichier importé (traçabilité de l'origine, art. 14 RGPD)
  last_contacted_at timestamptz,
  contact_count integer not null default 0,
  converted_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_artisans_status_check check (status in ('new', 'contacted', 'converted', 'blacklisted')),
  constraint prospect_artisans_phone_format check (phone ~ '^\+[0-9]{8,15}$'),
  constraint prospect_artisans_postal_code_format check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint prospect_artisans_name_len check (char_length(business_name) between 2 and 200),
  constraint prospect_artisans_notes_len check (notes is null or char_length(notes) <= 4000),
  -- Désinscrit = jamais recontacté, quel que soit le statut affiché.
  constraint prospect_artisans_opt_out_blacklisted check (not opt_out or status = 'blacklisted')
);

-- Déduplication stricte sur le téléphone normalisé.
create unique index if not exists prospect_artisans_phone_unique on public.prospect_artisans (phone);
create index if not exists prospect_artisans_match_idx on public.prospect_artisans (trade_category, trade) where not opt_out and status in ('new', 'contacted');

drop trigger if exists set_prospect_artisans_updated_at on public.prospect_artisans;
create trigger set_prospect_artisans_updated_at before update on public.prospect_artisans
for each row execute procedure public.set_updated_at();

alter table public.prospect_artisans enable row level security;

-- ---------------------------------------------------------------------------
-- Alertes : un chantier sans 3 artisans inscrits → prospects à appeler.
-- ---------------------------------------------------------------------------
create table if not exists public.concierge_alerts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  registered_count integer not null,
  prospect_ids uuid[] not null default '{}',
  summary jsonb not null,           -- récapitulatif ANONYMISÉ (métier, commune, budget, besoin)
  status text not null default 'open' check (status in ('open', 'handled', 'dismissed')),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists concierge_alerts_open_idx on public.concierge_alerts (status, created_at desc);
alter table public.concierge_alerts enable row level security;

-- ---------------------------------------------------------------------------
-- Invitations : lien unique prospect × chantier (débloque le chantier à l'inscription).
-- ---------------------------------------------------------------------------
create table if not exists public.concierge_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  prospect_id uuid not null references public.prospect_artisans (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  sms_sent_at timestamptz,
  claimed_at timestamptz,
  claimed_profile_id uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  -- 1 lien par prospect × chantier, et 1 seul lien « générique » (sans chantier) par prospect.
  unique nulls not distinct (prospect_id, lead_id)
);

alter table public.concierge_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Sélection des prospects d'un chantier : même métier (ou même famille), ≤ rayon,
-- ni désinscrits, ni blacklistés, ni convertis, ni déjà clients (même téléphone
-- qu'un artisan inscrit), les moins sollicités d'abord à distance égale.
-- ---------------------------------------------------------------------------
create or replace function public.concierge_prospect_candidates(p_lead_id uuid, p_radius_km double precision, p_limit integer)
returns table (id uuid, business_name text, phone text, city text, postal_code text, trade text, distance_km double precision)
language sql
stable
security definer
set search_path = public
as $$
  with l as (select * from leads where id = p_lead_id and latitude is not null and longitude is not null)
  select c.id, c.business_name, c.phone, c.city, c.postal_code, c.trade, round(c.distance_km::numeric, 1)::double precision
  from (
    select p.*,
      case when l.trade is not null and p.trade = l.trade then 0 else 1 end as trade_rank,
      6371 * acos(least(1.0,
        cos(radians(l.latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(l.longitude))
        + sin(radians(l.latitude)) * sin(radians(p.latitude)))) as distance_km
    from prospect_artisans p, l
    where not p.opt_out
      and p.status in ('new', 'contacted')
      and p.latitude is not null and p.longitude is not null
      and (l.trade is null or p.trade = l.trade or (l.trade_category is not null and p.trade_category = l.trade_category))
      and not exists (
        select 1 from profiles pr where public.normalize_client_phone(pr.phone) = p.phone
      )
  ) c
  where c.distance_km <= p_radius_km
  order by c.trade_rank, c.distance_km, c.contact_count
  limit greatest(0, least(p_limit, 3));
$$;

revoke all on function public.concierge_prospect_candidates(uuid, double precision, integer) from public, anon, authenticated;
