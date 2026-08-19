-- =============================================================================
-- 07_stripe_billing_events.sql — Journal des événements Stripe Billing SaaS
-- =============================================================================
-- À exécuter après 06_retake_gaps.sql.

create table if not exists public.stripe_billing_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  stripe_event_id text not null,
  event_type text not null,
  checkout_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_plan text,
  billing_interval text,
  amount_total_cents integer,
  currency text,
  payment_status text,
  client_reference_id text,
  customer_email text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists stripe_billing_events_stripe_event_id_uidx
  on public.stripe_billing_events (stripe_event_id);

create index if not exists stripe_billing_events_profile_id_created_at_idx
  on public.stripe_billing_events (profile_id, created_at desc);

comment on table public.stripe_billing_events is 'Historique des webhooks Stripe liés aux abonnements SaaS Soline';

alter table public.stripe_billing_events enable row level security;

drop policy if exists stripe_billing_events_select_own on public.stripe_billing_events;
create policy stripe_billing_events_select_own
  on public.stripe_billing_events
  for select
  to authenticated
  using (
    profile_id in (
      select p.id from public.profiles p where p.user_id = auth.uid()
    )
  );
