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
