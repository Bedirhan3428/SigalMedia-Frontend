/** One emoji category of the sticker sheet. */
export interface EmojiCategory {
  /** Stable id. */
  id: string;
  /** Turkish label (tab + section heading). */
  label: string;
  /** Emoji shown on the category tab. */
  icon: string;
  /** Emojis in display order. */
  emojis: readonly string[];
}

const split = (s: string) => s.split(" ").filter(Boolean);

/** Curated emoji set for story stickers (no external data, no dependency). */
export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: "smileys",
    label: "Yüzler",
    icon: "😀",
    emojis: split(
      "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👻 💀 ☠️ 👽 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾"
    ),
  },
  {
    id: "hearts",
    label: "Kalpler",
    icon: "❤️",
    emojis: split(
      "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🌈 ☀️ 🌙"
    ),
  },
  {
    id: "gestures",
    label: "El hareketleri",
    icon: "👋",
    emojis: split(
      "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 👀 👁️ 👅 👄"
    ),
  },
  {
    id: "nature",
    label: "Hayvanlar ve doğa",
    icon: "🐶",
    emojis: split(
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦄 🐝 🦋 🐞 🐢 🐍 🐙 🐬 🐳 🦈 🐠 🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌿 🍀 🍁 🍂 🌵 🌴 🌊 ❄️ ☃️"
    ),
  },
  {
    id: "food",
    label: "Yiyecek ve içecek",
    icon: "🍕",
    emojis: split(
      "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🌶️ 🌽 🥐 🥯 🍞 🧀 🥚 🍳 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🍝 🍜 🍣 🍱 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 ☕ 🍵 🧋 🥤 🍹 🍸 🥂 🍾"
    ),
  },
  {
    id: "activity",
    label: "Etkinlik",
    icon: "⚽",
    emojis: split(
      "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🏹 🎣 🛹 🛼 ⛸️ 🎿 🏂 🏋️ 🤸 🧘 🏄 🏊 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🎮 🎯 🎳 🎉 🎊 🎈 🎁"
    ),
  },
  {
    id: "travel",
    label: "Seyahat",
    icon: "✈️",
    emojis: split(
      "🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🛵 🏍️ 🚲 🛴 🚂 🚆 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🛳️ ⚓ 🗺️ 🧭 🏔️ ⛰️ 🌋 🏕️ 🏖️ 🏝️ 🏜️ 🏟️ 🏛️ 🕌 🏰 🗼 🗽 🌉 🌁 🌃 🌄 🌅 🌆 🌇 🎡 🎢 🎠"
    ),
  },
  {
    id: "objects",
    label: "Nesneler",
    icon: "💡",
    emojis: split(
      "⌚ 📱 💻 ⌨️ 🖥️ 📷 📸 📹 🎥 📺 📻 🎙️ ⏰ ⏳ 💡 🔦 🕯️ 💸 💵 💰 💳 💎 🔑 🗝️ 🔒 🧸 🪩 🎀 🛍️ 📚 📖 ✏️ 🖊️ 📝 📌 📍 ✂️ 🗓️ 📅 📈 💼 🎒 👓 🕶️ 👑 💍 👟 👠 👗 👕 🧢"
    ),
  },
  {
    id: "symbols",
    label: "Semboller",
    icon: "✅",
    emojis: split(
      "✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ‼️ ⁉️ ❓ ❔ ❗ ❕ 〰️ ➰ ➿ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 ▶️ ⏸️ ⏯️ ⏹️ 🔁 🔀 🔊 🔇 🔔 🔕 📣 💬 💭 🆕 🆒 🆗 🆙 🔝 ♻️ ⚠️ 🚫 ⛔ 🎵 🎶 ™️ ©️ ®️ 🇹🇷"
    ),
  },
];

// ---------------------------------------------------------------------------
// Render-support filter (canvas measurement), so tofu boxes / split ZWJ sequences /
// flag letters never reach the sticker grid on platforms lacking the glyph.
// ---------------------------------------------------------------------------

const supportCache = new Map<string, boolean>();
let probe: {
  ctx: CanvasRenderingContext2D;
  tofu: string;
  refWidth: number;
} | null | undefined;

const PROBE_PX = 32;

function pixelSignature(ctx: CanvasRenderingContext2D, text: string): string {
  ctx.clearRect(0, 0, PROBE_PX * 3, PROBE_PX * 2);
  ctx.fillText(text, 2, 2);
  const d = ctx.getImageData(0, 0, PROBE_PX * 3, PROBE_PX * 2).data;
  // Hızlı imza: alfa kanalı örnekleri
  let sig = "";
  for (let i = 3; i < d.length; i += 4 * 7) sig += d[i] > 40 ? "1" : "0";
  return sig;
}

function getProbe() {
  if (probe !== undefined) return probe;
  probe = null;
  if (typeof document === "undefined") return probe;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = PROBE_PX * 3;
    canvas.height = PROBE_PX * 2;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return probe;
    ctx.font = `${PROBE_PX}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#000";
    probe = { ctx, tofu: pixelSignature(ctx, "\u{10FFFE}"), refWidth: ctx.measureText("😀").width };
  } catch {
    probe = null;
  }
  return probe;
}

/** True when the emoji renders as a single proper glyph on this platform (best effort; true if unknown). */
export function isEmojiRenderable(emoji: string): boolean {
  const hit = supportCache.get(emoji);
  if (hit !== undefined) return hit;
  const p = getProbe();
  let ok = true;
  if (p) {
    try {
      const cps = Array.from(emoji).filter((c) => c !== "\uFE0F" && c !== "\u200D");
      const w = p.ctx.measureText(emoji).width;
      // Çok kod noktalı (ZWJ / bayrak / ten rengi) dizi tek glif olmalı: parçalanmışsa geniş çıkar
      if (cps.length > 1 && w > p.refWidth * 1.45) ok = false;
      else if (pixelSignature(p.ctx, emoji) === p.tofu) ok = false;
    } catch {
      ok = true;
    }
  }
  supportCache.set(emoji, ok);
  return ok;
}

/** Emoji categories with unsupported glyphs removed (client only; unchanged on the server). */
export function getRenderableEmojiCategories(): readonly EmojiCategory[] {
  if (typeof document === "undefined") return EMOJI_CATEGORIES;
  return EMOJI_CATEGORIES.map((c) => ({ ...c, emojis: c.emojis.filter(isEmojiRenderable) })).filter(
    (c) => c.emojis.length > 0
  );
}
