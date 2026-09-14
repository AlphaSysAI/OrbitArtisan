-- Widget artisan : mise en relation directe sans géolocalisation du prospect.

create or replace function public.match_lead_to_origin_artisan(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_origin record;
  v_out jsonb := '[]'::jsonb;
begin
  v_lead := public.lead_by_token(p_token);
  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;

  if v_lead.origin_artisan_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_origin_artisan');
  end if;

  if exists (select 1 from public.lead_matches where lead_id = v_lead.id) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'artisan_id', m.artisan_id,
          'business_name', p.business_name,
          'slug', p.slug,
          'distance_km', m.distance_km,
          'rank', m.rank
        )
        order by m.rank
      ),
      '[]'::jsonb
    )
    into v_out
    from public.lead_matches m
    join public.profiles p on p.id = m.artisan_id
    where m.lead_id = v_lead.id;

    return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'matches', v_out);
  end if;

  select p.id, p.business_name, p.slug
  into v_origin
  from public.profiles p
  where p.id = v_lead.origin_artisan_id
    and p.lead_matching_enabled;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'origin_artisan_unavailable');
  end if;

  insert into public.lead_matches (lead_id, artisan_id, distance_km, rank)
  values (v_lead.id, v_origin.id, null, 1)
  on conflict do nothing;

  update public.leads set status = 'matched' where id = v_lead.id;

  v_out := jsonb_build_array(
    jsonb_build_object(
      'artisan_id', v_origin.id,
      'business_name', v_origin.business_name,
      'slug', v_origin.slug,
      'distance_km', null,
      'rank', 1
    )
  );

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'matches', v_out);
end;
$$;

grant execute on function public.match_lead_to_origin_artisan(text) to anon, authenticated;
