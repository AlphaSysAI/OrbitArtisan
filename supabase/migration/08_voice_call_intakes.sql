-- Appels Soline : résumé + brouillon de devis à valider par l'artisan

create table if not exists public.voice_call_intakes (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles (id) on delete cascade,
  from_number text,
  to_number text,
  twilio_call_sid text unique,
  customer_name text,
  customer_email text,
  transcript text,
  summary text,
  quote_draft jsonb,
  quote_id uuid references public.quotes (id) on delete set null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'validated', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_call_intakes_artisan_created_idx
  on public.voice_call_intakes (artisan_id, created_at desc);

create index if not exists voice_call_intakes_status_idx
  on public.voice_call_intakes (artisan_id, status, created_at desc);

alter table public.voice_call_intakes enable row level security;

drop policy if exists voice_call_intakes_artisan_read on public.voice_call_intakes;
create policy voice_call_intakes_artisan_read
on public.voice_call_intakes
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = voice_call_intakes.artisan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists voice_call_intakes_artisan_update on public.voice_call_intakes;
create policy voice_call_intakes_artisan_update
on public.voice_call_intakes
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = voice_call_intakes.artisan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = voice_call_intakes.artisan_id
      and p.user_id = auth.uid()
  )
);

drop trigger if exists set_voice_call_intakes_updated_at on public.voice_call_intakes;
create trigger set_voice_call_intakes_updated_at
before update on public.voice_call_intakes
for each row execute function public.set_updated_at();

comment on table public.voice_call_intakes is 'Appels traités par Soline avec résumé et proposition de devis à valider';
comment on column public.voice_call_intakes.quote_draft is 'Brouillon IA (AiQuoteDraft JSON, version 1)';
comment on column public.voice_call_intakes.status is 'pending_review | validated | dismissed';
