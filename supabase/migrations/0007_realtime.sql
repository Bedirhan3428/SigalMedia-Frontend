-- 0007: Realtime. Supabase-only objects are guarded so the file also loads on a plain Postgres.
-- Channels (see docs/SUPABASE_PLAN.md):
--   postgres_changes on messages (filter conversation_id), conversation_read_state, notifications, message_reactions
--   broadcast `chat:{conversation_id}`  -> typing (ephemeral, no table)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.conversation_read_state,
      public.notifications, public.message_reactions;
  end if;
  -- Realtime Authorization for private broadcast channels: only conversation members may join/send on chat:{id}.
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy chat_broadcast_read on realtime.messages for select to authenticated
      using (realtime.topic() like 'chat:%' and public.is_conversation_member(public.try_uuid(substr(realtime.topic(), 6))))$p$;
    execute $p$create policy chat_broadcast_write on realtime.messages for insert to authenticated
      with check (realtime.topic() like 'chat:%' and public.is_conversation_member(public.try_uuid(substr(realtime.topic(), 6))))$p$;
  end if;
end $$;

-- Replica identity so UPDATE events (read state, reactions) carry the old keys.
alter table public.conversation_read_state replica identity full;
alter table public.message_reactions replica identity full;

-- Push triggers: configure two Database Webhooks (Dashboard -> Database -> Webhooks) calling Edge Function `send-push`:
--   INSERT on public.messages       (chat pushes; function skips the sender and muted/hidden members)
--   INSERT on public.notifications  (like/reply/comment/follow/...)
-- Cron (pg_cron or Supabase Cron): select public.gc_pending_uploads();  daily
--                                  Edge Function `r2-reaper` drains public.r2_delete_queue every minute.
