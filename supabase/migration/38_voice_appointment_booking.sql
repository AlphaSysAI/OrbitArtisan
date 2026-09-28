-- =============================================================================
-- 38_voice_appointment_booking.sql — Prise de RDV par Soline (plages de visite)
-- =============================================================================
-- Idempotent. Requiert 21_appointment_overlap_guard.sql.
--
-- Soline propose des créneaux dans les plages de visite de l'artisan et crée un RDV
-- `pending` qui bloque le créneau (contrainte appointments_no_overlap). Sans
-- validation de l'artisan sous 24 h, le RDV est annulé et le créneau libéré.

-- 1) Plages de visite de l'artisan.
--    Format : {"1":[{"start":"17:00","end":"19:00"}], ..., "7":[]} — clé = jour ISO (1 = lundi),
--    heures locales Europe/Paris. NULL = prise de RDV vocale désactivée.
alter table public.profiles
  add column if not exists visit_hours jsonb,
  add column if not exists visit_duration_minutes integer not null default 60;

alter table public.profiles drop constraint if exists profiles_visit_duration_minutes_range;
alter table public.profiles
  add constraint profiles_visit_duration_minutes_range
  check (visit_duration_minutes between 15 and 240);

alter table public.profiles drop constraint if exists profiles_visit_hours_object;
alter table public.profiles
  add constraint profiles_visit_hours_object
  check (visit_hours is null or jsonb_typeof(visit_hours) = 'object');

comment on column public.profiles.visit_hours is
  'Plages de visite proposées par Soline au téléphone (jour ISO → [{start,end}] en heure de Paris). NULL = RDV vocal désactivé.';
comment on column public.profiles.visit_duration_minutes is
  'Durée d''une visite proposée par Soline (minutes).';

-- 2) RDV : e-mail facultatif (au téléphone, le numéro de l'appelant suffit), origine, notes, durée, expiration.
alter table public.appointments alter column customer_email drop not null;

alter table public.appointments
  add column if not exists source text,
  add column if not exists notes text,
  add column if not exists duration_minutes integer,
  add column if not exists expires_at timestamptz,
  add column if not exists confirmation_sms_sent_at timestamptz;

alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments
  add constraint appointments_source_check
  check (source is null or source in ('artisan', 'vitrine', 'voice'));

alter table public.appointments drop constraint if exists appointments_duration_minutes_range;
alter table public.appointments
  add constraint appointments_duration_minutes_range
  check (duration_minutes is null or duration_minutes between 15 and 480);

comment on column public.appointments.source is 'Origine du RDV : artisan (saisie), vitrine, voice (Soline au téléphone).';
comment on column public.appointments.expires_at is 'RDV pending : annulé automatiquement à cette date sans validation de l''artisan.';
comment on column public.appointments.duration_minutes is 'Durée explicite (prioritaire sur services.duration pour end_time).';

create index if not exists appointments_pending_expiry_idx
  on public.appointments (expires_at)
  where status = 'pending' and expires_at is not null;

-- 3) end_time : la durée explicite prime sur la durée de la prestation.
create or replace function public.set_appointment_end_time()
returns trigger
language plpgsql
as $$
begin
  if new.duration_minutes is not null then
    new.end_time := new.start_time + make_interval(mins => new.duration_minutes);
  else
    new.end_time := public.compute_appointment_end_time(new.start_time, new.service_id);
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_set_end_time on public.appointments;
create trigger appointments_set_end_time
  before insert or update of start_time, service_id, duration_minutes on public.appointments
  for each row
  execute function public.set_appointment_end_time();

-- 4) Expiration des RDV pending non validés (appelée à la volée et par le cron).
create or replace function public.expire_pending_appointments(p_artisan_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.appointments
  set status = 'cancelled'
  where status = 'pending'
    and expires_at is not null
    and expires_at <= now()
    and (p_artisan_id is null or artisan_id = p_artisan_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_pending_appointments(uuid) from public;
grant execute on function public.expire_pending_appointments(uuid) to service_role;
