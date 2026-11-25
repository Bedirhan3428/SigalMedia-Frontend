-- Fake data for local development only (supabase db reset). Never run against production.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'ayse@example.test',   '{"full_name":"Ayşe Demo"}'),
  ('00000000-0000-4000-8000-000000000002', 'mert@example.test',   '{"full_name":"Mert Demo"}'),
  ('00000000-0000-4000-8000-000000000003', 'zeynep@example.test', '{"full_name":"Zeynep Demo"}'),
  ('00000000-0000-4000-8000-000000000004', 'can@example.test',    '{"full_name":"Can Demo"}');

update public.profiles set username = 'ayse_demo',   display_name = 'Ayşe Demo',   bio = 'Fotoğraf ve kahve.', onboarding_completed = true where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set username = 'mert_demo',   display_name = 'Mert Demo',   bio = 'Kısa videolar.',     onboarding_completed = true where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set username = 'zeynep_demo', display_name = 'Zeynep Demo', bio = 'Gizli hesap.',       onboarding_completed = true, is_private = true where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set username = 'can_demo',    display_name = 'Can Demo',    bio = 'Yeni üye.',          onboarding_completed = true, who_can_message = 'mutuals' where id = '00000000-0000-4000-8000-000000000004';

insert into public.follows (follower_id, following_id) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');
insert into public.follow_requests (requester_id, target_id) values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003');

insert into public.posts (id, author_id, kind, post_type, caption, hashtags, created_at) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'post', 'photo', 'Sabah kahvesi #kahve #sabah', '{kahve,sabah}', now() - interval '3 hours'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'post', 'video', 'İlk reels denemem #video', '{video}', now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'post', 'photo', 'Sadece takipçiler görsün', '{}', now() - interval '1 hour'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'post', 'poll',  'Hangisi?', '{}', now() - interval '30 minutes');
insert into public.post_media (post_id, position, type, key, width, height, poster_key, duration_ms) values
  ('10000000-0000-4000-8000-000000000001', 0, 'image', 'posts/00000000-0000-4000-8000-000000000001/demo-1.jpg', 1080, 1350, null, null),
  ('10000000-0000-4000-8000-000000000002', 0, 'video', 'posts/00000000-0000-4000-8000-000000000002/demo-2.mp4', 720, 1280, 'posts/00000000-0000-4000-8000-000000000002/demo-2.jpg', 12000),
  ('10000000-0000-4000-8000-000000000003', 0, 'image', 'posts/00000000-0000-4000-8000-000000000003/demo-3.jpg', 1080, 1080, null, null);
insert into public.polls (post_id, question, ends_at) values ('10000000-0000-4000-8000-000000000004', 'Çay mı kahve mi?', now() + interval '1 day');
insert into public.poll_options (id, poll_id, position, text) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 0, 'Çay'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 1, 'Kahve');
-- a reply (flat chain: reply to root)
insert into public.posts (id, author_id, kind, post_type, caption, reply_root_id, reply_parent_id)
  values ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'post', 'photo', 'Bence de!',
          '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
insert into public.post_media (post_id, position, type, key) values
  ('10000000-0000-4000-8000-000000000005', 0, 'image', 'posts/00000000-0000-4000-8000-000000000002/demo-5.jpg');
insert into public.likes (post_id, user_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001');
insert into public.comments (post_id, author_id, body) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Harika kare!');

-- one conversation (Ayşe <-> Mert) with two messages
insert into public.conversations (id, direct_key) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001_00000000-0000-4000-8000-000000000002');
insert into public.conversation_members (conversation_id, user_id) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into public.conversation_read_state (conversation_id, user_id) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into public.messages (conversation_id, sender_id, body) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Selam Mert!'),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Selam Ayşe, nasılsın?');
