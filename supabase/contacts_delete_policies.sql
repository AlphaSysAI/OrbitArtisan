-- Suppression d'un contact client par l'artisan.
-- Sans ces policies, un DELETE depuis le client utilisateur n'affecte AUCUNE ligne
-- (RLS bloque en silence, sans lever d'erreur) : la suppression semblerait réussir.
-- À exécuter dans l'éditeur SQL Supabase.

-- 1) L'artisan peut supprimer une conversation de son activité.
--    Les messages sont supprimés en cascade (messages.conversation_id ON DELETE CASCADE).
drop policy if exists "conversations_delete_artisan" on public.conversations;
create policy "conversations_delete_artisan"
on public.conversations
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = conversations.artisan_id
      and p.user_id = auth.uid()
  )
);

-- 2) L'artisan peut supprimer les rendez-vous de son activité.
drop policy if exists "appointments_owner_delete" on public.appointments;
create policy "appointments_owner_delete"
on public.appointments
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = appointments.artisan_id
      and p.user_id = auth.uid()
  )
);

-- 3) L'artisan peut supprimer les invitations qu'il a émises.
--    Nécessaire pour qu'un contact issu d'une invitation acceptée ne réapparaisse pas
--    après suppression (cf. listArtisanContacts, qui reconstruit les contacts
--    à partir des invitations acceptées).
--
--    Ignoré si la table n'existe pas encore (platform_invitations.sql non exécuté),
--    pour que les policies 1 et 2 s'appliquent quand même.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'platform_invitations'
  ) then
    execute 'drop policy if exists "platform_invitations_delete_inviter" on public.platform_invitations';
    execute $p$
      create policy "platform_invitations_delete_inviter"
      on public.platform_invitations
      for delete
      to authenticated
      using (inviter_user_id = auth.uid())
    $p$;
  else
    raise notice 'Table platform_invitations absente : policy ignoree. Executer platform_invitations.sql puis relancer ce script.';
  end if;
end
$$;
