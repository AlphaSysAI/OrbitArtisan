-- 59 — Marge de l'artisan sur les fournitures (réglages).
--
-- Pourcentage appliqué automatiquement au prix d'achat estimé des fournitures
-- (recherche web / estimation IA) lors de la préparation d'un devis : 30 => prix × 1,30.
-- Jamais affiché sur le devis : seul le prix de vente en résulte.
-- Rejouable. À appliquer après 58.

alter table public.profiles
  add column if not exists materials_margin_rate numeric(5, 2) not null default 0;

alter table public.profiles drop constraint if exists profiles_materials_margin_rate_range;
alter table public.profiles
  add constraint profiles_materials_margin_rate_range
  check (materials_margin_rate >= 0 and materials_margin_rate <= 200);
