-- 56 — Conciergerie : e-mail professionnel du prospect (canal de repli des lignes fixes).
--
-- Usage unique : envoyer le lien d'inscription APRÈS un appel « Intéressé » quand le
-- numéro est un fixe (SMS impossible). Jamais d'envoi groupé ni d'autre usage.
-- Seuls les e-mails vérifiés « RECEIVING » par l'extracteur sont importés.
-- Désinscription (RGPD) : l'e-mail est effacé en même temps que le reste.

alter table public.prospect_artisans
  add column if not exists email text;

alter table public.prospect_artisans drop constraint if exists prospect_artisans_email_format;
alter table public.prospect_artisans
  add constraint prospect_artisans_email_format
  check (email is null or (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'));

alter table public.prospect_artisans drop constraint if exists prospect_artisans_opt_out_no_email;
alter table public.prospect_artisans
  add constraint prospect_artisans_opt_out_no_email
  check (not opt_out or email is null);

comment on column public.prospect_artisans.email is
  'E-mail pro vérifié, utilisé uniquement pour le lien d''inscription post-appel quand le numéro est fixe. Effacé à la désinscription.';
