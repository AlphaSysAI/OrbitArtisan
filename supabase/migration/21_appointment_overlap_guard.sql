-- Point 9 (audit pré-pilote) : anti double-booking DB + matérialisation de end_time.
--
-- ⚠️ AVANT D'APPLIQUER CETTE MIGRATION EN PRODUCTION : vérifier qu'aucun chevauchement
-- n'existe déjà pour un même artisan, sinon l'ALTER TABLE ... ADD CONSTRAINT plus bas
-- échouera à l'application. Requête de contrôle (doit renvoyer 0 ligne avant de continuer) :
--
--   select a1.id as rdv_1, a2.id as rdv_2, a1.artisan_id, a1.start_time as debut_1, a2.start_time as debut_2
--   from public.appointments a1
--   join public.appointments a2
--     on a1.artisan_id = a2.artisan_id
--    and a1.id < a2.id
--    and a1.status <> 'cancelled'
--    and a2.status <> 'cancelled'
--   where tstzrange(
--           a1.start_time,
--           a1.start_time + make_interval(mins => coalesce((select s.duration from public.services s where s.id = a1.service_id), 60)),
--           '[)'
--         )
--         && tstzrange(
--           a2.start_time,
--           a2.start_time + make_interval(mins => coalesce((select s.duration from public.services s where s.id = a2.service_id), 60)),
--           '[)'
--         );
--
-- Si des lignes ressortent : annuler (statut 'cancelled') l'un des deux RDV en conflit
-- manuellement avant de relancer cette migration.

create extension if not exists btree_gist;

alter table public.appointments
  add column if not exists end_time timestamptz;

-- Durée par défaut si le service est absent/supprimé : 60 minutes.
create or replace function public.compute_appointment_end_time(p_start timestamptz, p_service_id uuid)
returns timestamptz
language sql
stable
as $$
  select p_start + make_interval(mins => coalesce(
    (select s.duration from public.services s where s.id = p_service_id),
    60
  ));
$$;

-- Backfill des lignes existantes.
update public.appointments
set end_time = public.compute_appointment_end_time(start_time, service_id)
where end_time is null;

alter table public.appointments
  alter column end_time set not null;

-- Recalcule systématiquement end_time à l'écriture : les 4 points d'entrée applicatifs
-- (RDV manuel artisan, RDV connecté vitrine, RDV invité vitrine, finalisation vitrine)
-- n'ont donc pas besoin de porter cette logique — une seule source de vérité en base.
create or replace function public.set_appointment_end_time()
returns trigger
language plpgsql
as $$
begin
  new.end_time := public.compute_appointment_end_time(new.start_time, new.service_id);
  return new;
end;
$$;

drop trigger if exists appointments_set_end_time on public.appointments;
create trigger appointments_set_end_time
  before insert or update of start_time, service_id on public.appointments
  for each row
  execute function public.set_appointment_end_time();

-- Le garde-fou réel : deux RDV non annulés d'un même artisan ne peuvent pas se chevaucher,
-- quel que soit le point d'entrée applicatif (l'artisan, un client connecté, un invité, ou
-- la finalisation d'un RDV vitrine en attente). Erreur Postgres renvoyée en cas de conflit :
-- code 23P01 (exclusion_violation), traduit côté application (voir rdv/actions.ts et
-- site/[slug]/actions.ts) en erreur "slot_taken".
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    artisan_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status <> 'cancelled');

comment on column public.appointments.end_time is 'Calculée automatiquement (trigger) à partir de start_time + services.duration (60 min par défaut si service absent).';
comment on constraint appointments_no_overlap on public.appointments is 'Anti double-booking (point 9 audit pré-pilote) : bloque tout chevauchement de créneau pour un même artisan.';
