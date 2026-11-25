-- Shovrum / Supabase migration 0001: extensions, enums, profiles, social graph, helper functions.
-- Target: Postgres 15 (Supabase). Idempotency is not attempted; run once via `supabase db push`.

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.who_can_message as enum ('everyone', 'following', 'followers', 'mutuals', 'none');
create type public.post_kind       as enum ('post', 'reels', 'story');
create type public.post_type       as enum ('photo', 'video', 'poll');
create type public.media_type      as enum ('image', 'video');
create type public.notification_type as enum ('like', 'reply', 'comment', 'follow', 'follow_request', 'follow_accept', 'mention', 'badge');
create type public.report_target   as enum ('user', 'post', 'comment', 'message', 'story');
create type public.report_reason   as enum ('spam', 'harassment', 'hate', 'nudity', 'self_harm', 'violence', 'impersonation', 'underage', 'other');
create type public.report_status   as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- ---------------------------------------------------------------- generic helpers
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------- profiles
-- Firestore users/{uid}. Public data only; birth date lives in profile_private.
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             extensions.citext unique,                     -- null until claimed in onboarding
  display_name         text not null default '' check (char_length(display_name) <= 50),
  bio                  text not null default '' check (char_length(bio) <= 300),
  avatar_key           text,                                         -- Cloudflare R2 object key (public prefix `avatars/`)
  is_verified          boolean not null default false,
  is_private           boolean not null default false,               -- Firestore isPrivate
  who_can_message      public.who_can_message not null default 'everyone',
  read_receipts        boolean not null default true,
  show_online_status   boolean not null default true,
  profile_style        jsonb not null default '{"v":1,"theme":"default","banner":null,"song":null}'::jsonb
                         check (jsonb_typeof(profile_style) = 'object' and pg_column_size(profile_style) < 4096),
  role                 text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  onboarding_completed boolean not null default false,
  followers_count      integer not null default 0 check (followers_count >= 0),
  following_count      integer not null default 0 check (following_count >= 0),
  posts_count          integer not null default 0 check (posts_count >= 0),
  last_seen_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint username_format check (username is null or username operator(extensions.~) '^[a-z0-9_]{3,15}$')
);
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_trgm  on public.profiles using gin (display_name extensions.gin_trgm_ops);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- Private per-user data (own-row access only).
create table public.profile_private (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  birth_date date check (birth_date is null or birth_date <= current_date),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- social graph
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id, created_at desc);

create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------- visibility helpers (used by RLS everywhere)
create function public.is_blocked_either(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function public.is_following(follower uuid, target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.follows where follower_id = follower and following_id = target);
$$;

-- Can the current user see content authored by `a`? (self, or not blocked and (public account or approved follower))
create function public.can_see_author(a uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select a is not null and (
    a = auth.uid()
    or (
      not public.is_blocked_either(a, auth.uid())
      and (
        not exists (select 1 from public.profiles p where p.id = a and p.is_private)
        or public.is_following(auth.uid(), a)
      )
    )
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'moderator'));
$$;

-- ---------------------------------------------------------------- rate limiting
create table public.rate_events (
  user_id uuid not null,
  action  text not null,
  at      timestamptz not null default now()
);
create index rate_events_idx on public.rate_events (user_id, action, at desc);

-- Raises 'rate_limited' when the current user did `p_action` more than p_max times in the window.
create function public.rate_limit(p_action text, p_max integer, p_window_seconds integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select count(*) into n from public.rate_events
   where user_id = auth.uid() and action = p_action and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then raise exception 'rate_limited' using errcode = 'P0429', hint = p_action; end if;
  insert into public.rate_events (user_id, action) values (auth.uid(), p_action);
end $$;

-- ---------------------------------------------------------------- auth hook: create a profile for each new auth user
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name, avatar_key)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 50),
    null
  )
  on conflict (id) do nothing;
  insert into public.profile_private (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
