-- =============================================================================
-- 19_voice_intake_reminders_and_badge_fix.sql
-- =============================================================================
--
-- Point 12 de l'audit pré-pilote (docs/audit-pre-pilote.md).
--
-- 1) Le badge "à valider" (voice_intakes) se réinitialisait sur simple
--    visite de /app/appels (via user_notification_watermarks), pas sur une
--    action réelle : un artisan interrompu après avoir juste ouvert la page
--    voyait le badge disparaître sans avoir validé ni écarté l'appel.
--
--    Correctif : le compteur voice_intakes de get_notification_counts()
--    compte désormais uniquement les voice_call_intakes au statut
--    'pending_review' pour l'artisan, sans watermark — il ne peut donc
--    diminuer que par une vraie action (validation ou rejet, qui changent
--    le statut). Les autres catégories (quotes_accepted, quotes_received,
--    invoices_received) sont des indicateurs "vu / pas vu" et gardent leur
--    mécanique par watermark inchangée.
--
-- 2) Ajoute le suivi de relance (reminder_count, last_reminder_at) sur
--    voice_call_intakes, même mécanique que invoices.reminder_count /
--    last_reminder_at, pour permettre une relance push automatique des
--    brouillons oubliés (voir src/lib/voice/voice-intake-reminders.ts et
--    /api/cron/voice-intake-reminders).
--
-- Idempotent.

alter table public.voice_call_intakes
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

create or replace function public.get_notification_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artisan_id uuid;
  v_messages int := 0;
  v_quotes_accepted int := 0;
  v_quotes_received int := 0;
  v_voice int := 0;
  v_invoices int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select p.id into v_artisan_id
  from public.profiles p
  where p.user_id = v_uid;

  select count(*)::int into v_messages
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.conversation_reads cr
    on cr.conversation_id = c.id and cr.user_id = v_uid
  where (
    c.customer_user_id = v_uid
    or exists (
      select 1
      from public.profiles p
      where p.id = c.artisan_id and p.user_id = v_uid
    )
  )
  and (
    m.sender_user_id is distinct from v_uid
    or (
      m.sender_user_id is null
      and m.kind = 'lead_recap'
      and v_artisan_id is not null
      and c.artisan_id = v_artisan_id
    )
  )
  and m.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz);

  if v_artisan_id is not null then
    select count(*)::int into v_quotes_accepted
    from public.quotes q
    left join public.user_notification_watermarks w
      on w.user_id = v_uid and w.category = 'quotes_accepted'
    where q.artisan_id = v_artisan_id
      and q.status = 'accepted'
      and q.signed_at > coalesce(w.last_seen_at, '-infinity'::timestamptz);

    -- voice_intakes : compteur d'action, pas d'indicateur "vu" — ne dépend
    -- plus du watermark (Point 12 de l'audit pré-pilote).
    select count(*)::int into v_voice
    from public.voice_call_intakes vi
    where vi.artisan_id = v_artisan_id
      and vi.status = 'pending_review';
  end if;

  select count(*)::int into v_quotes_received
  from public.quotes q
  left join public.user_notification_watermarks w
    on w.user_id = v_uid and w.category = 'quotes_received'
  where q.customer_user_id = v_uid
    and q.status = 'sent'
    and coalesce(q.sent_at, q.updated_at) > coalesce(w.last_seen_at, '-infinity'::timestamptz);

  select count(*)::int into v_invoices
  from public.invoices i
  left join public.user_notification_watermarks w
    on w.user_id = v_uid and w.category = 'invoices_received'
  where i.customer_user_id = v_uid
    and i.status in ('sent', 'overdue')
    and i.created_at > coalesce(w.last_seen_at, '-infinity'::timestamptz);

  return jsonb_build_object(
    'ok', true,
    'messages', v_messages,
    'quotes_accepted', v_quotes_accepted,
    'quotes_received', v_quotes_received,
    'voice_intakes', v_voice,
    'invoices_received', v_invoices,
    'is_artisan', v_artisan_id is not null
  );
end;
$$;

grant execute on function public.get_notification_counts() to authenticated;
