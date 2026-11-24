"use client";
import type { Post } from "@/lib/feed/types";
import { useBaseLayer, type PostMenuItem } from "./FeedContext";
import { FeedPost } from "./FeedPost";
import { FeedProvider } from "./FeedProvider";
import { Icon } from "./glyphs";

interface Props {
  /** Izgara sırasındaki gönderiler (akış biçiminde). */
  posts: Post[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Gönderi ayarları sayfasına eklenen sayfaya özel öğeler (örn. onaylı Sil). */
  postMenu?: (post: Post) => PostMenuItem[];
}

function Layer({ posts, index, onClose }: Props) {
  useBaseLayer(onClose);
  const post = posts[index];
  if (!post) return null;
  return (
    <div className="fd-pd" role="dialog" aria-modal="true" aria-label="Gönderi" data-testid="fd-detail">
      <div className="fd-pd-h">
        <button type="button" className="fd-pd-b" aria-label="Geri" onClick={onClose}><Icon id="i-back" /></button>
        <h2>Gönderi</h2>
        <span className="fd-pd-b" aria-hidden="true" />
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
    <FeedProvider postMenu={props.postMenu}>
      <Layer {...props} />
    </FeedProvider>
  );
}
