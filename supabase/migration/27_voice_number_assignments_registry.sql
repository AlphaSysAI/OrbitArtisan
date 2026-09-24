-- Registre télécom : qui exploitait quel numéro, quand (obligation réponse autorités).

alter table public.profiles
  add column if not exists registration_ip text,
  add column if not exists registration_recorded_at timestamptz;

comment on column public.profiles.registration_ip is
  'IP client au moment de l''inscription (en-têtes proxy), conservée à des fins de traçabilité.';
comment on column public.profiles.registration_recorded_at is
  'Horodatage serveur de l''enregistrement registration_ip.';

create table if not exists public.voice_number_assignments (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  artisan_id uuid not null references public.profiles (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  release_reason text,
  assigned_by text not null default 'artisan_self_service',
  artisan_snapshot jsonb not null default '{}'::jsonb,
  constraint voice_number_assignments_times check (
    released_at is null or released_at >= assigned_at
  )
);

comment on table public.voice_number_assignments is
  'Historique immuable des rattachements numéro E.164 ↔ artisan (mise à disposition / résiliation).';

create unique index if not exists voice_number_assignments_one_open_per_phone_idx
  on public.voice_number_assignments (phone_e164)
  where released_at is null;

create index if not exists voice_number_assignments_phone_assigned_idx
  on public.voice_number_assignments (phone_e164, assigned_at desc);

create index if not exists voice_number_assignments_artisan_assigned_idx
  on public.voice_number_assignments (artisan_id, assigned_at desc);

alter table public.voice_number_assignments enable row level security;

-- Aucune policy : lecture/écriture réservées au service role (API admin / server actions).

-- Table mapping courant (définie dans init.sql ; absente si la base n'a été créée que via migrations 01–26).
create table if not exists public.artisan_voice_numbers (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null unique references public.profiles (id) on delete cascade,
  phone_e164 text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artisan_voice_numbers_artisan_id_idx on public.artisan_voice_numbers (artisan_id);
create index if not exists artisan_voice_numbers_phone_e164_idx on public.artisan_voice_numbers (phone_e164);
create index if not exists artisan_voice_numbers_is_active_idx on public.artisan_voice_numbers (is_active);

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

drop trigger if exists set_voice_numbers_updated_at on public.artisan_voice_numbers;
create trigger set_voice_numbers_updated_at
before update on public.artisan_voice_numbers
for each row execute procedure public.set_updated_at();

-- Rattachements actuels → première ligne d''historique (assigned_at = created_at du mapping).
insert into public.voice_number_assignments (
  phone_e164,
  artisan_id,
  user_id,
  assigned_at,
  assigned_by,
  artisan_snapshot
)
select
  avn.phone_e164,
  avn.artisan_id,
  p.user_id,
  avn.created_at,
  'backfill_migration_27',
  jsonb_build_object(
    'captured_at', avn.created_at,
    'profile_id', p.id,
    'user_id', p.user_id,
    'email', u.email,
    'registration_ip', p.registration_ip,
    'registration_recorded_at', p.registration_recorded_at,
    'business_name', p.business_name,
    'name', p.name,
    'siret', p.siret,
    'siren', p.siren,
    'vat_number', p.vat_number,
    'address_line1', p.address_line1,
    'address_line2', p.address_line2,
    'postal_code', p.postal_code,
    'city', p.city,
    'phone', p.phone
  )
from public.artisan_voice_numbers avn
join public.profiles p on p.id = avn.artisan_id
join auth.users u on u.id = p.user_id
where not exists (
  select 1
  from public.voice_number_assignments vna
  where vna.phone_e164 = avn.phone_e164
    and vna.released_at is null
);

-- Qui exploitait le numéro à l''instant T (usage autorités / support).
create or replace function public.resolve_voice_number_assignee_at(
  p_phone_e164 text,
  p_instant timestamptz default clock_timestamp()
)
returns table (
  assignment_id uuid,
  phone_e164 text,
  artisan_id uuid,
  user_id uuid,
  assigned_at timestamptz,
  released_at timestamptz,
  release_reason text,
  assigned_by text,
  artisan_snapshot jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.phone_e164,
    a.artisan_id,
    a.user_id,
    a.assigned_at,
    a.released_at,
    a.release_reason,
    a.assigned_by,
    a.artisan_snapshot
  from public.voice_number_assignments a
  where a.phone_e164 = trim(p_phone_e164)
    and a.assigned_at <= p_instant
    and (a.released_at is null or a.released_at > p_instant)
  order by a.assigned_at desc
  limit 1;
$$;

comment on function public.resolve_voice_number_assignee_at(text, timestamptz) is
  'Retourne le rattachement actif à l''instant donné pour un numéro E.164 (réponse réquisitions).';

revoke all on function public.resolve_voice_number_assignee_at(text, timestamptz) from public;
grant execute on function public.resolve_voice_number_assignee_at(text, timestamptz) to service_role;
