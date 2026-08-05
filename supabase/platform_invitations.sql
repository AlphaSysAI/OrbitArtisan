-- Invitations plateforme (client ou artisan) — exécuter après messages.sql
-- Si vous aviez déjà `client_invitations`, exécutez aussi migrate_client_invitations.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_invitation_status') then
    create type public.platform_invitation_status as enum ('pending', 'accepted', 'cancelled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_account_type') then
    create type public.platform_account_type as enum ('client', 'artisan');
  end if;
end
$$;

create table if not exists public.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  artisan_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  invited_name text,
  account_type public.platform_account_type not null default 'client',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status public.platform_invitation_status not null default 'pending',
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint platform_invitations_email_nonempty check (char_length(trim(email)) > 0)
);

create index if not exists platform_invitations_inviter_idx on public.platform_invitations (inviter_user_id);
create index if not exists platform_invitations_artisan_id_idx on public.platform_invitations (artisan_id);
create index if not exists platform_invitations_email_idx on public.platform_invitations (lower(email));

drop index if exists platform_invitations_pending_unique;
create unique index platform_invitations_pending_unique
  on public.platform_invitations (inviter_user_id, lower(email), account_type)
  where status = 'pending';

alter table public.platform_invitations enable row level security;

drop policy if exists platform_invitations_inviter_select on public.platform_invitations;
create policy platform_invitations_inviter_select
on public.platform_invitations
for select
to authenticated
using (inviter_user_id = auth.uid());

drop policy if exists platform_invitations_inviter_insert on public.platform_invitations;
create policy platform_invitations_inviter_insert
on public.platform_invitations
for insert
to authenticated
with check (inviter_user_id = auth.uid());

drop policy if exists platform_invitations_inviter_update on public.platform_invitations;
create policy platform_invitations_inviter_update
on public.platform_invitations
for update
to authenticated
using (inviter_user_id = auth.uid())
with check (inviter_user_id = auth.uid());

drop policy if exists platform_invitations_invitee_read on public.platform_invitations;
create policy platform_invitations_invitee_read
on public.platform_invitations
for select
to authenticated
using (
  accepted_user_id = auth.uid()
  or (
    status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

-- Conversations : artisan ↔ client lié par invitation client acceptée
-- Ces deux policies acceptaient aussi l'ancienne table client_invitations, pour les
-- bases antérieures à la bascule vers platform_invitations. Sur une base neuve cette
-- table n'existe pas et la création échouait (ERROR 42P01) : la branche héritée
-- n'est désormais ajoutée que si la table est réellement présente.
do $mig$
declare
  legacy_conv text := '';
  legacy_cp text := '';
begin
  if to_regclass('public.client_invitations') is not null then
    legacy_conv := $l$
        or exists (
          select 1 from public.client_invitations i
          where i.artisan_id = conversations.artisan_id
            and i.accepted_user_id = conversations.customer_user_id
            and i.status = 'accepted'
        )
    $l$;
    legacy_cp := $l$
      or exists (
        select 1
        from public.client_invitations i
        join public.profiles p on p.id = i.artisan_id
        where i.accepted_user_id = customer_profiles.user_id
          and i.status = 'accepted'
          and p.user_id = auth.uid()
      )
    $l$;
  end if;

  execute 'drop policy if exists conversations_insert_artisan_linked on public.conversations';
  execute format($f$
    create policy conversations_insert_artisan_linked
    on public.conversations
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = artisan_id and p.user_id = auth.uid()
      )
      and (
        exists (
          select 1 from public.platform_invitations i
          where i.artisan_id = conversations.artisan_id
            and i.accepted_user_id = conversations.customer_user_id
            and i.status = 'accepted'
            and i.account_type = 'client'
        )
        %s
        or exists (
          select 1 from public.quotes q
          where q.artisan_id = conversations.artisan_id
            and q.customer_user_id = conversations.customer_user_id
        )
      )
    )
  $f$, legacy_conv);

  execute 'drop policy if exists customer_profiles_artisan_invitation_read on public.customer_profiles';
  execute format($f$
    create policy customer_profiles_artisan_invitation_read
    on public.customer_profiles
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.platform_invitations i
        join public.profiles p on p.id = i.artisan_id
        where i.accepted_user_id = customer_profiles.user_id
          and i.status = 'accepted'
          and i.account_type = 'client'
          and p.user_id = auth.uid()
      )
      %s
      or exists (
        select 1
        from public.quotes q
        join public.profiles p on p.id = q.artisan_id
        where q.customer_user_id = customer_profiles.user_id
          and p.user_id = auth.uid()
      )
    )
  $f$, legacy_cp);
end
$mig$;

create or replace function public.accept_platform_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.platform_invitations%rowtype;
  v_conv_id uuid;
  v_user_email text;
  v_display text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select * into v_inv
  from public.platform_invitations
  where token = trim(p_token)
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select email into v_user_email from auth.users where id = v_uid;
  if v_user_email is null or lower(trim(v_user_email)) <> lower(trim(v_inv.email)) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  if v_inv.account_type = 'artisan' then
    if exists (select 1 from public.customer_profiles where user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'already_client');
    end if;

    update public.platform_invitations
    set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
    where id = v_inv.id;

    return jsonb_build_object('ok', true, 'account_type', 'artisan');
  end if;

  v_display := coalesce(
    nullif(trim(v_inv.invited_name), ''),
    split_part(v_user_email, '@', 1),
    'Client'
  );

  insert into public.customer_profiles (user_id, display_name, email)
  values (v_uid, v_display, v_user_email)
  on conflict (user_id) do update
  set
    email = coalesce(public.customer_profiles.email, excluded.email),
    display_name = case
      when public.customer_profiles.display_name in ('Client', '') then excluded.display_name
      else public.customer_profiles.display_name
    end;

  if v_inv.artisan_id is not null then
    insert into public.conversations (artisan_id, customer_user_id)
    values (v_inv.artisan_id, v_uid)
    on conflict (artisan_id, customer_user_id) do nothing
    returning id into v_conv_id;

    if v_conv_id is null then
      select id into v_conv_id
      from public.conversations
      where artisan_id = v_inv.artisan_id and customer_user_id = v_uid;
    end if;
  end if;

  update public.platform_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'account_type', 'client',
    'conversation_id', v_conv_id,
    'artisan_id', v_inv.artisan_id
  );
end;
$$;

grant execute on function public.accept_platform_invitation(text) to authenticated;

-- Compatibilité ancienne RPC
create or replace function public.accept_client_invitation(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.accept_platform_invitation(p_token);
$$;

grant execute on function public.accept_client_invitation(text) to authenticated;
