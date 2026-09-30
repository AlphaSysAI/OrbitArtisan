-- 48 — Rangement des appels Soline : lu / archivé.
--
-- read_at     : l'artisan a déplié le résumé (indicateur visuel « non lu »).
-- archived_at : appel rangé (classé sans suite, ou devis traité et rangé).
--
-- Invariant : un appel « à traiter » (pending_review) n'est jamais archivé.
-- Le badge de navigation (get_notification_counts) et les relances
-- (voice-intake-reminders) filtrent déjà sur pending_review : ils excluent
-- donc les archivés sans modification.

alter table public.voice_call_intakes
  add column if not exists read_at timestamptz,
  add column if not exists archived_at timestamptz;

-- Historique : les appels déjà traités sont considérés lus ; les « ignorés »
-- passent en archives (même sens qu'avant, désormais retrouvables).
update public.voice_call_intakes
  set read_at = coalesce(read_at, updated_at)
  where status <> 'pending_review' and read_at is null;

update public.voice_call_intakes
  set archived_at = coalesce(archived_at, updated_at)
  where status = 'dismissed' and archived_at is null;

alter table public.voice_call_intakes
  drop constraint if exists voice_call_intakes_pending_not_archived;
alter table public.voice_call_intakes
  add constraint voice_call_intakes_pending_not_archived
  check (not (status = 'pending_review' and archived_at is not null));

-- Onglets « Devis » et « Archivés ».
create index if not exists voice_call_intakes_archived_idx
  on public.voice_call_intakes (artisan_id, archived_at, created_at desc);

comment on column public.voice_call_intakes.read_at is 'Résumé ouvert par l''artisan (null = non lu)';
comment on column public.voice_call_intakes.archived_at is 'Appel rangé dans les archives (jamais pour pending_review)';
