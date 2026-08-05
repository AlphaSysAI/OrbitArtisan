-- Diagnostic : quelles migrations ont été appliquées ?
-- Lecture seule, ne modifie rien. À exécuter dans l'éditeur SQL Supabase.
-- Chaque ligne indique le fichier à exécuter si la colonne « etat » vaut MANQUANT.

with attendu(fichier, objet, present) as (
  values
    ('schema.sql',                      'table profiles',
      to_regclass('public.profiles') is not null),
    ('schema.sql',                      'table appointments',
      to_regclass('public.appointments') is not null),
    ('schema.sql',                      'table services',
      to_regclass('public.services') is not null),
    ('messages.sql',                    'table conversations',
      to_regclass('public.conversations') is not null),
    ('messages.sql',                    'table messages',
      to_regclass('public.messages') is not null),
    ('quotes.sql',                      'table quotes',
      to_regclass('public.quotes') is not null),
    ('quotes.sql',                      'table quote_materials',
      to_regclass('public.quote_materials') is not null),
    ('invoices_and_quote_signature.sql', 'table invoices',
      to_regclass('public.invoices') is not null),
    ('appointments_customer_and_pending.sql', 'appointments.customer_user_id',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='appointments'
                and column_name='customer_user_id')),
    ('quotes_customer_link.sql',        'quotes.customer_user_id',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='quotes'
                and column_name='customer_user_id')),
    ('add_accent_color.sql',            'profiles.accent_color',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='profiles'
                and column_name='accent_color')),
    ('platform_invitations.sql',        'table platform_invitations',
      to_regclass('public.platform_invitations') is not null),
    ('profile_contact_fields.sql',      'profiles.phone',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='profiles'
                and column_name='phone')),
    ('supplier_products.sql',           'table supplier_products',
      to_regclass('public.supplier_products') is not null),
    ('supplier_products.sql',           'quote_materials.exclude_from_invoice',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='quote_materials'
                and column_name='exclude_from_invoice')),
    ('profile_trade.sql',               'profiles.trade_category',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='profiles'
                and column_name='trade_category')),
    ('contacts_delete_policies.sql',    'policy conversations_delete_artisan',
      exists (select 1 from pg_policies
              where schemaname='public' and tablename='conversations'
                and policyname='conversations_delete_artisan')),
    ('contacts_delete_policies.sql',    'policy appointments_owner_delete',
      exists (select 1 from pg_policies
              where schemaname='public' and tablename='appointments'
                and policyname='appointments_owner_delete')),
    ('stripe_connect_express.sql',      'profiles.stripe_transfers_enabled',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='profiles'
                and column_name='stripe_transfers_enabled'))
)
select
  case when present then 'ok' else 'MANQUANT' end as etat,
  fichier,
  objet
from attendu
order by present asc, fichier, objet;

-- Bonus : reste-t-il l'ancienne table client_invitations ?
-- Si oui (et seulement dans ce cas), exécuter migrate_client_invitations.sql
-- APRÈS platform_invitations.sql pour reprendre les données.
select
  case
    when to_regclass('public.client_invitations') is not null
      then 'client_invitations existe : executer migrate_client_invitations.sql apres platform_invitations.sql'
    else 'client_invitations absente : rien a migrer'
  end as ancienne_table;
