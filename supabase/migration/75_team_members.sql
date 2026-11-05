-- =============================================================================
-- 75_team_members.sql — Plusieurs utilisateurs sur un même compte artisan (Ultra : 2)
-- =============================================================================
-- Principe : `profiles.user_id` reste le titulaire. Les collaborateurs sont dans
-- `profile_members`. La colonne calculée `profiles.account_user_ids` (titulaire +
-- collaborateurs dans la limite de la formule) remplace `user_id = auth.uid()` dans
-- toutes les règles d'accès : un collaborateur voit et modifie les mêmes données
-- que le titulaire. Abonnement, paiement, réglages légaux et suppression du compte
-- restent réservés au titulaire (contrôlés côté application).
-- Un passage à une formule sans collaborateur coupe l'accès sans supprimer le lien :
-- le repasser en Ultra le rétablit.

begin;

-- -----------------------------------------------------------------------------
-- 1) Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profile_members (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, user_id),
  -- Un utilisateur appartient à un seul compte artisan.
  constraint profile_members_user_unique unique (user_id)
);

create table if not exists public.profile_member_invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index if not exists profile_member_invites_profile_idx on public.profile_member_invites (profile_id);

alter table public.profile_members enable row level security;
alter table public.profile_member_invites enable row level security;

-- Lecture : le titulaire voit son équipe, un collaborateur voit sa propre ligne.
-- Écritures : uniquement via les fonctions ci-dessous (security definer).
drop policy if exists profile_members_read on public.profile_members;
create policy profile_members_read on public.profile_members for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = profile_members.profile_id and p.user_id = auth.uid())
);

drop policy if exists profile_member_invites_owner_read on public.profile_member_invites;
create policy profile_member_invites_owner_read on public.profile_member_invites for select to authenticated
using (exists (select 1 from public.profiles p where p.id = profile_member_invites.profile_id and p.user_id = auth.uid()));

revoke insert, update, delete on public.profile_members, public.profile_member_invites from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Utilisateurs autorisés par compte
-- -----------------------------------------------------------------------------
-- Même grille que src/lib/billing/subscription-plans.ts (usersIncluded).
create or replace function public.plan_users_included(p_plan text)
returns integer
language sql immutable set search_path = public
as $$
  select case p_plan when 'ultra' then 2 else 1 end
$$;

alter table public.profiles add column if not exists account_user_ids uuid[] not null default '{}';
create index if not exists profiles_account_user_ids_idx on public.profiles using gin (account_user_ids);

-- Recalculée à chaque écriture du profil : jamais modifiable directement.
create or replace function public.profiles_compute_account_users()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Le titulaire ne peut pas être changé depuis l'application.
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.user_id := old.user_id;
  end if;
  new.account_user_ids := array[new.user_id] || coalesce((
    select array_agg(s.user_id order by s.created_at)
    from (
      select m.user_id, m.created_at from public.profile_members m
      where m.profile_id = new.id
      order by m.created_at
      limit greatest(public.plan_users_included(new.subscription_plan) - 1, 0)
    ) s
  ), '{}'::uuid[]);
  return new;
end
$$;

-- Préfixe « zz_ » : s'exécute après la protection des colonnes d'abonnement.
drop trigger if exists zz_profiles_account_users on public.profiles;
create trigger zz_profiles_account_users
  before insert or update on public.profiles
  for each row execute function public.profiles_compute_account_users();

create or replace function public.profile_members_refresh_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set account_user_ids = account_user_ids
    where id = coalesce(new.profile_id, old.profile_id);
  return null;
end
$$;

drop trigger if exists profile_members_refresh on public.profile_members;
create trigger profile_members_refresh
  after insert or delete on public.profile_members
  for each row execute function public.profile_members_refresh_profile();

-- Un collaborateur n'a pas de compte artisan à lui, et inversement.
create or replace function public.guard_profile_member_exclusive()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'profile_members' then
    if exists (select 1 from public.profiles where user_id = new.user_id) then
      raise exception 'user_has_own_account' using errcode = '23505';
    end if;
  elsif exists (select 1 from public.profile_members where user_id = new.user_id) then
    raise exception 'user_is_team_member' using errcode = '23505';
  end if;
  return new;
end
$$;

drop trigger if exists guard_profile_member_exclusive on public.profile_members;
create trigger guard_profile_member_exclusive
  before insert on public.profile_members
  for each row execute function public.guard_profile_member_exclusive();

drop trigger if exists guard_profile_member_exclusive on public.profiles;
create trigger guard_profile_member_exclusive
  before insert on public.profiles
  for each row execute function public.guard_profile_member_exclusive();

update public.profiles set account_user_ids = array[user_id];

-- Titulaire du compte auquel appartient l'utilisateur connecté (lui-même s'il est titulaire).
create or replace function public.account_owner_user_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.user_id from public.profiles p where auth.uid() = any(p.account_user_ids) limit 1
$$;
grant execute on function public.account_owner_user_id() to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Règles d'accès : « titulaire du profil » devient « membre du compte »
-- -----------------------------------------------------------------------------
-- Tables rattachées au titulaire par user_id (bibliothèque d'ouvrages, recouvrement) :
-- partagées avec l'équipe, et une ligne créée par un collaborateur est enregistrée
-- au nom du titulaire.
create or replace function public.assign_row_to_account_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.user_id is not distinct from auth.uid() then
    v_owner := public.account_owner_user_id();
    if v_owner is not null then new.user_id := v_owner; end if;
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['work_items', 'work_categories', 'formal_notices', 'debt_collection_cases'] loop
    execute format('drop trigger if exists assign_row_to_account_owner on public.%I', t);
    execute format(
      'create trigger assign_row_to_account_owner before insert on public.%I for each row execute function public.assign_row_to_account_owner()',
      t
    );
  end loop;
end
$$;

do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_shared boolean;
  v_changed integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%'
  loop
    -- Le titulaire garde seul les droits complets sur la ligne du profil (suppression…) :
    -- les collaborateurs reçoivent des règles dédiées plus bas.
    continue when r.tablename = 'profiles' and r.cmd <> 'SELECT';

    v_shared := r.tablename in ('work_items', 'work_categories', 'formal_notices', 'debt_collection_cases');
    v_qual := r.qual;
    v_check := r.with_check;

    v_qual := replace(v_qual, 'p.user_id = auth.uid()', 'auth.uid() = ANY (p.account_user_ids)');
    v_check := replace(v_check, 'p.user_id = auth.uid()', 'auth.uid() = ANY (p.account_user_ids)');
    v_qual := replace(v_qual, 'profiles.user_id = auth.uid()', 'auth.uid() = ANY (profiles.account_user_ids)');
    v_check := replace(v_check, 'profiles.user_id = auth.uid()', 'auth.uid() = ANY (profiles.account_user_ids)');

    if r.tablename = 'profiles' then
      v_qual := replace(v_qual, 'auth.uid() = user_id', 'auth.uid() = ANY (account_user_ids)');
    elsif v_shared then
      v_qual := replace(replace(v_qual, 'auth.uid() = user_id', 'user_id = account_owner_user_id()'), 'user_id = auth.uid()', 'user_id = account_owner_user_id()');
      v_check := replace(replace(v_check, 'auth.uid() = user_id', 'user_id = account_owner_user_id()'), 'user_id = auth.uid()', 'user_id = account_owner_user_id()');
    end if;

    if v_qual is distinct from r.qual or v_check is distinct from r.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        r.policyname, r.schemaname, r.tablename,
        case when v_qual is not null then format(' using (%s)', v_qual) else '' end,
        case when v_check is not null then format(' with check (%s)', v_check) else '' end
      );
      v_changed := v_changed + 1;
    end if;
  end loop;
  raise notice 'règles d''accès adaptées à l''équipe : %', v_changed;
end
$$;

drop policy if exists profiles_member_select on public.profiles;
create policy profiles_member_select on public.profiles for select to authenticated
using (auth.uid() = any(account_user_ids));

drop policy if exists profiles_member_update on public.profiles;
create policy profiles_member_update on public.profiles for update to authenticated
using (auth.uid() = any(account_user_ids))
with check (auth.uid() = any(account_user_ids));

-- -----------------------------------------------------------------------------
-- 4) Fonctions SQL qui retrouvaient le profil par user_id = auth.uid()
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_changed integer := 0;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.prosrc like '%user_id = auth.uid()%' or p.prosrc like '%p.user_id = v_uid%')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    v_new := replace(v_new, 'from public.profiles where user_id = auth.uid()', 'from public.profiles where auth.uid() = any(account_user_ids)');
    v_new := replace(v_new, 'p.user_id = auth.uid()', 'auth.uid() = any(p.account_user_ids)');
    v_new := replace(v_new, 'p.user_id = v_uid', 'v_uid = any(p.account_user_ids)');
    if v_new <> v_def then
      execute v_new;
      v_changed := v_changed + 1;
    end if;
  end loop;
  raise notice 'fonctions adaptées à l''équipe : %', v_changed;
end
$$;

-- -----------------------------------------------------------------------------
-- 5) Invitations (titulaire) et arrivée dans l'équipe (invité)
-- -----------------------------------------------------------------------------
-- Résultat : 'ok' ou un code d'erreur lisible par l'application.
create or replace function public.create_team_invite(p_email text, p_token_hash text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_email text := lower(trim(p_email));
  v_used integer;
begin
  select * into v_profile from public.profiles where user_id = auth.uid();
  if not found then return 'not_owner'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'invalid_email'; end if;
  if exists (select 1 from auth.users where id = auth.uid() and lower(email) = v_email) then return 'self'; end if;

  perform pg_advisory_xact_lock(hashtextextended('team:' || v_profile.id::text, 0));
  update public.profile_member_invites set revoked_at = now()
    where profile_id = v_profile.id and email = v_email and accepted_at is null and revoked_at is null;
  select (select count(*) from public.profile_members where profile_id = v_profile.id)
       + (select count(*) from public.profile_member_invites
            where profile_id = v_profile.id and accepted_at is null and revoked_at is null and expires_at > now())
    into v_used;
  if v_used >= public.plan_users_included(v_profile.subscription_plan) - 1 then
    return case when public.plan_users_included(v_profile.subscription_plan) <= 1 then 'plan_not_eligible' else 'seats_full' end;
  end if;

  insert into public.profile_member_invites (profile_id, email, token_hash, invited_by)
    values (v_profile.id, v_email, p_token_hash, auth.uid());
  return 'ok';
end
$$;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.profile_member_invites i set revoked_at = now()
  where i.id = p_invite_id and i.accepted_at is null
    and exists (select 1 from public.profiles p where p.id = i.profile_id and p.user_id = auth.uid())
$$;

create or replace function public.remove_team_member(p_user_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.profile_members m
  where m.user_id = p_user_id
    and exists (select 1 from public.profiles p where p.id = m.profile_id and p.user_id = auth.uid())
$$;

-- L'invité doit être connecté avec l'adresse invitée. Si l'inscription lui a déjà
-- créé une fiche artisan vide (aucun abonnement, devis, facture ni client), elle est
-- supprimée ; une fiche réellement utilisée bloque l'arrivée dans l'équipe.
create or replace function public.accept_team_invite(p_token_hash text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.profile_member_invites;
  v_owner public.profiles;
  v_own public.profiles;
  v_email text;
begin
  if auth.uid() is null then return 'auth'; end if;
  select * into v_invite from public.profile_member_invites where token_hash = p_token_hash for update;
  if not found or v_invite.revoked_at is not null then return 'invalid'; end if;
  if v_invite.accepted_at is not null then
    return case when v_invite.accepted_user_id = auth.uid() then 'ok' else 'invalid' end;
  end if;
  if v_invite.expires_at <= now() then return 'expired'; end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from v_invite.email then return 'email_mismatch'; end if;
  if exists (select 1 from public.profile_members where user_id = auth.uid()) then return 'already_member'; end if;

  select * into v_owner from public.profiles where id = v_invite.profile_id;
  if not found then return 'invalid'; end if;
  if v_owner.user_id = auth.uid() then return 'self'; end if;
  perform pg_advisory_xact_lock(hashtextextended('team:' || v_owner.id::text, 0));
  if (select count(*) from public.profile_members where profile_id = v_owner.id)
       >= public.plan_users_included(v_owner.subscription_plan) - 1 then
    return 'seats_full';
  end if;

  select * into v_own from public.profiles where user_id = auth.uid();
  if found then
    if v_own.stripe_subscription_id is not null
       or v_own.subscription_status in ('active', 'trialing', 'past_due')
       or exists (select 1 from public.quotes where artisan_id = v_own.id)
       or exists (select 1 from public.invoices where artisan_id = v_own.id)
       or exists (select 1 from public.clients where artisan_id = v_own.id) then
      return 'has_own_account';
    end if;
    delete from public.work_items where user_id = auth.uid();
    delete from public.work_categories where user_id = auth.uid();
    delete from public.profiles where id = v_own.id;
  end if;

  insert into public.profile_members (profile_id, user_id, invited_by)
    values (v_owner.id, auth.uid(), v_invite.invited_by);
  update public.profile_member_invites set accepted_at = now(), accepted_user_id = auth.uid()
    where id = v_invite.id;
  return 'ok';
end
$$;

revoke all on function public.create_team_invite(text, text) from public, anon;
revoke all on function public.revoke_team_invite(uuid) from public, anon;
revoke all on function public.remove_team_member(uuid) from public, anon;
revoke all on function public.accept_team_invite(text) from public, anon;
grant execute on function public.create_team_invite(text, text) to authenticated;
grant execute on function public.revoke_team_invite(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
grant execute on function public.accept_team_invite(text) to authenticated;

commit;
