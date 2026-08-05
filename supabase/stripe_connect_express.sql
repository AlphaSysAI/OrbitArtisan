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

