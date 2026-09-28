-- =============================================================================
-- 46_profiles_private_by_default.sql — Profils artisans privés
-- =============================================================================
-- Idempotent. Suite du point 7 de l'audit pré-pilote (migration 17).
--
-- Avant : policy "profiles_public_read" = using (true) pour anon ET authenticated.
-- Tout compte connecté (l'inscription client est ouverte à tous) pouvait lire
-- toutes les colonnes de tous les artisans via l'API REST : adresse, téléphone,
-- SIRET, assurances, taux horaire, IDs Stripe, IP d'inscription, abonnement,
-- e-mail du comptable…
--
-- Après :
--   - la table `profiles` n'est lisible que par son propriétaire (authenticated) ;
--   - anon n'a plus aucun accès direct à la table ;
--   - les données réellement publiques (vitrine, widget, nom sur devis/factures/messages)
--     passent par la vue `artisan_public_profiles`, colonnes choisies une par une ;
--   - les documents légaux (PDF devis/facture) et les notifications lisent l'identité
--     de l'artisan côté serveur (service role), APRÈS contrôle d'accès au document.
--
-- ⚠️ Ordre : migration 44 (vue) → déploiement du code → cette migration.
-- L'ancien code lit `profiles` directement pour les vitrines et l'espace client.

-- Table : lecture réservée au propriétaire.
drop policy if exists "profiles_public_read" on public.profiles;

drop policy if exists profiles_owner_read on public.profiles;
create policy profiles_owner_read
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

-- anon : plus aucun accès à la table (les grants colonne des migrations 17 et 36
-- sont retirés ; la vue les remplace).
revoke select on public.profiles from anon;
