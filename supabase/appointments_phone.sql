-- Téléphone du client sur les rendez-vous, pour le bouton « appeler » côté artisan.
-- Rejouable. À exécuter dans l'éditeur SQL Supabase.

alter table public.appointments
  add column if not exists customer_phone text;

-- Même champ sur la file d'attente, pour ne pas perdre le numéro entre la
-- réservation d'un invité et la finalisation après inscription.
alter table public.pending_vitrine_appointments
  add column if not exists customer_phone text;
