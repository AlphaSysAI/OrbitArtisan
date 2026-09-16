-- Numérotation séquentielle des devis par artisan et année civile.

create table if not exists public.quote_number_counters (
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (artisan_id, year)
);

comment on table public.quote_number_counters is
  'Compteur séquentiel de devis par artisan/année — passer par allocate_quote_number().';

alter table public.quote_number_counters enable row level security;

drop policy if exists quote_number_counters_select_own on public.quote_number_counters;
create policy quote_number_counters_select_own on public.quote_number_counters
  for select
  using (artisan_id in (select id from public.profiles where user_id = auth.uid()));

alter table public.quotes
  add column if not exists quote_number text;

alter table public.quotes drop constraint if exists quotes_artisan_quote_number_unique;
alter table public.quotes
  add constraint quotes_artisan_quote_number_unique unique (artisan_id, quote_number);

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
begin
  select artisan_id, quote_number, extract(year from created_at at time zone 'UTC')::integer
  into v_artisan_id, v_existing, v_year
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote_not_found';
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

comment on function public.allocate_quote_number(uuid) is
  'Attribue un numéro DEV-AAAA-NNNN au devis (idempotent si déjà attribué).';

grant execute on function public.allocate_quote_number(uuid) to authenticated, service_role;
