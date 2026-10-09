-- =============================================================================
-- 63_voice_booking_identity.sql — Identité des réservations vocales (Soline)
-- =============================================================================
-- Rejouable. Requiert 21 (appointments_no_overlap) et 38 (RDV vocaux pending).
--
-- Problème corrigé : l'idempotence et le changement de créneau reposaient sur
-- « même numéro d'appelant + RDV pending créé il y a moins de 30 min » (lecture puis
-- écriture côté application). Un client peut avoir plusieurs demandes légitimes, et
-- une lecture suivie d'une écriture ne protège pas des requêtes concurrentes.
--
-- 1) voice_call_sessions : une ligne par conversation ElevenLabs, écrite par le webhook
--    d'initiation (conversation_id + artisan résolu par le numéro appelé). Les outils ne
--    reconnaissent un conversation_id que s'il figure ici POUR CET ARTISAN. started_at
--    sert aussi au calcul du temps d'appel restant renvoyé par les outils.
-- 2) appointments.voice_conversation_id : rattache un RDV à la conversation qui l'a créé.
-- 3) voice_book_appointment() : rejeu / modification / création dans UNE transaction,
--    sérialisée par conversation (verrou consultatif). Les chevauchements restent
--    tranchés par appointments_no_overlap (23P01), y compris entre conversations.

-- 1) Sessions d'appel -----------------------------------------------------------
create table if not exists public.voice_call_sessions (
  conversation_id text primary key,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  call_sid text,
  caller_number text,
  started_at timestamptz not null default now(),
  closing_signaled_at timestamptz,
  constraint voice_call_sessions_conversation_id_format
    check (char_length(conversation_id) between 8 and 128)
);

create index if not exists voice_call_sessions_started_idx
  on public.voice_call_sessions (started_at);

-- Service role uniquement (webhooks) : RLS activée sans aucune policy.
alter table public.voice_call_sessions enable row level security;
revoke all on public.voice_call_sessions from anon, authenticated;

comment on table public.voice_call_sessions is
  'Conversation Soline en cours (écrite par le webhook d''initiation, supprimée par le post-appel ou le cron). Service role uniquement.';

-- 2) Rattachement RDV ↔ conversation ---------------------------------------------
alter table public.appointments
  add column if not exists voice_conversation_id text;

create index if not exists appointments_voice_conversation_idx
  on public.appointments (artisan_id, voice_conversation_id)
  where voice_conversation_id is not null;

comment on column public.appointments.voice_conversation_id is
  'Conversation ElevenLabs ayant créé le RDV (source = voice). Clé d''idempotence et de modification.';

-- 3) Réservation atomique ----------------------------------------------------------
-- Statuts renvoyés (jsonb {status, id?, start_time?, previous_start_time?, current_status?}) :
--   already_booked       : même conversation, même créneau, RDV pending existant (rejeu) ;
--   created              : nouveau RDV pending ;
--   replaced             : RDV pending de CETTE conversation déplacé (même id) ;
--   existing_booking     : la conversation a déjà un RDV pending et l'appel ne dit ni
--                          « modifier » ni « visite supplémentaire » → rien n'est écrit ;
--   replace_not_found    : RDV à modifier inconnu pour cet artisan ET cette conversation ;
--   replace_not_pending  : RDV à modifier déjà confirmé/annulé → jamais modifié ;
--   slot_unavailable     : chevauchement (contrainte d'exclusion) → rien n'est modifié.
create or replace function public.voice_book_appointment(
  p_artisan_id uuid,
  p_conversation_id text,
  p_start timestamptz,
  p_duration_minutes integer,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_expires_at timestamptz,
  p_replaces_id uuid default null,
  p_additional boolean default false
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.appointments%rowtype;
begin
  if p_conversation_id is null or char_length(p_conversation_id) < 8 then
    raise exception 'conversation_id requis' using errcode = '22023';
  end if;

  -- Sérialise les opérations d'une même conversation (rejeux concurrents, double clic outil).
  perform pg_advisory_xact_lock(hashtextextended(p_artisan_id::text || ':' || p_conversation_id, 0));

  -- Rejeu de la même opération.
  select id into v_id
  from public.appointments
  where artisan_id = p_artisan_id
    and voice_conversation_id = p_conversation_id
    and source = 'voice'
    and status = 'pending'
    and start_time = p_start
  limit 1;
  if v_id is not null then
    return jsonb_build_object('status', 'already_booked', 'id', v_id, 'start_time', p_start);
  end if;

  -- Modification d'un RDV de CETTE conversation (et de cet artisan) uniquement.
  if p_replaces_id is not null then
    select * into v_row
    from public.appointments
    where id = p_replaces_id
      and artisan_id = p_artisan_id
      and voice_conversation_id = p_conversation_id
      and source = 'voice'
    for update;
    if not found then
      return jsonb_build_object('status', 'replace_not_found');
    end if;
    if v_row.status <> 'pending' then
      return jsonb_build_object('status', 'replace_not_pending', 'id', v_row.id, 'current_status', v_row.status::text);
    end if;
    begin
      update public.appointments
      set start_time = p_start,
          duration_minutes = p_duration_minutes,
          expires_at = p_expires_at,
          notes = coalesce(p_notes, notes)
      where id = v_row.id;
    exception when exclusion_violation then
      -- Le nouveau créneau est pris : l'ancien RDV reste tel quel.
      return jsonb_build_object('status', 'slot_unavailable');
    end;
    return jsonb_build_object(
      'status', 'replaced', 'id', v_row.id, 'start_time', p_start, 'previous_start_time', v_row.start_time
    );
  end if;

  -- Nouvelle réservation : refusée si la conversation a déjà un RDV pending, sauf
  -- seconde visite explicitement demandée (rien n'est annulé automatiquement).
  if not p_additional then
    select * into v_row
    from public.appointments
    where artisan_id = p_artisan_id
      and voice_conversation_id = p_conversation_id
      and source = 'voice'
      and status = 'pending'
    order by created_at
    limit 1;
    if found then
      return jsonb_build_object('status', 'existing_booking', 'id', v_row.id, 'start_time', v_row.start_time);
    end if;
  end if;

  begin
    insert into public.appointments (
      artisan_id, customer_name, customer_email, customer_phone, start_time, duration_minutes,
      status, source, notes, expires_at, voice_conversation_id
    ) values (
      p_artisan_id, p_customer_name, p_customer_email, p_customer_phone, p_start, p_duration_minutes,
      'pending', 'voice', p_notes, p_expires_at, p_conversation_id
    )
    returning id into v_id;
  exception when exclusion_violation then
    return jsonb_build_object('status', 'slot_unavailable');
  end;
  return jsonb_build_object('status', 'created', 'id', v_id, 'start_time', p_start);
end;
$$;

revoke all on function public.voice_book_appointment(uuid, text, timestamptz, integer, text, text, text, text, timestamptz, uuid, boolean) from public, anon, authenticated;
grant execute on function public.voice_book_appointment(uuid, text, timestamptz, integer, text, text, text, text, timestamptz, uuid, boolean) to service_role;

-- 4) Signal de clôture unique par appel (outils) --------------------------------------
-- Renvoie true une seule fois par conversation : le premier outil appelé après le seuil.
create or replace function public.voice_mark_closing_signal(p_conversation_id text, p_artisan_id uuid)
returns boolean
language sql
set search_path = public
as $$
  with updated as (
    update public.voice_call_sessions
    set closing_signaled_at = now()
    where conversation_id = p_conversation_id
      and artisan_id = p_artisan_id
      and closing_signaled_at is null
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.voice_mark_closing_signal(text, uuid) from public, anon, authenticated;
grant execute on function public.voice_mark_closing_signal(text, uuid) to service_role;
