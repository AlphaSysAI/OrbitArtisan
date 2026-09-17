-- CGV propres de l'artisan (clients finaux) : devis PDF + vitrine

alter table public.profiles
  add column if not exists sales_terms_text text;

comment on column public.profiles.sales_terms_text is
  'Conditions générales de vente de l''artisan vis-à-vis de ses clients — annexe devis PDF et page vitrine /site/[slug]/cgv';
