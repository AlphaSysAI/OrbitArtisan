-- Migration : copier client_invitations → platform_invitations
-- Exécuter APRÈS platform_invitations.sql si l’ancienne table existe.
--
-- ⚠️ N'EXÉCUTER QUE SI la table public.client_invitations existe réellement.
--    Le `where exists (... information_schema ...)` plus bas NE protège PAS :
--    le `from public.client_invitations` échoue dès l'analyse de la requête
--    (ERROR 42P01), avant que la clause WHERE ne soit évaluée.
--    Vérifier d'abord avec _diagnostic.sql.

insert into public.platform_invitations (
  inviter_user_id,
  artisan_id,
  email,
  invited_name,
  account_type,
  token,
  status,
  accepted_at,
  accepted_user_id,
  created_at,
  expires_at
)
select
  coalesce(
    (select p.user_id from public.profiles p where p.id = ci.artisan_id limit 1),
    ci.accepted_user_id
  ),
  ci.artisan_id,
  ci.email,
  ci.invited_name,
  'client'::public.platform_account_type,
  ci.token,
  ci.status::text::public.platform_invitation_status,
  ci.accepted_at,
  ci.accepted_user_id,
  ci.created_at,
  ci.expires_at
from public.client_invitations ci
where exists (select 1 from information_schema.tables where table_name = 'client_invitations')
  and not exists (
    select 1 from public.platform_invitations pi where pi.token = ci.token
  );
