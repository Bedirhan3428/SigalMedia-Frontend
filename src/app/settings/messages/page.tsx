"use client";

// [START] CREATED BY Umut
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_MESSAGE_SETTINGS,
  getMessageSettings,
  updateMessageSettings,
} from "@/services/privacyService";
import { syncPresenceVisibility } from "@/services/messageService";
import type { MessageSettings } from "@/types/user";

const WHO_CAN_MESSAGE_OPTIONS: {
  value: MessageSettings["whoCanMessage"];
  label: string;
}[] = [
  { value: "everyone", label: "Herkes" },
  { value: "following", label: "Takip Ettiklerim" },
  { value: "followers", label: "Takipçilerim" },
  { value: "mutuals", label: "Karşılıklı Takip" },
  { value: "none", label: "Hiç Kimse" },
];

export default function MessageSettingsPage() {
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<MessageSettings>(
    DEFAULT_MESSAGE_SETTINGS
  );
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    let active = true;

    getMessageSettings(profile.uid)
      .then((res) => {
        if (!active) return;
        setSettings(res);
      })
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
  }, [profile?.uid]);

  const handleSelectWhoCanMessage = async (
    value: MessageSettings["whoCanMessage"]
  ) => {
    if (saving || settings.whoCanMessage === value) return;
    const prev = settings;
    const optimistic: MessageSettings = { ...settings, whoCanMessage: value };
    setSettings(optimistic);
    setSaving(true);

    try {
      const updated = await updateMessageSettings({ whoCanMessage: value });
      setSettings(updated);
      await refreshProfile();
      showToast("Güncellendi");
    } catch {
      setSettings(prev);
      showToast("Güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSetting = async (
    key: "readReceipts" | "showOnlineStatus"
  ) => {
    if (saving) return;
    const prev = settings;
    const nextValue = !settings[key];
    const optimistic: MessageSettings = { ...settings, [key]: nextValue };
    setSettings(optimistic);
    setSaving(true);

    try {
      const updated = await updateMessageSettings({ [key]: nextValue });
      setSettings(updated);
      if (key === "showOnlineStatus" && profile?.uid) {
        await syncPresenceVisibility(profile.uid, nextValue);
      }
      await refreshProfile();
      showToast("Güncellendi");
    } catch {
      setSettings(prev);
      showToast("Güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || loading || fetching) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col">
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

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
            Mesaj Ayarları
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-4 overflow-y-auto space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Kimler Mesaj Gönderebilir
          </h2>
          <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-900">
            {WHO_CAN_MESSAGE_OPTIONS.map((option) => {
              const isSelected = settings.whoCanMessage === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving}
                  onClick={() => handleSelectWhoCanMessage(option.value)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-900 transition-colors text-sm font-medium text-zinc-100 btn-press-subtle"
                >
                  <span>{option.label}</span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                        : "border-zinc-700 bg-transparent"
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Durum ve Bilgiler
          </h2>
          <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-900">
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-medium text-zinc-100">
                Okundu Bilgisi
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.readReceipts}
                disabled={saving}
                onClick={() => handleToggleSetting("readReceipts")}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.readReceipts ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.readReceipts ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-medium text-zinc-100">
                Çevrimiçi Durumu
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.showOnlineStatus}
                disabled={saving}
                onClick={() => handleToggleSetting("showOnlineStatus")}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.showOnlineStatus ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.showOnlineStatus
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
// [END] CREATED BY Umut
