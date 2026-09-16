-- =============================================================================
-- 17_restrict_profiles_anon_columns.sql
-- =============================================================================
--
-- Point 7 de l'audit pré-pilote (docs/audit-pre-pilote.md).
--
-- La policy RLS "profiles_public_read" (supabase/init.sql) autorise la
-- lecture de TOUTES les colonnes de `profiles` par le rôle `anon` (clé
-- publique, sans compte), y compris des colonnes internes non destinées au
-- public : Stripe (stripe_account_id, stripe_customer_id, ...), statut et
-- plan d'abonnement, quotas vocaux, SIRET/SIREN/TVA/RCS, taux horaire,
-- retenue de garantie par défaut, assurances, adresse complète, etc.
-- Exploitable par un simple appel REST `GET /rest/v1/profiles?select=*`,
-- sans authentification, pour tous les artisans.
--
-- La RLS Postgres restreint des LIGNES, pas des colonnes : on ne peut pas
-- masquer des colonnes précises via une policy. La restriction se fait donc
-- au niveau des privilèges colonne (GRANT/REVOKE), pour le rôle `anon`
-- uniquement. Le rôle `authenticated` garde l'accès actuel : des flux
-- authentifiés légitimes en dépendent aujourd'hui, faute de policy "owner"
-- dédiée (ex. un client lisant le SIRET de l'artisan sur son propre PDF de
-- facture). Fermer complètement l'exposition pour `authenticated` demande
-- une policy "owner" + une policy "partie à une facture/devis" séparée,
-- plus risqué à faire sans tests dédiés — laissé pour une passe ultérieure
-- (vecteur nécessitant un compte, donc moins critique que l'accès anonyme
-- fermé ici).
--
-- Colonnes nécessaires aux pages publiques existantes (vérifié dans le code,
-- aucun changement applicatif requis par cette migration) :
--   - /site/[slug]   : id, user_id, name, business_name, description, logo_url, slug, accent_color
--   - /embed/[slug]  : id, business_name, logo_url, slug, trade_category, trade
--   - /estimation    : id, city, logo_url, phone
--
-- Idempotent : peut être rejouée sans erreur.

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
  phone
) on public.profiles to anon;
