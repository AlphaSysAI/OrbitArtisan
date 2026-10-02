-- 57 — Demandes multi-corps d'état (widget public /estimation).
--
-- Une demande de particulier peut nécessiter plusieurs métiers (maison neuve :
-- maçon, couvreur, plombier…). L'IA propose les lots, le client les valide, puis
-- jusqu'à 3 artisans sont retenus PAR lot. Chaque artisan ne reçoit que son lot.
--
-- leads.lots vide = demande mono-métier historique (trade_category / trade du lead).
-- Rejouable. À appliquer après 56.

-- ---------------------------------------------------------------------------
-- 1. Lots validés par le client : [{ "trade_category", "trade", "summary" }, …]
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists lots jsonb not null default '[]'::jsonb;

alter table public.leads drop constraint if exists leads_lots_shape;
alter table public.leads
  add constraint leads_lots_shape
  check (jsonb_typeof(lots) = 'array' and jsonb_array_length(lots) <= 8);

-- ---------------------------------------------------------------------------
-- 2. Lot de chaque mise en relation ; le rang (1 à 3) devient propre au lot.
-- ---------------------------------------------------------------------------
alter table public.lead_matches
  add column if not exists lot_index smallint not null default 0,
  add column if not exists trade_category text,
  add column if not exists trade text;

alter table public.lead_matches drop constraint if exists lead_matches_lot_index_range;
alter table public.lead_matches
  add constraint lead_matches_lot_index_range check (lot_index between 0 and 7);

alter table public.lead_matches drop constraint if exists lead_matches_unique_rank;
alter table public.lead_matches drop constraint if exists lead_matches_unique_lot_rank;
alter table public.lead_matches
  add constraint lead_matches_unique_lot_rank unique (lead_id, lot_index, rank);

-- Historique : le lot des mises en relation existantes est celui du lead.
update public.lead_matches m
set trade_category = l.trade_category, trade = l.trade
from public.leads l
where l.id = m.lead_id and m.trade_category is null;

-- ---------------------------------------------------------------------------
-- 3. Mise en relation par lot (même signature : aucun appelant à changer).
-- ---------------------------------------------------------------------------
create or replace function public.match_lead_to_artisans(
  p_token text,
  p_radius_km double precision default 30,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_limit integer;
  v_radius double precision;
  v_lots jsonb;
  v_lot jsonb;
  v_lot_index integer;
  v_lot_category text;
  v_lot_trade text;
  v_rank smallint;
  v_total integer := 0;
  v_row record;
  v_origin record;
  v_origin_lot integer;
  v_out jsonb := '[]'::jsonb;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;
  if v_lead.latitude is null or v_lead.longitude is null then
    return jsonb_build_object('ok', false, 'error', 'missing_location');
  end if;

  -- Jamais plus de 3 artisans par lot : pas de logique d'enchères.
  v_limit := greatest(1, least(coalesce(p_limit, 3), 3));
  v_radius := greatest(1, coalesce(p_radius_km, 30));

  -- Idempotent : sélection déjà figée → renvoyée telle quelle.
  if exists (select 1 from public.lead_matches where lead_id = v_lead.id) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'artisan_id', m.artisan_id,
          'business_name', p.business_name,
          'slug', p.slug,
          'distance_km', m.distance_km,
          'rank', m.rank,
          'lot_index', m.lot_index,
          'trade_category', m.trade_category,
          'trade', m.trade
        )
        order by m.lot_index, m.rank
      ),
      '[]'::jsonb
    )
    into v_out
    from public.lead_matches m
    join public.profiles p on p.id = m.artisan_id
    where m.lead_id = v_lead.id;

    return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'matches', v_out);
  end if;

  v_lots := case
    when jsonb_typeof(v_lead.lots) = 'array' and jsonb_array_length(v_lead.lots) > 0 then v_lead.lots
    else jsonb_build_array(jsonb_build_object('trade_category', v_lead.trade_category, 'trade', v_lead.trade))
  end;

  -- Widget ou QR code d'un artisan : son prospect, il passe devant dans le lot de son
  -- métier (à défaut le premier). Tolérance de distance doublée, pas illimitée.
  if v_lead.origin_artisan_id is not null then
    select
      p.id, p.business_name, p.slug, p.trade_category, p.trade,
      6371 * acos(
        least(1.0,
          cos(radians(v_lead.latitude)) * cos(radians(p.latitude))
          * cos(radians(p.longitude) - radians(v_lead.longitude))
          + sin(radians(v_lead.latitude)) * sin(radians(p.latitude))
        )
      ) as distance_km
    into v_origin
    from public.profiles p
    where p.id = v_lead.origin_artisan_id
      and p.lead_matching_enabled
      and p.latitude is not null
      and p.longitude is not null;

    if found and v_origin.distance_km <= v_radius * 2 then
      select coalesce(min(e.idx - 1), 0)::integer into v_origin_lot
      from jsonb_array_elements(v_lots) with ordinality as e(lot, idx)
      where e.lot->>'trade_category' = v_origin.trade_category;

      insert into public.lead_matches (lead_id, artisan_id, distance_km, rank, lot_index, trade_category, trade)
      values (
        v_lead.id, v_origin.id, round(v_origin.distance_km::numeric, 2), 1, v_origin_lot,
        v_lots->v_origin_lot->>'trade_category', v_lots->v_origin_lot->>'trade'
      )
      on conflict do nothing;
    end if;
  end if;

  for v_lot, v_lot_index in
    select e.lot, (e.idx - 1)::integer
    from jsonb_array_elements(v_lots) with ordinality as e(lot, idx)
  loop
    v_lot_category := nullif(v_lot->>'trade_category', '');
    v_lot_trade := nullif(v_lot->>'trade', '');
    select coalesce(max(m.rank), 0) into v_rank
    from public.lead_matches m
    where m.lead_id = v_lead.id and m.lot_index = v_lot_index;

    for v_row in
      select *
      from (
        select
          p.id,
          -- Le métier exact passe devant, la même catégorie sert de repli.
          case when v_lot_trade is not null and p.trade = v_lot_trade then 0 else 1 end as trade_rank,
          6371 * acos(
            least(1.0,
              cos(radians(v_lead.latitude)) * cos(radians(p.latitude))
              * cos(radians(p.longitude) - radians(v_lead.longitude))
              + sin(radians(v_lead.latitude)) * sin(radians(p.latitude))
            )
          ) as distance_km
        from public.profiles p
        where p.lead_matching_enabled
          and p.latitude is not null
          and p.longitude is not null
          -- Un artisan n'est retenu qu'une fois par demande, sur un seul lot.
          and not exists (select 1 from public.lead_matches x where x.lead_id = v_lead.id and x.artisan_id = p.id)
          and (
            (v_lot_category is null and v_lot_trade is null)
            or p.trade = v_lot_trade
            or (v_lot_category is not null and p.trade_category = v_lot_category)
          )
      ) candidats
      where candidats.distance_km <= v_radius
      order by candidats.trade_rank asc, candidats.distance_km asc
      limit greatest(0, v_limit - v_rank)
    loop
      v_rank := v_rank + 1;
      insert into public.lead_matches (lead_id, artisan_id, distance_km, rank, lot_index, trade_category, trade)
      values (v_lead.id, v_row.id, round(v_row.distance_km::numeric, 2), v_rank, v_lot_index, v_lot_category, v_lot_trade)
      on conflict do nothing;
    end loop;
  end loop;

  select count(*) into v_total from public.lead_matches where lead_id = v_lead.id;
  if v_total = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_artisan_nearby');
  end if;

  update public.leads set status = 'matched' where id = v_lead.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'artisan_id', m.artisan_id,
        'business_name', p.business_name,
        'slug', p.slug,
        'distance_km', m.distance_km,
        'rank', m.rank,
        'lot_index', m.lot_index,
        'trade_category', m.trade_category,
        'trade', m.trade
      )
      order by m.lot_index, m.rank
    ),
    '[]'::jsonb
  )
  into v_out
  from public.lead_matches m
  join public.profiles p on p.id = m.artisan_id
  where m.lead_id = v_lead.id;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'matches', v_out);
end;
$$;

-- Appelée uniquement côté serveur (service role) depuis la migration 55.
revoke all on function public.match_lead_to_artisans(text, double precision, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Conciergerie : candidats prospects pour un lot donné (métier explicite).
-- ---------------------------------------------------------------------------
drop function if exists public.concierge_prospect_candidates(uuid, double precision, integer);
drop function if exists public.concierge_prospect_candidates(uuid, double precision, integer, text, text);

create function public.concierge_prospect_candidates(
  p_lead_id uuid,
  p_radius_km double precision,
  p_limit integer,
  p_trade_category text default null,
  p_trade text default null
)
returns table (id uuid, business_name text, phone text, city text, postal_code text, trade text, distance_km double precision)
language sql
stable
security definer
set search_path = public
as $$
  with l as (
    select latitude, longitude,
      coalesce(p_trade_category, trade_category) as trade_category,
      case when p_trade_category is null then trade else p_trade end as trade
    from leads
    where id = p_lead_id and latitude is not null and longitude is not null
  )
  select c.id, c.business_name, c.phone, c.city, c.postal_code, c.trade, round(c.distance_km::numeric, 1)::double precision
  from (
    select p.*,
      case when l.trade is not null and p.trade = l.trade then 0 else 1 end as trade_rank,
      6371 * acos(least(1.0,
        cos(radians(l.latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(l.longitude))
        + sin(radians(l.latitude)) * sin(radians(p.latitude)))) as distance_km
    from prospect_artisans p, l
    where not p.opt_out
      and p.status in ('new', 'contacted')
      and p.latitude is not null and p.longitude is not null
      and (l.trade is null or p.trade = l.trade or (l.trade_category is not null and p.trade_category = l.trade_category))
      and not exists (
        select 1 from profiles pr where public.normalize_client_phone(pr.phone) = p.phone
      )
  ) c
  where c.distance_km <= p_radius_km
  order by c.trade_rank, c.distance_km, c.contact_count
  limit greatest(0, least(p_limit, 3));
$$;
revoke all on function public.concierge_prospect_candidates(uuid, double precision, integer, text, text) from public, anon, authenticated;
