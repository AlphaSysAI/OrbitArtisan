-- 34_voice_intake_urgency.sql — Appels Soline classés urgents (alerte push prioritaire).
-- Idempotent.

alter table public.voice_call_intakes
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgency_reason text;

comment on column public.voice_call_intakes.is_urgent is
  'Urgence détectée dans l''appel (fuite active, gaz, électricité dangereuse, sinistre…) : notification push prioritaire.';

create index if not exists voice_call_intakes_urgent_pending_idx
  on public.voice_call_intakes (artisan_id, created_at desc)
  where is_urgent and status = 'pending_review';
