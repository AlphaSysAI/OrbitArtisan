-- =============================================================================
-- 24_quote_valid_until.sql
-- =============================================================================
--
-- La date de validité du devis (3 mois, imprimée sur le PDF) n'était jamais
-- stockée : elle était recalculée à la volée depuis created_at à chaque
-- génération de PDF, et surtout jamais vérifiée à l'acceptation client
-- (client_accept_quote acceptait un devis "sent" quelle que soit son
-- ancienneté). Un client pouvait donc signer un devis dont les prix
-- (matériaux notamment) étaient caducs depuis longtemps.
--
-- On fige la date à la création du devis (colonne dédiée, pas un recalcul),
-- pour garantir que la date imprimée sur le PDF envoyé au client est
-- exactement celle que la RPC d'acceptation vérifie ensuite — aucun risque
-- de dérive entre les deux si la formule de calcul change un jour.
--
-- Idempotent, non destructif.

alter table public.quotes
  add column if not exists valid_until date;

-- Backfill des devis existants avec la même règle que l'ancien calcul PDF
-- (created_at + 3 mois), pour ne pas rendre "expirés" des devis déjà envoyés
-- sur cette seule base rétroactive.
update public.quotes
set valid_until = (created_at + interval '3 months')::date
where valid_until is null;

comment on column public.quotes.valid_until is
  'Date de fin de validité du devis (figée à la création, 3 mois par défaut) — vérifiée par client_accept_quote, imprimée sur le PDF.';

-- Un client ne doit plus pouvoir signer un devis expiré.
create or replace function public.client_accept_quote(p_quote_id uuid, p_signer_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    raise exception 'invalid_signer';
  end if;

  update public.quotes
  set
    status = 'accepted',
    signed_at = now(),
    signed_by_name = trim(p_signer_name),
    rejected_at = null,
    updated_at = now()
  where id = p_quote_id
    and customer_user_id = auth.uid()
    and status = 'sent'
    and (valid_until is null or valid_until >= current_date);

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_acceptable';
  end if;
end;
$$;
