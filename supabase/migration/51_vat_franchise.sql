-- 51 — Franchise en base de TVA (art. 293 B du CGI).
--
-- profiles.vat_regime = 'normal' | 'franchise'. En franchise, la base IMPOSE :
--   devis        : reduced_vat_rate = 0, pas d'attestation de TVA réduite ;
--   fournitures  : vat_rate = 0 ;
--   factures     : lignes à 0 %, catégorie E, motif « TVA non applicable, art. 293 B du CGI » ;
--   bibliothèque : default_vat_rate = 0.
-- Imposé par triggers : aucun écran, import ou action serveur ne peut produire
-- une TVA facturée par une entreprise en franchise (ni l'inverse : 0 % refusé
-- au régime normal). Seuls les documents encore modifiables sont concernés :
-- un devis envoyé ou une facture finalisée n'est jamais réécrit.

alter table public.profiles add column if not exists vat_regime text not null default 'normal';
alter table public.profiles drop constraint if exists profiles_vat_regime_check;
alter table public.profiles add constraint profiles_vat_regime_check check (vat_regime in ('normal', 'franchise'));

alter table public.quotes drop constraint if exists quotes_reduced_vat_rate_check;
alter table public.quotes add constraint quotes_reduced_vat_rate_check
  check (reduced_vat_rate is null or reduced_vat_rate in (0, 5.5, 10, 20));

alter table public.work_items drop constraint if exists work_items_vat_rate_valid;
alter table public.work_items add constraint work_items_vat_rate_valid check (default_vat_rate in (0, 5.5, 10, 20));

create or replace function public.artisan_vat_franchise(p_artisan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select vat_regime = 'franchise' from profiles where id = p_artisan_id), false);
$$;

revoke all on function public.artisan_vat_franchise(uuid) from public, anon, authenticated;

-- Devis ------------------------------------------------------------------------
create or replace function public.enforce_vat_regime_quote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return new; -- devis envoyé : figé
  end if;
  if public.artisan_vat_franchise(new.artisan_id) then
    new.reduced_vat_rate := 0;
    new.generate_vat_attestation := false;
  elsif new.reduced_vat_rate = 0 then
    raise exception 'vat_zero_requires_franchise';
  end if;
  return new;
end $$;

drop trigger if exists enforce_vat_regime_quote on public.quotes;
create trigger enforce_vat_regime_quote
before insert or update of reduced_vat_rate, generate_vat_attestation, status on public.quotes
for each row execute procedure public.enforce_vat_regime_quote();

create or replace function public.enforce_vat_regime_quote_material()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_artisan uuid; v_status text;
begin
  select artisan_id, status::text into v_artisan, v_status from quotes where id = new.quote_id;
  if v_status is distinct from 'draft' then return new; end if;
  if public.artisan_vat_franchise(v_artisan) then
    new.vat_rate := 0;
  elsif new.vat_rate = 0 then
    raise exception 'vat_zero_requires_franchise';
  end if;
  return new;
end $$;

drop trigger if exists enforce_vat_regime_quote_material on public.quote_materials;
create trigger enforce_vat_regime_quote_material
before insert or update of vat_rate on public.quote_materials
for each row execute procedure public.enforce_vat_regime_quote_material();

-- Factures ---------------------------------------------------------------------
create or replace function public.enforce_vat_regime_invoice_line()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_artisan uuid; v_finalized timestamptz;
begin
  select artisan_id, finalized_at into v_artisan, v_finalized from invoices where id = new.invoice_id;
  if v_finalized is not null then return new; end if; -- facture émise : figée
  if public.artisan_vat_franchise(v_artisan) then
    new.vat_rate := 0;
    new.vat_category_code := 'E';
    new.vat_exemption_reason := 'TVA non applicable, art. 293 B du CGI';
  elsif new.vat_category_code = 'E' and new.vat_exemption_reason = 'TVA non applicable, art. 293 B du CGI' then
    raise exception 'vat_franchise_line_on_normal_regime';
  end if;
  return new;
end $$;

drop trigger if exists enforce_vat_regime_invoice_line on public.invoice_lines;
create trigger enforce_vat_regime_invoice_line
before insert or update on public.invoice_lines
for each row execute procedure public.enforce_vat_regime_invoice_line();

-- Bibliothèque d'ouvrages ---------------------------------------------------------
create or replace function public.enforce_vat_regime_work_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_franchise boolean;
begin
  select vat_regime = 'franchise' into v_franchise from profiles where user_id = new.user_id limit 1;
  if coalesce(v_franchise, false) then
    new.default_vat_rate := 0;
  elsif new.default_vat_rate = 0 then
    new.default_vat_rate := 20;
  end if;
  return new;
end $$;

drop trigger if exists enforce_vat_regime_work_item on public.work_items;
create trigger enforce_vat_regime_work_item
before insert or update of default_vat_rate on public.work_items
for each row execute procedure public.enforce_vat_regime_work_item();

-- Changement de régime ---------------------------------------------------------------
-- Interdit si une facture a été émise ce mois-ci (cohérence de la période déclarative).
create or replace function public.guard_vat_regime_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vat_regime is distinct from old.vat_regime and exists (
    select 1 from invoices
    where artisan_id = new.id
      and finalized_at is not null
      and date_trunc('month', finalized_at at time zone 'Europe/Paris') = date_trunc('month', now() at time zone 'Europe/Paris')
  ) then
    raise exception 'vat_regime_locked_this_month';
  end if;
  return new;
end $$;

drop trigger if exists guard_vat_regime_change on public.profiles;
create trigger guard_vat_regime_change
before update of vat_regime on public.profiles
for each row execute procedure public.guard_vat_regime_change();

-- Après changement : brouillons et bibliothèque repassent au nouveau régime
-- (franchise → 0 % ; retour au régime normal → 20 %, à ajuster par l'artisan).
create or replace function public.apply_vat_regime_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric := case when new.vat_regime = 'franchise' then 0 else 20 end;
begin
  if new.vat_regime is not distinct from old.vat_regime then return new; end if;
  update quotes set reduced_vat_rate = v_rate where artisan_id = new.id and status = 'draft';
  update quote_materials qm set vat_rate = v_rate
  from quotes q where q.id = qm.quote_id and q.artisan_id = new.id and q.status = 'draft';
  update work_items set default_vat_rate = v_rate where user_id = new.user_id;
  update invoice_lines il set
    vat_rate = case when new.vat_regime = 'franchise' then 0 else 20 end,
    vat_category_code = case when new.vat_regime = 'franchise' then 'E' else 'S' end,
    vat_exemption_reason = case when new.vat_regime = 'franchise' then 'TVA non applicable, art. 293 B du CGI' else null end
  from invoices i where i.id = il.invoice_id and i.artisan_id = new.id and i.finalized_at is null;
  return new;
end $$;

drop trigger if exists apply_vat_regime_change on public.profiles;
create trigger apply_vat_regime_change
after update of vat_regime on public.profiles
for each row execute procedure public.apply_vat_regime_change();
