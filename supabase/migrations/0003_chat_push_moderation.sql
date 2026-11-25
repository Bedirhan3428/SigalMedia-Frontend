-- 0003: chat, push subscriptions, notifications, reports.
-- Messages are stored as plaintext (TLS + encryption at rest + RLS). The previous "RSA envelope" was server-decrypted
-- and stored plaintext in RTDB anyway, so nothing is lost; see docs/SUPABASE_PLAN.md for the E2EE trade-off.

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  direct_key      text not null unique,            -- least(uid)||'_'||greatest(uid): same shape as the old RTDB chatId
  created_at      timestamptz not null default now(),
  last_message_id uuid,
  last_message_at timestamptz,
  last_preview    text,
  last_sender_id  uuid
);
create index conversations_last_idx on public.conversations (last_message_at desc nulls last);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  muted           boolean not null default false,
  hidden_at       timestamptz,                      -- "delete chat" for me
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

-- Read state is its own table so RLS can hide a user's read time from the peer when read_receipts = false.
create table public.conversation_read_state (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default 'epoch',
  last_read_seq   bigint not null default 0,
  unread_count    integer not null default 0 check (unread_count >= 0),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,       -- stable cursor for paging
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  kind            text not null default 'text' check (kind in ('text', 'image', 'video', 'voice', 'file')),
  body            text check (char_length(body) <= 2000),
  media_key       text,                                      -- R2 key in the PRIVATE bucket (chat/{conversation}/{uid}/{uuid}.ext)
  media_meta      jsonb,
  reply_to_id     uuid references public.messages (id) on delete set null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,                               -- "unsend": body/media nulled by RPC
  check (deleted_at is not null or body is not null or media_key is not null)
);
create index messages_conv_idx on public.messages (conversation_id, seq desc);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)                          -- one reaction per person
);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%'),
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,   -- recipient
  actor_id        uuid references public.profiles (id) on delete cascade,
  type            public.notification_type not null,
  post_id         uuid references public.posts (id) on delete cascade,
  comment_id      uuid references public.comments (id) on delete cascade,
  data            jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create unique index notifications_dedupe on public.notifications
  (user_id, actor_id, type, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where type in ('like', 'follow', 'follow_request', 'follow_accept');

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  target_type      public.report_target not null,
  target_id        uuid not null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 1000),
  context          jsonb,                                  -- e.g. snapshot of the reported message(s): reporter-supplied evidence
  status           public.report_status not null default 'open',
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
