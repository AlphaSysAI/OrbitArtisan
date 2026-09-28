-- =============================================================================
-- 45_appointments_insert_pending_only.sql — RDV créés par un client : toujours « en attente »
-- =============================================================================
-- Idempotent.
--
-- Les policies d'insertion client (init.sql) ne contrôlaient pas le statut : un visiteur
-- ou un client connecté pouvait, via l'API REST, créer un RDV directement « confirmé »
-- dans l'agenda de n'importe quel artisan et bloquer ses créneaux (contrainte anti
-- chevauchement). L'application n'insère que des RDV `pending` : on l'impose en base.
-- Les RDV créés par l'artisan, la vitrine (service role) et Soline ne sont pas concernés.

drop policy if exists "appointments_anon_insert_guest" on public.appointments;
create policy "appointments_anon_insert_guest"
on public.appointments
for insert
to anon
with check (
  customer_user_id is null
  and status = 'pending'
  and source is distinct from 'voice'
  and expires_at is null
);

drop policy if exists "appointments_authenticated_insert_own" on public.appointments;
create policy "appointments_authenticated_insert_own"
on public.appointments
for insert
to authenticated
with check (
  customer_user_id = auth.uid()
  and status = 'pending'
  and source is distinct from 'voice'
  and expires_at is null
);
