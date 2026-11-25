-- 0006: read models and feed RPCs. Feed algorithm is intentionally simple (no ranking/ML):
--   home_feed  = (my posts + people I follow) newest first; if the page is short, filled with recent public posts newest first.
--   reels_feed = recent public videos, newest first.
--   post_replies('popular') = most likes, then newest.
-- Views are SECURITY INVOKER so RLS (blocks, private accounts, hidden, expired stories) applies to the caller.

create view public.post_cards with (security_invoker = true) as
select
  p.id, p.kind, p.post_type, p.author_id,
  pr.username, pr.display_name, pr.avatar_key, pr.is_verified,
  p.caption, p.hashtags, p.reply_root_id, p.reply_parent_id, p.cover_time_ms, p.music, p.has_video,
  p.like_count, p.reply_count, p.comment_count, p.created_at, p.expires_at,
  exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
  exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me,
  coalesce((select jsonb_agg(jsonb_build_object('type', m.type, 'key', m.key, 'width', m.width, 'height', m.height,
                                                'poster_key', m.poster_key, 'duration_ms', m.duration_ms) order by m.position)
              from public.post_media m where m.post_id = p.id), '[]'::jsonb) as media,
  (select jsonb_build_object(
            'question', pl.question, 'ends_at', pl.ends_at,
            'my_vote', (select v.option_id from public.poll_votes v where v.poll_id = pl.post_id and v.user_id = auth.uid()),
            'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text, 'votes', o.vote_count, 'art', o.art) order by o.position)
                          from public.poll_options o where o.poll_id = pl.post_id))
     from public.polls pl where pl.post_id = p.id) as poll
from public.posts p
join public.profiles pr on pr.id = p.author_id;

grant select on public.post_cards to anon, authenticated;

-- ---------------------------------------------------------------- home feed
create function public.home_feed(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 10)
returns setof public.post_cards
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  lim integer := least(greatest(p_limit, 1), 50);
  got integer := 0;
  cur uuid := coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
  me uuid := auth.uid();
  r public.post_cards;
begin
  -- 1) mine + followed
  for r in
    select c.* from public.post_cards c
     where c.reply_root_id is null and c.kind = 'post'
       and (p_before is null or (c.created_at, c.id) < (p_before, cur))
       and (c.author_id = me or exists (select 1 from public.follows f where f.follower_id = me and f.following_id = c.author_id))
     order by c.created_at desc, c.id desc
     limit lim
  loop
    return next r; got := got + 1;
  end loop;
  -- 2) thin feed (new user / end of following posts): fill with recent public posts. Cursor keeps paging by time.
  if got < lim then
    for r in
      select c.* from public.post_cards c
       where c.reply_root_id is null and c.kind = 'post'
         and (p_before is null or (c.created_at, c.id) < (p_before, cur))
         and not (c.author_id = me or exists (select 1 from public.follows f where f.follower_id = me and f.following_id = c.author_id))
       order by c.created_at desc, c.id desc
       limit lim - got
    loop
      return next r;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------- reels (public videos, newest first; already global so no fallback needed)
create function public.reels_feed(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 8)
returns setof public.post_cards
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.* from public.post_cards c
   where c.reply_root_id is null and c.has_video and c.kind in ('post', 'reels')
     and (p_before is null or (c.created_at, c.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by c.created_at desc, c.id desc
   limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------- reply chain: 'popular' = likes desc then newest (p_min_likes = 1 for the rail), 'new' = newest first
create function public.post_replies(p_root uuid, p_sort text default 'popular', p_limit integer default 50, p_offset integer default 0, p_min_likes integer default 0)
returns setof public.post_cards
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.* from public.post_cards c
   where c.reply_root_id = p_root and c.like_count >= p_min_likes
   order by case when p_sort = 'popular' then c.like_count end desc nulls last, c.created_at desc, c.id desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------- profile grid / hashtag: plain filtered reads of post_cards, keyset on (created_at,id)
create function public.profile_posts(p_user uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 18)
returns setof public.post_cards
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.* from public.post_cards c
   where c.author_id = p_user and c.reply_root_id is null and c.kind <> 'story'
     and (p_before is null or (c.created_at, c.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by c.created_at desc, c.id desc limit least(greatest(p_limit, 1), 50);
$$;

create function public.hashtag_posts(p_tag text, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 18)
returns setof public.post_cards
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.* from public.post_cards c
   where c.hashtags @> array[lower(p_tag)] and c.reply_root_id is null and c.kind = 'post'
     and (p_before is null or (c.created_at, c.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by c.created_at desc, c.id desc limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------- story tray
create function public.story_tray()
returns table (author_id uuid, username extensions.citext, avatar_key text, latest_at timestamptz, story_count bigint, has_unseen boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.author_id, pr.username, pr.avatar_key, max(p.created_at), count(*),
         bool_or(not exists (select 1 from public.story_views v where v.post_id = p.id and v.viewer_id = auth.uid()))
    from public.posts p join public.profiles pr on pr.id = p.author_id
   where p.kind = 'story' and p.expires_at > now()
     and (p.author_id = auth.uid() or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.author_id))
   group by p.author_id, pr.username, pr.avatar_key
   order by (p.author_id = auth.uid()) desc, 6 desc, 4 desc;
$$;

-- ---------------------------------------------------------------- user search (username / display name prefix + trigram)
create function public.search_users(p_q text, p_limit integer default 20)
returns table (id uuid, username extensions.citext, display_name text, avatar_key text, is_verified boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select p.id, p.username, p.display_name, p.avatar_key, p.is_verified from public.profiles p
   where p.username is not null and length(p_q) >= 2
     and (p.username::text ilike replace(replace(p_q, '%', ''), '_', '\_') || '%' or p.display_name ilike '%' || replace(p_q, '%', '') || '%')
   order by (p.username::text ilike p_q || '%') desc, p.followers_count desc limit least(p_limit, 50);
$$;

revoke execute on function public.home_feed, public.reels_feed, public.post_replies, public.profile_posts, public.hashtag_posts,
  public.story_tray, public.search_users from public;
grant execute on function public.home_feed, public.reels_feed, public.post_replies, public.profile_posts, public.hashtag_posts,
  public.search_users to anon, authenticated;
grant execute on function public.story_tray to authenticated;
