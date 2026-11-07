-- =============================================================================
-- 76_technical_sheets.sql — Fiches techniques par métier
-- =============================================================================
-- Le contenu des fiches de la bibliothèque est dans le code
-- (src/lib/technical-sheets/library). La base garde :
--   1) la relecture de chaque fiche de la bibliothèque (vérifiée / à corriger) ;
--   2) les fiches générées par l'IA à la demande d'un artisan (non vérifiées).

begin;

-- 1) Relecture des fiches de la bibliothèque (écriture : administration, service role).
create table if not exists public.technical_sheet_reviews (
  sheet_id text primary key check (sheet_id ~ '^[a-z0-9-]{3,120}$'),
  status text not null check (status in ('verified', 'needs_changes')),
  reviewer_name text check (reviewer_name is null or length(reviewer_name) <= 120),
  note text check (note is null or length(note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now()
);

alter table public.technical_sheet_reviews enable row level security;

drop policy if exists technical_sheet_reviews_read on public.technical_sheet_reviews;
create policy technical_sheet_reviews_read on public.technical_sheet_reviews for select to authenticated
using (true);

revoke insert, update, delete on public.technical_sheet_reviews from anon, authenticated;

-- 2) Fiches générées par l'IA, propres à un compte artisan.
create table if not exists public.technical_sheets_ai (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  trade_category_id text,
  trade_id text,
  request text not null check (length(request) between 3 and 300),
  title text not null check (length(title) between 3 and 200),
  content jsonb not null,
  model text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists technical_sheets_ai_profile_idx on public.technical_sheets_ai (profile_id, created_at desc);
create index if not exists technical_sheets_ai_created_idx on public.technical_sheets_ai (created_at desc);

alter table public.technical_sheets_ai enable row level security;

drop policy if exists technical_sheets_ai_select on public.technical_sheets_ai;
create policy technical_sheets_ai_select on public.technical_sheets_ai for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = technical_sheets_ai.profile_id and auth.uid() = any (p.account_user_ids)
));

drop policy if exists technical_sheets_ai_insert on public.technical_sheets_ai;
create policy technical_sheets_ai_insert on public.technical_sheets_ai for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = technical_sheets_ai.profile_id and auth.uid() = any (p.account_user_ids)
  )
);

drop policy if exists technical_sheets_ai_delete on public.technical_sheets_ai;
create policy technical_sheets_ai_delete on public.technical_sheets_ai for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = technical_sheets_ai.profile_id and auth.uid() = any (p.account_user_ids)
));

revoke update on public.technical_sheets_ai from anon, authenticated;
revoke all on public.technical_sheets_ai, public.technical_sheet_reviews from anon;

commit;
