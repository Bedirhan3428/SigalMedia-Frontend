-- 0005: Row Level Security. Every table has RLS enabled. Writes mostly flow through SECURITY DEFINER RPCs (0004);
-- the policies below cover SELECT and the few direct writes that were granted. auth.uid() is wrapped in (select ...) for plan caching.

alter table public.profiles                enable row level security;
alter table public.profile_private         enable row level security;
alter table public.follows                 enable row level security;
alter table public.follow_requests         enable row level security;
alter table public.blocks                  enable row level security;
alter table public.posts                   enable row level security;
alter table public.post_media              enable row level security;
alter table public.likes                   enable row level security;
alter table public.saves                   enable row level security;
alter table public.comments                enable row level security;
alter table public.polls                   enable row level security;
alter table public.poll_options            enable row level security;
alter table public.poll_votes              enable row level security;
alter table public.badges                  enable row level security;
alter table public.user_badges             enable row level security;
alter table public.story_views             enable row level security;
alter table public.notes                   enable row level security;
alter table public.pending_uploads         enable row level security;   -- service role only (presign endpoint)
alter table public.conversations           enable row level security;
alter table public.conversation_members    enable row level security;
alter table public.conversation_read_state enable row level security;
alter table public.messages                enable row level security;
alter table public.message_reactions       enable row level security;
alter table public.push_subscriptions      enable row level security;
alter table public.notifications           enable row level security;
alter table public.reports                 enable row level security;
alter table public.rate_events             enable row level security;   -- no policies: only definer functions touch it

-- profiles: public read (anon too, for share links) except across blocks; only own row updatable (column grants limit fields)
create policy profiles_select on public.profiles for select to anon, authenticated
  using (not public.is_blocked_either(id, (select auth.uid())));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy profile_private_select on public.profile_private for select to authenticated using (user_id = (select auth.uid()));
create policy profile_private_update on public.profile_private for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- social graph
create policy follows_select on public.follows for select to anon, authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()) or public.can_see_author(following_id));
create policy follow_requests_select on public.follow_requests for select to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));
create policy blocks_select on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));

-- posts: hidden posts and expired stories invisible (except to the author); blocks and private accounts honoured
create policy posts_select on public.posts for select to anon, authenticated
  using (
    author_id = (select auth.uid())
    or (not is_hidden and (kind <> 'story' or expires_at > now()) and public.can_see_author(author_id))
  );
create policy posts_update_author on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy posts_moderate on public.posts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- children of posts inherit post visibility (the sub-select is itself filtered by posts_select)
create policy post_media_select on public.post_media for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy polls_select on public.polls for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy poll_options_select on public.poll_options for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = poll_id));
create policy poll_votes_select on public.poll_votes for select to authenticated using (user_id = (select auth.uid()));

create policy likes_select on public.likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy likes_delete on public.likes for delete to authenticated using (user_id = (select auth.uid()));

create policy saves_select on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_insert on public.saves for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy saves_delete on public.saves for delete to authenticated using (user_id = (select auth.uid()));

create policy comments_select on public.comments for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id) and not public.is_blocked_either(author_id, (select auth.uid())));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin()
         or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

-- badges
create policy badges_select on public.badges for select to anon, authenticated using (true);
create policy user_badges_select on public.user_badges for select to anon, authenticated
  using (not public.is_blocked_either(user_id, (select auth.uid())));

-- stories / notes
create policy story_views_select on public.story_views for select to authenticated
  using (viewer_id = (select auth.uid())
         or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy notes_select on public.notes for select to authenticated
  using (expires_at > now() and (user_id = (select auth.uid())
         or (public.can_see_author(user_id) and public.is_following((select auth.uid()), user_id))));
create policy notes_write on public.notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- chat: members only
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversation_members_select on public.conversation_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_conversation_member(conversation_id));
create policy conversation_members_update_own on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- own state always; the peer's read time only if that peer has read receipts enabled
create policy read_state_select on public.conversation_read_state for select to authenticated
  using (user_id = (select auth.uid())
         or (public.is_conversation_member(conversation_id)
             and exists (select 1 from public.profiles p where p.id = user_id and p.read_receipts)));
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy reactions_select on public.message_reactions for select to authenticated
  using (public.can_access_message(message_id));

-- push / notifications
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_update on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid()));
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- reports: reporters see their own; moderators see and resolve all
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());
create policy reports_update_mod on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
