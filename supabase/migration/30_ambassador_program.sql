-- =============================================================================
-- 30_ambassador_program.sql — Tarif ambassadeur (50 premiers ABONNÉS Pro/Premium)
-- =============================================================================
-- Principe :
--   1. L'artisan enregistre le code (inscription via user_metadata.promo_code, ou
--      Réglages > Abonnement) → statut "registered". Aucune place n'est prise.
--   2. Au lancement d'un paiement Pro/Premium, le serveur (service role) appelle
--      reserve_promo_slot : si le programme est ouvert et qu'il reste une place,
--      elle est bloquée ("pending") pendant la durée de vie de la page Stripe.
--   3. Paiement confirmé (webhook) → "active" : la place est définitivement prise.
--      Paiement abandonné → le blocage expire tout seul (hold_expires_at).
--   4. Plus de place ou date dépassée au moment du paiement → "lapsed" : l'artisan
--      peut souscrire au tarif normal.
--   5. Fin de l'abonnement remisé → "forfeited" : remise perdue, place non remise
--      en jeu.
-- Places occupées = active + forfeited + pending dont le blocage court encore.
-- Idempotent (réexécutable, y compris sur la première version de cette migration).

create table if not exists public.promo_programs (
  code text primary key check (code ~ '^[A-Z0-9-]{3,32}$'),
  label text not null,
  max_slots integer not null check (max_slots > 0),
  ends_at timestamptz not null,
  discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  eligible_plans text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.promo_programs is
  'Programmes promotionnels à places limitées (ex. AMBASSADEUR). La remise est appliquée par un coupon Stripe côté serveur.';

create table if not exists public.promo_enrollments (
  -- Un seul code promotionnel par artisan.
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  program_code text not null references public.promo_programs (code),
  status text not null default 'registered',
  enrolled_at timestamptz not null default now(),
  activated_at timestamptz,
  forfeited_at timestamptz,
  stripe_subscription_id text
);

alter table public.promo_enrollments
  add column if not exists hold_expires_at timestamptz,
  add column if not exists stripe_checkout_session_id text;

-- (Re)définition des statuts — la 1re version utilisait 'reserved'.
alter table public.promo_enrollments drop constraint if exists promo_enrollments_status_check;
update public.promo_enrollments set status = 'registered' where status = 'reserved';
alter table public.promo_enrollments alter column status set default 'registered';
alter table public.promo_enrollments
  add constraint promo_enrollments_status_check
  check (status in ('registered', 'pending', 'active', 'lapsed', 'forfeited'));

create index if not exists promo_enrollments_program_idx on public.promo_enrollments (program_code, status);
create index if not exists promo_enrollments_subscription_idx
  on public.promo_enrollments (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.promo_enrollments.status is
  'registered = code enregistré, pas de place ; pending = place bloquée jusqu''à hold_expires_at (paiement en cours) ; active = abonnement remisé, place prise ; lapsed = plus de place / offre close au paiement ; forfeited = abonnement remisé terminé, remise perdue.';

-- ---------------------------------------------------------------------------
-- RLS : lecture de sa propre inscription uniquement. Aucune écriture client.
-- ---------------------------------------------------------------------------
alter table public.promo_programs enable row level security;
alter table public.promo_enrollments enable row level security;

drop policy if exists promo_enrollments_select_own on public.promo_enrollments;
create policy promo_enrollments_select_own on public.promo_enrollments
  for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Places occupées
-- ---------------------------------------------------------------------------
create or replace function public.promo_slots_taken(p_code text)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.promo_enrollments
  where program_code = p_code
    and (
      status in ('active', 'forfeited')
      or (status = 'pending' and hold_expires_at > now())
    );
$$;

revoke all on function public.promo_slots_taken(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enregistrement du code (sans prise de place)
-- ---------------------------------------------------------------------------
drop function if exists public.claim_promo_slot_for_profile(uuid, text);

create or replace function public.register_promo_code_for_profile(p_profile_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_program public.promo_programs%rowtype;
begin
  select * into v_program from public.promo_programs where code = v_code;
  if not found or not v_program.is_active then
    return 'invalid';
  end if;

  if exists (select 1 from public.promo_enrollments where profile_id = p_profile_id) then
    return 'already_enrolled';
  end if;

  if now() > v_program.ends_at then
    return 'expired';
  end if;

  if public.promo_slots_taken(v_code) >= v_program.max_slots then
    return 'full';
  end if;

  insert into public.promo_enrollments (profile_id, program_code, status)
  values (p_profile_id, v_code, 'registered')
  on conflict (profile_id) do nothing;

  if not found then
    return 'already_enrolled';
  end if;
  return 'registered';
end;
$$;

revoke all on function public.register_promo_code_for_profile(uuid, text) from public, anon, authenticated;

-- Appelable par l'artisan connecté (Réglages > Abonnement).
create or replace function public.claim_promo_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = auth.uid();
  if v_profile_id is null then
    return 'no_profile';
  end if;
  return public.register_promo_code_for_profile(v_profile_id, p_code);
end;
$$;

revoke all on function public.claim_promo_code(text) from public, anon;
grant execute on function public.claim_promo_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Blocage d'une place au lancement du paiement (service role uniquement)
-- ---------------------------------------------------------------------------
create or replace function public.reserve_promo_slot(p_profile_id uuid, p_hold_minutes integer default 35)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.promo_enrollments%rowtype;
  v_program public.promo_programs%rowtype;
begin
  select * into v_enrollment from public.promo_enrollments where profile_id = p_profile_id for update;
  if not found then
    return 'not_enrolled';
  end if;

  if v_enrollment.status in ('active', 'forfeited') then
    return 'already_used';
  end if;
  if v_enrollment.status = 'lapsed' then
    return 'lapsed';
  end if;

  select * into v_program from public.promo_programs where code = v_enrollment.program_code;

  -- Sérialise les blocages d'un même programme : jamais de 51e place.
  perform pg_advisory_xact_lock(hashtext('promo_program:' || v_enrollment.program_code));

  -- Relance d'un paiement déjà en cours : on prolonge le même blocage.
  if v_enrollment.status = 'pending' and v_enrollment.hold_expires_at > now() then
    update public.promo_enrollments
    set hold_expires_at = now() + make_interval(mins => p_hold_minutes)
    where profile_id = p_profile_id;
    return 'reserved';
  end if;

  if not v_program.is_active or now() > v_program.ends_at then
    update public.promo_enrollments set status = 'lapsed', hold_expires_at = null where profile_id = p_profile_id;
    return 'expired';
  end if;

  if public.promo_slots_taken(v_program.code) >= v_program.max_slots then
    update public.promo_enrollments set status = 'lapsed', hold_expires_at = null where profile_id = p_profile_id;
    return 'full';
  end if;

  update public.promo_enrollments
  set status = 'pending', hold_expires_at = now() + make_interval(mins => p_hold_minutes)
  where profile_id = p_profile_id;
  return 'reserved';
end;
$$;

revoke all on function public.reserve_promo_slot(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_promo_slot(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Statut public (places restantes)
-- ---------------------------------------------------------------------------
drop function if exists public.promo_program_status(text);
create or replace function public.promo_program_status(p_code text)
returns table (code text, remaining_slots integer, ends_at timestamptz, is_open boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    pp.code,
    greatest(0, pp.max_slots - public.promo_slots_taken(pp.code))::integer,
    pp.ends_at,
    pp.is_active and now() <= pp.ends_at and public.promo_slots_taken(pp.code) < pp.max_slots
  from public.promo_programs pp
  where pp.code = upper(btrim(coalesce(p_code, '')));
$$;

revoke all on function public.promo_program_status(text) from public;
grant execute on function public.promo_program_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger : enregistrement du code saisi à l'inscription, à la création du profil.
-- Un échec ne bloque JAMAIS la création du profil.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_claim_promo_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  select u.raw_user_meta_data ->> 'promo_code' into v_code
  from auth.users u
  where u.id = new.user_id;

  if v_code is not null and btrim(v_code) <> '' then
    begin
      perform public.register_promo_code_for_profile(new.id, v_code);
    exception when others then
      raise warning 'promo register failed for profile %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_claim_promo_on_insert on public.profiles;
create trigger profiles_claim_promo_on_insert
  after insert on public.profiles
  for each row
  execute function public.profiles_claim_promo_on_insert();

-- ---------------------------------------------------------------------------
-- Programme AMBASSADEUR : 50 premiers abonnés Pro/Premium, paiement au plus tard
-- le 30/11/2026 23:59:59 (Paris), −25 %, mensuel ou annuel.
-- ---------------------------------------------------------------------------
insert into public.promo_programs (code, label, max_slots, ends_at, discount_percent, eligible_plans)
values (
  'AMBASSADEUR',
  'Tarif ambassadeur',
  50,
  timestamptz '2026-11-30 23:59:59 Europe/Paris',
  25,
  array['pro', 'premium']
)
on conflict (code) do nothing;
