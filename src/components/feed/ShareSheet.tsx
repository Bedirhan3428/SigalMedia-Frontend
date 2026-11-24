"use client";
import { useEffect, useMemo, useState } from "react";
import type { Post } from "@/lib/feed/types";
import { useAuth } from "@/context/AuthContext";
import { listenUserChats, buildChatId, sendEncryptedMessage, type UserChatSummary } from "@/services/messageService";
import { peekList, peekLastUid } from "@/lib/chat/chatCache";
import { bumpSendCount, getSendCounts, sortByActivity } from "@/lib/chat/chatActivity";
import { buildPostShareText } from "@/lib/chat/postLink";
import { useFeedActions } from "./FeedContext";
import { Icon } from "./glyphs";
import { Sheet } from "./Sheet";
import { copyText } from "./PostMenuSheet";

type TestWin = {
  /** Test kancası: tanımlıysa gerçek gönderim yapılmaz, gönderilecek mesaj buraya verilir. */
  __SIGAL_TEST_SHARE__?: (m: { chatId: string; peerUid: string; text: string }) => void;
  /** Test kancası: sohbet listesi yerine bu liste kullanılır. */
  __SIGAL_TEST_SHARE_CHATS__?: UserChatSummary[];
};

/** "Paylaş": gönderi bağlantısını en sık konuşulan sohbetlere (çoklu seçim + not) yollar; bağlantıyı kopyala / sistem paylaşımı. */
export function ShareSheet({ post, opener, onClose }: { post: Post; opener?: HTMLElement | null; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useFeedActions();
  const uid = user?.uid ?? null;
  const [chats, setChats] = useState<UserChatSummary[] | null>(() => {
    const t = typeof window !== "undefined" ? (window as unknown as TestWin).__SIGAL_TEST_SHARE_CHATS__ : undefined;
    return t ?? (uid || peekLastUid() ? peekList(uid ?? peekLastUid()) : null);
  });
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [counts] = useState(() => getSendCounts(uid));

  useEffect(() => {
    if (!uid || (window as unknown as TestWin).__SIGAL_TEST_SHARE_CHATS__) return;
    return listenUserChats(uid, (list) => setChats(list));
  }, [uid]);

  const sorted = useMemo(() => sortByActivity(chats ?? [], counts), [chats, counts]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sorted;
    return sorted.filter((c) => (c.peerProfile?.displayName ?? "").toLowerCase().includes(s) || (c.peerProfile?.username ?? "").toLowerCase().includes(s));
  }, [sorted, q]);

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${post.id}`;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = async () => {
    if (!uid || !sel.length || busy) return;
    setBusy(true);
    const text = buildPostShareText(window.location.origin, post.id, note);
    const hook = (window as unknown as TestWin).__SIGAL_TEST_SHARE__;
    const targets = sorted.filter((c) => sel.includes(c.chatId));
    const res = await Promise.allSettled(
      targets.map(async (c) => {
        const peerUid = c.peerUid || "";
        const chatId = c.chatId || buildChatId(uid, peerUid);
        if (hook) hook({ chatId, peerUid, text });
        else await sendEncryptedMessage(peerUid, text);
        bumpSendCount(uid, chatId);
      })
    );
    setBusy(false);
    const failed = res.filter((r) => r.status === "rejected").length;
    if (failed) {
      const first = res.find((r): r is PromiseRejectedResult => r.status === "rejected");
      toast(first?.reason instanceof Error && first.reason.message ? first.reason.message : "Gönderilemedi");
      // Başarılı olanlar listeden çıkarılır, tekrar denemede çift gönderilmez.
      setSel(targets.filter((_, i) => res[i].status === "rejected").map((c) => c.chatId));
      return;
    }
    onClose();
    toast("Gönderildi", <Icon id="i-check" />);
  };

  const copy = () => {
    void copyText(url).then((ok) => { onClose(); toast(ok ? "Bağlantı kopyalandı" : "Bağlantı kopyalanamadı"); });
  };
  const native = () => {
    void navigator.share({ url }).then(onClose, () => { /* kullanıcı vazgeçti */ });
  };

  return (
    <Sheet titleId="fd-share-t" title="Paylaş" onClose={onClose} opener={opener} height="min(80%, 640px)">
      <div className="fd-shb" data-testid="fd-share">
        <input
          type="search"
          className="fd-field"
          data-first
          placeholder="Ara"
          aria-label="Ara"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!uid}
          autoComplete="off"
        />
        {!uid ? (
          <p className="fd-shn" role="status">Paylaşmak için giriş yapmalısın.</p>
        ) : chats === null ? (
          <p className="fd-shn" role="status">Yükleniyor…</p>
        ) : chats.length === 0 ? (
          <p className="fd-shn" role="status">Henüz sohbetin yok</p>
        ) : shown.length === 0 ? (
          <p className="fd-shn" role="status">Sonuç yok</p>
        ) : (
          <ul className="fd-shg" role="list" data-testid="fd-share-list">
            {shown.map((c) => {
              const p = c.peerProfile;
              const on = sel.includes(c.chatId);
              const name = p?.displayName || p?.username || "Sohbet";
              return (
                <li key={c.chatId}>
                  <button type="button" className="fd-shi" aria-pressed={on} data-chat={c.chatId} onClick={() => toggle(c.chatId)} aria-label={`${name}${p?.username ? ` @${p.username}` : ""}`}>
                    <span className="fd-shav">
                      <span className="fd-av" style={{ width: 56, height: 56, background: "var(--s3)" }} aria-hidden="true">
                        {p?.photoURL ? <img src={p.photoURL} alt="" loading="lazy" referrerPolicy="no-referrer" /> : (name[0] ?? "?").toUpperCase()}
                      </span>
                      {on ? <span className="fd-shck" aria-hidden="true"><Icon id="i-check" /></span> : null}
                    </span>
                    <b>{name}</b>
                    {p?.username ? <small>@{p.username}</small> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="fd-shf">
          {sel.length ? (
            <input type="text" className="fd-field" placeholder="Mesaj ekle…" aria-label="Mesaj ekle" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          ) : null}
          {sel.length ? (
            <button type="button" className="fd-cta" data-testid="fd-share-send" disabled={busy} onClick={() => void send()}>
              {busy ? "Gönderiliyor…" : sel.length > 1 ? `Gönder (${sel.length})` : "Gönder"}
            </button>
          ) : null}
          <div className="fd-shs">
            <button type="button" className="fd-mb" onClick={copy}>Bağlantıyı kopyala</button>
            {canNative ? <button type="button" className="fd-mb" onClick={native}>Diğer uygulamalar</button> : null}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
