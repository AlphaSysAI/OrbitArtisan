-- Vérif migration 66 (rejouable, tout en ROLLBACK) : psql -d <base_locale> -f supabase/tests/account-deletion.sql
-- En local, service_role n'a pas BYPASSRLS : la suppression du profil est faite en postgres.
\set ON_ERROR_STOP 1
begin;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a1','del@test.fr');
insert into public.profiles(id, user_id, business_name, slug) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','Del SARL','del-sarl-test');
insert into public.quotes(id, artisan_id) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1');
insert into public.invoices(artisan_id, quote_id, status) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','sent');
insert into public.voice_number_assignments(phone_e164, artisan_id, user_id, released_at, release_reason, artisan_snapshot)
  values ('+33900000001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1', clock_timestamp()+interval '1 second', 'subscription_ended', '{"business_name":"Del SARL","siret":"123"}');
insert into public.account_deletions(profile_id, user_id, purge_after) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1', now());
-- seconde demande en cours refusée
do $$ begin
  insert into public.account_deletions(profile_id, user_id, purge_after) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1', now());
  raise exception 'doublon accepté';
exception when unique_violation then raise notice 'OK doublon refusé'; end $$;
-- authenticated ne lit pas la table
set local role authenticated;
do $$ begin perform 1 from public.account_deletions; raise exception 'lecture authenticated autorisée';
exception when insufficient_privilege then raise notice 'OK authenticated refusé'; end $$;
reset role;
-- postgres (service role réel = BYPASSRLS)
delete from public.profiles where id='00000000-0000-0000-0000-0000000000b1';
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000a1';
select 'invoices restantes', count(*) from public.invoices where artisan_id='00000000-0000-0000-0000-0000000000b1';
select 'registre', artisan_id is null and user_id is null as liens_null, artisan_snapshot->>'siret' from public.voice_number_assignments where phone_e164='+33900000001';
select 'preuve', count(*) from public.account_deletions where profile_id='00000000-0000-0000-0000-0000000000b1';
rollback;
