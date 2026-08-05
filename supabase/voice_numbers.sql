-- Numéros vocaux pour les artisans
-- Table pour mapper les numéros de téléphone aux artisans
-- et activer/désactiver la vocal AI pour chaque artisan

create table if not exists public.artisan_voice_numbers (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null unique references public.profiles (id) on delete cascade,
  phone_e164 text not null unique, -- Format E.164: +33123456789
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artisan_voice_numbers_artisan_id_idx on public.artisan_voice_numbers (artisan_id);
create index if not exists artisan_voice_numbers_phone_e164_idx on public.artisan_voice_numbers (phone_e164);
create index if not exists artisan_voice_numbers_is_active_idx on public.artisan_voice_numbers (is_active);

-- RLS : les artisans peuvent voir et modifier leur propre numéro
alter table public.artisan_voice_numbers enable row level security;

drop policy if exists "voice_numbers_public_auth_read" on public.artisan_voice_numbers;
create policy "voice_numbers_public_auth_read"
on public.artisan_voice_numbers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "voice_numbers_owner_write" on public.artisan_voice_numbers;
create policy "voice_numbers_owner_write"
on public.artisan_voice_numbers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "voice_numbers_owner_insert" on public.artisan_voice_numbers;
create policy "voice_numbers_owner_insert"
on public.artisan_voice_numbers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "voice_numbers_owner_delete" on public.artisan_voice_numbers;
create policy "voice_numbers_owner_delete"
on public.artisan_voice_numbers
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = artisan_voice_numbers.artisan_id
      and p.user_id = auth.uid()
  )
);

-- Trigger pour updated_at
drop trigger if exists set_voice_numbers_updated_at on public.artisan_voice_numbers;
create trigger set_voice_numbers_updated_at
before update on public.artisan_voice_numbers
for each row execute procedure public.set_updated_at();
