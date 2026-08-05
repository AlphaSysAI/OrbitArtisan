-- Catalogue fournisseur (ex. Brico Dépôt) + recherche vectorielle
-- Exécuter dans l'éditeur SQL Supabase.

create extension if not exists vector;

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price numeric(10, 2) not null check (price >= 0),
  url text not null,
  sku text not null unique,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_products_sku_idx on public.supplier_products (sku);
create index if not exists supplier_products_embedding_idx
  on public.supplier_products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

drop trigger if exists set_supplier_products_updated_at on public.supplier_products;
create trigger set_supplier_products_updated_at
before update on public.supplier_products
for each row execute procedure public.set_updated_at();

-- Colonnes fournisseur sur les lignes matériaux de devis
alter table public.quote_materials
  add column if not exists supplier_product_id uuid references public.supplier_products (id) on delete set null;

alter table public.quote_materials
  add column if not exists supplier_url text;

alter table public.quote_materials
  add column if not exists supplier_sku text;

alter table public.quote_materials
  add column if not exists is_supplier_catalog boolean not null default false;

alter table public.quote_materials
  add column if not exists exclude_from_invoice boolean not null default false;

create index if not exists quote_materials_supplier_product_id_idx
  on public.quote_materials (supplier_product_id);

-- Lecture catalogue : artisans authentifiés
alter table public.supplier_products enable row level security;

drop policy if exists supplier_products_artisan_read on public.supplier_products;
create policy supplier_products_artisan_read
on public.supplier_products
for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid())
);

-- Recherche par similarité cosinus (appelée via RPC, security definer)
create or replace function public.match_supplier_products(
  query_embedding vector(1024),
  match_count int default 5,
  match_threshold float default 0.5
)
returns table (
  id uuid,
  title text,
  price numeric,
  url text,
  sku text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.id,
    sp.title,
    sp.price,
    sp.url,
    sp.sku,
    1 - (sp.embedding <=> query_embedding) as similarity
  from public.supplier_products sp
  where sp.embedding is not null
    and 1 - (sp.embedding <=> query_embedding) >= match_threshold
  order by sp.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_supplier_products(vector, int, float) to authenticated;

-- Exemples de produits (sans embedding — à indexer via script séparé)
insert into public.supplier_products (title, price, url, sku)
values
  ('Tuyau PVC évacuation diam. 32 mm longueur 2 m', 4.90, 'https://www.bricodepot.fr/', 'BD-PVC32-2M'),
  ('Colle PVC pression 500 ml', 6.50, 'https://www.bricodepot.fr/', 'BD-COLLE-PVC500'),
  ('Robinet mitigeur lavabo chromé', 39.90, 'https://www.bricodepot.fr/', 'BD-MIT-LAV-CHR'),
  ('Peinture acrylique blanche mat 10 L', 49.90, 'https://www.bricodepot.fr/', 'BD-PEINT-BLANC10'),
  ('Carrelage grès cérame 30x60 cm gris anthracite', 12.90, 'https://www.bricodepot.fr/', 'BD-CAR-3060-GA')
on conflict (sku) do nothing;
