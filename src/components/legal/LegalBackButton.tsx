"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function LegalBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push("/");
      }}
      title="Geri"
      aria-label="Geri"
      className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
    >
      <ChevronLeft className="w-6 h-6" />
    </button>
  );
}
