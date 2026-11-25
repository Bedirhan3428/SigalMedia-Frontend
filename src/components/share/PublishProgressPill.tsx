"use client";

// WP-37: yayın kuyruğunun üst çubuk hapı. Her sayfada görünür (kök layout'ta bağlanır); editörde gizlidir.
import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, RotateCw, X } from "lucide-react";
import { uploadQueue, type JobSnapshot } from "@/lib/publish/uploadQueue";

const DONE_VISIBLE_MS = 8000;

function Pill({ job }: { job: JobSnapshot }) {
  const router = useRouter();

  // Başarı hapı kendiliğinden kapanır
  useEffect(() => {
    if (job.status !== "done") return;
    const t = setTimeout(() => uploadQueue.dismiss(job.id), DONE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [job.status, job.id]);

  const pct = Math.round(job.progress * 100);
  const base =
    "pointer-events-auto relative overflow-hidden flex items-center gap-2.5 rounded-full bg-zinc-900/95 border border-zinc-700/80 backdrop-blur-md pl-3.5 pr-2 py-2 text-[13px] font-medium text-white shadow-lg shadow-black/40";

  if (job.status === "error") {
    return (
      <div role="alert" data-testid="publish-pill" data-status="error" className={base}>
        <span className="text-red-300">Yüklenemedi</span>
        <button
          type="button"
          onClick={() => uploadQueue.retry(job.id)}
          className="flex items-center gap-1 rounded-full bg-white text-zinc-950 px-3 py-1 text-xs font-semibold active:scale-95 transition-transform"
        >
          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
          Tekrar dene
        </button>
        <button type="button" aria-label="Kapat" onClick={() => uploadQueue.dismiss(job.id)} className="p-1.5 rounded-full text-zinc-400 hover:text-white active:scale-90 transition-transform">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (job.status === "done") {
    return (
      <div role="status" data-testid="publish-pill" data-status="done" className={base}>
        <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <span>Paylaşıldı</span>
        <button
          type="button"
          onClick={() => {
            if (job.href) router.push(job.href);
            uploadQueue.dismiss(job.id);
          }}
          className="rounded-full bg-white text-zinc-950 px-3 py-1 text-xs font-semibold active:scale-95 transition-transform"
        >
          Görüntüle
        </button>
        <button type="button" aria-label="Kapat" onClick={() => uploadQueue.dismiss(job.id)} className="p-1.5 rounded-full text-zinc-400 hover:text-white active:scale-90 transition-transform">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" data-testid="publish-pill" data-status={job.status} data-progress={pct} className={base + " pr-4"}>
      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" aria-hidden="true" />
      <span>{job.status === "saving" ? "Paylaşılıyor" : `Yükleniyor %${pct}`}</span>
      <span
        role="progressbar"
        aria-label="Yükleme ilerlemesi"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="absolute left-0 bottom-0 h-[2px] bg-emerald-400 transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function PublishProgressPill() {
  const jobs = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.getSnapshot, uploadQueue.getServerSnapshot);
  const pathname = usePathname();
  // Editörde üst çubukla çakışmasın; editörden çıkınca yeniden görünür
  if (jobs.length === 0 || pathname?.startsWith("/share")) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      {jobs.map((j) => (
        <Pill key={j.id} job={j} />
      ))}
    </div>
  );
}
