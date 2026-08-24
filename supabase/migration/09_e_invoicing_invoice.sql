-- =============================================================================
-- 09_e_invoicing_invoice.sql — Colonnes e-facturation manquantes sur invoices / invoice_lines
-- (extrait de init.sql — requis pour afficher et créer les factures en prod)
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_operation_type') then
    create type public.invoice_operation_type as enum (
      'livraison_biens',
      'prestation_services',
      'mixte'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'vat_collection_nature') then
    create type public.vat_collection_nature as enum (
      'on_delivery',
      'on_payment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'e_invoicing_status') then
    create type public.e_invoicing_status as enum (
      'DRAFT',
      'DEPOSITED',
      'APPROVED',
      'REJECTED',
      'PAID'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_emission_flow') then
    create type public.invoice_emission_flow as enum (
      'e_invoicing',
      'e_reporting'
    );
  end if;
end
$$;

alter table public.invoices
  add column if not exists operation_type public.invoice_operation_type not null default 'prestation_services',
  add column if not exists vat_on_debits boolean not null default false,
  add column if not exists vat_collection_nature public.vat_collection_nature not null default 'on_delivery',
  add column if not exists e_invoicing_status public.e_invoicing_status not null default 'DRAFT',
  add column if not exists finalized_at timestamptz,
  add column if not exists emission_flow public.invoice_emission_flow,
  add column if not exists pa_submission_id text,
  add column if not exists e_invoicing_rejection_reason text,
  add column if not exists e_invoicing_status_updated_at timestamptz;

create index if not exists invoices_e_invoicing_status_idx on public.invoices (e_invoicing_status);
create index if not exists invoices_finalized_at_idx
  on public.invoices (artisan_id, finalized_at desc)
  where finalized_at is not null;

alter table public.invoice_lines
  add column if not exists vat_rate numeric(5, 2) not null default 20.00,
  add column if not exists vat_exemption_reason text,
  add column if not exists vat_category_code text not null default 'S';

-- Valeurs enum étendues (init.sql)
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'e_invoicing_status' and e.enumlabel = 'RECEIVED_BY_PLATFORM'
  ) then
    alter type public.e_invoicing_status add value 'RECEIVED_BY_PLATFORM';
  end if;

  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'e_invoicing_status' and e.enumlabel = 'TRANSMITTED'
  ) then
    alter type public.e_invoicing_status add value 'TRANSMITTED';
  end if;
end
$$;
