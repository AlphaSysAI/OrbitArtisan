-- Une réservation reste liée à la facture en cas de nouvel essai.
alter table public.invoices add column if not exists reserved_invoice_number text;
alter table public.invoices add column if not exists issued_pdf_base64 text;
alter table public.e_reporting_queue add column if not exists provider_submission_id text;

create or replace function public.reserve_invoice_number(p_invoice_id uuid, p_claim timestamptz)
returns text
language plpgsql security invoker set search_path = public
as $$
declare
  v_number text;
begin
  select reserved_invoice_number into v_number from public.invoices
  where id = p_invoice_id and status = 'draft' and finalized_at is null and finalizing_at = p_claim
  for update;
  if not found then raise exception 'invoice_claim_lost'; end if;
  if v_number is null then
    v_number := public.allocate_invoice_number(p_invoice_id);
    update public.invoices set reserved_invoice_number = v_number where id = p_invoice_id;
  end if;
  return v_number;
end
$$;
revoke all on function public.reserve_invoice_number(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_invoice_number(uuid, timestamptz) to service_role;

create or replace function public.issue_b2c_invoice(
  p_invoice_id uuid, p_claim timestamptz, p_number text,
  p_issued_at timestamptz, p_due_date date, p_pdf text, p_payload jsonb, p_period date
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_artisan uuid;
  v_queue_id uuid;
  v_retention_source uuid;
begin
  if nullif(p_pdf, '') is null or octet_length(p_pdf) > 8000000 then
    raise exception 'invoice_pdf_invalid';
  end if;
  update public.invoices set status = 'sent', finalized_at = p_issued_at,
    finalizing_at = null, invoice_number = p_number, due_date = p_due_date,
    emission_flow = 'e_reporting', issued_pdf_base64 = p_pdf
  where id = p_invoice_id and status = 'draft' and finalized_at is null
    and finalizing_at = p_claim and reserved_invoice_number = p_number
  returning artisan_id, case when invoice_type = 'final' then parent_invoice_id end into v_artisan, v_retention_source;
  if not found then raise exception 'invoice_claim_lost'; end if;
  insert into public.e_reporting_queue (invoice_id, artisan_id, status, payload, reporting_period)
    values (p_invoice_id, v_artisan, 'pending', p_payload, p_period)
    returning id into v_queue_id;
  if v_retention_source is not null then
    update public.invoices set retention_released_at = p_issued_at
      where id = v_retention_source and artisan_id = v_artisan and retention_released_at is null;
    if not found then raise exception 'invalid_retention_release'; end if;
  end if;
  return v_queue_id;
end
$$;
revoke all on function public.issue_b2c_invoice(uuid, timestamptz, text, timestamptz, date, text, jsonb, date) from public, anon, authenticated;
grant execute on function public.issue_b2c_invoice(uuid, timestamptz, text, timestamptz, date, text, jsonb, date) to service_role;

create or replace function public.guard_issued_invoice_pdf()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
    (tg_op = 'INSERT' and (new.issued_pdf_base64 is not null or new.reserved_invoice_number is not null)) or
    (tg_op = 'UPDATE' and (new.issued_pdf_base64 is distinct from old.issued_pdf_base64
      or new.reserved_invoice_number is distinct from old.reserved_invoice_number))
  ) then
    raise exception 'invoice_issued_immutable' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists guard_issued_invoice_pdf on public.invoices;
create trigger guard_issued_invoice_pdf before insert or update on public.invoices
  for each row execute function public.guard_issued_invoice_pdf();

-- Une correction de ligne ne doit pas s'intercaler entre la génération du PDF
-- et sa persistance. Le verrou sérialise aussi l'arrivée du claim.
create or replace function public.guard_invoice_lines_during_issue()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice public.invoices;
begin
  if current_user in ('anon', 'authenticated') then
    for v_invoice in
      select i.* from public.invoices i
      where i.id in (case when tg_op <> 'INSERT' then old.invoice_id end,
        case when tg_op <> 'DELETE' then new.invoice_id end)
      order by i.id for update
    loop
      if v_invoice.finalized_at is not null or v_invoice.finalizing_at >= now() - interval '2 minutes' then
        raise exception 'invoice_lines_locked' using errcode = '42501';
      end if;
    end loop;
  end if;
  return coalesce(new, old);
end
$$;
drop trigger if exists guard_invoice_lines_during_issue on public.invoice_lines;
create trigger guard_invoice_lines_during_issue before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_invoice_lines_during_issue();
