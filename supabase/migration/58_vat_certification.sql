-- 58 — Certification TVA à taux réduit (remplace l'attestation Cerfa depuis le 01/03/2025).
--
-- Le client certifie les conditions du taux réduit sur le devis lui-même. Horodatage
-- de cette certification, distinct de l'acceptation : un accord oral enregistré par
-- l'artisan accepte le devis SANS certifier (la certification devra figurer sur la facture).
-- Rejouable. À appliquer après 57.

alter table public.quotes
  add column if not exists vat_certified_at timestamptz;

comment on column public.quotes.vat_certified_at is
  'Certification client des conditions du taux réduit de TVA (art. 279-0 bis / 278-0 bis A CGI), validée à l''acceptation. Null = non certifiée.';

comment on column public.quotes.generate_vat_attestation is
  'Obsolète depuis le 01/03/2025 (attestation remplacée par la certification sur devis/facture). Conservé pour l''historique.';

-- Seul le serveur (service role) pose la certification, au moment de l'acceptation.
-- Un artisan ne peut ni la créer ni la modifier par l'API (preuve opposable au client).
create or replace function public.guard_quote_vat_certification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' and new.vat_certified_at is not null then
    raise exception 'quote_vat_certification_server_only' using errcode = '42501';
  end if;
  -- Exception : devis papier signé enregistré par l'artisan (le PDF imprimé porte la
  -- certification) — uniquement lors du passage envoyé → accepté, à la date de signature.
  if tg_op = 'UPDATE' and new.vat_certified_at is distinct from old.vat_certified_at
     and not (
       old.vat_certified_at is null
       and old.status = 'sent' and new.status = 'accepted'
       and new.response_channel = 'artisan_paper'
       and new.vat_certified_at = new.signed_at
     ) then
    raise exception 'quote_vat_certification_server_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_quote_vat_certification on public.quotes;
create trigger guard_quote_vat_certification
before insert or update on public.quotes
for each row execute procedure public.guard_quote_vat_certification();
