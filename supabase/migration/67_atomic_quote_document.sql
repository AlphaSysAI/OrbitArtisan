-- En-tête + lignes + envoi en une transaction, sous le rôle de l'artisan.
create or replace function public.save_quote_document(
  p_quote_id uuid, p_header jsonb, p_services jsonb, p_materials jsonb, p_send boolean
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  h public.quotes := jsonb_populate_record(null::public.quotes, p_header);
  v_id uuid;
begin
  if p_quote_id is null then
    insert into public.quotes (
      artisan_id, client_id, customer_name, customer_email, customer_user_id, conversation_id, notes, labor_rate_per_hour, labor_duration_minutes, labor_total, materials_total, grand_total, reduced_vat_rate, generate_vat_attestation, work_site_address, work_site_city, work_site_postal_code, retraction_waived, valid_until
    ) values (
      h.artisan_id, h.client_id, h.customer_name, h.customer_email, h.customer_user_id, h.conversation_id, h.notes, h.labor_rate_per_hour, h.labor_duration_minutes, h.labor_total, h.materials_total, h.grand_total, h.reduced_vat_rate, h.generate_vat_attestation, h.work_site_address, h.work_site_city, h.work_site_postal_code, h.retraction_waived, h.valid_until
    ) returning id into v_id;
  else
    -- Verrou pris avant tout changement de lignes ou transition.
    update public.quotes set
      customer_name = h.customer_name,
      customer_email = h.customer_email,
      customer_user_id = h.customer_user_id,
      conversation_id = h.conversation_id,
      notes = h.notes,
      labor_rate_per_hour = h.labor_rate_per_hour,
      labor_duration_minutes = h.labor_duration_minutes,
      labor_total = h.labor_total,
      materials_total = h.materials_total,
      grand_total = h.grand_total,
      reduced_vat_rate = h.reduced_vat_rate,
      generate_vat_attestation = h.generate_vat_attestation,
      work_site_address = h.work_site_address,
      work_site_city = h.work_site_city,
      work_site_postal_code = h.work_site_postal_code,
      retraction_waived = h.retraction_waived,
      valid_until = h.valid_until
    where id = p_quote_id and artisan_id = h.artisan_id and status = 'draft'
    returning id into v_id;
    if v_id is null then raise exception 'quote_not_editable'; end if;
    delete from public.quote_services where quote_id = v_id;
    delete from public.quote_materials where quote_id = v_id;
  end if;

  insert into public.quote_services (quote_id, service_id, service_title, duration_minutes, unit_price)
    select v_id, l.service_id, l.service_title, l.duration_minutes, l.unit_price
    from jsonb_populate_recordset(null::public.quote_services, p_services) l;
  insert into public.quote_materials (quote_id, label, quantity, unit_price, line_total, supplier_product_id, supplier_url, supplier_sku, is_supplier_catalog, exclude_from_invoice, vat_rate, unit)
    select v_id, l.label, l.quantity, l.unit_price, l.line_total, l.supplier_product_id, l.supplier_url, l.supplier_sku, l.is_supplier_catalog, l.exclude_from_invoice, l.vat_rate, l.unit
    from jsonb_populate_recordset(null::public.quote_materials, p_materials) l;

  if p_send then
    perform public.send_quote_document(v_id, h.artisan_id);
  end if;
  return v_id;
end
$$;

revoke all on function public.save_quote_document(uuid, jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_quote_document(uuid, jsonb, jsonb, jsonb, boolean) to authenticated;

-- Envoi séparé d'un brouillon existant, y compris des brouillons historiques.
create or replace function public.send_quote_document(p_quote_id uuid, p_artisan_id uuid, p_expected_updated_at timestamptz default null)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  q public.quotes;
  v_materials bigint;
begin
  select * into q from public.quotes
    where id = p_quote_id and artisan_id = p_artisan_id and status = 'draft'
      and (p_expected_updated_at is null or updated_at = p_expected_updated_at) for update;
  if not found then return null; end if;
  select coalesce(sum(line_total) filter (where not exclude_from_invoice), 0)
    into v_materials from public.quote_materials where quote_id = q.id;
  if q.grand_total <= 0 or q.grand_total <> q.labor_total + v_materials
    or (q.labor_total > 0 and not exists (select 1 from public.quote_services where quote_id = q.id)) then
    raise exception 'inconsistent_quote_total';
  end if;
  update public.quotes set status = 'sent', sent_at = now() where id = q.id;
  return q.id;
end
$$;
revoke all on function public.send_quote_document(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.send_quote_document(uuid, uuid, timestamptz) to authenticated;
