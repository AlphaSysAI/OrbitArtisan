-- =============================================================================
-- 65_admin_user_lookup.sql — E-mails des comptes pour l'admin (service role uniquement)
-- =============================================================================
-- Rejouable. Les e-mails vivent dans auth.users : l'admin les lisait un par un
-- (auth.admin.getUserById par ligne) et ne pouvait pas chercher un artisan par e-mail.

create or replace function public.admin_user_emails(p_user_ids uuid[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = any (p_user_ids);
$$;

-- Recherche partielle (« dupont@ », « gmail ») : caractères spéciaux de LIKE neutralisés.
create or replace function public.admin_search_user_ids_by_email(p_query text)
returns setof uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.id
  from auth.users u
  where char_length(btrim(coalesce(p_query, ''))) >= 3
    and u.email ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  limit 200;
$$;

revoke all on function public.admin_user_emails(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_search_user_ids_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_user_emails(uuid[]) to service_role;
grant execute on function public.admin_search_user_ids_by_email(text) to service_role;
