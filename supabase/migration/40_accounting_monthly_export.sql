-- =============================================================================
-- 40_accounting_monthly_export.sql — Envoi comptable mensuel
-- =============================================================================
-- Idempotent.
--
-- Le dernier jour du mois, Soline envoie au comptable de l'artisan les factures
-- émises (PDF Factur-X + récapitulatif CSV) et les pièces que l'artisan a ajoutées
-- (photos de factures d'achat, tickets CB…). Préavis 48 h avant.
-- Les pièces ajoutées ne sont stockées que jusqu'à l'envoi, puis supprimées :
-- aucune copie, aucun nom de fichier n'est conservé par Soline.

-- 1) Réglages artisan.
alter table public.profiles
  add column if not exists accountant_email text,
  add column if not exists accounting_export_enabled boolean not null default false;

alter table public.profiles drop constraint if exists profiles_accountant_email_format;
alter table public.profiles
  add constraint profiles_accountant_email_format
  check (accountant_email is null or accountant_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');

comment on column public.profiles.accountant_email is 'E-mail du comptable destinataire de l''envoi mensuel.';
comment on column public.profiles.accounting_export_enabled is 'Envoi comptable automatique le dernier jour du mois.';

-- 2) Journal des envois (métadonnées uniquement : compteurs, jamais les fichiers).
create table if not exists public.accounting_exports (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'skipped', 'failed')),
  notice_sent_at timestamptz,
  sent_at timestamptz,
  -- Borne haute des factures incluses (finalized_at <= cutoff_at) : l'envoi suivant
  -- reprend exactement là, aucune facture ne tombe entre deux envois.
  cutoff_at timestamptz,
  recipient_email text,
  invoice_count integer not null default 0 check (invoice_count >= 0),
  attachment_count integer not null default 0 check (attachment_count >= 0),
  email_parts integer not null default 0 check (email_parts >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_exports_artisan_period_unique unique (artisan_id, period_start)
);

create index if not exists accounting_exports_artisan_idx
  on public.accounting_exports (artisan_id, period_start desc);

drop trigger if exists set_accounting_exports_updated_at on public.accounting_exports;
create trigger set_accounting_exports_updated_at
before update on public.accounting_exports
for each row execute procedure public.set_updated_at();

alter table public.accounting_exports enable row level security;

drop policy if exists accounting_exports_artisan_read on public.accounting_exports;
create policy accounting_exports_artisan_read
on public.accounting_exports
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = accounting_exports.artisan_id and p.user_id = auth.uid()
  )
);
-- Écritures : service role uniquement (cron).

-- 3) Stockage temporaire des pièces ajoutées (privé, un dossier par artisan).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'accounting-uploads',
  'accounting-uploads',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

drop policy if exists accounting_uploads_owner_insert on storage.objects;
create policy accounting_uploads_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'accounting-uploads'
  and split_part(name, '/', 1) = (
    select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1
  )
);

drop policy if exists accounting_uploads_owner_select on storage.objects;
create policy accounting_uploads_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'accounting-uploads'
  and split_part(name, '/', 1) = (
    select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1
  )
);

drop policy if exists accounting_uploads_owner_delete on storage.objects;
create policy accounting_uploads_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'accounting-uploads'
  and split_part(name, '/', 1) = (
    select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1
  )
);
