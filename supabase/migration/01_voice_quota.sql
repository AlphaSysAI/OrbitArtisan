-- =============================================================================
-- 01_voice_quota.sql — Quota vocal Soline + journal Twilio
-- =============================================================================
-- À exécuter sur une base déjà initialisée avec init.sql.

-- Quota mensuel sur le profil artisan (équivalent Organization)
alter table public.profiles
  add column if not exists subscription_plan text not null default 'base',
  add column if not exists voice_minutes_included integer not null default 0,
  add column if not exists voice_minutes_used integer not null default 0,
  add column if not exists voice_minutes_overdue integer not null default 0,
  add column if not exists billing_cycle_reset_at timestamptz;

alter table public.profiles drop constraint if exists profiles_subscription_plan_check;
alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('base', 'pro', 'premium'));

alter table public.profiles drop constraint if exists profiles_voice_minutes_included_nonnegative;
alter table public.profiles
  add constraint profiles_voice_minutes_included_nonnegative
  check (voice_minutes_included >= 0);

alter table public.profiles drop constraint if exists profiles_voice_minutes_used_nonnegative;
alter table public.profiles
  add constraint profiles_voice_minutes_used_nonnegative
  check (voice_minutes_used >= 0);

alter table public.profiles drop constraint if exists profiles_voice_minutes_overdue_nonnegative;
alter table public.profiles
  add constraint profiles_voice_minutes_overdue_nonnegative
  check (voice_minutes_overdue >= 0);

comment on column public.profiles.voice_minutes_included is 'Quota mensuel Soline (minutes entières) selon le plan actif';
comment on column public.profiles.voice_minutes_used is 'Minutes consommées sur le cycle de facturation courant';
comment on column public.profiles.voice_minutes_overdue is 'Minutes consommées au-delà du quota inclus';
comment on column public.profiles.billing_cycle_reset_at is 'Prochaine remise à zéro du compteur (sync Stripe)';

-- Journal des appels Twilio
create table if not exists public.voice_call_logs (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  twilio_call_sid text not null,
  from_number text not null,
  to_number text not null,
  status text not null,
  duration_seconds integer not null default 0,
  minutes_billed integer not null default 0,
  created_at timestamptz not null default now(),
  constraint voice_call_logs_twilio_call_sid_unique unique (twilio_call_sid),
  constraint voice_call_logs_duration_nonnegative check (duration_seconds >= 0),
  constraint voice_call_logs_minutes_billed_nonnegative check (minutes_billed >= 0)
);

create index if not exists voice_call_logs_artisan_id_idx on public.voice_call_logs (artisan_id);
create index if not exists voice_call_logs_created_at_idx on public.voice_call_logs (artisan_id, created_at desc);

alter table public.voice_call_logs enable row level security;

drop policy if exists voice_call_logs_artisan_read on public.voice_call_logs;
create policy voice_call_logs_artisan_read
on public.voice_call_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = voice_call_logs.artisan_id
      and p.user_id = auth.uid()
  )
);

-- Traitement atomique idempotent d'un statusCallback Twilio
create or replace function public.process_twilio_voice_call_status(
  p_artisan_id uuid,
  p_twilio_call_sid text,
  p_from_number text,
  p_to_number text,
  p_status text,
  p_duration_seconds integer,
  p_minutes_billed integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_included integer;
  v_used integer;
  v_overdue integer;
begin
  insert into public.voice_call_logs (
    artisan_id,
    twilio_call_sid,
    from_number,
    to_number,
    status,
    duration_seconds,
    minutes_billed
  )
  values (
    p_artisan_id,
    p_twilio_call_sid,
    p_from_number,
    p_to_number,
    p_status,
    greatest(coalesce(p_duration_seconds, 0), 0),
    greatest(coalesce(p_minutes_billed, 0), 0)
  )
  on conflict (twilio_call_sid) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select voice_minutes_included, voice_minutes_used, voice_minutes_overdue
    into v_included, v_used, v_overdue
    from public.profiles
    where id = p_artisan_id;

    return jsonb_build_object(
      'duplicate', true,
      'minutes_billed', 0,
      'voice_minutes_included', coalesce(v_included, 0),
      'voice_minutes_used', coalesce(v_used, 0),
      'voice_minutes_overdue', coalesce(v_overdue, 0)
    );
  end if;

  if coalesce(p_minutes_billed, 0) > 0 then
    update public.profiles
    set
      voice_minutes_used = voice_minutes_used + p_minutes_billed,
      voice_minutes_overdue = greatest(0, voice_minutes_used + p_minutes_billed - voice_minutes_included),
      updated_at = now()
    where id = p_artisan_id
    returning voice_minutes_included, voice_minutes_used, voice_minutes_overdue
    into v_included, v_used, v_overdue;
  else
    select voice_minutes_included, voice_minutes_used, voice_minutes_overdue
    into v_included, v_used, v_overdue
    from public.profiles
    where id = p_artisan_id;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'minutes_billed', coalesce(p_minutes_billed, 0),
    'voice_minutes_included', coalesce(v_included, 0),
    'voice_minutes_used', coalesce(v_used, 0),
    'voice_minutes_overdue', coalesce(v_overdue, 0)
  );
end;
$$;

revoke all on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) from public;
grant execute on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) to service_role;
