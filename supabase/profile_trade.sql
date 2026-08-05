-- Métier de l'artisan, en deux niveaux (secteur + métier).
-- Champs distincts de business_name, qui reste le nom commercial affiché
-- sur la vitrine, les factures et dans les échanges.
-- À exécuter dans l'éditeur SQL Supabase.

alter table public.profiles
  add column if not exists trade_category text;

alter table public.profiles
  add column if not exists trade text;

-- Les valeurs stockées sont les `id` de src/lib/trades/taxonomy.ts.
-- Volontairement sans contrainte d'énumération en base : la nomenclature évolue
-- côté application, et un métier retiré ne doit pas bloquer la mise à jour
-- d'un profil existant. La cohérence est validée à l'écriture (upsertProfile).

create index if not exists profiles_trade_category_idx
  on public.profiles (trade_category)
  where trade_category is not null;

create index if not exists profiles_trade_idx
  on public.profiles (trade)
  where trade is not null;
