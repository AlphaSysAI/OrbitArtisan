-- =============================================================================
-- 37_soline_calls_pricing.sql — Forfait Soline compté en appels + dépassement plafonné
-- =============================================================================
-- Idempotent.
--
-- Grille (source de vérité : src/lib/billing/subscription-plans.ts) :
--   Essentiel (base) 29 € HT — pas de voix
--   Pro      69 € HT — 40 appels / mois, 0,90 € HT / appel au-delà
--   Premium 109 € HT — 100 appels / mois, 0,70 € HT / appel au-delà
--
-- Un appel compte s'il est `completed` et dure au moins 30 s (voice_call_logs).
-- Le quota se calcule en lecture : aucune colonne de compteur n'est ajoutée.
-- voice_minutes_included / voice_allow_overage restent en base (historique),
-- mais ne sont plus lus par l'application.

-- 1) Plafond mensuel de dépassement choisi par l'artisan (centimes HT).
--    Au-delà : Soline ne coupe pas la ligne, elle prend seulement un message.
alter table public.profiles
  add column if not exists voice_overage_cap_cents integer not null default 3000;

alter table public.profiles drop constraint if exists profiles_voice_overage_cap_cents_range;
alter table public.profiles
  add constraint profiles_voice_overage_cap_cents_range
  check (voice_overage_cap_cents >= 0 and voice_overage_cap_cents <= 100000);

comment on column public.profiles.voice_overage_cap_cents is
  'Plafond mensuel de dépassement Soline (centimes HT). 0 = aucun appel facturé hors forfait : Soline passe en message seul.';

-- Reprise de l'ancienne préférence : dépassement refusé → plafond à 0.
-- Ne touche que les profils encore au défaut, pour rester idempotent sans écraser un réglage.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'voice_allow_overage'
  ) then
    update public.profiles
    set voice_overage_cap_cents = 0
    where voice_allow_overage = false
      and voice_overage_cap_cents = 3000;
  end if;
end $$;

-- 2) Index de décompte des appels facturables du mois.
create index if not exists voice_call_logs_billable_idx
  on public.voice_call_logs (artisan_id, created_at desc)
  where status = 'completed' and duration_seconds >= 30;

-- 3) Journal des dépassements facturés (un par artisan et par mois civil).
create table if not exists public.voice_overage_charges (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  plan_id text not null check (plan_id in ('base', 'pro', 'premium')),
  calls_included integer not null check (calls_included >= 0),
  calls_used integer not null check (calls_used >= 0),
  overage_calls integer not null check (overage_calls >= 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  cap_cents integer not null check (cap_cents >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'invoiced', 'skipped', 'failed')),
  stripe_invoice_item_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_overage_charges_artisan_period_unique unique (artisan_id, period_start)
);

comment on table public.voice_overage_charges is
  'Dépassements Soline du mois civil précédent, ajoutés à la prochaine facture Stripe (invoice item). Unicité artisan+mois = idempotence.';

create index if not exists voice_overage_charges_artisan_idx
  on public.voice_overage_charges (artisan_id, period_start desc);

drop trigger if exists set_voice_overage_charges_updated_at on public.voice_overage_charges;
create trigger set_voice_overage_charges_updated_at
before update on public.voice_overage_charges
for each row execute procedure public.set_updated_at();

alter table public.voice_overage_charges enable row level security;

drop policy if exists voice_overage_charges_artisan_read on public.voice_overage_charges;
create policy voice_overage_charges_artisan_read
on public.voice_overage_charges
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = voice_overage_charges.artisan_id
      and p.user_id = auth.uid()
  )
);
-- Écritures : service role uniquement (cron de facturation).
