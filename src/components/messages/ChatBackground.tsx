"use client";

import type { CSSProperties } from "react";
import { CHAT_PHOTOS } from "@/lib/chat/chatPhotos";
import type { ChatSettings } from "@/lib/chat/chatThemes";

// Arka plan katmanı: bulanıklık kenar taşmasın diye -inset-6; üstte siyah karartma. Renkler CSS değişkenlerinden gelir.
export function ChatBackground({
  settings,
  customPhoto,
}: {
  settings: ChatSettings;
  customPhoto: string | null;
}) {
  const { type, pattern, photo } = settings.bg;
  const style: CSSProperties = {};
  let cls = "";
  if (type === "solid") style.background = "var(--bg1)";
  else if (type === "photo") {
    const isCustom = photo === "custom" && customPhoto;
    style.backgroundImage = isCustom
      ? `url("${customPhoto}")`
      : (CHAT_PHOTOS.find((p) => p.id === photo) ?? CHAT_PHOTOS[0]).css;
    // Hazır sahneler katmanı olduğu gibi doldurur (alta yaslı, yakınlaştırmasız); galeri fotoğrafı cover.
    style.backgroundSize = isCustom ? "cover" : "100% 100%";
    style.backgroundRepeat = "no-repeat";
    style.backgroundPosition = "center";
  } else if (type === "pattern") cls = `chat-bg-pat-${pattern}`;
  return (
    <>
      <div
        data-chat-bg={type}
        aria-hidden="true"
        className={`chat-bg-layer pointer-events-none absolute -inset-6 z-0 ${cls}`}
        style={style}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-black"
        style={{ opacity: "var(--dim)" }}
      />
    </>
  );
}

export const CHAT_CSS = `
.chat-bg-layer{background:linear-gradient(180deg,var(--bg1),var(--bg2));filter:blur(var(--blur,0px))}
.chat-bg-pat-dots{background-image:radial-gradient(color-mix(in srgb,var(--acc) 28%,transparent) 1.3px,transparent 1.8px),linear-gradient(180deg,var(--bg1),var(--bg2));background-size:20px 20px,auto}
.chat-bg-pat-lines{background-image:repeating-linear-gradient(45deg,color-mix(in srgb,var(--acc) 14%,transparent) 0 1.5px,transparent 1.5px 14px),linear-gradient(180deg,var(--bg1),var(--bg2))}
.chat-bg-pat-grid{background-image:linear-gradient(color-mix(in srgb,var(--acc) 14%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--acc) 14%,transparent) 1px,transparent 1px),linear-gradient(180deg,var(--bg1),var(--bg2));background-size:24px 24px,24px 24px,auto}
.chat-sent{background:linear-gradient(135deg,var(--sent-a),var(--sent-b));color:var(--sent-t)}
.chat-recv{background:var(--recv-bg);color:var(--recv-t)}
.chat-typing-dot{animation:chatTypingBounce 1.1s infinite ease-in-out}
@keyframes chatTypingBounce{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-4px);opacity:1}}
@media (prefers-reduced-motion: reduce){.chat-typing-dot{animation:none}.chat-root *{transition:none!important}.msg-bubble-slide-up{animation:none!important}}
`;

export const CHAT_MENU_CSS = `
.msg-menu-backdrop{animation:chatMenuFade 160ms ease-out both}
.msg-menu-pop{animation:chatMenuPop 170ms cubic-bezier(.22,1,.36,1) both}
.msg-chip{animation:chatMenuPop 160ms cubic-bezier(.22,1,.36,1) both}
@keyframes chatMenuFade{from{opacity:0}to{opacity:1}}
@keyframes chatMenuPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.msg-menu-backdrop,.msg-menu-pop,.msg-chip{animation:none!important}}
`;
