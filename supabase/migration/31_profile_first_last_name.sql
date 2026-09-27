-- 31_profile_first_last_name.sql — Prénom et nom de l'artisan séparés.
-- `name` reste le nom complet affiché (devis, factures, vitrine) et est
-- recomposé par l'application à chaque enregistrement : « Prénom Nom ».
-- Idempotent.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column public.profiles.first_name is 'Prénom de l''artisan (accueil téléphonique Soline, relation client).';
comment on column public.profiles.last_name is 'Nom de famille de l''artisan.';

-- Rattrapage des comptes existants : 1er mot = prénom, reste = nom.
-- Approximatif (ordre « Nom Prénom », prénoms composés sans tiret) : chaque
-- artisan peut corriger dans Réglages > Activité.
update public.profiles
set
  first_name = nullif(split_part(btrim(name), ' ', 1), ''),
  last_name = nullif(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), '')
where first_name is null
  and last_name is null
  and name is not null
  and btrim(name) <> '';
