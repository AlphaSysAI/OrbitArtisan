-- Filet « pool vocal vide » : l'artisan Pro/Premium voit un message en attendant son numéro.

alter table public.profiles
  add column if not exists voice_number_assignment_pending_at timestamptz;

comment on column public.profiles.voice_number_assignment_pending_at is
  'Horodatage si l''attribution auto du pool a échoué (pool vide) ; NULL une fois le numéro attribué.';
