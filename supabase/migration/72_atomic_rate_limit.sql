create or replace function public.consume_rate_limit(
  p_bucket text, p_key_hash text, p_max integer, p_window_seconds integer
) returns boolean
language plpgsql security invoker set search_path = public
as $$
begin
  if p_bucket is null or p_key_hash is null or p_max not between 1 and 1000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key_hash, 0));
  if (select count(*) from public.rate_limit_events where bucket = p_bucket and key_hash = p_key_hash
      and created_at >= now() - make_interval(secs => p_window_seconds)) >= p_max then
    return false;
  end if;
  insert into public.rate_limit_events(bucket, key_hash) values (p_bucket, p_key_hash);
  return true;
end
$$;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant select, insert, delete on public.rate_limit_events to service_role;
grant usage on sequence public.rate_limit_events_id_seq to service_role;
