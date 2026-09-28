-- =============================================================================
-- 39_voice_number_quarantine.sql — Quarantaine des numéros Soline libérés
-- =============================================================================
-- Idempotent. Requiert 28_voice_number_pool.sql.
--
-- Un numéro rendu (fin d'essai, passage en Essentiel, résiliation) peut encore
-- recevoir des appels des clients de l'artisan précédent. Il reste 30 jours en
-- quarantaine avant de pouvoir être réattribué.

alter table public.voice_number_pool
  add column if not exists quarantine_until timestamptz;

alter table public.voice_number_pool drop constraint if exists voice_number_pool_status_check;
alter table public.voice_number_pool
  add constraint voice_number_pool_status_check
  check (status in ('available', 'assigned', 'quarantine', 'retired'));

comment on column public.voice_number_pool.quarantine_until is
  'Numéro libéré : réattribuable seulement après cette date (30 jours).';

create index if not exists voice_number_pool_quarantine_idx
  on public.voice_number_pool (quarantine_until)
  where status = 'quarantine';

create or replace function public.release_voice_number_from_pool(p_artisan_id uuid, p_phone_e164 text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if p_artisan_id is null then
    return null;
  end if;

  update public.voice_number_pool
  set
    status = 'quarantine',
    quarantine_until = clock_timestamp() + interval '30 days',
    assigned_artisan_id = null,
    assigned_at = null,
    updated_at = clock_timestamp()
  where assigned_artisan_id = p_artisan_id
    and status = 'assigned'
    and (
      p_phone_e164 is null
      or length(trim(p_phone_e164)) = 0
      or phone_e164 = trim(p_phone_e164)
    )
  returning phone_e164 into v_phone;

  return v_phone;
end;
$$;

comment on function public.release_voice_number_from_pool(uuid, text) is
  'Libère le numéro pool d''un artisan : quarantaine de 30 jours avant réattribution.';

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

  -- Fin de quarantaine : le numéro redevient disponible.
  update public.voice_number_pool
  set status = 'available', quarantine_until = null, updated_at = clock_timestamp()
  where status = 'quarantine'
    and quarantine_until <= clock_timestamp();

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
  'Attribue le plus ancien numéro disponible (hors quarantaine) du pool à un artisan (SKIP LOCKED).';
