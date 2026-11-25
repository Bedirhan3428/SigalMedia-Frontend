// Hand-written, generated-style types for supabase/migrations (WP-39). Replace with `supabase gen types typescript` output once a project exists.
// NOT imported anywhere yet.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type WhoCanMessage = "everyone" | "following" | "followers" | "mutuals" | "none";
export type PostKind = "post" | "reels" | "story";
export type PostType = "photo" | "video" | "poll";
export type MediaType = "image" | "video";
export type NotificationType = "like" | "reply" | "comment" | "follow" | "follow_request" | "follow_accept" | "mention" | "badge";
export type ReportTarget = "user" | "post" | "comment" | "message" | "story";
export type ReportReason = "spam" | "harassment" | "hate" | "nudity" | "self_harm" | "violence" | "impersonation" | "underage" | "other";
export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";

export interface ProfileRow {
  id: string; username: string | null; display_name: string; bio: string; avatar_key: string | null;
  is_verified: boolean; is_private: boolean; who_can_message: WhoCanMessage; read_receipts: boolean; show_online_status: boolean;
  profile_style: Json; role: "user" | "moderator" | "admin"; onboarding_completed: boolean;
  followers_count: number; following_count: number; posts_count: number; last_seen_at: string | null; created_at: string; updated_at: string;
}
export interface PostRow {
  id: string; author_id: string; kind: PostKind; post_type: PostType; caption: string; hashtags: string[];
  reply_root_id: string | null; reply_parent_id: string | null; cover_time_ms: number | null; music: Json | null; has_video: boolean;
  like_count: number; reply_count: number; comment_count: number; is_hidden: boolean; expires_at: string | null; created_at: string;
}
export interface PostMediaRow {
  id: string; post_id: string; position: number; type: MediaType; key: string; width: number | null; height: number | null;
  poster_key: string | null; duration_ms: number | null; size_bytes: number | null;
}
export interface MediaItem { type: MediaType; key: string; width: number | null; height: number | null; poster_key: string | null; duration_ms: number | null }
export interface PollView { question: string; ends_at: string; my_vote: string | null; options: { id: string; text: string; votes: number; art: string | null }[] }
/** Row of view `post_cards` and of home_feed / reels_feed / post_replies / profile_posts / hashtag_posts. */
export interface PostCardRow extends Omit<PostRow, "is_hidden"> {
  username: string | null; display_name: string; avatar_key: string | null; is_verified: boolean;
  liked_by_me: boolean; saved_by_me: boolean; media: MediaItem[]; poll: PollView | null;
}
export interface MessageRow {
  id: string; seq: number; conversation_id: string; sender_id: string; kind: "text" | "image" | "video" | "voice" | "file";
  body: string | null; media_key: string | null; media_meta: Json | null; reply_to_id: string | null; created_at: string; deleted_at: string | null;
}
export interface ConversationRow { id: string; direct_key: string; created_at: string; last_message_id: string | null; last_message_at: string | null; last_preview: string | null; last_sender_id: string | null }
export interface ReadStateRow { conversation_id: string; user_id: string; last_read_at: string; last_read_seq: number; unread_count: number }
export interface NotificationRow { id: string; user_id: string; actor_id: string | null; type: NotificationType; post_id: string | null; comment_id: string | null; data: Json | null; read_at: string | null; created_at: string }
export interface CommentRow { id: string; post_id: string; author_id: string; body: string; created_at: string }
export interface ReportRow { id: string; reporter_id: string; target_type: ReportTarget; target_id: string; reported_user_id: string | null; reason: ReportReason; details: string | null; context: Json | null; status: ReportStatus; created_at: string }

type Tbl<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
type Fn<A, R> = { Args: A; Returns: R };

export interface Database {
  public: {
    Tables: {
      profiles: Tbl<ProfileRow>; posts: Tbl<PostRow>; post_media: Tbl<PostMediaRow>; comments: Tbl<CommentRow>;
      messages: Tbl<MessageRow>; conversations: Tbl<ConversationRow>; conversation_read_state: Tbl<ReadStateRow>;
      notifications: Tbl<NotificationRow>; reports: Tbl<ReportRow>;
    };
    Views: { post_cards: { Row: PostCardRow; Relationships: [] } };
    Functions: {
      home_feed: Fn<{ p_before?: string | null; p_before_id?: string | null; p_limit?: number }, PostCardRow[]>;
      reels_feed: Fn<{ p_before?: string | null; p_before_id?: string | null; p_limit?: number }, PostCardRow[]>;
      post_replies: Fn<{ p_root: string; p_sort?: "popular" | "new"; p_limit?: number; p_offset?: number; p_min_likes?: number }, PostCardRow[]>;
      profile_posts: Fn<{ p_user: string; p_before?: string | null; p_before_id?: string | null; p_limit?: number }, PostCardRow[]>;
      hashtag_posts: Fn<{ p_tag: string; p_before?: string | null; p_before_id?: string | null; p_limit?: number }, PostCardRow[]>;
      toggle_like: Fn<{ p_post: string }, { liked: boolean; like_count: number }[]>;
      toggle_save: Fn<{ p_post: string }, boolean>;
      vote_poll: Fn<{ p_poll: string; p_option: string }, undefined>;
      create_post: Fn<{ p_kind: PostKind; p_caption: string; p_media?: Json; p_poll?: Json | null; p_reply_parent?: string | null; p_cover_time_ms?: number | null; p_music?: Json | null }, string>;
      delete_post: Fn<{ p_id: string }, undefined>;
      claim_username: Fn<{ p_username: string }, string>;
      check_username_available: Fn<{ p_username: string }, boolean>;
      complete_onboarding: Fn<{ p_username: string; p_display_name: string; p_birth_date: string }, undefined>;
      follow_user: Fn<{ p_target: string }, "following" | "requested">;
      unfollow_user: Fn<{ p_target: string }, undefined>;
      respond_follow_request: Fn<{ p_requester: string; p_accept: boolean }, undefined>;
      block_user: Fn<{ p_target: string }, undefined>;
      unblock_user: Fn<{ p_target: string }, undefined>;
      get_or_create_direct: Fn<{ p_peer: string }, string>;
      send_message: Fn<{ p_peer: string; p_body: string; p_reply_to?: string | null; p_kind?: string; p_media_key?: string | null; p_media_meta?: Json | null }, MessageRow>;
      mark_read: Fn<{ p_conv: string }, undefined>;
      unsend_message: Fn<{ p_msg: string }, undefined>;
      set_reaction: Fn<{ p_msg: string; p_emoji: string | null }, undefined>;
      touch_presence: Fn<Record<string, never>, undefined>;
      peer_presence: Fn<{ p_peer: string }, string | null>;
      mark_notifications_read: Fn<Record<string, never>, undefined>;
      delete_my_account: Fn<Record<string, never>, undefined>;
      export_my_data: Fn<Record<string, never>, Json>;
    };
    Enums: Record<string, never>;
  };
}
