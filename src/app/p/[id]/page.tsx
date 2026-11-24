"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FeedPost, FeedProvider } from "@/components/feed";

/** Tek gönderi sayfası (paylaşım bağlantıları): /p/<id>. */
export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };
  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md pt-safe">
        <div className="max-w-md mx-auto px-2 h-14 flex items-center gap-1">
          <button type="button" onClick={back} aria-label="Geri" className="w-11 h-11 grid place-items-center rounded-xl text-zinc-300 hover:bg-zinc-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-base font-semibold pr-11">Gönderi</h1>
        </div>
      </header>
      <main className="max-w-md mx-auto pb-12">
        <FeedProvider>
          {id ? <FeedPost postId={id} variant="detail" /> : null}
        </FeedProvider>
      </main>
    </div>
  );
}
