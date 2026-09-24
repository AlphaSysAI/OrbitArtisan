-- Pool de numéros Twilio pré-provisionnés (attribution auto à l'abonnement Pro/Premium).

create table if not exists public.voice_number_pool (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  status text not null default 'available'
    check (status in ('available', 'assigned', 'retired')),
  twilio_incoming_phone_sid text,
  elevenlabs_ready boolean not null default true,
  assigned_artisan_id uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint voice_number_pool_phone_e164_unique unique (phone_e164)
);

comment on table public.voice_number_pool is
  'Inventaire des numéros Soline (Twilio) disponibles ou attribués à un artisan.';

create index if not exists voice_number_pool_available_idx
  on public.voice_number_pool (created_at asc)
  where status = 'available' and elevenlabs_ready = true;

create index if not exists voice_number_pool_assigned_artisan_idx
  on public.voice_number_pool (assigned_artisan_id)
  where status = 'assigned';

alter table public.voice_number_pool enable row level security;

-- Réserve atomiquement un numéro du pool pour un artisan (service role / RPC).
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
  'Attribue le plus ancien numéro disponible du pool à un artisan (SKIP LOCKED).';

-- Remet un numéro pool en disponible si rattaché à l'artisan (retourne l'E.164 ou NULL).
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

  if p_phone_e164 is not null and length(trim(p_phone_e164)) > 0 then
    update public.voice_number_pool
    set
      status = 'available',
      assigned_artisan_id = null,
      assigned_at = null,
      updated_at = clock_timestamp()
    where assigned_artisan_id = p_artisan_id
      and status = 'assigned'
      and phone_e164 = trim(p_phone_e164)
    returning phone_e164 into v_phone;
  else
    update public.voice_number_pool
    set
      status = 'available',
      assigned_artisan_id = null,
      assigned_at = null,
      updated_at = clock_timestamp()
    where assigned_artisan_id = p_artisan_id
      and status = 'assigned'
    returning phone_e164 into v_phone;
  end if;

  return v_phone;
end;
$$;

comment on function public.release_voice_number_from_pool(uuid, text) is
  'Libère le numéro pool assigné à un artisan (optionnellement filtré par E.164).';
