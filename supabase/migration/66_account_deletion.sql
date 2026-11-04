-- =============================================================================
-- 66_account_deletion.sql — Suppression du compte par l'artisan (libre-service)
-- =============================================================================
-- Rejouable. Parcours (src/lib/account/account-deletion.ts) :
--   1. l'artisan demande la suppression : abonnement Stripe résilié immédiatement (sans
--      remboursement de la période payée, CGV art. 6), accès coupé, numéro Soline libéré ;
--   2. 30 jours plus tard, le cron efface définitivement la fiche (cascade), ses fichiers
--      et son compte de connexion.
-- Pendant ces 30 jours, l'admin peut annuler (compte restauré, abonnement à reprendre).

-- 1) File des suppressions (preuve d'effacement, RGPD art. 5.2) -------------------------
-- Aucune clé étrangère : la ligne survit à l'effacement de la fiche. Données minimales :
-- identifiants techniques et client Stripe (rattachement des factures émises par l'Éditeur).
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  user_id uuid not null,
  stripe_customer_id text,
  requested_by text not null default 'artisan',
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  purged_at timestamptz,
  cancelled_at timestamptz,
  constraint account_deletions_requested_by check (requested_by in ('artisan', 'admin')),
  constraint account_deletions_closed_once check (not (purged_at is not null and cancelled_at is not null))
);

-- Une seule demande en cours par fiche.
create unique index if not exists account_deletions_pending_profile_idx
  on public.account_deletions (profile_id)
  where purged_at is null and cancelled_at is null;

create index if not exists account_deletions_due_idx
  on public.account_deletions (purge_after)
  where purged_at is null and cancelled_at is null;

alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;

comment on table public.account_deletions is
  'Demandes de suppression de compte artisan (J+30). Service role uniquement ; conservé après effacement comme preuve.';

-- 2) Registre des numéros : survit à l'effacement du compte -----------------------------
-- La photo d'identité (artisan_snapshot) prise à l'attribution reste disponible pour les
-- réquisitions judiciaires ; seuls les liens vers la fiche et le compte passent à NULL.
-- Avant : ON DELETE RESTRICT, qui rendait la suppression d'un compte impossible.
alter table public.voice_number_assignments alter column artisan_id drop not null;
alter table public.voice_number_assignments alter column user_id drop not null;

alter table public.voice_number_assignments drop constraint if exists voice_number_assignments_artisan_id_fkey;
alter table public.voice_number_assignments
  add constraint voice_number_assignments_artisan_id_fkey
  foreign key (artisan_id) references public.profiles (id) on delete set null;

alter table public.voice_number_assignments drop constraint if exists voice_number_assignments_user_id_fkey;
alter table public.voice_number_assignments
  add constraint voice_number_assignments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
