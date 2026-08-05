-- Nettoyage des conversations « fantômes » : celles créées par la simple consultation
-- d'une page vitrine, avant que la création ne soit conditionnée à un acte explicite.
--
-- ⚠️ NE PAS exécuter d'un bloc. Lancer l'étape 1, examiner le résultat,
--    puis seulement décommenter l'étape 3 si le contenu convient.

-- ---------------------------------------------------------------------------
-- Étape 1 — INSPECTION : que supprimerait-on ?
-- Une conversation est considérée fantôme si elle n'a AUCUN :
--   • message échangé,
--   • rendez-vous entre ce client et cet artisan,
--   • devis rattaché.
-- ---------------------------------------------------------------------------
select
  c.id,
  c.artisan_id,
  c.customer_user_id,
  c.created_at,
  cp.display_name,
  cp.email
from public.conversations c
left join public.customer_profiles cp on cp.user_id = c.customer_user_id
where not exists (
    select 1 from public.messages m
    where m.conversation_id = c.id
  )
  and not exists (
    select 1 from public.appointments a
    where a.artisan_id = c.artisan_id
      and a.customer_user_id = c.customer_user_id
  )
  and not exists (
    select 1 from public.quotes q
    where q.conversation_id = c.id
  )
order by c.created_at desc;

-- ---------------------------------------------------------------------------
-- Étape 2 — CONTRÔLE : combien de conversations sont conservées ?
-- ---------------------------------------------------------------------------
-- select count(*) as total, count(*) filter (
--   where exists (select 1 from public.messages m where m.conversation_id = conversations.id)
-- ) as avec_messages
-- from public.conversations;

-- ---------------------------------------------------------------------------
-- Étape 3 — SUPPRESSION (décommenter après validation de l'étape 1)
--
-- Rappel des effets de bord :
--   • messages.conversation_id est ON DELETE CASCADE — sans objet ici,
--     puisqu'on ne cible que des conversations sans aucun message.
--   • quotes.conversation_id est ON DELETE SET NULL — les conversations
--     porteuses d'un devis sont exclues ci-dessus pour ne pas rompre ce lien.
-- ---------------------------------------------------------------------------
-- delete from public.conversations c
-- where not exists (
--     select 1 from public.messages m
--     where m.conversation_id = c.id
--   )
--   and not exists (
--     select 1 from public.appointments a
--     where a.artisan_id = c.artisan_id
--       and a.customer_user_id = c.customer_user_id
--   )
--   and not exists (
--     select 1 from public.quotes q
--     where q.conversation_id = c.id
--   );
