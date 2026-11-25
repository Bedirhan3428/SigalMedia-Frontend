# Shovrum: Firebase to Supabase + Cloudflare R2 migration plan (WP-39)

Status: design and SQL only. No live project exists. Nothing in `src/` imports the new code.
Files: `supabase/migrations/0001..0007*.sql`, `supabase/seed.sql`, `supabase/config.toml`, `src/lib/supabase/{client,types}.ts` (unwired stub).

Owner decisions baked in:
- Supabase = Postgres + RLS, Auth, Realtime, Edge Functions. **Media = Cloudflare R2** (not Supabase Storage); the DB stores R2 object keys only.
- Feed algorithm stays simple: no ranking, no personalization.
- Frontend-only rule stays: all calls hide behind the existing service layers (thin adapters).

## 0. Cost policy and portability (owner decision 2026-11-25, overrides later sections)

- **No paid Supabase plan.** The beta runs on the Supabase Free tier. Wherever this document says "Pro before launch", read "Free for the beta". If the beta goes well we move to **our own servers on Oracle** (own Postgres etc.), not to Supabase Pro.
- Free tier facts to respect: ~500 MB database (media is on R2, so rows only), ~200 concurrent Realtime connections, project pauses only after ~7 days without requests (an active beta keeps it awake), no PITR — take a `pg_dump` before each cutover phase and weekly during the beta.
- **Portability first:** keep business logic in plain Postgres (tables, RLS, SQL RPCs, triggers) and in **Next.js API routes on Vercel**, not in Supabase-only features. Concretely: `send-push` and `r2-reaper` become Next route handlers (`/api/push/send` called by a Postgres trigger via `pg_net` or a Database Webhook with a shared secret; `/api/media/reap` on a daily Vercel Cron), not Edge Functions. Supabase Auth (GoTrue) and Realtime are open source, so the Oracle exit path is either self-hosting Supabase on an Oracle VM (no app changes) or Postgres + GoTrue + a small websocket service behind the same service-layer seams.
- Avoid: Supabase Storage, Edge Functions, Vault-only secrets, and dashboard-only configuration that isn't captured in `supabase/` files.

## 1. Inventory: Firebase feature to Supabase equivalent

| Today (Firebase / local) | Supabase / R2 equivalent |
|---|---|
| Auth (Google, email+password, custom 4-digit email code via Cloud Function + Resend) | Supabase Auth: Google OAuth, email+password, built-in email confirmation (custom SMTP). Custom code flow retired. |
| Firestore `users`, `usernames` | `profiles` (username `citext unique`), `profile_private` (birth date), RPC `claim_username` / `complete_onboarding` |
| Firestore `follows`, `follow_requests`, `blocks` (+ `/api/users/*`) | `follows`, `follow_requests`, `blocks`; RPC `follow_user`, `unfollow_user`, `respond_follow_request`, `remove_follower`, `block_user`, `unblock_user` |
| Firestore `posts` (type post/reels/story, replyTo, media[], audio) | `posts` (+ `post_media`, `polls`, `poll_options`); RPC `create_post`, `delete_post` |
| Firebase Storage `posts/`, `avatars/` | R2 public bucket, keys `posts/{uid}/{uuid}.ext`, `avatars/{uid}/{uuid}.ext` |
| RTDB `chats`, `user_chats`, reactions, read receipts | `conversations`, `conversation_members`, `conversation_read_state`, `messages`, `message_reactions`; RPC `send_message`, `mark_read`, `set_reaction`, `unsend_message` |
| RTDB `typing`, `presence` | Realtime broadcast channel `chat:{conversation_id}` (typing, ephemeral); presence = `profiles.last_seen_at` heartbeat via `touch_presence()` and `peer_presence()` |
| `/api/messages/*` (RSA public key, send) | Dropped: `send_message` RPC does validation, block/privacy check, rate limit |
| Web push (`push_subscriptions` Firestore, `/api/push/*`, VAPID, reply token) | `push_subscriptions` table + Edge Function `send-push` (web-push) fired by Database Webhooks |
| **Local only:** likes (localStorage) | `likes` + `posts.like_count` trigger, RPC `toggle_like` |
| **Local only:** saves | `saves` (private), RPC `toggle_save` |
| **Local only:** polls and votes | `polls`, `poll_options`, `poll_votes` (PK blocks double vote), RPC `vote_poll` |
| **Local only:** badges and rules (`badgeRules.ts`) | `badges` (seeded catalog), `user_badges`, awarded by triggers (`ilk`, `zincir`, `begeni`, `kahin`, `oy`). `seri`, `trend`, `kral` need a daily cron later. |
| **Local only:** created replies / counters | real `posts` rows; `reply_count`, `comment_count` by trigger |
| Comments (new feature) | `comments` (flat) |
| `profileStyleStore` (Firestore field) | `profiles.profile_style jsonb` (size-capped; keep `parseProfileStyle` validation client-side) |
| Stories / notes | `posts kind='story'` (+`expires_at`, 24h) + `story_views`; `notes` table; RPC `story_tray`, `view_story` |
| iTunes music | unchanged (stored in `posts.music` / `profile_style.song`) |
| Hashtags | `posts.hashtags text[]` + GIN index (extracted server-side in `create_post`), RPC `hashtag_posts`, `trending_hashtags` |
| Cloud Functions / Express backend | Removed. Postgres RPC + Edge Functions + two Next route handlers (presign, account deletion) |

## 2. Auth

- Providers: Google + email/password. Email confirmation ON (`config.toml`); production needs custom SMTP (Resend is already used; use its SMTP). The home-grown 4-digit code flow and its Cloud Function are retired. Optional later: Supabase OTP email.
- Profile row is created by trigger `on_auth_user_created` (username null). Onboarding calls `complete_onboarding(username, display_name, birth_date)`: validates `^[a-z0-9_]{3,15}$`, reserved names, uniqueness (unique violation = `username_unavailable`), refuses under 13, and for a teen audience applies safer defaults (under 16: private account; under 18: `who_can_message='following'`, i.e. only people they follow can start a DM).
- Existing Firebase users (few): **re-signup** is recommended (owner announces; usernames can be reserved by hand via SQL). Import is possible (Google users map by email; email/password hashes are Firebase scrypt and need the Supabase `auth.users` import with the scrypt parameters), but with only a handful of accounts it is not worth the risk. Content of those users is migrated by script (section 7) after they re-signup, matched by email.
- Next sessions: `@supabase/ssr`. Browser: `createBrowserClient` (`src/lib/supabase/client.ts`). Server routes / RSC: `createServerClient` with `next/headers` cookies; a `middleware.ts` (Next 16 proxy) refreshes the session. Server code always uses `auth.getUser()` (verifies JWT), never `getSession()`, for authorization. Route handlers verify the Supabase JWT instead of `adminAuth.verifyIdToken`.
- `service_role` key only in server env (Vercel / Edge Function secrets), never `NEXT_PUBLIC_`.

## 3. Data model and RLS summary

All tables have RLS on. Default privileges are revoked for `anon` / `authenticated`, then granted per table/column/function (migration 0004 end). Writes go through `SECURITY DEFINER` RPCs with `search_path` pinned; direct DML is granted only where harmless (likes, saves, comments, notes, own push subscription, notification read flag, profile columns).

| Area | Rule |
|---|---|
| profiles | public read (anon too) except across a block; update own row, only whitelisted columns (counters, role, username, verified are not writable) |
| posts / media / polls | visible if `can_see_author(author)`: self, or not blocked and (public account or I follow them). Hidden posts and expired stories invisible. Children inherit via sub-select on posts |
| likes/saves/comments | tied to post visibility; saves private; comment delete by author, post owner or moderator |
| follows / requests / blocks | read only; mutations only via RPC (private account becomes follow request; block removes both follows) |
| chat | members only (`is_conversation_member`); no direct INSERT on messages; peer's read time visible only if that peer has `read_receipts=true` |
| notifications, push, reports | own rows; moderators (`role in admin, moderator`) read/resolve reports and hide posts |

Indexes: home feed `(created_at desc, id desc)` partial on roots/kind post; per-author `(author_id, created_at desc, id desc)`; reels partial on `has_video`; chain `(reply_root_id, like_count desc, created_at desc)`; GIN on hashtags; trigram on username and display name; `messages (conversation_id, seq desc)`.

Counters (`like_count`, `reply_count`, `comment_count`, `posts_count`, followers/following, poll `vote_count`) are maintained by triggers, not computed on read.

Flat chains: `reply_root_id` (top post) and `reply_parent_id` (post answered); `create_post` normalizes so depth is always 1 and roots can never be replies.

## 4. Media on Cloudflare R2

> **Owner decision 2026-11-25 (overrides the public-bucket/CDN delivery below):** all media (posts, Reels, stories, avatars, chat) is read **directly from R2 with presigned GET URLs** — no public bucket, no proxying bytes through our servers. Our server only signs.
> - One private bucket (`shovrum-media`) with prefixes `posts/`, `avatars/`, `stories/`, `chat/`. No public access, no `r2.dev`.
> - Signing happens in batch where data is read: feed/reels/profile/chat API responses (Next route handlers calling the RPC with the user's JWT) return rows plus presigned GET URLs for every key the user is allowed to see (RLS decides visibility; private accounts and chat get access control for free).
> - **Cache-friendly signing:** expiry rounded to fixed windows (e.g. URLs valid until the end of the current 6-hour window + 6 h, signed with the window start as the signing date) so the same key yields the same URL within a window → browser/HTTP cache hits and the `<video>` element doesn't refetch. Client keeps a small key→URL cache and re-requests signatures only when a URL is near expiry or a 403 occurs (refresh + retry once).
> - Trade-off, accepted for the beta: presigned S3-endpoint URLs are not served from Cloudflare's CDN cache, so every first fetch is an R2 Class B operation (generous free tier) and latency is R2-origin rather than edge. Mitigations: fast-start MP4s, posters as small JPEGs, range requests (R2 supports them), preloading the next reel. If latency hurts later: a Worker on a custom domain that validates our own HMAC token and serves from cache — still no bytes through our app servers.
> - Uploads stay as below (presigned PUT / multipart), into the same private bucket.

**Buckets / prefixes.** `shovrum-public` (custom domain `media.<domain>` behind Cloudflare CDN, public read): `posts/{uid}/{uuid}.{ext}` (incl. posters, stories) and `avatars/{uid}/{uuid}.{ext}`. `shovrum-private` (no public access): `chat/{conversationId}/{uid}/{uuid}.{ext}`, and optionally private-account media later. Public URL = `NEXT_PUBLIC_MEDIA_BASE_URL + '/' + key` (helper `mediaUrl()`).

**Upload (presign endpoint = Next route handler on Vercel, `POST /api/media/presign`).** Chosen over an Edge Function because it reuses the existing `src/app/api` structure, the AWS SDK v3 S3 presigner runs natively in Node, and it needs no extra deploy target; the cost is that Vercel function time is spent only on tiny signing calls. Flow:
1. Client calls the route with the Supabase session; the route calls `getUser()`.
2. Server checks content-type allow-list (jpeg/png/webp/heic-converted, mp4/webm/quicktime, audio for voice), declared size vs per-type cap (image 10 MB, video 100 MB, avatar 2 MB, chat 25 MB), and a per-user quota (rows in `pending_uploads` last hour/day + `rate_events`).
3. Server generates the key (`posts/{uid}/{uuid}.{ext}`, server-chosen, never client-chosen), inserts a `pending_uploads` row (service role), and returns a presigned **PUT** (5-10 min expiry, `Content-Type` and `Content-Length` signed).
4. Large videos: **S3 multipart**. Server endpoints `multipart/create`, `multipart/sign-part` (presigned UploadPart URLs, 8 MB parts), `multipart/complete`, `multipart/abort`. This keeps the `uploadQueue.ts` UX: per-part progress, per-part retry, resume by re-requesting part URLs, abort. Files under ~8 MB use a single PUT.
5. After upload the client calls `create_post(...)` (or `complete_onboarding`/avatar update, `send_message`) referencing the keys. The RPC enforces the `posts/{uid}/` prefix, so a user cannot attach someone else's object, and marks `pending_uploads.attached_at`.

**Orphans.** Uploads never attached within 24h are cleaned by `gc_pending_uploads()` (daily cron) which queues R2 deletes. Belt and braces: an R2 lifecycle rule that expires objects under a `tmp/` prefix if you prefer tmp-then-copy; the pending table approach is the default because it needs no copy step.

**Deletion.** Triggers enqueue R2 deletes into `r2_delete_queue` whenever a `post_media` row (including poster), an avatar key, or a message with media disappears, which also covers cascades from post delete, account deletion and moderation. Edge Function `r2-reaper` (cron every minute) drains the queue with S3 DeleteObjects and retries. Account deletion therefore needs no per-file logic in the app.

**Private media.** Chat attachments: bucket is private; client asks `POST /api/media/sign-get {messageId}`; server verifies membership via an RLS-checked select on `messages` with the user's JWT, then returns a presigned GET (about 5 min). Optional later: private-account posts in the private bucket with the same pattern (costs CDN caching). Launch trade-off: public-account and private-account post media live in the public bucket under unguessable UUID keys (URLs are not enumerable but are bearer links). Decide before launch whether private accounts matter enough for the private-bucket path; the schema does not need to change (`key` is bucket-agnostic; add a `bucket` column if needed).

**Delivery.** Cache headers `Cache-Control: public, max-age=31536000, immutable` set at upload (keys are unique, never overwritten). CORS on both buckets: origins = production + preview domains + localhost; methods `GET, HEAD, PUT`; headers `Content-Type, Content-Length, x-amz-*`; expose `ETag` (required for multipart completion). No image transformation service at launch: keep client-side compression, poster generation and mp4-muxer. Later options: Cloudflare Images / Image Resizing or a Worker for thumbnails and responsive sizes.

## 5. Chat

Tables: `conversations` (direct only, `direct_key = sortedUid1_sortedUid2`, same shape as old RTDB chatId, which simplifies migration), `conversation_members` (mute, hide), `conversation_read_state` (unread_count, last_read_at/seq; separate table so RLS can hide read time when receipts are off), `messages` (kind, body, media_key, reply_to_id, soft unsend), `message_reactions` (one per user).

Realtime:
- **postgres_changes** on `messages` (filter `conversation_id=eq.X`), `conversation_read_state`, `notifications`, `message_reactions`. RLS is applied per subscriber, so privacy holds. Simplest and correct for launch. Known limit: RLS checks per change scale roughly with subscribers; at several hundred concurrent chatters switch new-message delivery to `realtime.broadcast_changes` from a trigger (same client API shape). For the conversation list, subscribe once to `conversation_read_state` for the user.
- **Typing**: Broadcast on private channel `chat:{conversation_id}`; authorization policy on `realtime.messages` (migration 0007) restricts to members. Nothing stored.
- **Presence**: not a global Realtime presence channel (cost and connection limits). `touch_presence()` every ~60 s while the tab is visible; `peer_presence()` returns last seen only for conversation peers who have `show_online_status`; "online" = seen in the last 90 s.

**Encryption decision.** Drop the client-side RSA envelope for launch. Evidence: the envelope is encrypted to the *server's* public key, and `sendCore.ts` stores `cleanText` in plaintext in RTDB, so it is transport obfuscation on top of TLS, not end-to-end. Supabase gives TLS in transit, encryption at rest, and RLS. Recommendation: plaintext rows + RLS + rate limits, which also enables reporting/moderation of abusive messages (important for a teen audience) and server-side push previews. Trade-off: the operator (and a DB breach) can read messages; document this honestly in the privacy policy, never claim "end-to-end". If E2EE becomes a goal, do it properly later (per-device keys, Signal-style) and accept losing server-side search/moderation context; reports then carry reporter-supplied `context`.

## 6. Push

`push_subscriptions` (endpoint unique, p256dh, auth). Two Database Webhooks call Edge Function `send-push` (web-push with VAPID keys as function secrets): INSERT on `messages` (skips sender; skips muted or hidden members; body preview as `last_preview`, media placeholders as before) and INSERT on `notifications` (like, reply, comment, follow, request, accept, badge). The function looks up subscriptions with the service role, sends, deletes subscriptions that return 404/410. Suppression when the user is looking at the chat stays in `public/sw.js` (unchanged); the existing inline-reply token can be kept by signing with an HMAC secret in the function (reply posts to a route that calls `send_message` as that user via a short-lived session or a service-role path with the same checks, decide when wiring).

## 7. Moderation and safety (teen audience)

- `reports` (target user/post/comment/message/story, reason enum, details, optional evidence `context`); one report per reporter per target; 3 distinct reporters on a post/story auto-set `is_hidden` pending review (RLS hides it from everyone but the author).
- Blocks enforced everywhere via `can_see_author` / `is_blocked_either` (posts, comments, profiles, notifications, DMs, follow). Block also removes follows both ways.
- Defaults for minors (section 2); minimum age 13; birth date private (`profile_private`).
- Rate limits (`rate_limit()` inside RPCs, `rate_events` table, pruned daily): posts and stories 30/h, likes 300/h, follows 200/h, messages 60/min, username claims 10/h, plus Supabase Auth's own limits and CAPTCHA (Turnstile) on signup.
- KVKK: `delete_my_account()` deletes the `auth.users` row and everything cascades (R2 objects follow via queue); `export_my_data()` returns the user's data as JSON. Server route `DELETE /api/account` wraps both so the client never needs service role. Keep a privacy notice for data stored in the EU (eu-central-1).
- Minimal admin: set `profiles.role='admin'` by SQL. Useful queries: open reports `select * from reports where status='open' order by created_at`; reports per target `select target_type,target_id,count(*) from reports group by 1,2 order by 3 desc`; hide `update posts set is_hidden=true where id=...`; ban = delete the auth user or add a `banned_until` later. A tiny `/admin` page can come later; the Supabase dashboard suffices at launch.

## 8. Cutover plan (feature flags per service layer)

Env flags: `NEXT_PUBLIC_BACKEND_AUTH`, `..._FEED`, `..._SOCIAL`, `..._CHAT`, `..._PUSH`, `..._STORIES` = `firebase | supabase`. Each flag picks the adapter behind the existing seam: `feedService` (replace `MockFeedService`/`firestoreSource` with a Supabase source using `home_feed`/`reels_feed`/`post_replies`), `privacyService`/`followService`, `messageService`, `profileStyleStore`, `uploadQueue` (target changes from Firebase `uploadBytesResumable` to presigned R2 PUT/multipart), `pushClient`.

1. **Auth + profiles** (+ R2 avatars): onboarding, username claim, profile edit, settings flags. Re-signup of existing users.
2. **Posts / media / likes / saves / replies / comments / polls / badges**: new upload path, feed RPCs. Local-only data (likes, saves, votes) is started fresh (it only lived in localStorage; optionally upload it once from the client on first login).
3. **Follows / requests / blocks**.
4. **Chat** (conversations, realtime, reactions, receipts, typing, presence).
5. **Push** (Edge Function and webhooks; swap `pushClient` subscribe endpoint).
6. **Stories / notes**.

Data migration scripts (Node, run locally with the service role; Firebase Admin read-only): users (by email to new `auth.users` id map), `posts` + `media[]` (download from Firebase Storage then PUT to R2 with new keys, or copy via `rclone`), follows/blocks/requests (remap uids), RTDB chats to `conversations`/`messages` (chatId = sorted old uids, remap; preserve `timestamp` to `created_at`; set `conversation_read_state`). Scripts are idempotent (upsert on a `legacy_id` map table kept outside the schema) and dry-run capable.

Rollback: phases are flag-gated; flipping a flag returns to Firebase, which stays read/write live until the phase is declared stable. Dual-write is not planned (data diverges anyway); instead freeze writes briefly per phase for the final delta copy. Keep Firebase project for 30 days after phase 6; take a Supabase `pg_dump` before each phase (and enable PITR on Pro).

## 9. Limits to watch and cost (verify current pricing before deciding)

Approximate public figures at time of writing; **check current pricing pages** and treat numbers as formulas, not quotes.

Supabase Free: 500 MB database, 50k MAU, 2 GB egress class limits, about 200 concurrent Realtime connections and about 2M Realtime messages, 500k Edge Function invocations, project pauses after about a week of inactivity (unacceptable for production). Pro (about 25 USD/month per org): 8 GB DB, 100k MAU, 500 concurrent Realtime (higher is metered), no pausing, daily backups. Plan on **Pro from public launch**.

R2: storage about 0.015 USD per GB-month (10 GB free), Class A ops (writes/list) about 4.50 USD per million, Class B (reads) about 0.36 USD per million (free tier included), **zero egress fees**. CDN-cached reads through the custom domain largely avoid Class B ops.

Assumptions (state yours and replace): each active user stores S = 50 MB of compressed media in total; uploads per user per month U = 20 objects (Class A about 2 per object incl. multipart parts); DB per user about 1-2 MB of rows plus messages.

| Users | R2 storage (S x users) | R2 cost formula `max(0, GB - 10) x 0.015 + ops` | Supabase |
|---|---|---|---|
| 100 | 5 GB | about 0 (inside free) | Free tier works for testing; Pro for launch |
| 1,000 | 50 GB | about 0.6 USD/mo + ops (cents) | Pro 25 USD (DB about 1-2 GB, Realtime under 500 concurrent) |
| 10,000 | 500 GB | about 7.35 USD/mo + ops (a few USD) | Pro 25 USD plus compute add-on likely (larger instance for Realtime/DB, order of tens of USD) |

For comparison, Supabase Storage: Pro includes about 100 GB then roughly 0.021 USD/GB-month, **plus egress** over the included quota (about 250 GB on Pro, then per GB). At 10k users video egress is the dominant cost and can be tens to hundreds of USD per month, which R2's zero egress removes. Cloudflare Workers/Images transformations, if added later, are billed separately.

Other costs: Vercel (free hobby is not allowed commercially; Pro 20 USD/seat), Resend/SMTP, custom domain. Realtime messages: each chat message fans out to 2 subscribers; 10k users at about 50 messages/day is about 1M change events/month, within Pro.

## 10. Feed algorithm (intentionally simple)

- `home_feed(before, before_id, limit)`: my posts plus people I follow, newest first (keyset on `created_at, id`); if the page is short (new users), it is filled with recent public posts, newest first, excluding blocked and private authors (RLS).
- `reels_feed`: recent public videos, newest first (already global, so no fallback needed).
- `post_replies('popular')`: most likes then newest (`p_min_likes=1` for the rail); `'new'` newest first.
- Later (not now): recency-decayed engagement boost, interest signals, recommendations/embeddings.

## 11. Owner to-do

1. Create a Supabase project in **eu-central-1** (Frankfurt); upgrade to Pro before launch. Copy URL, anon key, service role key into `.env.local` and Vercel env (never in chat or git).
2. Link CLI (`supabase link`), `supabase db push` to apply migrations; `supabase db reset` locally uses `seed.sql` (fake data).
3. Google Cloud OAuth client (Web), redirect `https://<ref>.supabase.co/auth/v1/callback`; put id/secret in the Supabase dashboard (Auth, Providers).
4. Custom SMTP for auth emails (Resend SMTP) and SPF/DKIM on the sender domain; Auth redirect URLs (prod + preview + localhost); enable Turnstile CAPTCHA.
5. Cloudflare account; R2 buckets `shovrum-public` and `shovrum-private`; API token with R2 Object Read & Write scoped to those buckets; custom domain `media.<domain>` on the public bucket; CORS policy (section 4). Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (and `R2_PRIVATE_BUCKET`), `NEXT_PUBLIC_MEDIA_BASE_URL`.
6. VAPID keys (existing ones can be reused) as Edge Function secrets; create the two Database Webhooks; schedule cron for `gc_pending_uploads()` and `r2-reaper`.
7. Decide: private-account media in public bucket at launch (default) or private bucket; message plaintext disclosure in the privacy policy; minimum age 13.
8. Set your own profile `role='admin'` after first sign-in.

## 12. Validation status

Migrations 0001-0007 and `seed.sql` were executed on an embedded Postgres (PGlite, not Supabase) with stubs for `auth.users`, `auth.uid()` and roles; smoke tests passed for feeds (follow fill, private hiding, block hiding), toggle_like, vote_poll, create_post (reply normalization, key-prefix check), DM privacy rules, direct-insert denial, notifications and badges, and account deletion queueing R2 deletes. **Not tested:** real Supabase (`supabase db lint`, Realtime publication and `realtime.messages` policies in 0007 are guarded blocks that were skipped on plain Postgres), Edge Functions, presign routes, webhooks. `src/lib/supabase/*` is not wired; `client.ts` has `@ts-nocheck` until `@supabase/supabase-js` and `@supabase/ssr` are installed. Edge Functions and Next routes are specified here but not written.
