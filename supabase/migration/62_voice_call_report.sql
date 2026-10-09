-- 62 — Compte rendu structuré des appels Soline.
--
-- voice_call_intakes.call_report (jsonb, nullable) :
--   analysis        : ce que l'appelant a déclaré (intention, besoin, lieu, urgence + faits,
--                     informations manquantes, contradictions, suite annoncée) — extrait par le
--                     modèle, validé par schéma côté serveur ;
--   actions         : ce qui a réellement été fait pendant l'appel, lu en base (RDV en attente /
--                     confirmé / annulé, brouillon de devis) ;
--   humanValidation : validations attendues de l'artisan ;
--   meta            : version du prompt de l'agent, id de conversation, durée, modèle d'analyse.
-- Lecture : policy existante (artisan propriétaire). Écriture : service role (webhook post-appel).
-- Les appels antérieurs gardent call_report = null (affichage du résumé texte).
-- Rejouable. À appliquer après 61.

alter table public.voice_call_intakes
  add column if not exists call_report jsonb;

comment on column public.voice_call_intakes.call_report is
  'Compte rendu structuré (déclaré par l''appelant vs actions vérifiées en base), cf. src/lib/voice/call-report.ts';
