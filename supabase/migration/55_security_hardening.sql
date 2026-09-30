-- =============================================================================
-- 55_security_hardening.sql — Audit sécurité base (30/09/2026)
-- =============================================================================
-- Principe : la clé anon est publique (bundle navigateur). Tout ce qui est
-- exécutable ou modifiable avec elle — ou avec le JWT d'un artisan — en appelant
-- PostgREST directement, sans passer par l'application, doit être sûr.
--
--  A. Fonctions SECURITY DEFINER : « revoke from public » ne retire pas les droits
--     accordés explicitement par Supabase à anon / authenticated. Chaque fonction
--     est réduite au strict nécessaire ; le parcours anonyme (estimation, bons
--     d'intervention) passe désormais par le serveur (service role + limitation de débit).
--  B. Politiques RLS trop larges (numéros vocaux, invitations, RDV, stockage).
--  C. Intégrité légale : factures émises et devis envoyés/signés non modifiables
--     ni supprimables par appel direct (numérotation continue, inaltérabilité,
--     preuve de signature). Le service role (serveur) n'est pas concerné.
--  D. Colonnes sensibles du profil (Stripe Connect, preuve d'inscription, file
--     d'attribution des numéros) en lecture seule pour l'artisan.
--  E. Vue publique des artisans : plus d'identifiant de compte, comptes suspendus masqués.
--  F. Table de limitation de débit (service role uniquement).
-- Idempotent.

-- -----------------------------------------------------------------------------
-- A. Fonctions
-- -----------------------------------------------------------------------------

-- Les fonctions créées à l'avenir ne sont plus exécutables par défaut par anon.
alter default privileges in schema public revoke execute on functions from public, anon;

-- Serveur uniquement (service role).
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.user_id_by_email(text)',
    'public.lookup_auth_user_id_by_email(text)',
    'public.resolve_voice_number_assignee_at(text, timestamp with time zone)',
    'public.expire_pending_appointments(uuid)',
    'public.create_lead(text, text, text, text, text, double precision, double precision, text)',
    'public.update_lead_brief(text, text, text, text, double precision, double precision, text)',
    'public.update_lead_contact(text, text, text, text)',
    'public.set_lead_estimate(text, integer, integer, jsonb)',
    'public.match_lead_to_artisans(text, double precision, integer)',
    'public.match_lead_to_origin_artisan(text)',
    'public.add_lead_media(text, text, text)',
    'public.lead_id_from_token(text)',
    'public.lead_signup_preview(text)',
    'public.create_lead_client_invitation(text)',
    'public.lead_upload_allowed(text)',
    'public.work_order_by_public_token(text)',
    'public.public_sign_work_order(text, text, text, text, text)',
    'public.quote_by_public_token(text)',
    'public.public_accept_quote(text, text)'
  ]
  loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;

  -- Utilisateur connecté uniquement (vérifient auth.uid() en interne).
  foreach f in array array[
    'public.claim_lead(text)',
    'public.accept_client_invitation(text)',
    'public.accept_platform_invitation(text)',
    'public.client_accept_quote(uuid, text)',
    'public.client_reject_quote(uuid)',
    'public.can_access_lead(uuid)',
    'public.is_platform_admin()',
    'public.get_notification_counts()',
    'public.mark_conversation_read(uuid)',
    'public.mark_notification_category_seen(text)',
    'public.merge_clients(uuid, uuid)',
    'public.allocate_invoice_number(uuid)',
    'public.allocate_quote_number(uuid)',
    'public.seed_default_work_library(uuid)',
    'public.search_artisans_nearby(double precision, double precision, text, double precision, integer)',
    'public.match_supplier_products(vector, integer, double precision)',
    'public.claim_promo_code(text)'
  ]
  loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end
$$;

-- Numéro de devis : seul l'artisan propriétaire (ou le serveur) peut l'attribuer.
create or replace function public.allocate_quote_number(p_quote_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artisan_id uuid;
  v_year integer;
  v_existing text;
  v_next integer;
  v_number text;
  v_caller_profile_id uuid;
begin
  select artisan_id, quote_number, extract(year from created_at at time zone 'UTC')::integer
  into v_artisan_id, v_existing, v_year
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote_not_found';
  end if;

  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    select id into v_caller_profile_id from public.profiles where user_id = auth.uid();
    if v_caller_profile_id is null or v_caller_profile_id <> v_artisan_id then
      raise exception 'not_authorized';
    end if;
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.quote_number_counters (artisan_id, year, last_number)
  values (v_artisan_id, v_year, 1)
  on conflict (artisan_id, year)
  do update set
    last_number = quote_number_counters.last_number + 1,
    updated_at = now()
  returning last_number into v_next;

  v_number := 'DEV-' || v_year::text || '-' || lpad(v_next::text, 4, '0');

  update public.quotes
  set quote_number = v_number
  where id = p_quote_id;

  return v_number;
end;
$$;

-- Médias d'estimation : chemin strictement « <lead_id>/<fichier> ».
create or replace function public.add_lead_media(p_token text, p_storage_path text, p_kind text default 'photo')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_kind public.lead_media_kind;
  v_count integer;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;

  if p_storage_path is null
     or p_storage_path !~ ('^' || v_lead.id::text || '/[A-Za-z0-9-]{1,64}(\.[a-z0-9]{1,8})?$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_path');
  end if;

  select count(*) into v_count from public.lead_media where lead_id = v_lead.id;
  if v_count >= 6 then
    return jsonb_build_object('ok', false, 'error', 'too_many_media');
  end if;

  v_kind := case when p_kind = 'video' then 'video' else 'photo' end;

  insert into public.lead_media (lead_id, storage_path, kind)
  values (v_lead.id, p_storage_path, v_kind)
  on conflict (storage_path) do nothing;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id);
end;
$$;
revoke all on function public.add_lead_media(text, text, text) from public, anon, authenticated;

-- Recherche d'artisans (espace client) : comptes supprimés / suspendus exclus,
-- coordonnées arrondies (~1 km) : jamais l'adresse exacte d'un artisan.
create or replace function public.search_artisans_nearby(
  p_lat double precision,
  p_lng double precision,
  p_trade text default null,
  p_radius_km double precision default 50,
  p_limit integer default 50
)
returns table (
  id uuid,
  business_name text,
  slug text,
  trade_category text,
  trade text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with candidats as (
    select
      p.id,
      p.business_name,
      p.slug,
      p.trade_category,
      p.trade,
      p.city,
      p.postal_code,
      round(p.latitude::numeric, 2)::double precision as latitude,
      round(p.longitude::numeric, 2)::double precision as longitude,
      6371 * acos(
        least(1.0,
          cos(radians(p_lat)) * cos(radians(p.latitude))
          * cos(radians(p.longitude) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(p.latitude))
        )
      ) as distance_km
    from public.profiles p
    where p.latitude is not null
      and p.longitude is not null
      and p.deleted_at is null
      and coalesce(p.account_status, 'active') = 'active'
      and (p_trade is null or p.trade = p_trade)
  )
  select *
  from candidats
  where distance_km <= greatest(1, least(p_radius_km, 200))
  order by distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.search_artisans_nearby(double precision, double precision, text, double precision, integer) from public, anon;
grant execute on function public.search_artisans_nearby(double precision, double precision, text, double precision, integer) to authenticated;

-- Bon d'intervention : signature bornée (taille, nom).
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
  if p_signer_name is null or length(trim(p_signer_name)) not between 2 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_signer');
  end if;
  if p_signature_data is null or length(p_signature_data) > 400000
     or p_signature_data !~ '^data:image/(png|jpeg|svg\+xml);base64,' then
    return jsonb_build_object('ok', false, 'error', 'invalid_signature');
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
    work_performed = coalesce(nullif(left(trim(p_work_performed), 4000), ''), work_performed),
    materials_used = coalesce(nullif(left(trim(p_materials_used), 4000), ''), materials_used),
    signed_at = now(),
    updated_at = now()
  where id = v_wo.id;

  return jsonb_build_object('ok', true, 'work_order_id', v_wo.id);
end;
$$;
revoke all on function public.public_sign_work_order(text, text, text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- B. Politiques RLS
-- -----------------------------------------------------------------------------

-- Numéros vocaux : attribution exclusivement serveur. Un artisan pouvait s'attribuer
-- n'importe quel numéro libre (Soline gratuite, appels d'un autre détournés).
drop policy if exists voice_numbers_owner_insert on public.artisan_voice_numbers;
drop policy if exists voice_numbers_owner_write on public.artisan_voice_numbers;
drop policy if exists voice_numbers_owner_delete on public.artisan_voice_numbers;

-- RDV vitrine : créés uniquement par le serveur (créneau vérifié + limitation de débit).
drop policy if exists appointments_anon_insert_guest on public.appointments;
drop policy if exists appointments_authenticated_insert_own on public.appointments;

-- Invitations : un artisan n'invite qu'en son nom.
drop policy if exists platform_invitations_inviter_insert on public.platform_invitations;
create policy platform_invitations_inviter_insert
  on public.platform_invitations
  for insert
  to authenticated
  with check (
    inviter_user_id = auth.uid()
    and (
      artisan_id is null
      or exists (select 1 from public.profiles p where p.id = artisan_id and p.user_id = auth.uid())
    )
  );

-- Stockage des médias d'estimation : URL signées émises par le serveur uniquement.
drop policy if exists lead_media_objects_insert on storage.objects;

-- Lecture artisan des médias d'un lead : comparait le chemin au NOM du profil.
drop policy if exists lead_media_artisan_read on storage.objects;
create policy lead_media_artisan_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'lead-media'
    and exists (
      select 1
      from public.lead_media lm
      join public.lead_matches m on m.lead_id = lm.lead_id
      join public.profiles p on p.id = m.artisan_id
      where lm.storage_path = storage.objects.name
        and p.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- C. Intégrité des factures et devis (appels directs avec le JWT d'un artisan)
-- -----------------------------------------------------------------------------

create or replace function public.guard_invoice_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- current_user : rôle de l'appel direct (authenticated / anon). Dans une fonction
  -- SECURITY DEFINER (claim_lead, client_accept_quote…) il vaut le propriétaire : contrôles internes.
  v_role text := current_user;
  v_issued boolean;
  v_prefix text;
  v_counter integer;
begin
  if v_role not in ('authenticated', 'anon') then
    return coalesce(new, old); -- serveur, crons, SQL
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.finalized_at is not null or new.invoice_number is not null
       or new.payment_received_at is not null or new.pa_submission_id is not null then
      raise exception 'invoice_must_start_as_draft' using errcode = '42501';
    end if;
    return new;
  end if;

  v_issued := old.finalized_at is not null or old.invoice_number is not null;

  if tg_op = 'DELETE' then
    if v_issued then
      raise exception 'invoice_issued_not_deletable' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if not v_issued then
    if new.finalized_at is null then
      -- Brouillon : aucun numéro ni statut d'émission sans finalisation.
      if new.status <> 'draft' or new.invoice_number is not null then
        raise exception 'invoice_finalize_required' using errcode = '42501';
      end if;
      return new;
    end if;

    -- Finalisation : numéro issu du compteur séquentiel (allocate_invoice_number).
    v_prefix := case new.invoice_type
      when 'deposit' then 'ACO'
      when 'progress' then 'SIT'
      when 'final' then 'SOL'
      when 'credit_note' then 'AVO'
      else 'INV'
    end;
    if new.invoice_number is null
       or new.invoice_number !~ ('^' || v_prefix || '-[0-9]{4}-[0-9]{4,}$') then
      raise exception 'invoice_number_invalid' using errcode = '42501';
    end if;
    select c.last_number into v_counter
    from public.invoice_number_counters c
    where c.artisan_id = new.artisan_id
      and c.invoice_type = coalesce(new.invoice_type, 'standard')
      and c.year = split_part(new.invoice_number, '-', 2)::integer;
    if v_counter is null or split_part(new.invoice_number, '-', 3)::integer > v_counter then
      raise exception 'invoice_number_not_allocated' using errcode = '42501';
    end if;
    if new.status = 'draft' then
      raise exception 'invoice_finalized_status_invalid' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Facture émise : contenu figé (art. 242 nonies A, annexe II CGI).
  if new.artisan_id is distinct from old.artisan_id
     or new.quote_id is distinct from old.quote_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_email is distinct from old.customer_email
     or new.invoice_number is distinct from old.invoice_number
     or new.labor_total is distinct from old.labor_total
     or new.materials_total is distinct from old.materials_total
     or new.grand_total is distinct from old.grand_total
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
     or new.operation_type is distinct from old.operation_type
     or new.vat_on_debits is distinct from old.vat_on_debits
     or new.vat_collection_nature is distinct from old.vat_collection_nature
     or new.finalized_at is distinct from old.finalized_at
     or new.emission_flow is distinct from old.emission_flow
     or new.invoice_type is distinct from old.invoice_type
     or new.parent_invoice_id is distinct from old.parent_invoice_id
     or new.progress_percentage is distinct from old.progress_percentage
     or new.quote_reference_total is distinct from old.quote_reference_total
     or new.retention_rate is distinct from old.retention_rate
     or new.retention_amount is distinct from old.retention_amount
     or new.due_date is distinct from old.due_date
     or new.credit_note_for_invoice_id is distinct from old.credit_note_for_invoice_id
     or new.e_invoicing_status is distinct from old.e_invoicing_status
     or new.e_invoicing_rejection_reason is distinct from old.e_invoicing_rejection_reason
     or new.e_invoicing_status_updated_at is distinct from old.e_invoicing_status_updated_at
     or new.pa_submission_id is distinct from old.pa_submission_id
     or new.pa_submission_status is distinct from old.pa_submission_status then
    raise exception 'invoice_issued_immutable' using errcode = '42501';
  end if;
  if new.status = 'draft' then
    raise exception 'invoice_issued_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_invoice_integrity on public.invoices;
create trigger guard_invoice_integrity
  before insert or update or delete on public.invoices
  for each row execute function public.guard_invoice_integrity();

create or replace function public.guard_invoice_lines_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- current_user : rôle de l'appel direct (authenticated / anon). Dans une fonction
  -- SECURITY DEFINER (claim_lead, client_accept_quote…) il vaut le propriétaire : contrôles internes.
  v_role text := current_user;
begin
  if v_role not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if exists (
    select 1 from public.invoices i
    where i.id in (case when tg_op <> 'INSERT' then old.invoice_id end, case when tg_op <> 'DELETE' then new.invoice_id end)
      and (i.finalized_at is not null or i.invoice_number is not null)
  ) then
    raise exception 'invoice_issued_immutable' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_invoice_lines_integrity on public.invoice_lines;
create trigger guard_invoice_lines_integrity
  before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_invoice_lines_integrity();

create or replace function public.guard_quote_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- current_user : rôle de l'appel direct (authenticated / anon). Dans une fonction
  -- SECURITY DEFINER (claim_lead, client_accept_quote…) il vaut le propriétaire : contrôles internes.
  v_role text := current_user;
  v_uid uuid := auth.uid();
  v_is_customer boolean;
  v_signature_changed boolean;
  v_rejection_changed boolean;
begin
  if v_role not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'sent') or new.quote_number is not null
       or new.signed_at is not null or new.signed_by_name is not null or new.signed_ip is not null
       or new.signed_user_agent is not null or new.signed_document_hash is not null
       or new.signed_scan_path is not null or new.response_channel is not null
       or new.rejected_at is not null then
      raise exception 'quote_invalid_initial_state' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'quote_not_deletable' using errcode = '42501';
    end if;
    return old;
  end if;

  v_signature_changed :=
    new.signed_at is distinct from old.signed_at
    or new.signed_by_name is distinct from old.signed_by_name
    or new.signed_ip is distinct from old.signed_ip
    or new.signed_user_agent is distinct from old.signed_user_agent
    or new.signed_document_hash is distinct from old.signed_document_hash
    or new.signed_scan_path is distinct from old.signed_scan_path
    or new.response_channel is distinct from old.response_channel;
  v_rejection_changed :=
    new.rejected_at is distinct from old.rejected_at
    or new.rejection_reason is distinct from old.rejection_reason
    or new.rejection_comment is distinct from old.rejection_comment;

  -- Numéro : attribué une seule fois.
  if old.quote_number is not null and new.quote_number is distinct from old.quote_number then
    raise exception 'quote_number_immutable' using errcode = '42501';
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'sent') or v_signature_changed or v_rejection_changed then
      raise exception 'quote_invalid_transition' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Devis envoyé / accepté / refusé : contenu figé (preuve de l'offre et de la signature).
  if new.artisan_id is distinct from old.artisan_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_email is distinct from old.customer_email
     or new.labor_rate_per_hour is distinct from old.labor_rate_per_hour
     or new.labor_duration_minutes is distinct from old.labor_duration_minutes
     or new.labor_total is distinct from old.labor_total
     or new.materials_total is distinct from old.materials_total
     or new.grand_total is distinct from old.grand_total
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
     or new.reduced_vat_rate is distinct from old.reduced_vat_rate
     or new.generate_vat_attestation is distinct from old.generate_vat_attestation
     or new.work_site_address is distinct from old.work_site_address
     or new.work_site_city is distinct from old.work_site_city
     or new.work_site_postal_code is distinct from old.work_site_postal_code
     or new.public_token is distinct from old.public_token
     or new.retraction_waived is distinct from old.retraction_waived
     or new.valid_until is distinct from old.valid_until
     or (old.sent_at is not null and new.sent_at is distinct from old.sent_at) then
    raise exception 'quote_sent_immutable' using errcode = '42501';
  end if;

  if new.status = old.status then
    if v_signature_changed or v_rejection_changed then
      raise exception 'quote_signature_immutable' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status <> 'sent' then
    raise exception 'quote_invalid_transition' using errcode = '42501';
  end if;

  v_is_customer := v_uid is not null and v_uid = old.customer_user_id;

  if new.status = 'accepted' then
    if v_rejection_changed and new.rejected_at is not null then
      raise exception 'quote_invalid_transition' using errcode = '42501';
    end if;
    if v_is_customer then
      return new; -- client_accept_quote (compte client)
    end if;
    -- Accord recueilli par l'artisan (papier / oral) : jamais d'IP ni de canal « lien ».
    if new.response_channel not in ('artisan_paper', 'artisan_oral')
       or new.signed_ip is not null or new.signed_user_agent is not null
       or new.signed_at is null or new.signed_by_name is null then
      raise exception 'quote_invalid_acceptance' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'rejected' then
    if new.signed_at is distinct from old.signed_at or new.signed_by_name is distinct from old.signed_by_name
       or new.signed_ip is distinct from old.signed_ip or new.signed_user_agent is distinct from old.signed_user_agent
       or new.signed_document_hash is distinct from old.signed_document_hash
       or new.signed_scan_path is distinct from old.signed_scan_path then
      raise exception 'quote_invalid_transition' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'quote_invalid_transition' using errcode = '42501';
end;
$$;

drop trigger if exists guard_quote_integrity on public.quotes;
create trigger guard_quote_integrity
  before insert or update or delete on public.quotes
  for each row execute function public.guard_quote_integrity();

-- Lignes d'un devis envoyé : figées.
create or replace function public.guard_quote_lines_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- current_user : rôle de l'appel direct (authenticated / anon). Dans une fonction
  -- SECURITY DEFINER (claim_lead, client_accept_quote…) il vaut le propriétaire : contrôles internes.
  v_role text := current_user;
begin
  if v_role not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if exists (
    select 1 from public.quotes q
    where q.id in (case when tg_op <> 'INSERT' then old.quote_id end, case when tg_op <> 'DELETE' then new.quote_id end)
      and q.status <> 'draft'
  ) then
    raise exception 'quote_sent_immutable' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_quote_materials_integrity on public.quote_materials;
create trigger guard_quote_materials_integrity
  before insert or update or delete on public.quote_materials
  for each row execute function public.guard_quote_lines_integrity();

drop trigger if exists guard_quote_services_integrity on public.quote_services;
create trigger guard_quote_services_integrity
  before insert or update or delete on public.quote_services
  for each row execute function public.guard_quote_lines_integrity();

-- Mise en relation : l'artisan ne peut pas déplacer sa ligne vers un autre lead
-- (il obtiendrait l'accès aux coordonnées d'un particulier).
create or replace function public.guard_lead_match_keys()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.lead_id is distinct from old.lead_id
     or new.artisan_id is distinct from old.artisan_id
     or new.rank is distinct from old.rank
     or new.distance_km is distinct from old.distance_km
     or new.created_at is distinct from old.created_at then
    raise exception 'lead_match_keys_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_lead_match_keys on public.lead_matches;
create trigger guard_lead_match_keys
  before update on public.lead_matches
  for each row execute function public.guard_lead_match_keys();

-- Lead réclamé par le particulier : la mise en relation et le statut restent serveur.
create or replace function public.guard_lead_owner_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.claimed_by_user_id is distinct from old.claimed_by_user_id
     or new.status is distinct from old.status
     or new.public_token is distinct from old.public_token
     or new.origin_artisan_id is distinct from old.origin_artisan_id
     or new.source is distinct from old.source
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.estimate_min is distinct from old.estimate_min
     or new.estimate_max is distinct from old.estimate_max
     or new.ai_qualification is distinct from old.ai_qualification then
    raise exception 'lead_fields_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_lead_owner_update on public.leads;
create trigger guard_lead_owner_update
  before update on public.leads
  for each row execute function public.guard_lead_owner_update();

-- -----------------------------------------------------------------------------
-- D. Colonnes sensibles du profil (redéfinit 54 : même règle d'essai + colonnes ajoutées)
-- -----------------------------------------------------------------------------
create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role not in ('authenticated', 'anon') then
    return new; -- service role, SQL direct, crons
  end if;

  if tg_op = 'INSERT' then
    -- Aucun essai sans carte : l'essai démarre avec l'abonnement Stripe (trial + CB).
    new.subscription_plan := 'pro';
    new.subscription_status := 'incomplete';
    new.trial_ends_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.stripe_account_id := null;
    new.stripe_transfers_enabled := false;
    new.stripe_payouts_enabled := false;
    new.stripe_account_updated_at := null;
    new.voice_number_assignment_pending_at := null;
    new.voice_number_provisioning_at := null;
    new.voice_minutes_included := 0;
    new.voice_minutes_used := 0;
    new.voice_minutes_overdue := 0;
    new.account_status := 'active';
    new.deleted_at := null;
    new.accountant_email_confirmed_at := null;
    new.accountant_confirm_token_hash := null;
    new.accountant_confirm_sent_at := null;
    return new;
  end if;

  new.subscription_plan := old.subscription_plan;
  new.subscription_status := old.subscription_status;
  new.trial_ends_at := old.trial_ends_at;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  -- Stripe Connect (encaissement des factures clients) : piloté par le serveur et le webhook.
  new.stripe_account_id := old.stripe_account_id;
  new.stripe_transfers_enabled := old.stripe_transfers_enabled;
  new.stripe_payouts_enabled := old.stripe_payouts_enabled;
  new.stripe_account_updated_at := old.stripe_account_updated_at;
  -- Preuve d'inscription (acceptation des CGU) : figée.
  new.registration_ip := old.registration_ip;
  new.registration_recorded_at := old.registration_recorded_at;
  -- Numéro Soline : file d'attribution et compteurs gérés par le serveur.
  new.voice_number_assignment_pending_at := old.voice_number_assignment_pending_at;
  new.voice_number_provisioning_at := old.voice_number_provisioning_at;
  new.voice_minutes_included := old.voice_minutes_included;
  new.voice_minutes_used := old.voice_minutes_used;
  new.voice_minutes_overdue := old.voice_minutes_overdue;
  new.billing_cycle_reset_at := old.billing_cycle_reset_at;
  new.account_status := old.account_status;
  new.deleted_at := old.deleted_at;
  new.accountant_confirm_sent_at := old.accountant_confirm_sent_at;

  -- Changer l'adresse du comptable annule toute confirmation en cours ou acquise.
  if new.accountant_email is distinct from old.accountant_email then
    new.accountant_email_confirmed_at := null;
    new.accountant_confirm_token_hash := null;
  else
    new.accountant_email_confirmed_at := old.accountant_email_confirmed_at;
    new.accountant_confirm_token_hash := old.accountant_confirm_token_hash;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- E. Vue publique : sans user_id, comptes suspendus masqués
-- -----------------------------------------------------------------------------
drop view if exists public.artisan_public_profiles;
create view public.artisan_public_profiles
with (security_invoker = false)
as
select
  p.id,
  p.slug,
  p.name,
  p.business_name,
  p.description,
  p.logo_url,
  p.accent_color,
  p.sales_terms_text,
  p.trade_category,
  p.trade,
  p.city,
  p.phone,
  p.lead_matching_enabled,
  p.stripe_transfers_enabled
from public.profiles p
where p.deleted_at is null
  and coalesce(p.account_status, 'active') = 'active';

comment on view public.artisan_public_profiles is
  'Vitrine publique des artisans (anon + authenticated). Colonnes listées explicitement : ne jamais passer en select *.';

revoke all on public.artisan_public_profiles from public, anon, authenticated;
grant select on public.artisan_public_profiles to anon, authenticated;

-- -----------------------------------------------------------------------------
-- F. Limitation de débit des parcours publics (IP hachée, service role uniquement)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup_idx on public.rate_limit_events (bucket, key_hash, created_at desc);
create index if not exists rate_limit_events_created_idx on public.rate_limit_events (created_at);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- G. Messagerie : un participant n'écrit qu'en son nom et en message « user »
--    (les récapitulatifs de demande et messages invités sont posés par le serveur).
-- -----------------------------------------------------------------------------
drop policy if exists messages_insert_participants on public.messages;
create policy messages_insert_participants
  on public.messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and kind = 'user'
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          c.customer_user_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = c.artisan_id and p.user_id = auth.uid())
        )
    )
  );
