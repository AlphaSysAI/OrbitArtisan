alter table public.voice_call_intakes add column if not exists elevenlabs_conversation_id text;
create unique index if not exists voice_intake_conversation_unique
  on public.voice_call_intakes(artisan_id, elevenlabs_conversation_id) where elevenlabs_conversation_id is not null;

create table if not exists public.voice_post_call_inbox (
  id text primary key,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb,
  attempts integer not null default 0,
  claimed_at timestamptz,
  processed_at timestamptz,
  next_attempt_at timestamptz not null default now()
);
alter table public.voice_post_call_inbox enable row level security;
revoke all on public.voice_post_call_inbox from public, anon, authenticated;
grant select, insert, update on public.voice_post_call_inbox to service_role;

create or replace function public.claim_voice_post_call(p_id text default null)
returns setof public.voice_post_call_inbox
language sql security invoker set search_path = public as $$
  update public.voice_post_call_inbox set claimed_at = now(), attempts = attempts + 1
  where id = (
    select id from public.voice_post_call_inbox
    where (p_id is null or id = p_id) and processed_at is null and attempts < 5
      and next_attempt_at <= now() and (claimed_at is null or claimed_at < now() - interval '3 minutes')
    order by next_attempt_at, id
    limit 1 for update skip locked
  ) returning *;
$$;
revoke all on function public.claim_voice_post_call(text) from public, anon, authenticated;
grant execute on function public.claim_voice_post_call(text) to service_role;
