-- Les brouillons débiteurs réservent le solde. Seuls les avoirs émis le libèrent.
create or replace function public.save_invoice_draft(
  p_header jsonb, p_lines jsonb, p_expected_invoiced integer
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  h public.invoices := jsonb_populate_record(null::public.invoices, p_header);
  q public.quotes;
  source public.invoices;
  v_id uuid;
  v_total bigint;
begin
  select * into q from public.quotes
  where id = h.quote_id and artisan_id = h.artisan_id and status = 'accepted' for update;
  if not found then raise exception 'quote_not_accepted'; end if;

  if h.grand_total is null or h.grand_total <= 0 then
    raise exception 'invalid_invoice_total';
  end if;

  if h.invoice_type = 'credit_note' then
    select * into source from public.invoices
    where id = h.credit_note_for_invoice_id and quote_id = q.id and artisan_id = q.artisan_id
      and finalized_at is not null and status in ('sent', 'overdue', 'paid') and invoice_type <> 'credit_note'
    for update;
    if not found or source.grand_total <> h.grand_total or exists (
      select 1 from public.invoices where credit_note_for_invoice_id = source.id and invoice_type = 'credit_note'
    ) then
      raise exception 'invalid_credit_note';
    end if;
  else
    if h.parent_invoice_id is not null then
      select * into source from public.invoices
      where id = h.parent_invoice_id and quote_id = q.id and artisan_id = q.artisan_id
        and finalized_at is not null and retention_released_at is null and retention_amount > 0
      for update;
      if not found or h.invoice_type <> 'final' or source.retention_amount <> h.grand_total or exists (
        select 1 from public.invoices where parent_invoice_id = source.id and invoice_type = 'final'
      ) then
        raise exception 'invalid_retention_release';
      end if;
    elsif exists (select 1 from public.invoices where quote_id = q.id and artisan_id = q.artisan_id
      and retention_amount > 0 and retention_released_at is null) then
      raise exception 'retention_not_released';
    end if;
    select coalesce(sum(case when invoice_type <> 'credit_note' then grand_total
      when finalized_at is not null then -grand_total else 0 end), 0)
    into v_total from public.invoices where quote_id = q.id and artisan_id = q.artisan_id;
    if v_total is distinct from p_expected_invoiced or v_total + h.grand_total > q.grand_total then
      raise exception 'invoice_total_changed';
    end if;
  end if;

  insert into public.invoices (
    artisan_id, quote_id, customer_user_id, customer_name, customer_email,
    invoice_type, progress_percentage, quote_reference_total, retention_rate, retention_amount,
    labor_total, materials_total, grand_total, notes, parent_invoice_id, credit_note_for_invoice_id,
    operation_type, vat_on_debits, vat_collection_nature, e_invoicing_status
  ) values (
    h.artisan_id, h.quote_id, h.customer_user_id, h.customer_name, h.customer_email,
    h.invoice_type, h.progress_percentage, h.quote_reference_total,
    coalesce(h.retention_rate, 0), coalesce(h.retention_amount, 0),
    h.labor_total, h.materials_total, h.grand_total, h.notes, h.parent_invoice_id, h.credit_note_for_invoice_id,
    h.operation_type, h.vat_on_debits, h.vat_collection_nature, h.e_invoicing_status
  ) returning id into v_id;

  if h.invoice_type = 'credit_note' then
    insert into public.invoice_lines (
      invoice_id, line_kind, label, quantity, unit_price, line_total, sort_order,
      vat_rate, vat_category_code, vat_exemption_reason, unit
    )
      select v_id, line_kind, label, quantity, unit_price, line_total, sort_order,
        vat_rate, vat_category_code, vat_exemption_reason, unit
      from public.invoice_lines where invoice_id = source.id;

    -- Un changement de régime entre facture et avoir ne doit pas modifier la TVA
    -- historique via le trigger de franchise. Le cas doit être vérifié manuellement.
    if exists (
      select line_total, vat_rate, vat_category_code, vat_exemption_reason from public.invoice_lines where invoice_id = source.id
      except all
      select line_total, vat_rate, vat_category_code, vat_exemption_reason from public.invoice_lines where invoice_id = v_id
    ) then
      raise exception 'credit_note_vat_changed';
    end if;
  else
    insert into public.invoice_lines (
      invoice_id, line_kind, label, quantity, unit_price, line_total, sort_order,
      vat_rate, vat_category_code, vat_exemption_reason, unit
    )
      select v_id, l.line_kind, l.label, l.quantity, l.unit_price, l.line_total, l.sort_order,
        l.vat_rate, l.vat_category_code, l.vat_exemption_reason, l.unit
      from jsonb_populate_recordset(null::public.invoice_lines, p_lines) l;
  end if;

  if h.grand_total is distinct from (select sum(line_total) from public.invoice_lines where invoice_id = v_id) then
    raise exception 'invoice_lines_total_mismatch';
  end if;
  return v_id;
end
$$;

revoke all on function public.save_invoice_draft(jsonb, jsonb, integer) from public, anon;
grant execute on function public.save_invoice_draft(jsonb, jsonb, integer) to authenticated;
