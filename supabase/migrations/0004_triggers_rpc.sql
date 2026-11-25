-- 0004: triggers (counters, notifications, badges, R2 delete queue) and RPCs (SECURITY DEFINER where needed).
-- All state-changing social operations go through RPCs; direct INSERT on posts/follows/blocks/messages is not granted.

-- ================================================================ R2 delete queue
-- A worker (Edge Function on a 1-min cron) drains this table and issues S3 DeleteObject against R2.
create table public.r2_delete_queue (
  id         bigint generated always as identity primary key,
  bucket     text not null check (bucket in ('public', 'private')),
  key        text not null,
  created_at timestamptz not null default now(),
  attempts   integer not null default 0
);
create index r2_delete_queue_idx on public.r2_delete_queue (created_at);
alter table public.r2_delete_queue enable row level security;   -- no policies: service role only

create function public.enqueue_r2_delete(p_bucket text, p_key text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_key is not null and p_key <> '' then
    insert into public.r2_delete_queue (bucket, key) values (p_bucket, p_key);
  end if;
end $$;

create function public.tg_post_media_deleted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.enqueue_r2_delete('public', old.key);
  perform public.enqueue_r2_delete('public', old.poster_key);
  return old;
end $$;
create trigger post_media_deleted after delete on public.post_media for each row execute function public.tg_post_media_deleted();

create function public.tg_profile_avatar_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_r2_delete('public', old.avatar_key);
    return old;
  end if;
  if old.avatar_key is distinct from new.avatar_key then
    perform public.enqueue_r2_delete('public', old.avatar_key);
  end if;
  return new;
end $$;
create trigger profile_avatar_changed after update of avatar_key or delete on public.profiles
  for each row execute function public.tg_profile_avatar_changed();

create function public.tg_message_media_deleted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.enqueue_r2_delete('private', old.media_key);
  return old;
end $$;
create trigger message_media_deleted after delete on public.messages
  for each row when (old.media_key is not null) execute function public.tg_message_media_deleted();

-- Orphans: uploads never attached to a post/avatar/message within 24h. Call daily (pg_cron or the same worker).
create function public.gc_pending_uploads() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  with gone as (
    delete from public.pending_uploads
     where attached_at is null and created_at < now() - interval '24 hours'
     returning bucket, key
  ), q as (
    insert into public.r2_delete_queue (bucket, key) select bucket, key from gone returning 1
  )
  select count(*) into n from q;
  delete from public.rate_events where at < now() - interval '2 days';
  return n;
end $$;

-- ================================================================ profile triggers
-- Switching an account from private to public auto-approves pending follow requests (as the old privacyService did).
create function public.tg_profile_privacy_flip() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.is_private and not new.is_private then
    insert into public.follows (follower_id, following_id)
      select requester_id, target_id from public.follow_requests where target_id = new.id
      on conflict do nothing;
    delete from public.follow_requests where target_id = new.id;
  end if;
  return new;
end $$;
create trigger profile_privacy_flip after update of is_private on public.profiles
  for each row execute function public.tg_profile_privacy_flip();

-- ================================================================ notifications / badges helpers
create function public.notify(p_user uuid, p_actor uuid, p_type public.notification_type,
                              p_post uuid default null, p_comment uuid default null, p_data jsonb default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.is_blocked_either(p_user, p_actor) then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id, data)
  values (p_user, p_actor, p_type, p_post, p_comment, p_data)
  on conflict do nothing;
end $$;

create function public.award_badge(p_user uuid, p_badge text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.user_badges (user_id, badge_id) values (p_user, p_badge) on conflict do nothing;
  if found then
    perform public.notify(p_user, null, 'badge', null, null, jsonb_build_object('badge_id', p_badge));
  end if;
end $$;

-- ================================================================ follows counters + notifications
create function public.tg_follows_counts() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    perform public.notify(new.following_id, new.follower_id, 'follow');
  else
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
  end if;
  return null;
end $$;
create trigger follows_counts after insert or delete on public.follows for each row execute function public.tg_follows_counts();

-- ================================================================ posts counters / notifications / badges
create function public.tg_posts_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare root_author uuid; parent_author uuid; n integer;
begin
  if new.reply_root_id is null then
    if new.kind <> 'story' then
      update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
    end if;
  else
    update public.posts set reply_count = reply_count + 1 where id = new.reply_root_id returning author_id into root_author;
    select author_id into parent_author from public.posts where id = new.reply_parent_id;
    perform public.notify(parent_author, new.author_id, 'reply', new.reply_root_id);
    if root_author is distinct from parent_author then
      perform public.notify(root_author, new.author_id, 'reply', new.reply_root_id);
    end if;
    select count(*) into n from public.posts where author_id = new.author_id and reply_root_id is not null;
    if n >= 3 then perform public.award_badge(new.author_id, 'zincir'); end if;
  end if;
  perform public.award_badge(new.author_id, 'ilk');
  return null;
end $$;
create trigger posts_after_insert after insert on public.posts for each row execute function public.tg_posts_after_insert();

create function public.tg_posts_after_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.reply_root_id is null then
    if old.kind <> 'story' then
      update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = old.author_id;
    end if;
  else
    update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.reply_root_id;
  end if;
  return null;
end $$;
create trigger posts_after_delete after delete on public.posts for each row execute function public.tg_posts_after_delete();

create function public.tg_post_media_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.type = 'video' then
    update public.posts set has_video = true where id = new.post_id;
  end if;
  return null;
end $$;
create trigger post_media_after_insert after insert on public.post_media for each row execute function public.tg_post_media_after_insert();

create function public.tg_likes_counts() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid; total bigint;
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id returning author_id into a;
    perform public.notify(a, new.user_id, 'like', new.post_id);
    select coalesce(sum(like_count), 0) into total from public.posts where author_id = a;
    if total >= 100 then perform public.award_badge(a, 'begeni'); end if;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger likes_counts after insert or delete on public.likes for each row execute function public.tg_likes_counts();

create function public.tg_comments_counts() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id returning author_id into a;
    perform public.notify(a, new.author_id, 'comment', new.post_id, new.id);
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger comments_counts after insert or delete on public.comments for each row execute function public.tg_comments_counts();

create function public.tg_poll_votes_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  update public.poll_options set vote_count = vote_count + 1 where id = new.option_id;
  select count(*) into n from public.poll_votes where user_id = new.user_id;
  if n >= 10 then perform public.award_badge(new.user_id, 'kahin'); end if;
  if n >= 50 then perform public.award_badge(new.user_id, 'oy'); end if;
  return null;
end $$;
create trigger poll_votes_after_insert after insert on public.poll_votes for each row execute function public.tg_poll_votes_after_insert();

-- 3 distinct reporters auto-hide a post/story pending moderator review (unique(reporter,target) => distinct).
create function public.tg_reports_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.target_type in ('post', 'story') then
    update public.posts p set is_hidden = true
     where p.id = new.target_id
       and (select count(*) from public.reports r where r.target_type in ('post', 'story') and r.target_id = new.target_id) >= 3;
  end if;
  return null;
end $$;
create trigger reports_after_insert after insert on public.reports for each row execute function public.tg_reports_after_insert();

-- ================================================================ membership helpers
create function public.is_conversation_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = auth.uid());
$$;

create function public.can_access_message(p_msg uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.messages m
                  join public.conversation_members cm on cm.conversation_id = m.conversation_id
                 where m.id = p_msg and cm.user_id = auth.uid());
$$;

-- ================================================================ username / onboarding
create function public.check_username_available(p_username text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,15}$'
     and lower(p_username) <> all (array['admin','root','support','shovrum','sigalmedia','moderator','help','official','system','null','undefined'])
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

create function public.claim_username(p_username text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare u text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.rate_limit('claim_username', 10, 3600);
  if not public.check_username_available(u) then raise exception 'username_unavailable' using errcode = '23505'; end if;
  begin
    update public.profiles set username = u where id = auth.uid() and (username is null or username = u);
  exception when unique_violation then
    raise exception 'username_unavailable' using errcode = '23505';
  end;
  if not found then raise exception 'username_already_set' using errcode = 'P0001'; end if;
  return u;
end $$;

-- One-shot onboarding: username + display name + birth date. Under 13 is refused; under 18 gets safer defaults.
create function public.complete_onboarding(p_username text, p_display_name text, p_birth_date date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare age_years integer := extract(year from age(current_date, p_birth_date));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if age_years < 13 then raise exception 'too_young' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and username is not null) then
    perform public.claim_username(p_username);
  end if;
  update public.profile_private set birth_date = p_birth_date where user_id = auth.uid();
  update public.profiles set
      display_name = left(trim(p_display_name), 50),
      onboarding_completed = true,
      is_private = case when age_years < 16 then true else is_private end,
      who_can_message = case when age_years < 18 and who_can_message = 'everyone' then 'following' else who_can_message end
   where id = auth.uid();
end $$;

-- ================================================================ follow / block RPCs
create function public.follow_user(p_target uuid) returns text   -- 'following' | 'requested'
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); priv boolean;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if me = p_target then raise exception 'invalid_target'; end if;
  perform public.rate_limit('follow', 200, 3600);
  if public.is_blocked_either(me, p_target) then raise exception 'blocked' using errcode = '42501'; end if;
  select is_private into priv from public.profiles where id = p_target;
  if priv is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if priv then
    insert into public.follow_requests (requester_id, target_id) values (me, p_target) on conflict do nothing;
    perform public.notify(p_target, me, 'follow_request');
    return 'requested';
  end if;
  insert into public.follows (follower_id, following_id) values (me, p_target) on conflict do nothing;
  return 'following';
end $$;

create function public.unfollow_user(p_target uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  with a as (delete from public.follows where follower_id = auth.uid() and following_id = p_target)
  delete from public.follow_requests where requester_id = auth.uid() and target_id = p_target;
$$;

create function public.respond_follow_request(p_requester uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.follow_requests where requester_id = p_requester and target_id = auth.uid();
  if found and p_accept and not public.is_blocked_either(auth.uid(), p_requester) then
    insert into public.follows (follower_id, following_id) values (p_requester, auth.uid()) on conflict do nothing;
    perform public.notify(p_requester, auth.uid(), 'follow_accept');
  end if;
end $$;

create function public.remove_follower(p_follower uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.follows where follower_id = p_follower and following_id = auth.uid();
$$;

create function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.uid() = p_target then raise exception 'invalid_target'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_target) on conflict do nothing;
  delete from public.follows where (follower_id = auth.uid() and following_id = p_target) or (follower_id = p_target and following_id = auth.uid());
  delete from public.follow_requests where (requester_id = auth.uid() and target_id = p_target) or (requester_id = p_target and target_id = auth.uid());
end $$;

create function public.unblock_user(p_target uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_target;
$$;

-- ================================================================ posts RPCs
-- p_media: [{key,type,width,height,poster_key,duration_ms,size_bytes}]; keys must be under posts/{uid}/ (uploaded via presign).
-- p_poll : {question, options:[text,...], ends_at}
create function public.create_post(
  p_kind public.post_kind, p_caption text, p_media jsonb default '[]', p_poll jsonb default null,
  p_reply_parent uuid default null, p_cover_time_ms integer default null, p_music jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid(); pid uuid; root uuid; parent_row public.posts; m jsonb; i integer := 0;
  tags text[]; ptype public.post_type; opt text; has_vid boolean := false;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = me and onboarding_completed) then raise exception 'onboarding_required'; end if;
  perform public.rate_limit(case when p_kind = 'story' then 'story' else 'post' end, 30, 3600);

  if p_reply_parent is not null then
    if p_kind = 'story' then raise exception 'invalid_reply'; end if;
    select * into parent_row from public.posts where id = p_reply_parent and not is_hidden;
    if not found or not public.can_see_author(parent_row.author_id) then raise exception 'parent_not_visible' using errcode = '42501'; end if;
    -- Flat chains: root is always the top post; parent is the post being answered.
    root := coalesce(parent_row.reply_root_id, parent_row.id);
    p_reply_parent := parent_row.id;
  end if;

  if p_poll is not null then
    ptype := 'poll';
    if jsonb_array_length(p_poll -> 'options') not between 2 and 6 then raise exception 'invalid_poll'; end if;
  elsif jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then
    raise exception 'media_required';
  elsif jsonb_array_length(p_media) > 7 then
    raise exception 'too_many_media';
  else
    for m in select * from jsonb_array_elements(p_media) loop
      if (m ->> 'type') = 'video' then has_vid := true; end if;
    end loop;
    ptype := case when has_vid then 'video' else 'photo' end;
  end if;

  select coalesce(array_agg(t), '{}') into tags from (
    select distinct lower(x[1]) as t from regexp_matches(coalesce(p_caption, ''), '#([[:alnum:]_]{1,50})', 'g') as x limit 30
  ) s;

  insert into public.posts (author_id, kind, post_type, caption, hashtags, reply_root_id, reply_parent_id, cover_time_ms, music, expires_at)
  values (me, p_kind, ptype, coalesce(p_caption, ''), tags, root, p_reply_parent, p_cover_time_ms, p_music,
          case when p_kind = 'story' then now() + interval '24 hours' end)
  returning id into pid;

  if ptype <> 'poll' then
    for m in select * from jsonb_array_elements(p_media) loop
      if (m ->> 'key') not like ('posts/' || me::text || '/%') then raise exception 'invalid_media_key' using errcode = '42501'; end if;
      insert into public.post_media (post_id, position, type, key, width, height, poster_key, duration_ms, size_bytes)
      values (pid, i, (m ->> 'type')::public.media_type, m ->> 'key', (m ->> 'width')::int, (m ->> 'height')::int,
              m ->> 'poster_key', (m ->> 'duration_ms')::int, (m ->> 'size_bytes')::bigint);
      update public.pending_uploads set attached_at = now()
       where user_id = me and key in (m ->> 'key', coalesce(m ->> 'poster_key', ''));
      i := i + 1;
    end loop;
  else
    insert into public.polls (post_id, question, ends_at)
    values (pid, p_poll ->> 'question', least((p_poll ->> 'ends_at')::timestamptz, now() + interval '7 days'));
    for opt in select jsonb_array_elements_text(p_poll -> 'options') loop
      insert into public.poll_options (poll_id, position, text) values (pid, i, left(opt, 80));
      i := i + 1;
    end loop;
  end if;
  return pid;
end $$;

create function public.delete_post(p_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.posts where id = p_id and author_id = auth.uid();
$$;

create function public.toggle_like(p_post uuid) returns table (liked boolean, like_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); a uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select author_id into a from public.posts where id = p_post and not is_hidden;
  if a is null or not public.can_see_author(a) then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.likes l where l.post_id = p_post and l.user_id = me;
  if found then
    liked := false;
  else
    perform public.rate_limit('like', 300, 3600);
    insert into public.likes (post_id, user_id) values (p_post, me);
    liked := true;
  end if;
  select p.like_count into like_count from public.posts p where p.id = p_post;
  return next;
end $$;

create function public.toggle_save(p_post uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); a uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select author_id into a from public.posts where id = p_post and not is_hidden;
  if a is null or not public.can_see_author(a) then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.saves where post_id = p_post and user_id = me;
  if found then return false; end if;
  insert into public.saves (post_id, user_id) values (p_post, me);
  return true;
end $$;

create function public.vote_poll(p_poll uuid, p_option uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select p.author_id into a from public.polls pl join public.posts p on p.id = pl.post_id
   where pl.post_id = p_poll and pl.ends_at > now() and not p.is_hidden;
  if a is null or not public.can_see_author(a) then raise exception 'poll_closed_or_hidden' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.poll_options where id = p_option and poll_id = p_poll) then raise exception 'invalid_option'; end if;
  insert into public.poll_votes (poll_id, user_id, option_id) values (p_poll, auth.uid(), p_option);  -- PK blocks double votes
end $$;

create function public.view_story(p_post uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.story_views (post_id, viewer_id)
  select p.id, auth.uid() from public.posts p
   where p.id = p_post and p.kind = 'story' and p.expires_at > now() and public.can_see_author(p.author_id)
  on conflict do nothing;
$$;

create function public.mark_notifications_read() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create function public.trending_hashtags(p_hours integer default 48, p_limit integer default 10)
returns table (tag text, uses bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select t, count(*) from public.posts p, unnest(p.hashtags) t
   where p.created_at > now() - make_interval(hours => p_hours) and p.reply_root_id is null and p.kind = 'post'
   group by t order by count(*) desc, t limit least(p_limit, 50);
$$;

-- ================================================================ chat RPCs
create function public.dm_denied_reason(p_sender uuid, p_recipient uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w public.who_can_message; sender_follows boolean; recipient_follows boolean;
begin
  if p_sender = p_recipient then return 'invalid_recipient'; end if;
  select who_can_message into w from public.profiles where id = p_recipient;
  if w is null then return 'recipient_not_found'; end if;
  if public.is_blocked_either(p_sender, p_recipient) then return 'blocked'; end if;
  if w = 'none' then return 'messages_disabled'; end if;
  sender_follows    := public.is_following(p_sender, p_recipient);
  recipient_follows := public.is_following(p_recipient, p_sender);
  -- same semantics as the old sendCore.ts
  if w = 'following' and not recipient_follows then return 'only_following'; end if;
  if w = 'followers' and not sender_follows then return 'only_followers'; end if;
  if w = 'mutuals' and not (sender_follows and recipient_follows) then return 'only_mutuals'; end if;
  return null;
end $$;

create function public.get_or_create_direct(p_peer uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); k text; cid uuid; reason text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  reason := public.dm_denied_reason(me, p_peer);
  if reason is not null then raise exception '%', reason using errcode = '42501'; end if;
  k := least(me::text, p_peer::text) || '_' || greatest(me::text, p_peer::text);
  select id into cid from public.conversations where direct_key = k;
  if cid is null then
    insert into public.conversations (direct_key) values (k) on conflict (direct_key) do nothing returning id into cid;
    if cid is null then select id into cid from public.conversations where direct_key = k; end if;
    insert into public.conversation_members (conversation_id, user_id) values (cid, me), (cid, p_peer) on conflict do nothing;
    insert into public.conversation_read_state (conversation_id, user_id) values (cid, me), (cid, p_peer) on conflict do nothing;
  end if;
  update public.conversation_members set hidden_at = null where conversation_id = cid and user_id in (me, p_peer);
  return cid;
end $$;

create function public.send_message(p_peer uuid, p_body text, p_reply_to uuid default null,
                                    p_kind text default 'text', p_media_key text default null, p_media_meta jsonb default null)
returns public.messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); cid uuid; msg public.messages; clean text := nullif(trim(coalesce(p_body, '')), '');
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if clean is null and p_media_key is null then raise exception 'empty_message'; end if;
  if clean is not null and char_length(clean) > 2000 then raise exception 'message_too_long'; end if;
  perform public.rate_limit('message', 60, 60);
  cid := public.get_or_create_direct(p_peer);
  if p_media_key is not null then
    if p_media_key not like ('chat/' || cid::text || '/' || me::text || '/%') then raise exception 'invalid_media_key' using errcode = '42501'; end if;
    update public.pending_uploads set attached_at = now() where key = p_media_key and user_id = me;
  end if;
  if p_reply_to is not null and not exists (select 1 from public.messages where id = p_reply_to and conversation_id = cid) then
    p_reply_to := null;
  end if;
  insert into public.messages (conversation_id, sender_id, kind, body, media_key, media_meta, reply_to_id)
  values (cid, me, p_kind, clean, p_media_key, p_media_meta, p_reply_to) returning * into msg;
  return msg;
end $$;

create function public.tg_messages_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.conversations set last_message_id = new.id, last_message_at = new.created_at,
         last_sender_id = new.sender_id,
         last_preview = case new.kind when 'text' then left(new.body, 120) when 'image' then 'Fotoğraf' when 'video' then 'Video'
                                      when 'voice' then 'Ses mesajı' else 'Dosya' end
   where id = new.conversation_id;
  update public.conversation_read_state set unread_count = unread_count + 1
   where conversation_id = new.conversation_id and user_id <> new.sender_id;
  update public.conversation_read_state set last_read_at = new.created_at, last_read_seq = new.seq
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  update public.conversation_members set hidden_at = null where conversation_id = new.conversation_id;
  return null;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.tg_messages_after_insert();

create function public.mark_read(p_conv uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s bigint; t timestamptz;
begin
  if not public.is_conversation_member(p_conv) then raise exception 'not_member' using errcode = '42501'; end if;
  select max(seq), max(created_at) into s, t from public.messages where conversation_id = p_conv;
  update public.conversation_read_state set unread_count = 0, last_read_at = coalesce(t, now()), last_read_seq = coalesce(s, 0)
   where conversation_id = p_conv and user_id = auth.uid();
end $$;

-- "Unsend": clears content; the private R2 object is queued for deletion.
create function public.unsend_message(p_msg uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  select media_key into k from public.messages where id = p_msg and sender_id = auth.uid() and deleted_at is null;
  if not found then return; end if;
  perform public.enqueue_r2_delete('private', k);
  update public.messages set body = null, media_key = null, media_meta = null, deleted_at = now() where id = p_msg;
end $$;

create function public.set_reaction(p_msg uuid, p_emoji text) returns void   -- p_emoji null removes
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_access_message(p_msg) then raise exception 'not_member' using errcode = '42501'; end if;
  if p_emoji is null then
    delete from public.message_reactions where message_id = p_msg and user_id = auth.uid();
  else
    insert into public.message_reactions (message_id, user_id, emoji) values (p_msg, auth.uid(), left(p_emoji, 16))
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end $$;

-- Presence: cheap heartbeat column instead of a global Realtime presence channel.
create function public.touch_presence() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

-- last_seen only for people the caller shares a conversation with, and only if the peer shows online status.
create function public.peer_presence(p_peer uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select p.last_seen_at from public.profiles p
   where p.id = p_peer and p.show_online_status and not public.is_blocked_either(p.id, auth.uid())
     and exists (select 1 from public.conversation_members a join public.conversation_members b using (conversation_id)
                  where a.user_id = auth.uid() and b.user_id = p_peer);
$$;

-- ================================================================ account deletion (KVKK)
-- R2 objects are removed by the delete queue (triggers on cascaded post_media / profiles / messages rows).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();      -- cascades to profiles and every owned row
end $$;

-- Data export (KVKK access request).
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'profile',  (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'private',  (select to_jsonb(pp) from public.profile_private pp where pp.user_id = auth.uid()),
    'posts',    coalesce((select jsonb_agg(to_jsonb(x)) from public.posts x where x.author_id = auth.uid()), '[]'),
    'comments', coalesce((select jsonb_agg(to_jsonb(c)) from public.comments c where c.author_id = auth.uid()), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(m)) from public.messages m where m.sender_id = auth.uid()), '[]'),
    'follows',  coalesce((select jsonb_agg(to_jsonb(f)) from public.follows f where f.follower_id = auth.uid()), '[]')
  );
$$;

-- ================================================================ privileges
-- Lock down by default; grant explicit table/column/function access. service_role keeps full access.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.follows, public.follow_requests, public.blocks, public.posts, public.post_media,
  public.likes, public.saves, public.comments, public.polls, public.poll_options, public.poll_votes, public.badges,
  public.user_badges, public.story_views, public.notes, public.conversations, public.conversation_members,
  public.conversation_read_state, public.messages, public.message_reactions, public.push_subscriptions,
  public.notifications, public.reports, public.profile_private to authenticated;
grant select on public.profiles, public.posts, public.post_media, public.polls, public.poll_options, public.badges,
  public.user_badges, public.follows, public.comments to anon;
grant update (display_name, bio, avatar_key, is_private, who_can_message, read_receipts, show_online_status, profile_style)
  on public.profiles to authenticated;
grant update (birth_date) on public.profile_private to authenticated;
grant update (caption) on public.posts to authenticated;
grant insert, delete on public.likes, public.saves to authenticated;
grant insert, delete on public.comments to authenticated;
grant insert, update, delete on public.notes to authenticated;
grant insert, delete on public.push_subscriptions to authenticated;
grant update (last_used_at) on public.push_subscriptions to authenticated;
grant update (read_at), delete on public.notifications to authenticated;
grant update (muted, hidden_at) on public.conversation_members to authenticated;
grant insert on public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;   -- moderators only (RLS)
grant update (is_hidden), delete on public.posts to authenticated;                    -- moderators / author (RLS)

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.can_see_author(uuid), public.is_blocked_either(uuid, uuid), public.is_following(uuid, uuid), public.is_admin(),
  public.check_username_available(text), public.try_uuid(text), public.trending_hashtags(integer, integer)
  to anon, authenticated;
grant execute on function
  public.claim_username(text), public.complete_onboarding(text, text, date), public.follow_user(uuid), public.unfollow_user(uuid),
  public.respond_follow_request(uuid, boolean), public.remove_follower(uuid), public.block_user(uuid), public.unblock_user(uuid),
  public.create_post(public.post_kind, text, jsonb, jsonb, uuid, integer, jsonb), public.delete_post(uuid),
  public.toggle_like(uuid), public.toggle_save(uuid), public.vote_poll(uuid, uuid), public.view_story(uuid),
  public.mark_notifications_read(), public.get_or_create_direct(uuid),
  public.send_message(uuid, text, uuid, text, text, jsonb), public.mark_read(uuid), public.unsend_message(uuid),
  public.set_reaction(uuid, text), public.touch_presence(), public.peer_presence(uuid), public.delete_my_account(),
  public.export_my_data(), public.is_conversation_member(uuid), public.can_access_message(uuid)
  to authenticated;
