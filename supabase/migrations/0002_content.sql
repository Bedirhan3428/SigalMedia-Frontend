-- 0002: posts, media (R2 keys), likes, saves, comments, polls, hashtags, badges, stories, notes.
-- Media bytes live in Cloudflare R2; the DB stores only object keys. Public URL = NEXT_PUBLIC_MEDIA_BASE_URL + '/' + key.

create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references public.profiles (id) on delete cascade,
  kind            public.post_kind not null default 'post',
  post_type       public.post_type not null default 'photo',
  caption         text not null default '' check (char_length(caption) <= 2200),
  hashtags        text[] not null default '{}' check (cardinality(hashtags) <= 30),
  -- Flat reply chains (depth always 1): replies point at the root; parent is the post being answered (UI "replying to").
  reply_root_id   uuid references public.posts (id) on delete cascade,
  reply_parent_id uuid references public.posts (id) on delete cascade,
  cover_time_ms   integer check (cover_time_ms is null or cover_time_ms >= 0),
  music           jsonb,                                  -- {title, artist, trackId, previewUrl, artworkUrl} (iTunes)
  has_video       boolean not null default false,         -- maintained from post_media
  like_count      integer not null default 0 check (like_count >= 0),
  reply_count     integer not null default 0 check (reply_count >= 0),   -- all replies in the chain (on root)
  comment_count   integer not null default 0 check (comment_count >= 0),
  is_hidden       boolean not null default false,         -- moderation (auto-hide on reports / admin)
  expires_at      timestamptz,                            -- stories only
  created_at      timestamptz not null default now(),
  check ((kind = 'story') = (expires_at is not null)),
  check (kind <> 'story' or reply_root_id is null),
  check ((reply_root_id is null) = (reply_parent_id is null))
);
-- Home feed / hashtag / reels / profile grid / chain / story tray
create index posts_feed_idx     on public.posts (created_at desc, id desc) where reply_root_id is null and kind = 'post' and not is_hidden;
create index posts_author_idx   on public.posts (author_id, created_at desc, id desc) where reply_root_id is null;
create index posts_reels_idx    on public.posts (created_at desc, id desc) where reply_root_id is null and has_video and kind in ('post', 'reels') and not is_hidden;
create index posts_root_idx     on public.posts (reply_root_id, like_count desc, created_at desc) where reply_root_id is not null;
create index posts_hashtags_idx on public.posts using gin (hashtags);
create index posts_story_idx    on public.posts (author_id, expires_at) where kind = 'story';

create table public.post_media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  position    smallint not null check (position between 0 and 6),   -- max 7 media per post
  type        public.media_type not null,
  key         text not null check (char_length(key) <= 300),        -- R2 object key, e.g. posts/{uid}/{uuid}.jpg
  width       integer check (width > 0),
  height      integer check (height > 0),
  poster_key  text,                                                  -- video poster (R2 key)
  duration_ms integer check (duration_ms >= 0),
  size_bytes  bigint check (size_bytes >= 0),
  unique (post_id, position)
);

create table public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user_idx on public.likes (user_id, created_at desc);

create table public.saves (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index saves_user_idx on public.saves (user_id, created_at desc);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

-- Polls (post_type = 'poll')
create table public.polls (
  post_id  uuid primary key references public.posts (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  ends_at  timestamptz not null
);
create table public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (post_id) on delete cascade,
  position   smallint not null check (position between 0 and 5),
  text       text not null check (char_length(text) between 1 and 80),
  art        text,
  vote_count integer not null default 0 check (vote_count >= 0),
  unique (poll_id, position)
);
create table public.poll_votes (
  poll_id    uuid not null references public.polls (post_id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index poll_votes_user_idx on public.poll_votes (user_id);

-- Badges (catalog = reference data, mirrors src/lib/feed/badgeRules.ts)
create table public.badges (
  id          text primary key,
  kind        text not null check (kind in ('achievement', 'post', 'poll')),
  tier        text check (tier in ('bronz', 'gumus', 'altin')),
  name        text not null,
  description text not null,
  glyph       text not null
);
create table public.user_badges (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  badge_id  text not null references public.badges (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
insert into public.badges (id, kind, tier, name, description, glyph) values
  ('ilk',    'achievement', 'bronz', 'İlk Gönderi',    'İlk gönderini paylaştın.',                      'g-pen'),
  ('seri',   'achievement', 'gumus', '7 Günlük Seri',  '7 gün üst üste paylaşım yaptın.',               'g-flame'),
  ('begeni', 'achievement', 'gumus', '100 Beğeni',     'Gönderilerin toplam 100 beğeni aldı.',          'g-heart'),
  ('zincir', 'achievement', 'altin', 'Zincir Ustası',  '3 yanıt zinciri başlattın ya da sürdürdün.',    'g-link'),
  ('trend',  'achievement', 'altin', 'Trend Avcısı',   'Gündemdeki bir gönderiye yanıt verdin.',        'g-trend'),
  ('kahin',  'poll',        'gumus', 'Kahin',          '10 ankete oy verdin.',                          'g-eye'),
  ('kral',   'poll',        'altin', 'Anket Kralı',    'Haftanın en çok oy alan anketi senin.',         'g-crown'),
  ('oy',     'poll',        'bronz', 'Oy Avcısı',      '50 ankete oy verdin.',                          'g-vote');

-- Stories are posts with kind='story' (+ expires_at). Views:
create table public.story_views (
  post_id    uuid not null references public.posts (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (post_id, viewer_id)
);
create index story_views_viewer_idx on public.story_views (viewer_id, viewed_at desc);

-- Notes (short status, 24h)
create table public.notes (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

-- Media uploaded to R2 but not yet attached to a post (orphan tracking / quota; see docs/SUPABASE_PLAN.md)
create table public.pending_uploads (
  key        text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  bucket     text not null default 'public' check (bucket in ('public', 'private')),
  content_type text not null,
  max_bytes  bigint not null,
  created_at timestamptz not null default now(),
  attached_at timestamptz
);
create index pending_uploads_gc_idx on public.pending_uploads (created_at) where attached_at is null;
create index pending_uploads_user_idx on public.pending_uploads (user_id, created_at desc);
