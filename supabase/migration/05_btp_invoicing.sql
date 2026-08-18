-- =============================================================================
-- 05_btp_invoicing.sql — Facturation BTP avancée (acompte, situation, TVA réduite)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Devis : TVA réduite & attestation
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists reduced_vat_rate numeric(5, 2),
  add column if not exists generate_vat_attestation boolean not null default false,
  add column if not exists work_site_address text,
  add column if not exists work_site_city text,
  add column if not exists work_site_postal_code text;

alter table public.quotes drop constraint if exists quotes_reduced_vat_rate_check;
alter table public.quotes
  add constraint quotes_reduced_vat_rate_check
  check (reduced_vat_rate is null or reduced_vat_rate in (5.5, 10, 20));

comment on column public.quotes.generate_vat_attestation is 'Générer attestation TVA réduite (rénovation) en annexe';
comment on column public.quotes.work_site_address is 'Adresse du chantier (attestation TVA)';

alter table public.quote_materials
  add column if not exists vat_rate numeric(5, 2) default 20.00;

-- ---------------------------------------------------------------------------
-- Factures : types BTP (acompte, situation, solde, avoir)
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists invoice_type text not null default 'standard',
  add column if not exists parent_invoice_id uuid references public.invoices (id) on delete set null,
  add column if not exists progress_percentage numeric(5, 2),
  add column if not exists quote_reference_total integer,
  add column if not exists retention_rate numeric(5, 2) default 0,
  add column if not exists retention_amount integer default 0;

alter table public.invoices drop constraint if exists invoices_invoice_type_check;
alter table public.invoices
  add constraint invoices_invoice_type_check
  check (invoice_type in ('standard', 'deposit', 'progress', 'final', 'credit_note'));

alter table public.invoices drop constraint if exists invoices_progress_percentage_check;
alter table public.invoices
  add constraint invoices_progress_percentage_check
  check (progress_percentage is null or (progress_percentage > 0 and progress_percentage <= 100));

-- Plusieurs factures par devis (acomptes + situations + solde)
alter table public.invoices drop constraint if exists invoices_quote_unique;

create index if not exists invoices_quote_id_idx on public.invoices (quote_id);
create index if not exists invoices_parent_invoice_id_idx on public.invoices (parent_invoice_id);
create index if not exists invoices_invoice_type_idx on public.invoices (invoice_type);

comment on column public.invoices.invoice_type is 'standard | deposit | progress | final | credit_note';
comment on column public.invoices.progress_percentage is 'Pourcentage d''avancement ou d''acompte sur le devis de référence';
comment on column public.invoices.quote_reference_total is 'Snapshot du total devis (centimes) à la création';
comment on column public.invoices.retention_rate is 'Retenue de garantie (%) — préparation flux BTP';
comment on column public.invoices.retention_amount is 'Montant retenue de garantie (centimes)';

-- Un seul brouillon/final par devis : index partiel optionnel laissé à l'application
