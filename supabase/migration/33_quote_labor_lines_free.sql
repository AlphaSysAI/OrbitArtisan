-- 33_quote_labor_lines_free.sql — Lignes de main-d'œuvre libres sur les devis.
-- quote_services devient la liste des lignes de main-d'œuvre du devis : une ligne
-- peut venir du catalogue de prestations (service_id) ou être saisie librement
-- (service_id NULL). Idempotent.
--
-- Corrige au passage un risque d'intégrité : avec ON DELETE CASCADE, supprimer une
-- prestation du catalogue supprimait ses lignes dans TOUS les devis existants
-- (y compris envoyés/signés), modifiant leur PDF a posteriori.

alter table public.quote_services alter column service_id drop not null;

alter table public.quote_services drop constraint if exists quote_services_service_id_fkey;
alter table public.quote_services
  add constraint quote_services_service_id_fkey
  foreign key (service_id) references public.services (id) on delete set null;

-- Deux lignes peuvent désormais reprendre la même prestation (ex. deux pièces).
alter table public.quote_services drop constraint if exists quote_services_quote_id_service_id_key;
