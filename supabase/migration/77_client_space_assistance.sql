-- =============================================================================
-- 77_client_space_assistance.sql — Espace client : dépannage, assistant, mise en relation
-- =============================================================================
-- 1) Demandes créées depuis l'espace client : origine dédiée « client_space ».
--    Le rattachement au compte réutilise leads.claimed_by_user_id (lecture déjà
--    autorisée au client par leads_participant_read / can_access_lead).
-- 2) Coordonnées d'intervention du client, gardées pour les prochaines mises en
--    relation. Table à part : customer_profiles est lisible par les artisans en
--    conversation avec le client, ces coordonnées ne doivent l'être que par lui.
--    Elles ne sont transmises qu'aux artisans d'une demande, quand il l'envoie.

-- Hors transaction : une nouvelle valeur d'enum n'est utilisable qu'après validation.
alter type public.lead_source add value if not exists 'client_space';

begin;

create table if not exists public.customer_contact_details (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text check (phone is null or length(phone) between 8 and 30),
  address_label text check (address_label is null or length(address_label) <= 300),
  address_lat double precision check (address_lat is null or address_lat between -90 and 90),
  address_lng double precision check (address_lng is null or address_lng between -180 and 180),
  updated_at timestamptz not null default now()
);

alter table public.customer_contact_details enable row level security;

drop policy if exists customer_contact_details_own on public.customer_contact_details;
create policy customer_contact_details_own on public.customer_contact_details for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.customer_contact_details from anon;

commit;
