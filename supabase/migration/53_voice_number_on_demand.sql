-- 53 — Numéros Soline à la demande (1 abonnement Pro/Premium = 1 numéro acheté).
--
-- Fin du stock tampon : le numéro est acheté chez Twilio au moment où l'abonnement
-- est validé, puis attribué. La table voice_number_pool reste le registre des
-- numéros détenus (attribués, en quarantaine, restitués).
--
-- 1. quarantined_artisan_id : un artisan qui se réabonne pendant la quarantaine
--    récupère SON numéro (ses clients l'ont enregistré) au lieu d'en acheter un neuf.
-- 2. profiles.voice_number_provisioning_at : verrou d'achat par artisan (Stripe
--    envoie plusieurs événements pour un même abonnement → jamais 2 achats).

alter table public.voice_number_pool
  add column if not exists quarantined_artisan_id uuid references public.profiles (id) on delete set null;

create index if not exists voice_number_pool_quarantined_artisan_idx
  on public.voice_number_pool (quarantined_artisan_id)
  where status = 'quarantine';

alter table public.profiles
  add column if not exists voice_number_provisioning_at timestamptz;

comment on column public.profiles.voice_number_provisioning_at is
  'Verrou : achat de numéro Soline en cours pour cet artisan (expire au bout de 10 min).';

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
    quarantined_artisan_id = p_artisan_id,
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

-- Réabonnement pendant la quarantaine : l'artisan retrouve son propre numéro.
create or replace function public.reclaim_quarantined_voice_number(p_artisan_id uuid)
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

  select p.id, p.phone_e164
  into v_id, v_phone
  from public.voice_number_pool p
  where p.status = 'quarantine'
    and p.quarantined_artisan_id = p_artisan_id
    and p.elevenlabs_ready = true
  order by p.updated_at desc
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
    quarantine_until = null,
    quarantined_artisan_id = null,
    updated_at = clock_timestamp()
  where id = v_id;

  pool_id := v_id;
  phone_e164 := v_phone;
  return next;
end;
$$;

revoke all on function public.reclaim_quarantined_voice_number(uuid) from public, anon, authenticated;
revoke all on function public.release_voice_number_from_pool(uuid, text) from public, anon, authenticated;
-- Faille corrigée : ces fonctions SECURITY DEFINER étaient exécutables par anon /
-- authenticated (n'importe qui pouvait mettre en quarantaine le numéro d'un artisan
-- ou s'en attribuer un). Service role uniquement.
revoke all on function public.claim_voice_number_from_pool(uuid) from public, anon, authenticated;
-- Même faille sur le décompte d'appels : « revoke from public » ne retire pas les
-- droits accordés explicitement par Supabase à anon / authenticated. N'importe qui
-- pouvait décompter (ou fausser) les appels d'un artisan. Appelé uniquement par le
-- webhook Twilio (service role).
revoke all on function public.process_twilio_voice_call_status(uuid, text, text, text, text, integer, integer) from anon, authenticated;

alter table public.voice_number_pool drop constraint if exists voice_number_pool_provisioned_by_check;
alter table public.voice_number_pool
  add constraint voice_number_pool_provisioned_by_check
  check (provisioned_by is null or provisioned_by in ('manual', 'admin_bulk', 'auto_refill', 'on_demand'));
