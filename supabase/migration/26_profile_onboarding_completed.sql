-- Parcours de paramétrage initial artisan (après confirmation e-mail)

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'Horodatage de fin du wizard coordonnées + mentions légales ; null = onboarding requis';

-- Artisans déjà paramétrés : ne pas les bloquer sur le wizard
update public.profiles p
set onboarding_completed_at = coalesce(p.updated_at, p.created_at, now())
where p.onboarding_completed_at is null
  and nullif(trim(p.name), '') is not null
  and nullif(trim(p.business_name), '') is not null
  and nullif(trim(p.phone), '') is not null
  and nullif(trim(p.address_line1), '') is not null
  and nullif(trim(p.postal_code), '') is not null
  and nullif(trim(p.city), '') is not null
  and nullif(trim(p.siren), '') is not null
  and nullif(trim(p.siret), '') is not null
  and nullif(trim(p.vat_number), '') is not null
  and nullif(trim(p.trade_register_number), '') is not null
  and nullif(trim(p.decennale_insurer), '') is not null
  and nullif(trim(p.decennale_policy_number), '') is not null
  and nullif(trim(p.rc_pro_insurer), '') is not null
  and nullif(trim(p.rc_pro_number), '') is not null
  and nullif(trim(p.mediator_name), '') is not null
  and nullif(trim(p.mediator_url), '') is not null
  and coalesce(p.default_payment_terms_days, 0) > 0;
