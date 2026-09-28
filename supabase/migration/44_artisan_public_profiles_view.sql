-- =============================================================================
-- 44_artisan_public_profiles_view.sql — Vue publique restreinte des artisans
-- =============================================================================
-- Idempotent. Étape 1/2 du passage des profils en privé (point 7 de l'audit pré-pilote).
-- Sans effet de bord : crée la vue utilisée par le nouveau code (vitrine, widget,
-- espace client). La fermeture de la table est dans 46_profiles_private_by_default.sql,
-- à appliquer une fois le code déployé.

-- Vue publique (colonnes sûres uniquement). Propriétaire postgres, sans
--    security_invoker : elle lit la table sans passer par la RLS, d'où la liste
--    fermée de colonnes. Toute nouvelle colonne de `profiles` reste privée par défaut.
create or replace view public.artisan_public_profiles
with (security_invoker = false)
as
select
  p.id,
  p.user_id,
  p.slug,
  p.name,
  p.business_name,
  p.description,
  p.logo_url,
  p.accent_color,
  p.sales_terms_text,
  p.trade_category,
  p.trade,
  p.city,
  p.phone,
  p.lead_matching_enabled,
  p.stripe_transfers_enabled
from public.profiles p
where p.deleted_at is null;

comment on view public.artisan_public_profiles is
  'Vitrine publique des artisans (anon + authenticated). Colonnes listées explicitement : ne jamais passer en select *.';

revoke all on public.artisan_public_profiles from public, anon, authenticated;
grant select on public.artisan_public_profiles to anon, authenticated;
