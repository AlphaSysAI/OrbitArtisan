-- =============================================================================
-- 23_quote_retraction_waived.sql
-- =============================================================================
--
-- Ajoute la case "renonciation expresse au délai de rétractation" sur le devis.
-- Par défaut à false : le devis affiche alors la mention légale complète du
-- droit de rétractation (14 jours, formulaire type) sur le PDF — c'est le
-- comportement le plus sûr juridiquement pour un devis signé hors établissement
-- (domicile client / chantier), le cas quasi systématique en BTP artisanal.
--
-- Idempotent, non destructif : peut être exécuté plusieurs fois sans risque.

alter table public.quotes
  add column if not exists retraction_waived boolean not null default false;

comment on column public.quotes.retraction_waived is
  'Renonciation expresse et signée du client à son délai de rétractation de 14 jours (art. L221-28 3° C. consommation), pour permettre l''exécution immédiate des travaux.';
