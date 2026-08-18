-- =============================================================================
-- 06_obat_gaps.sql — Relances, devis public, légal, chantiers, BI, fournisseurs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profils : mentions légales artisan & paramètres facturation
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists decennale_insurer text,
  add column if not exists decennale_policy_number text,
  add column if not exists rc_pro_insurer text,
  add column if not exists rc_pro_number text,
  add column if not exists mediator_name text,
  add column if not exists mediator_url text,
  add column if not exists default_payment_terms_days integer not null default 30,
  add column if not exists default_retention_rate numeric(5, 2) not null default 5.00,
  add column if not exists auto_reminder_enabled boolean not null default true;

alter table public.profiles drop constraint if exists profiles_default_payment_terms_days_check;
alter table public.profiles
  add constraint profiles_default_payment_terms_days_check
  check (default_payment_terms_days >= 0 and default_payment_terms_days <= 365);

alter table public.profiles drop constraint if exists profiles_default_retention_rate_check;
alter table public.profiles
  add constraint profiles_default_retention_rate_check
  check (default_retention_rate >= 0 and default_retention_rate <= 10);

comment on column public.profiles.decennale_insurer is 'Assureur responsabilité décennale';
comment on column public.profiles.rc_pro_number is 'Numéro contrat RC Pro';
comment on column public.profiles.mediator_name is 'Médiateur de la consommation (BTP)';
comment on column public.profiles.default_retention_rate is 'Retenue de garantie par défaut (%)';

-- ---------------------------------------------------------------------------
-- Devis : lien public & suivi consultation
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists public_token text unique default encode(gen_random_bytes(24), 'hex'),
  add column if not exists viewed_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists project_id uuid;

create index if not exists quotes_public_token_idx on public.quotes (public_token);

-- ---------------------------------------------------------------------------
-- Factures : échéances, relances, retenue libérée
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists due_date date,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists retention_released_at timestamptz,
  add column if not exists credit_note_for_invoice_id uuid references public.invoices (id) on delete set null;

-- Statut overdue pour impayés
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'overdue'));

create index if not exists invoices_due_date_idx on public.invoices (due_date) where status in ('sent', 'overdue');
create index if not exists invoices_status_due_idx on public.invoices (artisan_id, status, due_date);

-- ---------------------------------------------------------------------------
-- Relances impayés (historique)
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  reminder_level integer not null default 1 check (reminder_level >= 1 and reminder_level <= 5),
  channel text not null default 'email' check (channel in ('email', 'manual')),
  recipient_email text,
  subject text,
  body_preview text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists invoice_reminders_invoice_id_idx on public.invoice_reminders (invoice_id);
create index if not exists invoice_reminders_artisan_id_idx on public.invoice_reminders (artisan_id);

alter table public.invoice_reminders enable row level security;

drop policy if exists invoice_reminders_artisan_all on public.invoice_reminders;
create policy invoice_reminders_artisan_all
on public.invoice_reminders
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = invoice_reminders.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = invoice_reminders.artisan_id and p.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Chantiers (rentabilité)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  name text not null,
  client_name text,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  budget_labor_cents integer not null default 0,
  budget_materials_cents integer not null default 0,
  budget_total_cents integer not null default 0,
  address text,
  city text,
  postal_code text,
  started_at date,
  completed_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_artisan_id_idx on public.projects (artisan_id);
create index if not exists projects_quote_id_idx on public.projects (quote_id);

alter table public.quotes
  drop constraint if exists quotes_project_id_fkey;
alter table public.quotes
  add constraint quotes_project_id_fkey
  foreign key (project_id) references public.projects (id) on delete set null;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists projects_artisan_all on public.projects;
create policy projects_artisan_all
on public.projects
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = projects.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = projects.artisan_id and p.user_id = auth.uid()
  )
);

-- Saisie temps réel MO
create table if not exists public.project_time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null default current_date,
  duration_minutes integer not null check (duration_minutes > 0),
  hourly_rate_cents integer,
  cost_cents integer not null default 0,
  description text,
  worker_name text,
  created_at timestamptz not null default now()
);

create index if not exists project_time_entries_project_id_idx on public.project_time_entries (project_id);

alter table public.project_time_entries enable row level security;

drop policy if exists project_time_entries_artisan_all on public.project_time_entries;
create policy project_time_entries_artisan_all
on public.project_time_entries
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = project_time_entries.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = project_time_entries.artisan_id and p.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Bons d'intervention
-- ---------------------------------------------------------------------------
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  reference_number text,
  title text not null,
  description text,
  client_name text,
  site_address text,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'cancelled')),
  work_performed text,
  materials_used text,
  client_signature_name text,
  client_signature_data text,
  signed_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_orders_artisan_id_idx on public.work_orders (artisan_id);
create index if not exists work_orders_public_token_idx on public.work_orders (public_token);

drop trigger if exists set_work_orders_updated_at on public.work_orders;
create trigger set_work_orders_updated_at
before update on public.work_orders
for each row execute procedure public.set_updated_at();

alter table public.work_orders enable row level security;

drop policy if exists work_orders_artisan_all on public.work_orders;
create policy work_orders_artisan_all
on public.work_orders
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = work_orders.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = work_orders.artisan_id and p.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Photos devis
-- ---------------------------------------------------------------------------
create table if not exists public.quote_photos (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quote_photos_quote_id_idx on public.quote_photos (quote_id);

alter table public.quote_photos enable row level security;

drop policy if exists quote_photos_artisan_all on public.quote_photos;
create policy quote_photos_artisan_all
on public.quote_photos
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = quote_photos.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = quote_photos.artisan_id and p.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Sous-traitance sur devis
-- ---------------------------------------------------------------------------
create table if not exists public.quote_subcontractors (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  company_name text not null,
  trade_label text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quote_subcontractors_quote_id_idx on public.quote_subcontractors (quote_id);

alter table public.quote_subcontractors enable row level security;

drop policy if exists quote_subcontractors_artisan_all on public.quote_subcontractors;
create policy quote_subcontractors_artisan_all
on public.quote_subcontractors
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = quote_subcontractors.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = quote_subcontractors.artisan_id and p.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Fournisseurs (CRM léger)
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  siret text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_artisan_id_idx on public.suppliers (artisan_id);

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
before update on public.suppliers
for each row execute procedure public.set_updated_at();

alter table public.suppliers enable row level security;

drop policy if exists suppliers_artisan_all on public.suppliers;
create policy suppliers_artisan_all
on public.suppliers
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = suppliers.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = suppliers.artisan_id and p.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- RPC : accès devis public par token (sans login)
-- ---------------------------------------------------------------------------
create or replace function public.quote_by_public_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_artisan record;
  v_services jsonb;
  v_materials jsonb;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_quote
  from public.quotes q
  where q.public_token = trim(p_token)
  limit 1;

  if not found then
    return null;
  end if;

  -- Marquer consultation (première fois)
  if v_quote.viewed_at is null then
    update public.quotes set viewed_at = now() where id = v_quote.id;
  end if;

  select business_name, name, phone, logo_url, slug
  into v_artisan
  from public.profiles
  where id = v_quote.artisan_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_title', s.service_title,
    'duration_minutes', s.duration_minutes,
    'unit_price', s.unit_price,
    'line_total', s.line_total
  ) order by s.created_at), '[]'::jsonb)
  into v_services
  from public.quote_services s
  where s.quote_id = v_quote.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'label', m.label,
    'quantity', m.quantity,
    'unit_price', m.unit_price,
    'line_total', m.line_total
  ) order by m.created_at), '[]'::jsonb)
  into v_materials
  from public.quote_materials m
  where m.quote_id = v_quote.id;

  return jsonb_build_object(
    'id', v_quote.id,
    'status', v_quote.status,
    'customer_name', v_quote.customer_name,
    'labor_total', v_quote.labor_total,
    'materials_total', v_quote.materials_total,
    'grand_total', v_quote.grand_total,
    'notes', v_quote.notes,
    'signed_at', v_quote.signed_at,
    'signed_by_name', v_quote.signed_by_name,
    'rejected_at', v_quote.rejected_at,
    'created_at', v_quote.created_at,
    'artisan', jsonb_build_object(
      'business_name', v_artisan.business_name,
      'name', v_artisan.name,
      'phone', v_artisan.phone,
      'logo_url', v_artisan.logo_url,
      'slug', v_artisan.slug
    ),
    'services', v_services,
    'materials', v_materials
  );
end;
$$;

grant execute on function public.quote_by_public_token(text) to anon, authenticated;

-- Acceptation devis via token public (client sans compte)
create or replace function public.public_accept_quote(p_token text, p_signer_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  select * into v_quote
  from public.quotes
  where public_token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_quote.status not in ('sent', 'draft') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  update public.quotes
  set
    status = 'accepted',
    signed_at = now(),
    signed_by_name = trim(p_signer_name),
    updated_at = now()
  where id = v_quote.id;

  return jsonb_build_object('ok', true, 'quote_id', v_quote.id);
end;
$$;

grant execute on function public.public_accept_quote(text, text) to anon, authenticated;

-- RPC bon d'intervention public
create or replace function public.work_order_by_public_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo public.work_orders%rowtype;
  v_artisan record;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_wo
  from public.work_orders
  where public_token = trim(p_token);

  if not found then
    return null;
  end if;

  if v_wo.viewed_at is null then
    update public.work_orders set viewed_at = now() where id = v_wo.id;
  end if;

  select business_name, name, phone, logo_url
  into v_artisan
  from public.profiles
  where id = v_wo.artisan_id;

  return jsonb_build_object(
    'id', v_wo.id,
    'reference_number', v_wo.reference_number,
    'title', v_wo.title,
    'description', v_wo.description,
    'client_name', v_wo.client_name,
    'site_address', v_wo.site_address,
    'scheduled_at', v_wo.scheduled_at,
    'status', v_wo.status,
    'work_performed', v_wo.work_performed,
    'materials_used', v_wo.materials_used,
    'signed_at', v_wo.signed_at,
    'client_signature_name', v_wo.client_signature_name,
    'artisan', jsonb_build_object(
      'business_name', v_artisan.business_name,
      'name', v_artisan.name,
      'phone', v_artisan.phone,
      'logo_url', v_artisan.logo_url
    )
  );
end;
$$;

grant execute on function public.work_order_by_public_token(text) to anon, authenticated;

create or replace function public.public_sign_work_order(
  p_token text,
  p_signer_name text,
  p_signature_data text,
  p_work_performed text default null,
  p_materials_used text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo public.work_orders%rowtype;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_wo
  from public.work_orders
  where public_token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_wo.status = 'signed' then
    return jsonb_build_object('ok', false, 'error', 'already_signed');
  end if;

  update public.work_orders
  set
    status = 'signed',
    client_signature_name = trim(p_signer_name),
    client_signature_data = p_signature_data,
    work_performed = coalesce(nullif(trim(p_work_performed), ''), work_performed),
    materials_used = coalesce(nullif(trim(p_materials_used), ''), materials_used),
    signed_at = now(),
    updated_at = now()
  where id = v_wo.id;

  return jsonb_build_object('ok', true, 'work_order_id', v_wo.id);
end;
$$;

grant execute on function public.public_sign_work_order(text, text, text, text, text) to anon, authenticated;
