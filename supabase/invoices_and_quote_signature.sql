-- Signature client sur devis + factures (exécuter après quotes_customer_link.sql)

-- 1) Champs signature / refus sur les devis
alter table public.quotes
  add column if not exists signed_at timestamptz;

alter table public.quotes
  add column if not exists signed_by_name text;

alter table public.quotes
  add column if not exists rejected_at timestamptz;

-- 2) Factures (une facture max par devis converti)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete restrict,
  customer_user_id uuid references auth.users (id) on delete set null,
  customer_name text,
  customer_email text,
  invoice_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  labor_total integer not null default 0,
  materials_total integer not null default 0,
  grand_total integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_quote_unique unique (quote_id)
);

create index if not exists invoices_artisan_id_idx on public.invoices (artisan_id);
create index if not exists invoices_customer_user_id_idx on public.invoices (customer_user_id);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_kind text not null check (line_kind in ('labor', 'service', 'material')),
  label text not null,
  quantity integer,
  unit_price integer,
  line_total integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row execute procedure public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists invoices_artisan_all on public.invoices;
create policy invoices_artisan_all
on public.invoices
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = invoices.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = invoices.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists invoices_customer_read on public.invoices;
create policy invoices_customer_read
on public.invoices
for select
to authenticated
using (customer_user_id = auth.uid());

drop policy if exists invoice_lines_artisan_via_invoice on public.invoice_lines;
create policy invoice_lines_artisan_via_invoice
on public.invoice_lines
for all
to authenticated
using (
  exists (
    select 1 from public.invoices i
    join public.profiles p on p.id = i.artisan_id
    where i.id = invoice_lines.invoice_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.invoices i
    join public.profiles p on p.id = i.artisan_id
    where i.id = invoice_lines.invoice_id and p.user_id = auth.uid()
  )
);

drop policy if exists invoice_lines_customer_read on public.invoice_lines;
create policy invoice_lines_customer_read
on public.invoice_lines
for select
to authenticated
using (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_lines.invoice_id and i.customer_user_id = auth.uid()
  )
);

-- 3) RPC sécurisées : le client ne peut pas modifier les montants à la main
create or replace function public.client_accept_quote(p_quote_id uuid, p_signer_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    raise exception 'invalid_signer';
  end if;

  update public.quotes
  set
    status = 'accepted',
    signed_at = now(),
    signed_by_name = trim(p_signer_name),
    rejected_at = null,
    updated_at = now()
  where id = p_quote_id
    and customer_user_id = auth.uid()
    and status = 'sent';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_acceptable';
  end if;
end;
$$;

create or replace function public.client_reject_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.quotes
  set
    status = 'rejected',
    rejected_at = now(),
    updated_at = now()
  where id = p_quote_id
    and customer_user_id = auth.uid()
    and status = 'sent';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_rejectable';
  end if;
end;
$$;

grant execute on function public.client_accept_quote(uuid, text) to authenticated;
grant execute on function public.client_reject_quote(uuid) to authenticated;
