-- Géolocalisation des artisans + recherche par proximité.
-- Rejouable. À exécuter dans l'éditeur SQL Supabase.

-- 1) Coordonnées de l'adresse pro (renseignées via géocodage BAN à l'enregistrement)
alter table public.profiles
  add column if not exists latitude double precision;

alter table public.profiles
  add column if not exists longitude double precision;

-- Filtre partiel : seuls les profils géolocalisés sont indexés / cherchés.
create index if not exists profiles_geo_idx
  on public.profiles (latitude, longitude)
  where latitude is not null and longitude is not null;

-- 2) Recherche des artisans proches d'un point, pour un métier donné.
--    Distance par formule de haversine (rayon Terre 6371 km) — pas d'extension requise.
--    security definer : lecture publique volontaire (annuaire), colonnes non sensibles.
--    Le calcul de distance est fait dans une CTE pour pouvoir filtrer sur le rayon.
create or replace function public.search_artisans_nearby(
  p_lat double precision,
  p_lng double precision,
  p_trade text default null,
  p_radius_km double precision default 50,
  p_limit int default 50
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
      p.latitude,
      p.longitude,
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
      and (p_trade is null or p.trade = p_trade)
  )
  select *
  from candidats
  where distance_km <= greatest(1, p_radius_km)
  order by distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.search_artisans_nearby(double precision, double precision, text, double precision, int) to anon, authenticated;
