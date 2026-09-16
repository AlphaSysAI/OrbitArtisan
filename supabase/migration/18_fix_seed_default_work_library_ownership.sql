-- =============================================================================
-- 18_fix_seed_default_work_library_ownership.sql
-- =============================================================================
--
-- Point 8 de l'audit pré-pilote (docs/audit-pre-pilote.md).
--
-- public.seed_default_work_library(p_user_id uuid) est SECURITY DEFINER et
-- accordée à `authenticated` (supabase/migration/04_work_library.sql) sans
-- jamais vérifier que p_user_id correspond bien à l'appelant. N'importe quel
-- utilisateur authentifié peut donc appeler
-- `supabase.rpc('seed_default_work_library', { p_user_id: '<uuid arbitraire>' })`
-- depuis son propre navigateur et écraser (ré-initialiser) la bibliothèque
-- d'ouvrages d'un autre artisan qui n'a pas encore de work_items — combiné
-- au Point 7 (user_id d'un artisan lisible publiquement), l'attaque est
-- triviale à construire.
--
-- Correctif : on garde le comportement exact (même corps de fonction, mêmes
-- grants) et on ajoute la vérification d'ownership. `service_role` est
-- explicitement exempté (n'a pas de auth.uid(), et reste un rôle de
-- confiance pour un éventuel outillage admin futur — aucun appel service_role
-- existant aujourd'hui dans le code, vérifié).
--
-- Idempotent : create or replace function, peut être rejouée sans erreur.

create or replace function public.seed_default_work_library(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cat_gros uuid;
  cat_plom uuid;
  cat_elec uuid;
  cat_peint uuid;
begin
  if p_user_id is null then
    return;
  end if;

  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user';
  end if;

  if exists (select 1 from public.work_items where user_id = p_user_id limit 1) then
    return;
  end if;

  insert into public.work_categories (user_id, name) values (p_user_id, 'Gros œuvre')
  returning id into cat_gros;
  insert into public.work_categories (user_id, name) values (p_user_id, 'Plomberie')
  returning id into cat_plom;
  insert into public.work_categories (user_id, name) values (p_user_id, 'Électricité')
  returning id into cat_elec;
  insert into public.work_categories (user_id, name) values (p_user_id, 'Peinture')
  returning id into cat_peint;

  insert into public.work_items (
    user_id, category_id, reference, title, description, unit,
    unit_price_ht, default_vat_rate, labor_cost, material_cost, estimated_hours
  ) values
    (p_user_id, cat_gros, 'GO-001', 'Démolition cloison placo', 'Dépose cloison placo + évacuation gravats', 'm²', 28.00, 10, 18.00, 4.00, 0.75),
    (p_user_id, cat_gros, 'GO-002', 'Cloison placo BA13 sur ossature', 'Montage cloison 72/48, isolation laine de verre', 'm²', 65.00, 10, 42.00, 15.00, 1.50),
    (p_user_id, cat_plom, 'PL-001', 'Pose lavabo avec robinetterie', 'Fourniture lavabo standard + pose + raccordements', 'U', 320.00, 10, 120.00, 140.00, 2.00),
    (p_user_id, cat_plom, 'PL-002', 'Remplacement WC suspendu', 'Dépose, pose WC suspendu, raccordement eau / évacuation', 'U', 450.00, 10, 180.00, 170.00, 3.00),
    (p_user_id, cat_elec, 'EL-001', 'Point lumineux DCL', 'Création point lumière avec boîte DCL + câblage', 'U', 95.00, 10, 55.00, 18.00, 1.00),
    (p_user_id, cat_elec, 'EL-002', 'Prise de courant 16A', 'Création prise 2P+T encastrée', 'U', 75.00, 10, 45.00, 12.00, 0.75),
    (p_user_id, cat_peint, 'PE-001', 'Peinture murs acrylique 2 couches', 'Préparation légère + 2 couches acrylique mat', 'm²', 22.00, 10, 14.00, 4.00, 0.45),
    (p_user_id, cat_peint, 'PE-002', 'Peinture plafond acrylique', 'Préparation + 2 couches plafond', 'm²', 18.00, 10, 12.00, 3.00, 0.40),
    (p_user_id, cat_gros, 'GO-003', 'Ragréage sol autolissant', 'Préparation support + ragréage 3 à 5 mm', 'm²', 24.00, 10, 12.00, 8.00, 0.50),
    (p_user_id, cat_plom, 'PL-003', 'Débouchage canalisation', 'Intervention débouchage mécanique / manuel', 'forfait', 120.00, 10, 95.00, 5.00, 1.00);
end;
$$;

comment on function public.seed_default_work_library(uuid) is
  'Injecte la bibliothèque BTP par défaut à la première création de profil artisan';

revoke all on function public.seed_default_work_library(uuid) from public;
grant execute on function public.seed_default_work_library(uuid) to authenticated;
grant execute on function public.seed_default_work_library(uuid) to service_role;
