"use client";
import { memo } from "react";
import { useRouter } from "next/navigation";
import type { VideoPost } from "@/lib/feed/types";
import { Icon } from "./glyphs";
import { VideoPlayer } from "./VideoPlayer";

/** Akış, profil ayrıntısı ve /p/<id> için video gövdesi: ortak VideoPlayer çekirdeğinin ince sarmalayıcısı. */
export const VideoBody = memo(function VideoBody({ post }: { post: VideoPost }) {
  const router = useRouter();
  return (
    <VideoPlayer post={post} variant="feed">
      {post.mediaUrl ? (
        <button type="button" className="fd-vexp" aria-label="Reels'te izle" title="Reels'te izle" onClick={() => router.push(`/reels?id=${encodeURIComponent(post.id)}`)}>
          <Icon id="i-expand" />
        </button>
      ) : null}
    </VideoPlayer>
  );
});
