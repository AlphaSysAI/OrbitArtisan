-- =============================================================================
-- 10_e_reporting_worker.sql — File e-reporting + statuts PA (prod)
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'e_reporting_queue_status') then
    create type public.e_reporting_queue_status as enum (
      'pending',
      'batched',
      'submitted',
      'failed'
    );
  end if;
end
$$;

create table if not exists public.e_reporting_queue (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  status public.e_reporting_queue_status not null default 'pending',
  payload jsonb not null,
  reporting_period date,
  submitted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint e_reporting_queue_invoice_unique unique (invoice_id)
);

create index if not exists e_reporting_queue_status_idx
  on public.e_reporting_queue (status, created_at);

create index if not exists e_reporting_queue_artisan_id_idx
  on public.e_reporting_queue (artisan_id);

drop trigger if exists set_e_reporting_queue_updated_at on public.e_reporting_queue;
create trigger set_e_reporting_queue_updated_at
before update on public.e_reporting_queue
for each row execute procedure public.set_updated_at();

alter table public.e_reporting_queue enable row level security;

drop policy if exists e_reporting_queue_artisan_read on public.e_reporting_queue;
create policy e_reporting_queue_artisan_read
on public.e_reporting_queue
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = e_reporting_queue.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists e_reporting_queue_artisan_insert on public.e_reporting_queue;
create policy e_reporting_queue_artisan_insert
on public.e_reporting_queue
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = e_reporting_queue.artisan_id and p.user_id = auth.uid()
  )
);

-- Colonnes PA manquantes sur invoices (si migration 09 partielle)
alter table public.invoices
  add column if not exists pa_submission_status text,
  add column if not exists payment_received_at timestamptz;

comment on table public.e_reporting_queue is 'File e-reporting B2C — transmission groupée via cron /api/cron/e-reporting';
