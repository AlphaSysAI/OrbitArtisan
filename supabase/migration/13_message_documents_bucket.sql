-- Bucket privé pour pièces jointes PDF (devis, factures) dans la messagerie.
-- Upload via service role ; lecture via URL signée pour les participants à la conversation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-documents',
  'message-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

drop policy if exists message_documents_participant_read on storage.objects;
create policy message_documents_participant_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-documents'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(name, '/', 1)
      and (
        c.customer_user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = c.artisan_id and p.user_id = auth.uid()
        )
      )
  )
);
