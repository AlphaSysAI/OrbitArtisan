-- Galerie photos de la vitrine artisan (/site/[slug]).

create table if not exists public.artisan_vitrine_images (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  constraint artisan_vitrine_images_storage_path_unique unique (storage_path)
);

create index if not exists artisan_vitrine_images_artisan_sort_idx
  on public.artisan_vitrine_images (artisan_id, sort_order asc, created_at asc);

alter table public.artisan_vitrine_images enable row level security;

drop policy if exists artisan_vitrine_images_public_read on public.artisan_vitrine_images;
create policy artisan_vitrine_images_public_read
on public.artisan_vitrine_images
for select
to anon, authenticated
using (true);

drop policy if exists artisan_vitrine_images_owner_insert on public.artisan_vitrine_images;
create policy artisan_vitrine_images_owner_insert
on public.artisan_vitrine_images
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = artisan_vitrine_images.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists artisan_vitrine_images_owner_delete on public.artisan_vitrine_images;
create policy artisan_vitrine_images_owner_delete
on public.artisan_vitrine_images
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = artisan_vitrine_images.artisan_id and p.user_id = auth.uid()
  )
);

drop policy if exists artisan_vitrine_images_owner_update on public.artisan_vitrine_images;
create policy artisan_vitrine_images_owner_update
on public.artisan_vitrine_images
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = artisan_vitrine_images.artisan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = artisan_vitrine_images.artisan_id and p.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vitrine-media',
  'vitrine-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists vitrine_media_owner_insert on storage.objects;
create policy vitrine_media_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vitrine-media'
  and split_part(name, '/', 1) = (
    select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1
  )
);

drop policy if exists vitrine_media_owner_delete on storage.objects;
create policy vitrine_media_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vitrine-media'
  and split_part(name, '/', 1) = (
    select p.id::text from public.profiles p where p.user_id = auth.uid() limit 1
  )
);

drop policy if exists vitrine_media_public_read on storage.objects;
create policy vitrine_media_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'vitrine-media');
