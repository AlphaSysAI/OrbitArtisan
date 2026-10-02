-- 60 — Unité marchande des fournitures (devis et factures).
--
-- Jusqu'ici l'unité n'existait que dans le formulaire : les devis rechargés repassaient
-- en « U », le PDF affichait « u » pour tout et le Factur-X envoyait C62 (unité) même
-- pour des m² ou des m³. Nullable : les lignes existantes restent valides (affichage « u »).
-- Rejouable. À appliquer après 59.

alter table public.quote_materials
  add column if not exists unit text;
alter table public.quote_materials drop constraint if exists quote_materials_unit_length;
alter table public.quote_materials
  add constraint quote_materials_unit_length check (unit is null or char_length(unit) between 1 and 30);

alter table public.invoice_lines
  add column if not exists unit text;
alter table public.invoice_lines drop constraint if exists invoice_lines_unit_length;
alter table public.invoice_lines
  add constraint invoice_lines_unit_length check (unit is null or char_length(unit) between 1 and 30);
