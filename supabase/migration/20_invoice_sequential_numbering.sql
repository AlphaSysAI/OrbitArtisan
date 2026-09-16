-- =============================================================================
-- 20_invoice_sequential_numbering.sql
-- Point 4 (audit pré-pilote, Vague 2) : numérotation légale séquentielle des
-- factures, allouée à la finalisation (jamais à la création du brouillon).
--
-- Choix : une série par (artisan, invoice_type, année civile) plutôt qu'une
-- série unique tous types confondus. Les préfixes de série (ACO/SIT/SOL/AVO/
-- INV) existent déjà côté application (invoice-types.ts) et sont conservés
-- ici pour rester cohérents avec l'historique/l'UI. Le droit fiscal français
-- (BOI-TVA-DECLA-30-20-20) autorise plusieurs séries chronologiques
-- distinctes tant que chacune est identifiable et continue en son sein — ce
-- qui est le cas ici. À faire confirmer par l'expert-comptable avant mise en
-- production, comme convenu (facturation gelée jusqu'à validation).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Compteur atomique par (artisan, type de facture, année)
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_number_counters (
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  invoice_type text not null,
  year integer not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (artisan_id, invoice_type, year)
);

comment on table public.invoice_number_counters is
  'Point 4 audit pré-pilote : compteur séquentiel par artisan/type/année. Ne jamais écrire directement — passer par allocate_invoice_number().';

alter table public.invoice_number_counters enable row level security;

drop policy if exists invoice_number_counters_select_own on public.invoice_number_counters;
create policy invoice_number_counters_select_own on public.invoice_number_counters
  for select
  using (artisan_id in (select id from public.profiles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Claim anti double-submit à la finalisation (distinct de finalized_at)
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists finalizing_at timestamptz;

comment on column public.invoices.finalizing_at is
  'Point 4 audit pré-pilote : horodatage de claim pendant finalize() — anti double-submit. Distinct de finalized_at (succès définitif). Une fenêtre de 2 min (voir invoice-service.ts) rend le claim à nouveau éligible en cas de blocage.';

-- ---------------------------------------------------------------------------
-- Numéro non dupliqué par artisan. Les brouillons ont invoice_number NULL —
-- Postgres autorise plusieurs NULL sous une contrainte UNIQUE, donc aucun
-- impact sur les brouillons existants ou à venir.
-- ---------------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_artisan_invoice_number_unique;
alter table public.invoices
  add constraint invoices_artisan_invoice_number_unique unique (artisan_id, invoice_number);

-- ---------------------------------------------------------------------------
-- Allocation atomique du prochain numéro de série.
-- SECURITY DEFINER : nécessaire pour l'upsert du compteur (hors RLS), mais
-- vérifie explicitement la propriété de la facture par l'appelant (ou
-- service_role pour les tâches serveur), comme les autres RPC du projet.
-- ---------------------------------------------------------------------------
create or replace function public.allocate_invoice_number(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artisan_id uuid;
  v_invoice_type text;
  v_prefix text;
  v_year integer := extract(year from now())::integer;
  v_seq integer;
  v_number text;
  v_caller_profile_id uuid;
begin
  select artisan_id, coalesce(invoice_type, 'standard')
    into v_artisan_id, v_invoice_type
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_artisan_id is null then
    raise exception 'invoice_not_found';
  end if;

  if auth.role() <> 'service_role' then
    select id into v_caller_profile_id from public.profiles where user_id = auth.uid();
    if v_caller_profile_id is null or v_caller_profile_id <> v_artisan_id then
      raise exception 'not_authorized';
    end if;
  end if;

  v_prefix := case v_invoice_type
    when 'deposit' then 'ACO'
    when 'progress' then 'SIT'
    when 'final' then 'SOL'
    when 'credit_note' then 'AVO'
    else 'INV'
  end;

  insert into public.invoice_number_counters (artisan_id, invoice_type, year, last_number)
  values (v_artisan_id, v_invoice_type, v_year, 1)
  on conflict (artisan_id, invoice_type, year)
  do update set last_number = invoice_number_counters.last_number + 1, updated_at = now()
  returning last_number into v_seq;

  v_number := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
  return v_number;
end;
$$;

comment on function public.allocate_invoice_number(uuid) is
  'Point 4 audit pré-pilote : alloue un numéro de facture séquentiel et gapless par (artisan, type, année). À appeler UNIQUEMENT depuis InvoiceService.finalize(), jamais à la création du brouillon.';

grant execute on function public.allocate_invoice_number(uuid) to authenticated, service_role;
