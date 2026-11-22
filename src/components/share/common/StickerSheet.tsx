"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AtSign, ChevronLeft, Loader2, Search, UserRound, X } from "lucide-react";
import { Sheet } from "./Sheet";
import { useBackLayer } from "./hooks/useEditorBackStack";
import { getRenderableEmojiCategories } from "./emojiData";

/** A user that can be mentioned with the "@Bahset" sticker. */
export interface MentionUser {
  /** Firebase uid. */
  uid: string;
  /** Username without "@". */
  username: string;
  /** Display name (optional). */
  displayName?: string;
  /** Avatar URL (optional). */
  photoURL?: string;
}

/** Extra tile in the sticker sheet's top row (e.g. "Fotoğraf", "Müzik"). */
export interface StickerSheetAction {
  /** Stable id (React key). */
  id: string;
  /** Turkish label under the icon. */
  label: string;
  /** Icon element (~20 px). */
  icon: ReactNode;
  /** Tailwind classes for the icon bubble, e.g. "bg-[rgba(56,213,200,0.20)] text-[var(--ed-ac,#38d5c8)]". */
  accentClassName?: string;
  /** Called on tap. The sheet closes first when `closeOnSelect` is true. */
  onSelect: () => void;
}

/** User search used by the mention view. Must honour `signal` (aborted on each new query). */
export type SearchMentionUsers = (query: string, signal: AbortSignal) => Promise<MentionUser[]>;

/**
 * Default user search: `GET /api/users/search?q=<query>&excludeUid=<uid>` (public route,
 * returns `{ users: [...] }`, at most 25). An empty query returns suggestions.
 */
export async function searchMentionUsers(
  query: string,
  signal: AbortSignal,
  excludeUid?: string
): Promise<MentionUser[]> {
  const params = new URLSearchParams({ q: query });
  if (excludeUid) params.set("excludeUid", excludeUid);
  const res = await fetch(`/api/users/search?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`users/search ${res.status}`);
  const data = (await res.json()) as { users?: Array<Partial<MentionUser>> };
  return (data.users ?? [])
    .filter((u): u is Partial<MentionUser> & { uid: string; username: string } =>
      Boolean(u && u.uid && u.username)
    )
    .map((u) => ({
      uid: u.uid,
      username: u.username,
      displayName: u.displayName || "",
      photoURL: u.photoURL || "",
    }));
}

/**
 * Text style of the mention sticker used by the previous editor (white pill, black bold text).
 * Shape-compatible with the engine's `Partial<TextStyle>`; pass it to `engine.addText("@name", …)`.
 */
export const MENTION_STICKER_TEXT_STYLE = {
  fontSize: 72,
  color: "#000000",
  backgroundColor: "#ffffff",
  borderRadius: 14,
  backgroundPadding: 18,
  fontWeight: "800" as const,
  fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, sans-serif",
};

/** Props of {@link StickerSheet}. */
export interface StickerSheetProps {
  /** Shows the sheet. Each opening starts at `initialView`. */
  open: boolean;
  /** Close request (X, backdrop, drag, Back on the root view). */
  onClose: () => void;
  /** An emoji was picked. */
  onSelectEmoji: (emoji: string) => void;
  /** A user was picked in the mention view. Omit to hide the "@Bahset" tile. */
  onSelectMention?: (user: MentionUser) => void;
  /** Signed-in user: shown as "Kendini etiketle" and excluded from search results. */
  currentUser?: MentionUser | null;
  /** Extra tiles next to "@Bahset" (e.g. photo, music). */
  actions?: StickerSheetAction[];
  /** Custom user search; defaults to {@link searchMentionUsers}. Read on every query. */
  searchUsers?: SearchMentionUsers;
  /** View shown when opened (default `"stickers"`). */
  initialView?: "stickers" | "mention";
  /** Close the sheet after any pick (default true). */
  closeOnSelect?: boolean;
}

/**
 * Sticker tray: action tiles ("@Bahset" + `actions`) and a categorised emoji grid, plus a
 * mention sub-view with debounced user search. Back in the mention view returns to the grid.
 */
export function StickerSheet({
  open,
  onClose,
  onSelectEmoji,
  onSelectMention,
  currentUser,
  actions = [],
  searchUsers,
  initialView = "stickers",
  closeOnSelect = true,
}: StickerSheetProps) {
  const [view, setView] = useState<"stickers" | "mention">(initialView);
  const [prevOpen, setPrevOpen] = useState(open);

  // Her açılışta başlangıç görünümüne dön (render sırasında, effect olmadan)
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setView(onSelectMention ? initialView : "stickers");
  }

  const inMention = open && view === "mention" && Boolean(onSelectMention);
  useBackLayer(inMention, () => setView("stickers"));

  const pick = (fn: () => void) => {
    if (closeOnSelect) onClose();
    fn();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      height="70dvh"
      title={inMention ? "Bahset" : "Çıkartmalar"}
      headerStart={
        inMention ? (
          <button
            type="button"
            onClick={() => setView("stickers")}
            aria-label="Geri"
            className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white active:scale-90 active:bg-white/10 transition-transform"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : undefined
      }
      contentClassName="pb-4"
    >
      {inMention && onSelectMention ? (
        <MentionView
          currentUser={currentUser ?? null}
          searchUsers={searchUsers}
          onPick={(u) => pick(() => onSelectMention(u))}
        />
      ) : (
        <StickerGrid
          actions={actions}
          showMention={Boolean(onSelectMention)}
          onOpenMention={() => setView("mention")}
          onPickAction={(a) => pick(a.onSelect)}
          onPickEmoji={(e) => pick(() => onSelectEmoji(e))}
        />
      )}
    </Sheet>
  );
}

function StickerGrid({
  actions,
  showMention,
  onOpenMention,
  onPickAction,
  onPickEmoji,
}: {
  actions: StickerSheetAction[];
  showMention: boolean;
  onOpenMention: () => void;
  onPickAction: (a: StickerSheetAction) => void;
  onPickEmoji: (emoji: string) => void;
}) {
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const categories = useMemo(() => getRenderableEmojiCategories(), []);
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");

  const tiles: Array<StickerSheetAction & { onTap: () => void }> = [
    ...(showMention
      ? [
          {
            id: "__mention",
            label: "@Bahset",
            icon: <AtSign className="w-5 h-5" />,
            accentClassName: "bg-[rgba(56,213,200,0.20)] text-[var(--ed-ac,#38d5c8)]",
            onSelect: () => {},
            onTap: onOpenMention,
          },
        ]
      : []),
    ...actions.map((a) => ({ ...a, onTap: () => onPickAction(a) })),
  ];

  const jumpTo = (id: string) => {
    setActiveCat(id);
    sectionRefs.current.get(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div>
      {tiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 px-4 pt-1 pb-3">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={t.onTap}
              className="flex flex-col items-center justify-center gap-1.5 min-h-[76px] rounded-2xl bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] active:scale-95 active:bg-white/10 transition-transform text-white"
            >
              <span
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  t.accentClassName ?? "bg-white/10 text-white"
                }`}
              >
                {t.icon}
              </span>
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Kategori sekmeleri (yapışkan) */}
      <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur-xl border-b border-[var(--ed-line,#2a303a)]">
        <div className="flex overflow-x-auto no-scrollbar px-2" role="tablist" aria-label="Emoji kategorileri">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activeCat === c.id}
              aria-label={c.label}
              onClick={() => jumpTo(c.id)}
              className={`shrink-0 w-11 h-11 flex items-center justify-center text-xl rounded-xl transition-opacity ${
                activeCat === c.id ? "opacity-100 bg-white/10" : "opacity-55"
              }`}
            >
              {c.icon}
            </button>
          ))}
        </div>
      </div>

      {categories.map((c) => (
        <section
          key={c.id}
          ref={(el) => {
            if (el) sectionRefs.current.set(c.id, el);
            else sectionRefs.current.delete(c.id);
          }}
          className="px-3 pt-3 scroll-mt-12"
          aria-label={c.label}
        >
          <h3 className="px-1 pb-1 text-[11px] font-semibold text-[var(--ed-tx2,#98a2b3)]">{c.label}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))]">
            {c.emojis.map((e, i) => (
              <button
                key={`${c.id}-${i}`}
                type="button"
                onClick={() => onPickEmoji(e)}
                aria-label={e}
                className="h-12 flex items-center justify-center text-[28px] leading-none rounded-xl active:scale-90 active:bg-white/10 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type SearchStatus = "idle" | "loading" | "done" | "error";

function MentionView({
  currentUser,
  searchUsers,
  onPick,
}: {
  currentUser: MentionUser | null;
  searchUsers?: SearchMentionUsers;
  onPick: (user: MentionUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionUser[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const excludeUid = currentUser?.uid;

  const defaultSearch = useCallback<SearchMentionUsers>(
    (q, signal) => searchMentionUsers(q, signal, excludeUid),
    [excludeUid]
  );
  const searchRef = useRef<SearchMentionUsers>(searchUsers ?? defaultSearch);
  useLayoutEffect(() => {
    searchRef.current = searchUsers ?? defaultSearch;
  });

  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Gecikmeli arama; her yeni sorguda önceki istek iptal edilir
  useEffect(() => {
    const ctrl = new AbortController();
    const q = query.trim().replace(/^@/, "");
    const t = setTimeout(
      async () => {
        setStatus("loading");
        try {
          const users = await searchRef.current(q, ctrl.signal);
          if (ctrl.signal.aborted) return;
          setResults(users);
          setStatus("done");
        } catch {
          if (ctrl.signal.aborted) return;
          setStatus("error");
        }
      },
      q ? 250 : 0
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, retry]);

  const showSelf =
    currentUser &&
    (!query.trim() ||
      currentUser.username.toLowerCase().includes(query.trim().replace(/^@/, "").toLowerCase()));

  return (
    <div className="px-4">
      <div className="sticky top-0 z-10 bg-neutral-900/95 pb-2">
        <label className="flex items-center gap-2 h-11 rounded-xl bg-white/10 px-3 focus-within:ring-2 focus-within:ring-[var(--ed-ac,#38d5c8)]">
          <Search className="w-4 h-4 text-[var(--ed-tx2,#98a2b3)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kullanıcı ara"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label="Kullanıcı ara"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-white placeholder:text-[var(--ed-tx3,#5b6574)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Aramayı temizle"
              className="-mr-2 w-10 h-10 flex items-center justify-center text-[var(--ed-tx2,#98a2b3)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </label>
      </div>

      {showSelf && currentUser && (
        <UserRow user={currentUser} hint="Kendini etiketle" onPick={onPick} />
      )}

      {status === "loading" && results.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-[var(--ed-tx2,#98a2b3)] animate-spin" />
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-[var(--ed-tx2,#98a2b3)]">Kullanıcılar yüklenemedi</p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="h-11 px-5 rounded-full bg-white/10 text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {status === "done" && results.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--ed-tx3,#5b6574)]">Kullanıcı bulunamadı</p>
      )}

      {status !== "error" && results.length > 0 && (
        <ul className={status === "loading" ? "opacity-60 transition-opacity" : ""}>
          {results.map((u) => (
            <li key={u.uid}>
              <UserRow user={u} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({
  user,
  hint,
  onPick,
}: {
  user: MentionUser;
  hint?: string;
  onPick: (user: MentionUser) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(user)}
      className="w-full flex items-center gap-3 min-h-14 py-2 rounded-xl text-left active:bg-[var(--ed-bg2,#1a1e25)]"
    >
      <span className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <UserRound className="w-5 h-5 text-[var(--ed-tx2,#98a2b3)]" />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white truncate">{user.username}</span>
        <span className="block text-xs text-[var(--ed-tx2,#98a2b3)] truncate">{hint ?? user.displayName}</span>
      </span>
    </button>
  );
}
