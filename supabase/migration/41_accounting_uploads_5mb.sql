-- =============================================================================
-- 41_accounting_uploads_5mb.sql — Pièces comptables limitées à 5 Mo
-- =============================================================================
-- Idempotent. Les photos sont réduites dans le navigateur avant envoi
-- (2000 px, JPEG) : un ticket ou une facture d'achat pèse alors moins de 1 Mo.
-- 5 Mo reste la limite pour les PDF et les photos non compressibles (HEIC hors Safari).

update storage.buckets
set file_size_limit = 5242880
where id = 'accounting-uploads';
