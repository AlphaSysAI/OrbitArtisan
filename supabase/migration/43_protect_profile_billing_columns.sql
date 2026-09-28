-- =============================================================================
-- 43_protect_profile_billing_columns.sql — Colonnes d'abonnement non modifiables par l'artisan
-- =============================================================================
-- Idempotent.
--
-- La policy "profiles_owner_write" (init.sql) laisse un artisan connecté modifier
-- TOUTES les colonnes de sa ligne via l'API REST (clé publique + son jeton) :
-- il pouvait se passer lui-même en Premium actif, prolonger son essai, ou se
-- déclarer « comptable confirmé » sans l'accord du comptable.
-- Ces colonnes ne sont écrites que par le serveur (service role : webhooks Stripe,
-- admin, crons, confirmation comptable). Pour les rôles `authenticated` / `anon`,
-- ce trigger les fige ; à la création du profil, il impose l'essai standard.
-- Aucun changement applicatif : le code n'écrit ces colonnes qu'en service role,
-- sauf l'insertion du profil (valeurs identiques à celles imposées ici).

create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role not in ('authenticated', 'anon') then
    return new; -- service role, SQL direct, crons
  end if;

  if tg_op = 'INSERT' then
    new.subscription_plan := 'pro';
    new.subscription_status := 'trialing';
    new.trial_ends_at := now() + interval '30 days';
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.account_status := 'active';
    new.deleted_at := null;
    new.accountant_email_confirmed_at := null;
    new.accountant_confirm_token_hash := null;
    new.accountant_confirm_sent_at := null;
    return new;
  end if;

  new.subscription_plan := old.subscription_plan;
  new.subscription_status := old.subscription_status;
  new.trial_ends_at := old.trial_ends_at;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.account_status := old.account_status;
  new.deleted_at := old.deleted_at;
  new.accountant_confirm_sent_at := old.accountant_confirm_sent_at;

  -- Changer l'adresse du comptable annule toute confirmation en cours ou acquise.
  if new.accountant_email is distinct from old.accountant_email then
    new.accountant_email_confirmed_at := null;
    new.accountant_confirm_token_hash := null;
  else
    new.accountant_email_confirmed_at := old.accountant_email_confirmed_at;
    new.accountant_confirm_token_hash := old.accountant_confirm_token_hash;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_billing_columns on public.profiles;
create trigger profiles_protect_billing_columns
  before insert or update on public.profiles
  for each row
  execute function public.protect_profile_billing_columns();
