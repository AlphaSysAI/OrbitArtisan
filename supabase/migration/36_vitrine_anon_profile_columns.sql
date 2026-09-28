-- Colonnes lues par /site/[slug] et /site/[slug]/cgv mais absentes du GRANT anon (migration 17).
-- Sans ces colonnes, la clé anon ne peut pas SELECT le profil → vitrine 404 pour les visiteurs non connectés.

revoke select on public.profiles from anon;

grant select (
  id,
  user_id,
  name,
  business_name,
  description,
  logo_url,
  slug,
  accent_color,
  trade,
  trade_category,
  city,
  phone,
  sales_terms_text,
  lead_matching_enabled
) on public.profiles to anon;
