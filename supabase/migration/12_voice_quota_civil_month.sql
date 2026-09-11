-- =============================================================================
-- 12_voice_quota_civil_month.sql — Quota vocal dérivé + préférence dépassement
-- =============================================================================
-- Le décompte mensuel est calculé depuis voice_call_logs (mois civil).
-- Les colonnes voice_minutes_used / voice_minutes_overdue ne sont plus mises à jour.

alter table public.profiles
  add column if not exists voice_allow_overage boolean not null default true;

comment on column public.profiles.voice_allow_overage is
  'Si true, Soline continue de répondre au-delà du quota (minutes refacturables). Si false, les appels sont refusés une fois le quota épuisé.';

-- Index pour le décompte mensuel par artisan
create index if not exists voice_call_logs_quota_idx
  on public.voice_call_logs (artisan_id, created_at desc)
  where minutes_billed > 0;

-- RPC : journalisation seule (plus de compteurs cumulatifs sur profiles)
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
  v_minutes integer;
begin
  v_minutes := greatest(coalesce(p_minutes_billed, 0), 0);

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
    v_minutes
  )
  on conflict (twilio_call_sid) do nothing
  returning id into v_log_id;

  return jsonb_build_object(
    'duplicate', v_log_id is null,
    'minutes_billed', case when v_log_id is null then 0 else v_minutes end,
    'log_id', v_log_id
  );
end;
$$;

revoke all on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) from public;
grant execute on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) to service_role;
