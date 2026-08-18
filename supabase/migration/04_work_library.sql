-- =============================================================================
-- 04_work_library.sql — Bibliothèque d'ouvrages (catalogue prix BTP)
-- =============================================================================
-- À exécuter après init.sql (+ migrations précédentes si applicable).

-- ---------------------------------------------------------------------------
-- Catégories d'ouvrages (par artisan)
-- ---------------------------------------------------------------------------
create table if not exists public.work_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),

  constraint work_categories_name_nonempty check (char_length(trim(name)) > 0)
);

create index if not exists work_categories_user_id_idx on public.work_categories (user_id);
create unique index if not exists work_categories_user_name_uidx
  on public.work_categories (user_id, lower(trim(name)));

comment on table public.work_categories is 'Catégories de la bibliothèque d''ouvrages (par artisan)';

-- ---------------------------------------------------------------------------
-- Ouvrages / prestations pré-chiffrées
-- ---------------------------------------------------------------------------
create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.work_categories (id) on delete set null,
  reference text,
  title text not null,
  description text,
  unit text not null default 'U',
  unit_price_ht numeric(12, 2) not null default 0,
  default_vat_rate numeric(5, 2) not null default 20.00,
  labor_cost numeric(12, 2) not null default 0,
  material_cost numeric(12, 2) not null default 0,
  estimated_hours numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_items_title_nonempty check (char_length(trim(title)) > 0),
  constraint work_items_unit_nonempty check (char_length(trim(unit)) > 0),
  constraint work_items_unit_price_nonneg check (unit_price_ht >= 0),
  constraint work_items_labor_cost_nonneg check (labor_cost >= 0),
  constraint work_items_material_cost_nonneg check (material_cost >= 0),
  constraint work_items_estimated_hours_nonneg check (estimated_hours >= 0),
  constraint work_items_vat_rate_valid check (default_vat_rate in (5.5, 10, 20))
);

create index if not exists work_items_user_id_idx on public.work_items (user_id);
create index if not exists work_items_category_id_idx on public.work_items (category_id);
create index if not exists work_items_user_title_idx on public.work_items (user_id, lower(title));
create index if not exists work_items_user_reference_idx
  on public.work_items (user_id, lower(reference))
  where reference is not null;

comment on table public.work_items is 'Bibliothèque d''ouvrages BTP pré-chiffrés (par artisan)';

drop trigger if exists set_work_items_updated_at on public.work_items;
create trigger set_work_items_updated_at
before update on public.work_items
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.work_categories enable row level security;
alter table public.work_items enable row level security;

drop policy if exists work_categories_owner_select on public.work_categories;
create policy work_categories_owner_select
on public.work_categories for select to authenticated
using (user_id = auth.uid());

drop policy if exists work_categories_owner_insert on public.work_categories;
create policy work_categories_owner_insert
on public.work_categories for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists work_categories_owner_update on public.work_categories;
create policy work_categories_owner_update
on public.work_categories for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists work_categories_owner_delete on public.work_categories;
create policy work_categories_owner_delete
on public.work_categories for delete to authenticated
using (user_id = auth.uid());

drop policy if exists work_items_owner_select on public.work_items;
create policy work_items_owner_select
on public.work_items for select to authenticated
using (user_id = auth.uid());

drop policy if exists work_items_owner_insert on public.work_items;
create policy work_items_owner_insert
on public.work_items for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists work_items_owner_update on public.work_items;
create policy work_items_owner_update
on public.work_items for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists work_items_owner_delete on public.work_items;
create policy work_items_owner_delete
on public.work_items for delete to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Jeu de démarrage BTP (5–10 ouvrages standards)
-- ---------------------------------------------------------------------------
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
