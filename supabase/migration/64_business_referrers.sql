-- =============================================================================
-- 64_business_referrers.sql — Comptes « apporteur d'affaires » (création par l'admin)
-- =============================================================================
-- Rejouable. Aucune dépendance aux tables artisan : un apporteur n'est PAS un profil
-- artisan (pas de devis BTP, d'appels, d'agenda, de matching de demandes). Il porte en
-- revanche une identité d'entreprise complète : il facturera ses commissions en son nom
-- (SIREN, adresse, régime de TVA) dans une étape ultérieure.
--
-- Parcours : l'admin Soline saisit e-mail, prénom, nom, SIREN → invitation à usage
-- unique envoyée par e-mail (jeton haché, 14 jours) → l'apporteur complète son
-- entreprise et choisit son mot de passe → compte créé, invitation consommée.
--
-- Accès :
-- - business_referrer_invitations : service role uniquement (RLS sans policy) ;
-- - business_referrers : l'apporteur lit SA ligne ; écritures par le serveur (service
--   role) après contrôle — jamais directement depuis le navigateur.

-- 1) Invitations --------------------------------------------------------------------
create table if not exists public.business_referrer_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null,
  last_name text not null,
  siren text not null,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sent_at timestamptz,
  send_count integer not null default 0,
  claimed_at timestamptz,
  claimed_user_id uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  constraint business_referrer_invitations_email_format
    check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  constraint business_referrer_invitations_names
    check (char_length(btrim(first_name)) between 1 and 80 and char_length(btrim(last_name)) between 1 and 80),
  constraint business_referrer_invitations_siren check (siren ~ '^\d{9}$'),
  constraint business_referrer_invitations_token_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  -- claimed_user_id peut repasser à null si le compte est supprimé ; jamais l'inverse.
  constraint business_referrer_invitations_claim check (claimed_user_id is null or claimed_at is not null),
  constraint business_referrer_invitations_closed_once
    check (not (claimed_at is not null and cancelled_at is not null))
);

-- Une seule invitation ouverte par adresse (l'admin renvoie l'existante au lieu d'en créer une).
create unique index if not exists business_referrer_invitations_open_email_idx
  on public.business_referrer_invitations (email)
  where claimed_at is null and cancelled_at is null;

alter table public.business_referrer_invitations enable row level security;
revoke all on public.business_referrer_invitations from anon, authenticated;

comment on table public.business_referrer_invitations is
  'Invitations apporteur d''affaires créées par l''admin Soline. Jeton stocké haché (SHA-256). Service role uniquement.';

-- 2) Apporteurs ---------------------------------------------------------------------
create table if not exists public.business_referrers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  invitation_id uuid references public.business_referrer_invitations (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  business_name text not null,
  siren text not null,
  siret text,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  vat_regime text not null,
  vat_number text,
  status text not null default 'active',
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_referrers_names
    check (char_length(btrim(first_name)) between 1 and 80 and char_length(btrim(last_name)) between 1 and 80),
  constraint business_referrers_business_name check (char_length(btrim(business_name)) between 1 and 160),
  constraint business_referrers_phone check (phone ~ '^\+\d{8,15}$'),
  constraint business_referrers_siren check (siren ~ '^\d{9}$'),
  constraint business_referrers_siret check (siret is null or (siret ~ '^\d{14}$' and left(siret, 9) = siren)),
  constraint business_referrers_address
    check (char_length(btrim(address_line1)) between 3 and 200 and char_length(btrim(city)) between 1 and 120),
  constraint business_referrers_postal_code check (postal_code ~ '^\d{5}$'),
  -- Commission d'apport = prestation de services : TVA de droit commun (20 %) ou franchise en base.
  constraint business_referrers_vat_regime check (vat_regime in ('normal', 'franchise')),
  constraint business_referrers_vat_number
    check (
      (vat_regime = 'franchise' and vat_number is null)
      -- « is not null » explicite : sans lui, un NULL rendrait le CHECK inconnu, donc accepté.
      or (vat_regime = 'normal' and vat_number is not null and vat_number ~ '^FR[0-9A-Z]{2}\d{9}$' and right(vat_number, 9) = siren)
    ),
  constraint business_referrers_status check (status in ('active', 'suspended'))
);

drop trigger if exists business_referrers_set_updated_at on public.business_referrers;
create trigger business_referrers_set_updated_at
  before update on public.business_referrers
  for each row
  execute function public.set_updated_at();

alter table public.business_referrers enable row level security;
revoke all on public.business_referrers from anon;
revoke insert, update, delete on public.business_referrers from authenticated;
grant select on public.business_referrers to authenticated;

drop policy if exists business_referrers_select_own on public.business_referrers;
create policy business_referrers_select_own
  on public.business_referrers
  for select
  to authenticated
  using (user_id = auth.uid());

comment on table public.business_referrers is
  'Apporteurs d''affaires (compte distinct des artisans). Lecture de sa propre ligne ; écritures par le serveur.';

-- 3) Consommation de l'invitation ------------------------------------------------------
-- Appelée par le serveur APRÈS création du compte Auth : verrouille l'invitation, vérifie
-- qu'elle est ouverte, non expirée et pour la même adresse, crée l'apporteur et la marque
-- consommée — dans une seule transaction. En cas d'échec, le serveur supprime le compte
-- Auth qu'il vient de créer.
create or replace function public.claim_business_referrer_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_business_name text,
  p_siret text,
  p_address_line1 text,
  p_address_line2 text,
  p_postal_code text,
  p_city text,
  p_vat_regime text,
  p_vat_number text,
  p_terms_version text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_inv public.business_referrer_invitations%rowtype;
  v_id uuid;
begin
  select * into v_inv
  from public.business_referrer_invitations
  where token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_inv.cancelled_at is not null then
    return jsonb_build_object('status', 'cancelled');
  end if;
  if v_inv.claimed_at is not null then
    return jsonb_build_object('status', 'already_claimed');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if lower(p_email) <> v_inv.email then
    return jsonb_build_object('status', 'email_mismatch');
  end if;

  insert into public.business_referrers (
    user_id, invitation_id, first_name, last_name, email, phone, business_name, siren, siret,
    address_line1, address_line2, postal_code, city, vat_regime, vat_number,
    terms_accepted_at, terms_version
  ) values (
    p_user_id, v_inv.id, btrim(p_first_name), btrim(p_last_name), v_inv.email, p_phone, btrim(p_business_name),
    v_inv.siren, nullif(p_siret, ''), btrim(p_address_line1), nullif(btrim(coalesce(p_address_line2, '')), ''),
    p_postal_code, btrim(p_city), p_vat_regime, nullif(p_vat_number, ''), now(), p_terms_version
  )
  returning id into v_id;

  update public.business_referrer_invitations
  set claimed_at = now(), claimed_user_id = p_user_id
  where id = v_inv.id;

  return jsonb_build_object('status', 'claimed', 'referrer_id', v_id);
end;
$$;

revoke all on function public.claim_business_referrer_invitation(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_business_referrer_invitation(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;
