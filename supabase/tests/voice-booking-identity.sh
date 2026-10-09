#!/usr/bin/env bash
# Vérification PostgreSQL de la réservation vocale (migrations 21, 38, 62, 63) :
# rejeu, modification, concurrence, isolation entre conversations et entre artisans.
#
# Usage (PostgreSQL LOCAL de test uniquement, jamais la production) :
#   SOLINE_PG_TEST=1 PGHOST=/tmp PGPORT=5432 PGUSER=postgres bash supabase/tests/voice-booking-identity.sh
# Crée puis supprime la base « soline_booking_test ». Sortie : une ligne PASS/FAIL par scénario.
set -u
[ "${SOLINE_PG_TEST:-}" = "1" ] || { echo "Refusé : définir SOLINE_PG_TEST=1 (base locale de test uniquement)."; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"; M="$HERE/../migration"; DB=soline_booking_test
psql -d postgres -qc "drop database if exists $DB" -c "create database $DB" || exit 1
P="psql -d $DB -q -v ON_ERROR_STOP=1"
$P <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.services (id uuid primary key default gen_random_uuid(), duration integer);
create table public.quotes (id uuid primary key default gen_random_uuid());
create type public.appointment_status as enum ('pending','confirmed','cancelled');
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null, customer_email text not null,
  service_id uuid references public.services(id) on delete set null,
  start_time timestamptz not null,
  status public.appointment_status not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  customer_phone text);
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
SQL
for f in 21_appointment_overlap_guard 38_voice_appointment_booking 08_voice_call_intakes 62_voice_call_report 63_voice_booking_identity 62_voice_call_report 63_voice_booking_identity; do
  $P -f "$M/$f.sql" >/dev/null 2>&1 || { echo "FAIL migration $f"; exit 1; }
done
echo "PASS migrations 62 et 63 appliquées deux fois (rejouables)"
Q() { psql -d "$DB" -Atq -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
A=11111111-1111-1111-1111-111111111111; B=22222222-2222-2222-2222-222222222222
Q "insert into profiles(id) values ('$A'),('$B')" >/dev/null
book() { # conv start [replaces] [additional] [artisan]
  local rep=${3:-null}; [ "$rep" != null ] && rep="'$rep'"
  Q "select voice_book_appointment('${5:-$A}','$1','$2'::timestamptz,60,'Client','c@x.fr','+33612345678',null,now()+interval '24 hours',$rep,${4:-false})"; }
st() { echo "$1" | sed -E 's/.*"status": "([a-z_]+)".*/\1/'; }
idof() { echo "$1" | sed -E 's/.*"id": "([0-9a-f-]+)".*/\1/'; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 : attendu=$3 obtenu=$2"; fi; }
cnt() { Q "select count(*) from appointments where $1"; }

T1=2026-10-13T07:00:00Z; T2=2026-10-13T09:00:00Z; T3=2026-10-13T12:00:00Z; T930=2026-10-13T07:30:00Z

r=$(book conv-aaaa-1 $T1); check "création" "$(st "$r")" created; ID1=$(idof "$r")
r=$(book conv-aaaa-1 $T1); check "rejeu même opération" "$(st "$r")" already_booked
check "rejeu : aucun doublon" "$(cnt "voice_conversation_id='conv-aaaa-1'")" 1

# Concurrence 1 : deux rejeux simultanés de la même opération (nouvelle conversation)
( psql -d "$DB" -Atq -c "begin" -c "select voice_book_appointment('$A','conv-race-1','$T3'::timestamptz,60,'C','c@x.fr','+33600000000',null,now()+interval '1 day',null,false)" -c "select pg_sleep(1.5)" -c "commit" >/tmp/raceA.out 2>&1 ) &
sleep 0.4
rB=$(book conv-race-1 $T3); wait
check "concurrence rejeu : 2e appel = already_booked" "$(st "$rB")" already_booked
check "concurrence rejeu : 1 seul RDV" "$(cnt "voice_conversation_id='conv-race-1'")" 1

# Concurrence 2 : deux conversations différentes, même créneau
T4=2026-10-14T07:00:00Z
( psql -d "$DB" -Atq -c "begin" -c "select voice_book_appointment('$A','conv-race-2','$T4'::timestamptz,60,'C','c@x.fr','+33600000001',null,now()+interval '1 day',null,false)" -c "select pg_sleep(1.5)" -c "commit" >/tmp/raceB.out 2>&1 ) &
sleep 0.4
rC=$(book conv-race-3 $T4); wait
check "concurrence créneau : la 2e conversation est refusée" "$(st "$rC")" slot_unavailable
check "concurrence créneau : 1 seul RDV actif" "$(cnt "start_time='$T4' and status<>'cancelled'")" 1

# Modification vers un créneau libre
r=$(book conv-aaaa-1 $T2 $ID1); check "modification" "$(st "$r")" replaced
check "modification : même RDV déplacé" "$(idof "$r")" "$ID1"
check "modification : plus rien à l'ancien horaire" "$(cnt "start_time='$T1' and status<>'cancelled'")" 0
r=$(book conv-aaaa-1 $T2 $ID1); check "rejeu de la modification" "$(st "$r")" already_booked

# Modification vers un créneau occupé par une autre conversation : l'ancien est conservé
r=$(book conv-bbbb-1 $T1); ID_OTHER=$(idof "$r")
r=$(book conv-aaaa-1 $T1 $ID1); check "modification vers créneau pris" "$(st "$r")" slot_unavailable
check "créneau pris : ancien RDV intact" "$(Q "select start_time = '$T2'::timestamptz and status='pending' from appointments where id='$ID1'")" t

# Modification qui chevauche son propre ancien créneau (9 h -> 9 h 30, 60 min)
r=$(book conv-cccc-1 2026-10-15T07:00:00Z); ID_C=$(idof "$r")
r=$(book conv-cccc-1 2026-10-15T07:30:00Z $ID_C); check "modification chevauchant son propre créneau" "$(st "$r")" replaced

# RDV d'une autre conversation / d'un autre artisan : jamais modifié
r=$(book conv-aaaa-1 $T3 $ID_OTHER); check "modifier le RDV d'une autre conversation" "$(st "$r")" replace_not_found
r=$(Q "select voice_book_appointment('$B','conv-bbbb-1','2026-10-16T07:00:00Z'::timestamptz,60,'C','c@x.fr','+33600000002',null,now()+interval '1 day','$ID_OTHER',false)")
check "modifier le RDV d'un autre artisan" "$(st "$r")" replace_not_found
check "RDV d'autrui intact" "$(Q "select start_time='$T1'::timestamptz from appointments where id='$ID_OTHER'")" t

# RDV déjà validé par l'artisan : jamais modifié
Q "update appointments set status='confirmed' where id='$ID_C'" >/dev/null
r=$(book conv-cccc-1 2026-10-15T12:00:00Z $ID_C); check "modifier un RDV confirmé" "$(st "$r")" replace_not_pending
check "RDV confirmé intact" "$(Q "select start_time='2026-10-15T07:30:00Z'::timestamptz and status='confirmed' from appointments where id='$ID_C'")" t

# Nouvelle demande dans une conversation qui a déjà un RDV en attente
r=$(book conv-aaaa-1 2026-10-16T12:00:00Z); check "2e RDV sans précision" "$(st "$r")" existing_booking
check "2e RDV sans précision : rien écrit" "$(cnt "voice_conversation_id='conv-aaaa-1'")" 1
r=$(book conv-aaaa-1 2026-10-16T12:00:00Z null true); check "visite supplémentaire explicite" "$(st "$r")" created
check "visite supplémentaire : premier RDV conservé" "$(Q "select status from appointments where id='$ID1'")" pending

# Identifiant de conversation invalide
r=$(book short 2026-10-17T07:00:00Z); case "$r" in *"conversation_id requis"*) echo "PASS conversation_id invalide refusé";; *) echo "FAIL conversation_id invalide : $r";; esac

# Signal de clôture unique
Q "insert into voice_call_sessions(conversation_id, artisan_id) values ('conv-aaaa-1','$A')" >/dev/null
check "signal clôture : 1er" "$(Q "select voice_mark_closing_signal('conv-aaaa-1','$A')")" t
check "signal clôture : pas de 2e" "$(Q "select voice_mark_closing_signal('conv-aaaa-1','$A')")" f
check "signal clôture : autre artisan" "$(Q "select voice_mark_closing_signal('conv-aaaa-1','$B')")" f

# Droits : la fonction n'est pas exécutable par anon / authenticated
check "anon ne peut pas réserver" "$(Q "select has_function_privilege('anon','public.voice_book_appointment(uuid,text,timestamptz,integer,text,text,text,text,timestamptz,uuid,boolean)','execute')")" f
check "authenticated ne lit pas les sessions" "$(Q "select has_table_privilege('authenticated','public.voice_call_sessions','select')")" f

psql -d postgres -qc "drop database if exists $DB"
