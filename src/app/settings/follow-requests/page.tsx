"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, User as UserIcon, Loader2, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getFollowRequests, respondFollowRequest } from "@/services/privacyService";
import { FollowRequestData } from "@/types/privacy";

export default function FollowRequestsPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  const [requests, setRequests] = useState<FollowRequestData[]>([]);
  const [fetching, setFetching] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    let active = true;
    setFetching(true);

    getFollowRequests(profile.uid)
      .then((list) => {
        if (active) setRequests(list);
      })
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
  }, [profile?.uid]);

  const handleAction = async (requesterUid: string, action: "accept" | "reject") => {
    if (processingId) return;
    setProcessingId(requesterUid);

    try {
      await respondFollowRequest(requesterUid, action);
      setRequests((prev) => prev.filter((r) => r.requesterUid !== requesterUid));
      if (action === "accept") {
        await refreshProfile();
        showToast("Takip isteği onaylandı");
      } else {
        showToast("İstek silindi");
      }
    } catch {
      showToast("İşlem başarısız");
    } finally {
      setProcessingId(null);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Toast Bildirimi */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold tracking-tight text-white">
            Takip İstekleri
          </h1>
        </div>
      </header>

      {/* Liste Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {fetching ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            Bekleyen takip isteği bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.requestId}
                className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/50 border border-zinc-900"
              >
                <Link
                  href={`/profile/${req.requesterUid}`}
                  className="flex items-center gap-3 min-w-0 flex-1 mr-2"
                >
                  <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700/80 flex items-center justify-center shrink-0 overflow-hidden">
                    {req.photoURL ? (
                      <img
                        src={req.photoURL}
                        alt={req.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {req.displayName}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      @{req.username}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={processingId === req.requesterUid}
                    onClick={() => handleAction(req.requesterUid, "accept")}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-zinc-200 text-zinc-950 transition-all btn-press-subtle disabled:opacity-50"
                  >
                    Onayla
                  </button>
                  <button
                    type="button"
                    disabled={processingId === req.requesterUid}
                    onClick={() => handleAction(req.requesterUid, "reject")}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all btn-press-subtle disabled:opacity-50"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
