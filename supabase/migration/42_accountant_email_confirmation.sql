-- =============================================================================
-- 42_accountant_email_confirmation.sql — Double confirmation de l'e-mail du comptable
-- =============================================================================
-- Idempotent. Rien n'est envoyé à un comptable tant qu'il n'a pas confirmé, depuis
-- le lien reçu, accepter les envois de l'entreprise. Empêche d'utiliser Soline
-- (et l'adresse support@solinebtp.fr) pour adresser des fichiers à un tiers
-- non consentant.
-- Le jeton n'est jamais stocké en clair : seul son SHA-256 est conservé.

alter table public.profiles
  add column if not exists accountant_email_confirmed_at timestamptz,
  add column if not exists accountant_confirm_token_hash text,
  add column if not exists accountant_confirm_sent_at timestamptz;

create unique index if not exists profiles_accountant_confirm_token_hash_idx
  on public.profiles (accountant_confirm_token_hash)
  where accountant_confirm_token_hash is not null;

comment on column public.profiles.accountant_email_confirmed_at is
  'Date à laquelle le comptable a accepté les envois comptables. NULL = aucun envoi possible.';
comment on column public.profiles.accountant_confirm_token_hash is
  'SHA-256 (hex) du jeton de confirmation envoyé au comptable ; effacé une fois utilisé.';
comment on column public.profiles.accountant_confirm_sent_at is
  'Envoi du dernier lien de confirmation (anti-abus : 1 renvoi / 10 min, lien valable 14 jours).';

-- Les adresses déjà saisies n'ont jamais été confirmées : elles restent à NULL.
