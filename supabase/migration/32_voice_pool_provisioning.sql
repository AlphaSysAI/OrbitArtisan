-- 32_voice_pool_provisioning.sql — Provisionnement automatique des numéros Soline.
-- Idempotent.

alter table public.voice_number_pool
  add column if not exists elevenlabs_phone_number_id text,
  add column if not exists provisioned_by text
    check (provisioned_by is null or provisioned_by in ('manual', 'admin_bulk', 'auto_refill'));

comment on column public.voice_number_pool.elevenlabs_phone_number_id is
  'Identifiant du numéro importé côté ElevenLabs (phone_number_id).';
comment on column public.voice_number_pool.provisioned_by is
  'Origine : saisie manuelle, provisionnement admin en lot, ou réassort automatique (cron).';
