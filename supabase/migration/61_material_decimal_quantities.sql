-- 61 — Quantités décimales des fournitures (devis et factures).
--
-- Jusqu'ici quote_materials.quantity et invoice_lines.quantity étaient des entiers : le métré
-- arrondissait tout à l'unité supérieure (7,89 m³ de béton → 8 m³, 151,2 m² → 152 m²), soit un
-- sur-chiffrage systématique sur les unités continues (m³, m², ml, kg, t, L).
-- numeric(10,2) : 2 décimales, jusqu'à 99 999 999,99. Les valeurs existantes sont conservées à
-- l'identique (3 → 3.00) : aucun montant, numéro ni empreinte de document ne change.
-- line_total reste en centimes entiers (arrondi au centime côté application).
-- Le changement de type ne déclenche pas les triggers de ligne (factures émises intactes).
-- Rejouable. À appliquer après 60.

alter table public.quote_materials
  alter column quantity type numeric(10, 2) using quantity::numeric(10, 2);

alter table public.invoice_lines
  alter column quantity type numeric(10, 2) using quantity::numeric(10, 2);
