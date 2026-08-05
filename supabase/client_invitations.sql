-- DEPRECATED — Utiliser supabase/platform_invitations.sql
-- Invitations client + lien artisan ↔ client (exécuter après messages.sql / quotes_customer_link.sql)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'client_invitation_status') then
    create type public.client_invitation_status as enum ('pending', 'accepted', 'cancelled');
  end if;
end
$$;

create table if not exists public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  invited_name text,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status public.client_invitation_status not null default 'pending',
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint client_invitations_email_nonempty check (char_length(trim(email)) > 0)
);

create index if not exists client_invitations_artisan_id_idx on public.client_invitations (artisan_id);
create index if not exists client_invitations_email_idx on public.client_invitations (lower(email));
create unique index if not exists client_invitations_pending_unique
  on public.client_invitations (artisan_id, lower(email))
  where status = 'pending';

alter table public.client_invitations enable row level security;

drop policy if exists client_invitations_artisan_select on public.client_invitations;
create policy client_invitations_artisan_select
on public.client_invitations
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = client_invitations.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists client_invitations_artisan_insert on public.client_invitations;
create policy client_invitations_artisan_insert
on public.client_invitations
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists client_invitations_artisan_update on public.client_invitations;
create policy client_invitations_artisan_update
on public.client_invitations
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = client_invitations.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists client_invitations_customer_read_own on public.client_invitations;
create policy client_invitations_customer_read_own
on public.client_invitations
for select
to authenticated
using (
  accepted_user_id = auth.uid()
  or (
    status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

-- L’artisan peut ouvrir une conversation avec un client déjà lié (invitation acceptée ou devis)
drop policy if exists conversations_insert_artisan_linked on public.conversations;
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
      select 1 from public.client_invitations i
      where i.artisan_id = conversations.artisan_id
        and i.accepted_user_id = conversations.customer_user_id
        and i.status = 'accepted'
    )
    or exists (
      select 1 from public.quotes q
      where q.artisan_id = conversations.artisan_id
        and q.customer_user_id = conversations.customer_user_id
    )
  )
);

-- L’artisan peut lire le profil client s’il a une invitation acceptée ou un devis
drop policy if exists customer_profiles_artisan_invitation_read on public.customer_profiles;
create policy customer_profiles_artisan_invitation_read
on public.customer_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.client_invitations i
    join public.profiles p on p.id = i.artisan_id
    where i.accepted_user_id = customer_profiles.user_id
      and i.status = 'accepted'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.quotes q
    join public.profiles p on p.id = q.artisan_id
    where q.customer_user_id = customer_profiles.user_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.accept_client_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.client_invitations%rowtype;
  v_conv_id uuid;
  v_user_email text;
  v_display text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select * into v_inv
  from public.client_invitations
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

  insert into public.conversations (artisan_id, customer_user_id)
  values (v_inv.artisan_id, v_uid)
  on conflict (artisan_id, customer_user_id) do nothing
  returning id into v_conv_id;

  if v_conv_id is null then
    select id into v_conv_id
    from public.conversations
    where artisan_id = v_inv.artisan_id and customer_user_id = v_uid;
  end if;

  update public.client_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_user_id = v_uid
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_conv_id,
    'artisan_id', v_inv.artisan_id
  );
end;
$$;

grant execute on function public.accept_client_invitation(text) to authenticated;
