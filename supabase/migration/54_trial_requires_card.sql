-- 54 — Essai gratuit uniquement avec carte bancaire.
--
-- Nouveau statut « incomplete » : compte créé, aucun abonnement démarré. L'artisan
-- termine son onboarding puis démarre son essai via Stripe Checkout (CB obligatoire,
-- 0 € aujourd'hui, prélèvement à la fin de l'essai). Stripe passe ensuite le profil
-- en « trialing » (webhook), ce qui déclenche l'achat du numéro Soline.
-- Les comptes existants ne sont pas modifiés.

alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled'));

alter table public.profiles alter column subscription_status set default 'incomplete';

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
    -- Aucun essai sans carte : l'essai démarre avec l'abonnement Stripe (trial + CB).
    new.subscription_plan := 'pro';
    new.subscription_status := 'incomplete';
    new.trial_ends_at := null;
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
