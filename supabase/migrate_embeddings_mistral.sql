-- Migration embeddings OpenAI (1536) → Mistral (1024)
-- Exécuter après passage à mistral-embed, puis relancer scripts/seed-supplier-embeddings.ts

drop index if exists supplier_products_embedding_idx;

alter table public.supplier_products
  alter column embedding type vector(1024) using null;

update public.supplier_products set embedding = null where embedding is not null;

create index supplier_products_embedding_idx
  on public.supplier_products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

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
