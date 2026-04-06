-- Messagerie client ↔ artisan (exécuter après schema.sql / add_accent_color.sql)

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artisan_id, customer_user_id)
);

create index if not exists conversations_artisan_id_idx on public.conversations (artisan_id);
create index if not exists conversations_customer_user_id_idx on public.conversations (customer_user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_nonempty check (char_length(trim(body)) > 0)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute procedure public.set_updated_at();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists touch_conversation_on_message on public.messages;
create trigger touch_conversation_on_message
after insert on public.messages
for each row execute procedure public.touch_conversation_on_message();

alter table public.customer_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "customer_profiles_own" on public.customer_profiles;
create policy "customer_profiles_own"
on public.customer_profiles
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "conversations_select_participants" on public.conversations;
create policy "conversations_select_participants"
on public.conversations
for select
to authenticated
using (
  customer_user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = conversations.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists "conversations_insert_customer" on public.conversations;
create policy "conversations_insert_customer"
on public.conversations
for insert
to authenticated
with check (customer_user_id = auth.uid());

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
on public.messages
for select
to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
    and (
      c.customer_user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = c.artisan_id and p.user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
on public.messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
    and (
      c.customer_user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = c.artisan_id and p.user_id = auth.uid()
      )
    )
  )
);
