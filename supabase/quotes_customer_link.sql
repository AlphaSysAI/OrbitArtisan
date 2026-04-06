-- Lien devis ↔ client + email sur le profil client (exécuter après supabase/messages.sql et supabase/quotes.sql)

-- Email de contact (copie de l’email d’inscription, lisible par l’artisan via jointure profil)
alter table public.customer_profiles
  add column if not exists email text;

-- Lien optionnel vers la conversation et l’utilisateur client (pour envoi / historique)
alter table public.quotes
  add column if not exists customer_user_id uuid references auth.users (id) on delete set null;

alter table public.quotes
  add column if not exists conversation_id uuid references public.conversations (id) on delete set null;

create index if not exists quotes_customer_user_id_idx on public.quotes (customer_user_id);
create index if not exists quotes_conversation_id_idx on public.quotes (conversation_id);

-- Le client peut lire ses devis (sélection)
drop policy if exists quotes_customer_read on public.quotes;
create policy quotes_customer_read
on public.quotes
for select
to authenticated
using (customer_user_id = auth.uid());

-- L’artisan peut lire le profil client s’il existe une conversation avec lui (nom / email pour devis)
drop policy if exists customer_profiles_artisan_conversation_read on public.customer_profiles;
create policy customer_profiles_artisan_conversation_read
on public.customer_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    join public.profiles p on p.id = c.artisan_id
    where c.customer_user_id = customer_profiles.user_id
      and p.user_id = auth.uid()
  )
);
