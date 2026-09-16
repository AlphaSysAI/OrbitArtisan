-- Notifications in-app (badges) + abonnements push web.

-- =============================================================================
-- 1  Lecture des conversations
-- =============================================================================

create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_reads_user_idx
  on public.conversation_reads (user_id);

alter table public.conversation_reads enable row level security;

drop policy if exists conversation_reads_own on public.conversation_reads;
create policy conversation_reads_own
on public.conversation_reads
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =============================================================================
-- 2  Repères « vu » par catégorie (devis acceptés, appels vocaux, etc.)
-- =============================================================================

create table if not exists public.user_notification_watermarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint user_notification_watermarks_category_check
    check (category in ('quotes_accepted', 'quotes_received', 'voice_intakes', 'invoices_received'))
);

alter table public.user_notification_watermarks enable row level security;

drop policy if exists user_notification_watermarks_own on public.user_notification_watermarks;
create policy user_notification_watermarks_own
on public.user_notification_watermarks
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =============================================================================
-- 3  Abonnements push (Web Push / PWA)
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own
on public.push_subscriptions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute procedure public.set_updated_at();

-- =============================================================================
-- 4  RPC — marquer lu
-- =============================================================================

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.customer_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = c.artisan_id and p.user_id = auth.uid()
        )
      )
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, user_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.mark_notification_category_seen(p_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_category not in ('quotes_accepted', 'quotes_received', 'voice_intakes', 'invoices_received') then
    raise exception 'invalid_category';
  end if;

  insert into public.user_notification_watermarks (user_id, category, last_seen_at)
  values (auth.uid(), p_category, now())
  on conflict (user_id, category)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_notification_category_seen(text) to authenticated;

-- =============================================================================
-- 5  RPC — compteurs pour pastilles de navigation
-- =============================================================================

create or replace function public.get_notification_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artisan_id uuid;
  v_messages int := 0;
  v_quotes_accepted int := 0;
  v_quotes_received int := 0;
  v_voice int := 0;
  v_invoices int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select p.id into v_artisan_id
  from public.profiles p
  where p.user_id = v_uid;

  select count(*)::int into v_messages
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.conversation_reads cr
    on cr.conversation_id = c.id and cr.user_id = v_uid
  where (
    c.customer_user_id = v_uid
    or exists (
      select 1
      from public.profiles p
      where p.id = c.artisan_id and p.user_id = v_uid
    )
  )
  and (
    m.sender_user_id is distinct from v_uid
    or (
      m.sender_user_id is null
      and m.kind = 'lead_recap'
      and v_artisan_id is not null
      and c.artisan_id = v_artisan_id
    )
  )
  and m.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz);

  if v_artisan_id is not null then
    select count(*)::int into v_quotes_accepted
    from public.quotes q
    left join public.user_notification_watermarks w
      on w.user_id = v_uid and w.category = 'quotes_accepted'
    where q.artisan_id = v_artisan_id
      and q.status = 'accepted'
      and q.signed_at > coalesce(w.last_seen_at, '-infinity'::timestamptz);

    select count(*)::int into v_voice
    from public.voice_call_intakes vi
    left join public.user_notification_watermarks w
      on w.user_id = v_uid and w.category = 'voice_intakes'
    where vi.artisan_id = v_artisan_id
      and vi.status = 'pending_review'
      and vi.created_at > coalesce(w.last_seen_at, '-infinity'::timestamptz);
  end if;

  select count(*)::int into v_quotes_received
  from public.quotes q
  left join public.user_notification_watermarks w
    on w.user_id = v_uid and w.category = 'quotes_received'
  where q.customer_user_id = v_uid
    and q.status = 'sent'
    and coalesce(q.sent_at, q.updated_at) > coalesce(w.last_seen_at, '-infinity'::timestamptz);

  select count(*)::int into v_invoices
  from public.invoices i
  left join public.user_notification_watermarks w
    on w.user_id = v_uid and w.category = 'invoices_received'
  where i.customer_user_id = v_uid
    and i.status in ('sent', 'overdue')
    and i.created_at > coalesce(w.last_seen_at, '-infinity'::timestamptz);

  return jsonb_build_object(
    'ok', true,
    'messages', v_messages,
    'quotes_accepted', v_quotes_accepted,
    'quotes_received', v_quotes_received,
    'voice_intakes', v_voice,
    'invoices_received', v_invoices,
    'is_artisan', v_artisan_id is not null
  );
end;
$$;

grant execute on function public.get_notification_counts() to authenticated;

comment on table public.conversation_reads is 'Dernière lecture par utilisateur et conversation (pastille messages).';
comment on table public.user_notification_watermarks is 'Repères « vu » par catégorie pour les pastilles de navigation.';
comment on table public.push_subscriptions is 'Abonnements Web Push (PWA) par utilisateur.';
