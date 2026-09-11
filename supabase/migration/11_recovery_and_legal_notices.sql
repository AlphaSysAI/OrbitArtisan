-- =============================================================================
-- 11_recovery_and_legal_notices.sql — Pipeline de recouvrement
--   Phase 1 pré-contentieuse : mise en demeure LRAR (MySendingBox)
--   Phase 2 contentieuse      : mandat de recouvrement (RubyPayeur)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Factures : état du recouvrement
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists recovery_status text not null default 'none',
  add column if not exists rubypayeur_case_id text;

alter table public.invoices drop constraint if exists invoices_recovery_status_check;
alter table public.invoices
  add constraint invoices_recovery_status_check
  check (
    recovery_status in (
      'none',
      'formal_notice_sent',
      'submitted_to_collection',
      'in_progress',
      'collected',
      'failed'
    )
  );

create index if not exists invoices_recovery_status_idx
  on public.invoices (artisan_id, recovery_status)
  where recovery_status <> 'none';

create index if not exists invoices_rubypayeur_case_id_idx
  on public.invoices (rubypayeur_case_id)
  where rubypayeur_case_id is not null;

comment on column public.invoices.recovery_status is
  'none | formal_notice_sent | submitted_to_collection | in_progress | collected | failed';
comment on column public.invoices.rubypayeur_case_id is
  'Identifiant du dossier de recouvrement RubyPayeur (miroir de debt_collection_cases)';

-- ---------------------------------------------------------------------------
-- 2) Mises en demeure LRAR (MySendingBox)
-- ---------------------------------------------------------------------------
create table if not exists public.formal_notices (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  -- artisan_id : clé métier canonique du repo (jointures, cohérence avec invoices)
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  -- user_id : porte la RLS en lecture directe (auth.uid() = user_id), sans sous-requête
  user_id uuid not null references auth.users (id) on delete cascade,
  mysendingbox_letter_id text unique,
  tracking_number text,
  pdf_storage_path text,
  proof_storage_path text,
  filing_proof_storage_path text,
  status text not null default 'pending',
  last_event text,
  failure_reason text,
  amount_claimed_cents integer not null default 0,
  -- true si la lettre dépasse le quota mensuel inclus et doit être refacturée
  billed_to_artisan boolean not null default false,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.formal_notices drop constraint if exists formal_notices_status_check;
alter table public.formal_notices
  add constraint formal_notices_status_check
  check (
    status in (
      'pending',
      'sent',
      'in_transit',
      'waiting_withdrawal',
      'delivered',
      'returned',
      'wrong_address',
      'failed',
      'canceled'
    )
  );

create index if not exists formal_notices_invoice_id_idx on public.formal_notices (invoice_id);
create index if not exists formal_notices_artisan_id_idx on public.formal_notices (artisan_id, created_at desc);
create index if not exists formal_notices_status_idx on public.formal_notices (status);

-- Consommation du quota mensuel : seules les lettres réellement affranchies
-- (prises en charge par La Poste) sont comptées.
create index if not exists formal_notices_quota_idx
  on public.formal_notices (artisan_id, sent_at desc)
  where mysendingbox_letter_id is not null;

drop trigger if exists set_formal_notices_updated_at on public.formal_notices;
create trigger set_formal_notices_updated_at
before update on public.formal_notices
for each row execute procedure public.set_updated_at();

comment on table public.formal_notices is
  'Mises en demeure envoyées en LRAR papier via MySendingBox (phase pré-contentieuse)';
comment on column public.formal_notices.billed_to_artisan is
  'Affranchissement refacturé : la lettre dépasse le quota mensuel inclus dans l''abonnement';

-- ---------------------------------------------------------------------------
-- 3) Dossiers de recouvrement (RubyPayeur)
-- ---------------------------------------------------------------------------
create table if not exists public.debt_collection_cases (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rubypayeur_case_id text unique,
  amount_total numeric(10, 2) not null,
  amount_collected numeric(10, 2) not null default 0,
  rubypayeur_fee numeric(10, 2) not null default 0,
  our_commission numeric(10, 2) not null default 0,
  status text not null default 'submitted',
  mandate_accepted_at timestamptz not null default now(),
  closed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debt_collection_cases_invoice_unique unique (invoice_id)
);

alter table public.debt_collection_cases drop constraint if exists debt_collection_cases_status_check;
alter table public.debt_collection_cases
  add constraint debt_collection_cases_status_check
  check (
    status in (
      'submitted',
      'accepted',
      'in_progress',
      'partially_collected',
      'collected',
      'failed',
      'canceled'
    )
  );

alter table public.debt_collection_cases drop constraint if exists debt_collection_cases_amounts_check;
alter table public.debt_collection_cases
  add constraint debt_collection_cases_amounts_check
  check (
    amount_total >= 0
    and amount_collected >= 0
    and rubypayeur_fee >= 0
    and our_commission >= 0
  );

create index if not exists debt_collection_cases_artisan_id_idx
  on public.debt_collection_cases (artisan_id, created_at desc);
create index if not exists debt_collection_cases_status_idx
  on public.debt_collection_cases (status);

drop trigger if exists set_debt_collection_cases_updated_at on public.debt_collection_cases;
create trigger set_debt_collection_cases_updated_at
before update on public.debt_collection_cases
for each row execute procedure public.set_updated_at();

comment on table public.debt_collection_cases is
  'Dossiers de créance transmis à RubyPayeur avec mandat de recouvrement (phase contentieuse)';
comment on column public.debt_collection_cases.our_commission is
  'Rétrocession apporteur d''affaires calculée sur les honoraires RubyPayeur';

-- ---------------------------------------------------------------------------
-- 4) RLS — lecture propriétaire, écriture Server Actions ; MAJ réservées au
--    service role (webhooks), aucune policy UPDATE/DELETE pour `authenticated`.
-- ---------------------------------------------------------------------------
alter table public.formal_notices enable row level security;
alter table public.debt_collection_cases enable row level security;

drop policy if exists formal_notices_owner_read on public.formal_notices;
create policy formal_notices_owner_read
on public.formal_notices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists formal_notices_owner_insert on public.formal_notices;
create policy formal_notices_owner_insert
on public.formal_notices
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.profiles p
    where p.id = formal_notices.artisan_id and p.user_id = auth.uid()
  )
  and exists (
    select 1 from public.invoices i
    where i.id = formal_notices.invoice_id and i.artisan_id = formal_notices.artisan_id
  )
);

drop policy if exists debt_collection_cases_owner_read on public.debt_collection_cases;
create policy debt_collection_cases_owner_read
on public.debt_collection_cases
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists debt_collection_cases_owner_insert on public.debt_collection_cases;
create policy debt_collection_cases_owner_insert
on public.debt_collection_cases
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.profiles p
    where p.id = debt_collection_cases.artisan_id and p.user_id = auth.uid()
  )
  and exists (
    select 1 from public.invoices i
    where i.id = debt_collection_cases.invoice_id and i.artisan_id = debt_collection_cases.artisan_id
  )
);

-- ---------------------------------------------------------------------------
-- 5) Storage — bucket privé des pièces de recouvrement
--    Aucune policy `authenticated` : tous les accès passent par des URL
--    signées générées côté serveur (service role).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recovery-documents',
  'recovery-documents',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf'];
