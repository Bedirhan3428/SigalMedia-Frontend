"use client";

// [START] NexusAI
import { ReactNode, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { UserProfile } from "@/types/user";
import { ChevronLeft, Lock } from "lucide-react";
import BottomNav from "@/components/BottomNav";

function FollowPrivacyGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUidParam = searchParams.get("uid");
  const { user, loading: authLoading } = useAuth();

  const [checking, setChecking] = useState(true);
  const [isRestricted, setIsRestricted] = useState(false);
  const [targetUsername, setTargetUsername] = useState<string>("");

  useEffect(() => {
    if (authLoading) return;

    // Kullanıcı kendi takipçi/takip listesine bakıyorsa izin ver
    if (!targetUidParam || (user?.uid && targetUidParam === user.uid)) {
      setIsRestricted(false);
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);

    const verifyAccess = async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", targetUidParam));
        if (!userSnap.exists()) {
          if (active) setIsRestricted(true);
          return;
        }

        const data = userSnap.data() as UserProfile;
        if (active) {
          setTargetUsername(data.username || "kullanici");
          // Gizli hesapların takipçi/takip listesi kimseye gösterilmez
          if (data.isPrivate) {
            setIsRestricted(true);
            return;
          }
        }

        if (user?.uid) {
          const [blockAB, blockBA] = await Promise.all([
            getDoc(doc(db, "blocks", `${user.uid}_${targetUidParam}`)),
            getDoc(doc(db, "blocks", `${targetUidParam}_${user.uid}`)),
          ]);
          if (blockAB.exists() || blockBA.exists()) {
            if (active) setIsRestricted(true);
            return;
          }
        }

        if (active) setIsRestricted(false);
      } catch {
        if (active) setIsRestricted(true);
      } finally {
        if (active) setChecking(false);
      }
    };

    verifyAccess();

    return () => {
      active = false;
    };
  }, [targetUidParam, user?.uid, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isRestricted) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
        <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
          <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.back()}
              title="Geri"
              aria-label="Geri"
              className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-base font-bold tracking-tight text-white truncate max-w-[200px]">
              @{targetUsername || "kullanici"}
            </span>
            <div className="w-8" />
          </div>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto px-4 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full border border-zinc-800 bg-zinc-900/60 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-zinc-400" />
          </div>
          <h1 className="text-sm font-bold text-white">Bu Hesap Gizli</h1>
        </main>

        <BottomNav />
      </div>
    );
  }

  return <>{children}</>;
}

export default function FollowLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <FollowPrivacyGuard>{children}</FollowPrivacyGuard>
    </Suspense>
  );
}
// [END] NexusAI
