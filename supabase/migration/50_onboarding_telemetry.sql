-- 50 — Onboarding « zéro saisie », télémétrie d'usage, réengagement.

-- Mention obligatoire (art. L243-2 C. assur.) : couverture géographique de la décennale.
alter table public.profiles add column if not exists decennale_coverage_area text;

-- Rappels opérationnels (push / SMS de service, jamais marketing) : désactivables.
alter table public.profiles add column if not exists ops_nudges_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- Présence : un jour d'ouverture de l'app = une ligne (pas de log par clic).
-- ---------------------------------------------------------------------------
create table if not exists public.artisan_activity_days (
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  first_seen_at timestamptz not null default now(),
  primary key (artisan_id, day)
);

alter table public.artisan_activity_days enable row level security;
drop policy if exists artisan_activity_days_owner on public.artisan_activity_days;
create policy artisan_activity_days_owner on public.artisan_activity_days
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = artisan_activity_days.artisan_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.profiles p where p.id = artisan_activity_days.artisan_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Événements métier clés (import onboarding, correction vocale, validation…).
-- ---------------------------------------------------------------------------
create table if not exists public.artisan_activity_events (
  id bigint generated always as identity primary key,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint artisan_activity_events_kind_len check (char_length(kind) between 2 and 60)
);

create index if not exists artisan_activity_events_idx on public.artisan_activity_events (artisan_id, kind, created_at desc);

alter table public.artisan_activity_events enable row level security;
drop policy if exists artisan_activity_events_owner_read on public.artisan_activity_events;
create policy artisan_activity_events_owner_read on public.artisan_activity_events
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = artisan_activity_events.artisan_id and p.user_id = auth.uid()));
drop policy if exists artisan_activity_events_owner_insert on public.artisan_activity_events;
create policy artisan_activity_events_owner_insert on public.artisan_activity_events
for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = artisan_activity_events.artisan_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Journal des relances de réengagement (plafonds + mesure d'efficacité).
-- Écrit uniquement par le cron (service role) : aucune policy d'écriture.
-- ---------------------------------------------------------------------------
create table if not exists public.reengagement_log (
  id bigint generated always as identity primary key,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  risk_score integer not null,
  signal text not null,
  channel text not null check (channel in ('push', 'sms')),
  message text not null,
  sent_at timestamptz not null default now(),
  reactivated_at timestamptz
);

create index if not exists reengagement_log_artisan_idx on public.reengagement_log (artisan_id, sent_at desc);
alter table public.reengagement_log enable row level security;

-- Réactivation : première présence dans les 72 h qui suivent une relance.
create or replace function public.mark_reengagement_reactivated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update reengagement_log
  set reactivated_at = new.first_seen_at
  where artisan_id = new.artisan_id
    and reactivated_at is null
    and sent_at > new.first_seen_at - interval '72 hours';
  return new;
end;
$$;

drop trigger if exists mark_reengagement_reactivated on public.artisan_activity_days;
create trigger mark_reengagement_reactivated
after insert on public.artisan_activity_days
for each row execute procedure public.mark_reengagement_reactivated();

-- Synthèse chiffrée de chaque envoi comptable (affichage + message de confirmation).
alter table public.accounting_exports add column if not exists recap jsonb;
