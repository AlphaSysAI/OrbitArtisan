-- =============================================================================
-- 47_voice_number_release_after_quarantine.sql — Numéros rendus, jamais réattribués
-- =============================================================================
-- Idempotent. Remplace le comportement de 39 : un numéro sorti de quarantaine n'est
-- plus remis en « disponible » pour un autre artisan (si l'ancien a gardé son renvoi
-- d'appel, le nouveau recevrait ses clients). Au bout des 30 jours, le cron
-- voice-pool-refill le rend à Twilio, le retire d'ElevenLabs et le passe en « retired ».
-- Le réassort rachète des numéros neufs.

alter table public.voice_number_pool
  add column if not exists released_to_carrier_at timestamptz;

comment on column public.voice_number_pool.released_to_carrier_at is
  'Date de restitution du numéro à Twilio (fin de quarantaine).';

create or replace function public.claim_voice_number_from_pool(p_artisan_id uuid)
returns table (pool_id uuid, phone_e164 text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_phone text;
begin
  if p_artisan_id is null then
    return;
  end if;

  -- Uniquement des numéros jamais attribués (les numéros en quarantaine partent chez Twilio).
  select id, voice_number_pool.phone_e164
  into v_id, v_phone
  from public.voice_number_pool
  where status = 'available'
    and elevenlabs_ready = true
  order by created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  update public.voice_number_pool
  set
    status = 'assigned',
    assigned_artisan_id = p_artisan_id,
    assigned_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = v_id;

  pool_id := v_id;
  phone_e164 := v_phone;
  return next;
end;
$$;

comment on function public.claim_voice_number_from_pool(uuid) is
  'Attribue le plus ancien numéro disponible (jamais attribué) du pool à un artisan (SKIP LOCKED).';
