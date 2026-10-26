#!/usr/bin/env bash
# Vérification PostgreSQL des comptes apporteur (migration 64) : consommation unique de
# l'invitation (y compris en concurrence), contraintes d'identité / TVA, isolation RLS.
#
# Usage (PostgreSQL LOCAL de test uniquement, jamais la production) :
#   SOLINE_PG_TEST=1 PGHOST=/tmp PGPORT=5432 PGUSER=postgres bash supabase/tests/business-referrers.sh
# Crée puis supprime la base « soline_referrers_test ». Sortie : une ligne PASS/FAIL par scénario.
set -u
[ "${SOLINE_PG_TEST:-}" = "1" ] || { echo "Refusé : définir SOLINE_PG_TEST=1 (base locale de test uniquement)."; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"; M="$HERE/../migration"; DB=soline_referrers_test
psql -d postgres -qc "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1 || exit 1
P="psql -d $DB -q -v ON_ERROR_STOP=1"
$P <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
SQL
for f in 64_business_referrers 64_business_referrers; do
  $P -f "$M/$f.sql" >/dev/null 2>&1 || { echo "FAIL migration $f"; exit 1; }
done
echo "PASS migration 64 appliquée deux fois (rejouable)"

Q() { psql -d "$DB" -Atq -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 : attendu=$3 obtenu=$2"; fi; }
has_error() { case "$2" in *ERROR*) echo "PASS $1";; *) echo "FAIL $1 : aucune erreur ($2)";; esac; }

ADMIN=00000000-0000-0000-0000-00000000000a; U1=00000000-0000-0000-0000-000000000001; U2=00000000-0000-0000-0000-000000000002
Q "insert into auth.users values ('$ADMIN','admin@soline.fr'),('$U1','paul@exemple.fr'),('$U2','autre@exemple.fr')" >/dev/null
H() { printf '%064d' "$1"; }  # empreinte factice au bon format (64 hex)
inv() { # n email expire_offset
  Q "insert into business_referrer_invitations(email, first_name, last_name, siren, token_hash, created_by, expires_at)
     values ('$2','Paul','Martin','732829320','$(H $1)','$ADMIN', now() + interval '${3:-14 days}') returning id"; }
claim() { # n user email regime vat siret
  Q "select claim_business_referrer_invitation('$(H $1)','$2','$3','Paul','Martin','+33612345678','PM Conseil','${6:-}','12 rue des Lilas','','11000','Carcassonne','${4:-franchise}','${5:-}','v1')"; }
st() { echo "$1" | sed -E 's/.*"status": "([a-z_]+)".*/\1/'; }

inv 1 paul@exemple.fr >/dev/null
check "invitation : une seule ouverte par adresse" "$(case "$(inv 2 paul@exemple.fr)" in *duplicate*|*unique*) echo refus;; *) echo accepte;; esac)" refus
check "e-mail en minuscules imposé" "$(case "$(inv 3 Paul@Exemple.fr)" in *ERROR*) echo refus;; *) echo accepte;; esac)" refus

r=$(claim 1 $U1 PAUL@exemple.fr); check "consommation (adresse insensible à la casse)" "$(st "$r")" claimed
check "fiche apporteur créée avec le SIREN de l'invitation" "$(Q "select siren || '|' || email from business_referrers where user_id='$U1'")" "732829320|paul@exemple.fr"
check "invitation marquée consommée" "$(Q "select claimed_user_id from business_referrer_invitations where token_hash='$(H 1)'")" "$U1"
r=$(claim 1 $U2 paul@exemple.fr); check "second usage du lien refusé" "$(st "$r")" already_claimed
check "toujours une seule fiche" "$(Q "select count(*) from business_referrers")" 1
check "nouvelle invitation possible après consommation" "$(case "$(inv 4 paul@exemple.fr)" in *ERROR*) echo refus;; *) echo accepte;; esac)" accepte
Q "update business_referrer_invitations set cancelled_at = now() where token_hash='$(H 4)'" >/dev/null

# Concurrence : deux finalisations simultanées du même lien
inv 5 autre@exemple.fr >/dev/null
( psql -d "$DB" -Atq -c "begin" -c "select claim_business_referrer_invitation('$(H 5)','$U2','autre@exemple.fr','A','B','+33612345678','X','','12 rue A','','11000','Ville','franchise','','v1')" -c "select pg_sleep(1.5)" -c "commit" >/dev/null 2>&1 ) &
sleep 0.4
r=$(claim 5 $U2 autre@exemple.fr); wait
check "concurrence : la 2e finalisation voit le lien consommé" "$(st "$r")" already_claimed
check "concurrence : une seule fiche pour cette adresse" "$(Q "select count(*) from business_referrers where email='autre@exemple.fr'")" 1

# États du lien
inv 6 x6@exemple.fr "-1 minute" >/dev/null; check "lien expiré" "$(st "$(claim 6 $ADMIN x6@exemple.fr)")" expired
inv 7 x7@exemple.fr >/dev/null; Q "update business_referrer_invitations set cancelled_at=now() where token_hash='$(H 7)'" >/dev/null
check "lien annulé" "$(st "$(claim 7 $ADMIN x7@exemple.fr)")" cancelled
inv 8 x8@exemple.fr >/dev/null; check "adresse différente de l'invitation" "$(st "$(claim 8 $ADMIN pirate@exemple.fr)")" email_mismatch
check "empreinte inconnue" "$(st "$(claim 99 $ADMIN x8@exemple.fr)")" invalid

# Contraintes d'identité et de TVA (la transaction entière est annulée)
has_error "assujetti sans n° de TVA" "$(claim 8 $ADMIN x8@exemple.fr normal '')"
has_error "n° de TVA d'un autre SIREN" "$(claim 8 $ADMIN x8@exemple.fr normal FR00552100554)"
has_error "franchise avec n° de TVA" "$(claim 8 $ADMIN x8@exemple.fr franchise FR44732829320)"
has_error "SIRET d'un autre SIREN" "$(claim 8 $ADMIN x8@exemple.fr franchise '' 55210055400013)"
check "après refus : invitation toujours ouverte, rien créé" "$(Q "select (claimed_at is null)::text || '|' || (select count(*) from business_referrers where email='x8@exemple.fr') from business_referrer_invitations where token_hash='$(H 8)'")" "true|0"
r=$(claim 8 $ADMIN x8@exemple.fr normal FR44732829320 73282932000074); check "assujetti avec n° et SIRET cohérents" "$(st "$r")" claimed

# Isolation (rôle authenticated, jeton de l'utilisateur U1)
AS_U1() { psql -d "$DB" -Atq -c "set role authenticated" -c "select set_config('request.jwt.claim.sub','$U1',false)" -c "$1" 2>&1 | tail -n1; }
check "un apporteur ne lit que sa fiche" "$(AS_U1 "select count(*) || '|' || min(email) from business_referrers")" "1|paul@exemple.fr"
has_error "invitations illisibles côté navigateur" "$(AS_U1 "select count(*) from business_referrer_invitations")"
has_error "pas d'écriture directe de la fiche" "$(AS_U1 "update business_referrers set status='active', siren='552100554'")"
has_error "pas d'insertion directe" "$(AS_U1 "insert into business_referrers(user_id) values ('$U1')")"
has_error "consommation réservée au serveur" "$(AS_U1 "select claim_business_referrer_invitation('$(H 1)','$U1','paul@exemple.fr','a','b','+33612345678','x','','12 rue A','','11000','V','franchise','','v1')")"
check "anonyme : aucune fiche lisible" "$(psql -d "$DB" -Atq -c "set role anon" -c "select count(*) from business_referrers" 2>&1 | tail -n1 | grep -c ERROR)" 1

psql -d postgres -qc "drop database if exists $DB" >/dev/null 2>&1
