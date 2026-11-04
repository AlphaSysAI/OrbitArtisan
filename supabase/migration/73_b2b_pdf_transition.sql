-- Période transitoire B2B (jusqu'au 31/08/2027) : une facture à un client
-- professionnel est émise en PDF classique archivé, sans transmission à une
-- Plateforme Agréée ni entrée e-reporting (le B2B domestique relève de
-- l'e-invoicing, pas de l'e-reporting).
alter type public.invoice_emission_flow add value if not exists 'pdf_transition';

create or replace function public.issue_pdf_invoice(
  p_invoice_id uuid, p_claim timestamptz, p_number text,
  p_issued_at timestamptz, p_due_date date, p_pdf text
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_artisan uuid;
  v_retention_source uuid;
begin
  if nullif(p_pdf, '') is null or octet_length(p_pdf) > 8000000 then
    raise exception 'invoice_pdf_invalid';
  end if;
  update public.invoices set status = 'sent', finalized_at = p_issued_at,
    finalizing_at = null, invoice_number = p_number, due_date = p_due_date,
    emission_flow = 'pdf_transition', issued_pdf_base64 = p_pdf
  where id = p_invoice_id and status = 'draft' and finalized_at is null
    and finalizing_at = p_claim and reserved_invoice_number = p_number
  returning artisan_id, case when invoice_type = 'final' then parent_invoice_id end into v_artisan, v_retention_source;
  if not found then raise exception 'invoice_claim_lost'; end if;
  if v_retention_source is not null then
    update public.invoices set retention_released_at = p_issued_at
      where id = v_retention_source and artisan_id = v_artisan and retention_released_at is null;
    if not found then raise exception 'invalid_retention_release'; end if;
  end if;
  return p_invoice_id;
end
$$;
revoke all on function public.issue_pdf_invoice(uuid, timestamptz, text, timestamptz, date, text) from public, anon, authenticated;
grant execute on function public.issue_pdf_invoice(uuid, timestamptz, text, timestamptz, date, text) to service_role;
