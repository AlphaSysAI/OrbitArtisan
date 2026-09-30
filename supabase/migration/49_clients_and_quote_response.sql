-- 49 — Fiche client unifiée + réponse au devis par lien e-mail.
--
-- 1. public.clients : UN enregistrement par client et par artisan, qu'il ait un
--    compte ou non (appel Soline, vitrine sans compte, devis « e-mail seul »).
-- 2. client_id sur devis, factures, appels, RDV, conversations, chantiers,
--    renseigné AUTOMATIQUEMENT par triggers (même compte > même e-mail > même
--    téléphone ; jamais sur le nom seul). Aucun code d'insertion existant à modifier.
-- 3. Reprise de l'historique (backfill) sans toucher aux updated_at.
-- 4. Colonnes de preuve de signature / motif de refus / demande de rappel sur quotes.
-- 5. Messages « guest » : un client sans compte écrit à l'artisan depuis la page devis.
--
-- client_id sert à l'AFFICHAGE uniquement : une fusion de clients ne modifie
-- jamais les identités figées d'une facture émise (customer_name, XML Factur-X).

-- ---------------------------------------------------------------------------
-- 1. Table clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null default 'Client',
  phone text,
  email text,
  customer_user_id uuid references auth.users (id) on delete set null,
  address_line1 text,
  postal_code text,
  city text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_display_name_len check (char_length(display_name) between 1 and 200),
  constraint clients_phone_format check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  constraint clients_email_lower check (email is null or email = lower(email))
);

create index if not exists clients_artisan_activity_idx on public.clients (artisan_id, last_activity_at desc);
create index if not exists clients_artisan_phone_idx on public.clients (artisan_id, phone) where phone is not null;
create index if not exists clients_artisan_email_idx on public.clients (artisan_id, email) where email is not null;
create unique index if not exists clients_artisan_user_unique
  on public.clients (artisan_id, customer_user_id) where customer_user_id is not null;

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at before update on public.clients
for each row execute procedure public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists clients_owner_all on public.clients;
create policy clients_owner_all on public.clients
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = clients.artisan_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.profiles p where p.id = clients.artisan_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Normalisation + résolution
-- ---------------------------------------------------------------------------
create or replace function public.normalize_client_phone(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if p_raw is null then return null; end if;
  d := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  if d like '00%' then d := '+' || substr(d, 3); end if;
  if d ~ '^0[1-9][0-9]{8}$' then return '+33' || substr(d, 2); end if;
  if d ~ '^33[1-9][0-9]{8}$' then return '+' || d; end if;
  if d ~ '^\+33[1-9][0-9]{8}$' then return d; end if;
  if d ~ '^\+[1-9][0-9]{7,14}$' and d not like '+33%' then return d; end if;
  return null;
end;
$$;

create or replace function public.normalize_client_email(p_raw text)
returns text
language sql
immutable
as $$
  select case
    when p_raw is null then null
    when lower(trim(p_raw)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(trim(p_raw))
    else null
  end;
$$;

/**
 * Trouve (ou crée) le client d'un artisan : même compte > même e-mail > même
 * téléphone. Jamais sur le nom seul (homonymes). Complète les coordonnées
 * manquantes sans jamais écraser celles déjà connues.
 */
create or replace function public.resolve_client(
  p_artisan_id uuid,
  p_user_id uuid,
  p_email text,
  p_phone text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := public.normalize_client_email(p_email);
  v_phone text := public.normalize_client_phone(p_phone);
  v_name text := nullif(left(trim(coalesce(p_name, '')), 200), '');
begin
  if p_artisan_id is null then return null; end if;

  if p_user_id is not null then
    select id into v_id from clients
    where artisan_id = p_artisan_id and customer_user_id = p_user_id
    limit 1;
  end if;

  if v_id is null and v_email is not null then
    select id into v_id from clients
    where artisan_id = p_artisan_id and email = v_email
      and (p_user_id is null or customer_user_id is null or customer_user_id = p_user_id)
    order by last_activity_at desc
    limit 1;
  end if;

  if v_id is null and v_phone is not null then
    select id into v_id from clients
    where artisan_id = p_artisan_id and phone = v_phone
      and (p_user_id is null or customer_user_id is null or customer_user_id = p_user_id)
    order by last_activity_at desc
    limit 1;
  end if;

  if v_id is null then
    if p_user_id is null and v_email is null and v_phone is null then
      return null; -- rien d'identifiant : pas de fiche fantôme
    end if;
    insert into clients (artisan_id, display_name, email, phone, customer_user_id)
    values (p_artisan_id, coalesce(v_name, v_email, v_phone, 'Client'), v_email, v_phone, p_user_id)
    returning id into v_id;
  else
    update clients set
      email = coalesce(email, v_email),
      phone = coalesce(phone, v_phone),
      customer_user_id = coalesce(customer_user_id, p_user_id),
      display_name = case
        when v_name is not null and (display_name = 'Client' or display_name = email or display_name = phone)
          then v_name
        else display_name
      end,
      last_activity_at = greatest(last_activity_at, now())
    where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.resolve_client(uuid, uuid, text, text, text) from public, anon, authenticated;

/** client_id fourni explicitement : doit appartenir au même artisan (isolation multi-tenant). */
create or replace function public.client_belongs_to(p_client_id uuid, p_artisan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from clients where id = p_client_id and artisan_id = p_artisan_id);
$$;

revoke all on function public.client_belongs_to(uuid, uuid) from public, anon, authenticated;

create or replace function public.touch_client(p_client_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update clients set last_activity_at = now() where id = p_client_id;
$$;

revoke all on function public.touch_client(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Colonnes client_id + triggers
-- ---------------------------------------------------------------------------
alter table public.quotes add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.invoices add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.voice_call_intakes add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.appointments add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.conversations add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.projects add column if not exists client_id uuid references public.clients (id) on delete set null;

create index if not exists quotes_client_idx on public.quotes (client_id) where client_id is not null;
create index if not exists invoices_client_idx on public.invoices (client_id) where client_id is not null;
create index if not exists voice_call_intakes_client_idx on public.voice_call_intakes (client_id) where client_id is not null;
create index if not exists appointments_client_idx on public.appointments (client_id) where client_id is not null;
create index if not exists conversations_client_idx on public.conversations (client_id) where client_id is not null;
create index if not exists projects_client_idx on public.projects (client_id) where client_id is not null;

-- Conversation d'un client sans compte ni lead (message depuis la page devis).
alter table public.conversations drop constraint if exists conversations_participant_check;
alter table public.conversations
  add constraint conversations_participant_check
  check (customer_user_id is not null or lead_id is not null or client_id is not null);

create unique index if not exists conversations_artisan_guest_client_unique
  on public.conversations (artisan_id, client_id)
  where customer_user_id is null and lead_id is null;

create or replace function public.clients_assign_quote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not public.client_belongs_to(new.client_id, new.artisan_id) then
    new.client_id := null;
  end if;
  if new.client_id is null and new.conversation_id is not null then
    select c.client_id into new.client_id from conversations c
    where c.id = new.conversation_id and c.artisan_id = new.artisan_id;
  end if;
  if new.client_id is null then
    new.client_id := public.resolve_client(new.artisan_id, new.customer_user_id, new.customer_email, null, new.customer_name);
  elsif tg_op = 'INSERT' then
    perform public.touch_client(new.client_id);
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_quote on public.quotes;
create trigger clients_assign_quote
before insert or update of client_id, customer_user_id, customer_email, customer_name, conversation_id on public.quotes
for each row execute procedure public.clients_assign_quote();

create or replace function public.clients_assign_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not public.client_belongs_to(new.client_id, new.artisan_id) then
    new.client_id := null;
  end if;
  if new.client_id is null then
    select q.client_id into new.client_id from quotes q where q.id = new.quote_id and q.artisan_id = new.artisan_id;
  end if;
  if new.client_id is null then
    new.client_id := public.resolve_client(new.artisan_id, new.customer_user_id, new.customer_email, null, new.customer_name);
  elsif tg_op = 'INSERT' then
    perform public.touch_client(new.client_id);
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_invoice on public.invoices;
create trigger clients_assign_invoice
before insert or update of client_id, customer_user_id, customer_email on public.invoices
for each row execute procedure public.clients_assign_invoice();

create or replace function public.clients_assign_voice_intake()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not public.client_belongs_to(new.client_id, new.artisan_id) then
    new.client_id := null;
  end if;
  if new.client_id is null then
    new.client_id := public.resolve_client(new.artisan_id, null, new.customer_email, new.from_number, new.customer_name);
  elsif tg_op = 'INSERT' then
    perform public.touch_client(new.client_id);
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_voice_intake on public.voice_call_intakes;
create trigger clients_assign_voice_intake
before insert or update of client_id, customer_email, customer_name, from_number on public.voice_call_intakes
for each row execute procedure public.clients_assign_voice_intake();

create or replace function public.clients_assign_appointment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not public.client_belongs_to(new.client_id, new.artisan_id) then
    new.client_id := null;
  end if;
  if new.client_id is null then
    new.client_id := public.resolve_client(new.artisan_id, new.customer_user_id, new.customer_email, new.customer_phone, new.customer_name);
  elsif tg_op = 'INSERT' then
    perform public.touch_client(new.client_id);
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_appointment on public.appointments;
create trigger clients_assign_appointment
before insert or update of client_id, customer_user_id, customer_email, customer_phone on public.appointments
for each row execute procedure public.clients_assign_appointment();

create or replace function public.clients_assign_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_phone text; v_name text;
begin
  if new.client_id is not null and not public.client_belongs_to(new.client_id, new.artisan_id) then
    new.client_id := null;
  end if;
  if new.client_id is null and new.customer_user_id is not null then
    select cp.email, cp.phone, cp.display_name into v_email, v_phone, v_name
    from customer_profiles cp where cp.user_id = new.customer_user_id;
    new.client_id := public.resolve_client(new.artisan_id, new.customer_user_id, v_email, v_phone, v_name);
  elsif new.client_id is null and new.lead_id is not null then
    select l.contact_email, l.contact_phone, l.contact_name into v_email, v_phone, v_name
    from leads l where l.id = new.lead_id;
    new.client_id := public.resolve_client(new.artisan_id, null, v_email, v_phone, v_name);
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_conversation on public.conversations;
create trigger clients_assign_conversation
before insert or update of client_id, customer_user_id, lead_id on public.conversations
for each row execute procedure public.clients_assign_conversation();

create or replace function public.clients_assign_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not public.client_belongs_to(new.client_id, new.artisan_id) then
    new.client_id := null;
  end if;
  if new.client_id is null and new.quote_id is not null then
    select q.client_id into new.client_id from quotes q where q.id = new.quote_id and q.artisan_id = new.artisan_id;
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_project on public.projects;
create trigger clients_assign_project
before insert or update of client_id, quote_id on public.projects
for each row execute procedure public.clients_assign_project();

-- Nouveau message : le client remonte en tête de liste.
create or replace function public.clients_touch_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update clients set last_activity_at = now()
  where id = (select client_id from conversations where id = new.conversation_id);
  return new;
end $$;

drop trigger if exists clients_touch_on_message on public.messages;
create trigger clients_touch_on_message
after insert on public.messages
for each row execute procedure public.clients_touch_on_message();

-- ---------------------------------------------------------------------------
-- 4. Réponse au devis par lien + messages invités
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists rejection_reason text,
  add column if not exists rejection_comment text,
  add column if not exists signed_ip text,
  add column if not exists signed_user_agent text,
  add column if not exists signed_document_hash text,
  add column if not exists response_channel text,
  add column if not exists callback_requested_at timestamptz,
  add column if not exists callback_handled_at timestamptz,
  add column if not exists callback_phone text,
  add column if not exists signed_scan_path text;

alter table public.quotes drop constraint if exists quotes_rejection_reason_check;
alter table public.quotes add constraint quotes_rejection_reason_check
  check (rejection_reason is null or rejection_reason in ('price', 'delay', 'other_provider', 'project_cancelled', 'other'));
alter table public.quotes drop constraint if exists quotes_response_channel_check;
alter table public.quotes add constraint quotes_response_channel_check
  check (response_channel is null or response_channel in ('account', 'email_link', 'artisan_paper', 'artisan_oral'));
alter table public.quotes drop constraint if exists quotes_rejection_comment_len;
alter table public.quotes add constraint quotes_rejection_comment_len
  check (rejection_comment is null or char_length(rejection_comment) <= 1000);

create index if not exists quotes_callback_pending_idx
  on public.quotes (artisan_id, callback_requested_at)
  where callback_requested_at is not null and callback_handled_at is null;

comment on column public.quotes.signed_document_hash is
  'SHA-256 du contenu du devis accepté (lignes, totaux, numéro) : preuve de la version signée.';

-- Photo / scan du devis signé sur papier (privé, lecture artisan uniquement).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-signatures', 'quote-signatures', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];

drop policy if exists quote_signatures_owner_insert on storage.objects;
create policy quote_signatures_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'quote-signatures'
  and split_part(name, '/', 1) = (select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1)
);

drop policy if exists quote_signatures_owner_select on storage.objects;
create policy quote_signatures_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'quote-signatures'
  and split_part(name, '/', 1) = (select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1)
);

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('user', 'lead_recap', 'guest'));
alter table public.messages drop constraint if exists messages_sender_required;
alter table public.messages add constraint messages_sender_required
  check (sender_user_id is not null or kind in ('lead_recap', 'guest'));

-- ---------------------------------------------------------------------------
-- 5. Fusion de deux fiches (action artisan explicite)
-- ---------------------------------------------------------------------------
create or replace function public.merge_clients(p_keep uuid, p_remove uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artisan uuid;
  k clients%rowtype;
  r clients%rowtype;
begin
  if p_keep = p_remove then raise exception 'same_client'; end if;
  select * into k from clients where id = p_keep;
  select * into r from clients where id = p_remove;
  if k.id is null or r.id is null or k.artisan_id <> r.artisan_id then raise exception 'not_found'; end if;
  select p.id into v_artisan from profiles p where p.id = k.artisan_id and p.user_id = auth.uid();
  if v_artisan is null then raise exception 'forbidden'; end if;
  if k.customer_user_id is not null and r.customer_user_id is not null and k.customer_user_id <> r.customer_user_id then
    raise exception 'conflicting_accounts';
  end if;

  update quotes set client_id = p_keep where client_id = p_remove;
  update invoices set client_id = p_keep where client_id = p_remove;
  update voice_call_intakes set client_id = p_keep where client_id = p_remove;
  update appointments set client_id = p_keep where client_id = p_remove;
  update conversations set client_id = p_keep where client_id = p_remove;
  update projects set client_id = p_keep where client_id = p_remove;

  delete from clients where id = p_remove;
  update clients set
    email = coalesce(email, r.email),
    phone = coalesce(phone, r.phone),
    customer_user_id = coalesce(customer_user_id, r.customer_user_id),
    address_line1 = coalesce(address_line1, r.address_line1),
    postal_code = coalesce(postal_code, r.postal_code),
    city = coalesce(city, r.city),
    last_activity_at = greatest(last_activity_at, r.last_activity_at)
  where id = p_keep;
end;
$$;

grant execute on function public.merge_clients(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reprise de l'historique (sans modifier les updated_at existants)
-- ---------------------------------------------------------------------------
alter table public.conversations disable trigger set_conversations_updated_at;
alter table public.quotes disable trigger set_quotes_updated_at;
alter table public.invoices disable trigger set_invoices_updated_at;
alter table public.appointments disable trigger set_appointments_updated_at;
alter table public.voice_call_intakes disable trigger set_voice_call_intakes_updated_at;
alter table public.projects disable trigger set_projects_updated_at;

-- Ordre : comptes d'abord (identité la plus sûre), puis e-mail, puis téléphone.
update public.conversations c set client_id = public.resolve_client(
  c.artisan_id, c.customer_user_id, cp.email, cp.phone, cp.display_name)
from public.customer_profiles cp
where c.client_id is null and c.customer_user_id is not null and cp.user_id = c.customer_user_id;

update public.conversations c set client_id = public.resolve_client(
  c.artisan_id, null, l.contact_email, l.contact_phone, l.contact_name)
from public.leads l
where c.client_id is null and c.lead_id is not null and l.id = c.lead_id;

update public.quotes q set client_id = coalesce(
  (select c.client_id from public.conversations c where c.id = q.conversation_id and c.artisan_id = q.artisan_id),
  public.resolve_client(q.artisan_id, q.customer_user_id, q.customer_email, null, q.customer_name))
where q.client_id is null;

update public.invoices i set client_id = coalesce(
  (select q.client_id from public.quotes q where q.id = i.quote_id),
  public.resolve_client(i.artisan_id, i.customer_user_id, i.customer_email, null, i.customer_name))
where i.client_id is null;

update public.appointments a set client_id = public.resolve_client(
  a.artisan_id, a.customer_user_id, a.customer_email, a.customer_phone, a.customer_name)
where a.client_id is null;

update public.voice_call_intakes v set client_id = public.resolve_client(
  v.artisan_id, null, v.customer_email, v.from_number, v.customer_name)
where v.client_id is null;

update public.projects p set client_id = (select q.client_id from public.quotes q where q.id = p.quote_id)
where p.client_id is null and p.quote_id is not null;

-- Dernière activité réelle (et non la date de la migration).
update public.clients cl set last_activity_at = coalesce((
  select max(t) from (
    select max(created_at) t from public.quotes where client_id = cl.id
    union all select max(created_at) from public.invoices where client_id = cl.id
    union all select max(created_at) from public.appointments where client_id = cl.id
    union all select max(created_at) from public.voice_call_intakes where client_id = cl.id
    union all select max(m.created_at) from public.messages m
      join public.conversations c on c.id = m.conversation_id where c.client_id = cl.id
  ) s
), cl.created_at);

alter table public.conversations enable trigger set_conversations_updated_at;
alter table public.quotes enable trigger set_quotes_updated_at;
alter table public.invoices enable trigger set_invoices_updated_at;
alter table public.appointments enable trigger set_appointments_updated_at;
alter table public.voice_call_intakes enable trigger set_voice_call_intakes_updated_at;
alter table public.projects enable trigger set_projects_updated_at;
