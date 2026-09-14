-- Désactivation de l'accès public aux devis (consultation / signature sans compte).
-- Les clients passent par /mes-devis (authentifié) et le PDF en messagerie.

create or replace function public.quote_by_public_token(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select null::jsonb;
$$;

create or replace function public.public_accept_quote(p_token text, p_signer_name text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', false, 'error', 'disabled');
$$;

revoke all on function public.quote_by_public_token(text) from public;
revoke all on function public.public_accept_quote(text, text) from public;

comment on function public.quote_by_public_token(text) is
  'Désactivé — accès devis public retiré ; utiliser l''espace client authentifié.';
comment on function public.public_accept_quote(text, text) is
  'Désactivé — signature devis via client_accept_quote (compte client requis).';
