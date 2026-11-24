"use client";
import type { ReactNode } from "react";
import type { Post } from "@/lib/feed/types";
import { useBaseLayer } from "./FeedContext";
import { FeedPost } from "./FeedPost";
import { FeedProvider } from "./FeedProvider";
import { Icon } from "./glyphs";

interface Props {
  /** Izgara sırasındaki gönderiler (akış biçiminde). */
  posts: Post[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Başlık çubuğunun sağındaki eylemler (örn. sil). */
  headerActions?: (post: Post) => ReactNode;
}

function Layer({ posts, index, onIndexChange, onClose, headerActions }: Props) {
  useBaseLayer(onClose);
  const post = posts[index];
  if (!post) return null;
  return (
    <div className="fd-pd" role="dialog" aria-modal="true" aria-label="Gönderi" data-testid="fd-detail">
      <div className="fd-pd-h">
        <button type="button" className="fd-pd-b" aria-label="Kapat" onClick={onClose}><Icon id="i-x" /></button>
        <h2>Gönderi</h2>
        <button type="button" className="fd-pd-b" aria-label="Önceki gönderi" disabled={index <= 0} onClick={() => onIndexChange(index - 1)}>‹</button>
        <button type="button" className="fd-pd-b" aria-label="Sonraki gönderi" disabled={index >= posts.length - 1} onClick={() => onIndexChange(index + 1)}>›</button>
        {headerActions?.(post)}
      </div>
      <div className="fd-pd-s">
        <FeedPost key={post.id} post={post} variant="detail" />
      </div>
    </div>
  );
}

/** Profil ızgarasından açılan tam ekran gönderi görünümü: Geri/Escape ile kapanır, sayfalar (zincir) önce kapanır. */
export function PostDetailView(props: Props) {
  return (
    <FeedProvider>
      <Layer {...props} />
    </FeedProvider>
  );
}
