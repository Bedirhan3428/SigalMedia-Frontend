/* SigalMedia service worker: web push for chat messages. No caching/fetch handling. */
// Bump on every change so a new worker is byte-different and installs. Served with Cache-Control: no-cache (next.config.ts).
var SW_VERSION = "2026-11-25-wp40";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Chat pages report "I am showing chat X" ({type:"viewing", chatId, visible}) on show/hide and every ~15 s.
// Kept in memory (clientId -> {chatId, ts}); a worker restart empties it, so clients.matchAll stays the second line.
var VIEWING_TTL_MS = 40000;
var viewing = {};

function viewingChatIds(wins, now) {
  var ids = {};
  Object.keys(viewing).forEach(function (k) {
    var v = viewing[k];
    if (!v || now - v.ts > VIEWING_TTL_MS) {
      delete viewing[k];
      return;
    }
    // If that client is still listed and says it is hidden, trust the real state over our last message.
    var w = wins.filter(function (c) { return c.id === k; })[0];
    if (w && w.visibilityState === "hidden") return;
    ids[v.chatId] = true;
  });
  return ids;
}

var MAX_LINES = 5;
var APP_ICON = "/icons/icon-192.png";
var BADGE = "/icons/badge-96.png";

function samePath(clientUrl, path) {
  try {
    return new URL(clientUrl).pathname === path;
  } catch {
    return false;
  }
}

function normPath(p) {
  return String(p || "").replace(/[/]+$/, "") || "/";
}

// Chat path of the incoming push: prefer the explicit chatId, else the pathname of the payload url.
function chatPathOf(data, url) {
  if (data.chatId) return "/messages/" + data.chatId;
  try {
    return normPath(new URL(url, self.location.origin).pathname);
  } catch {
    return normPath(url);
  }
}

function safeDecode(p) {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

// True when a visible window is showing exactly this chat (query strings like ?reply=1 are ignored, %-encoding is normalised).
// `focused` is deliberately NOT required: installed Android PWAs / some Chrome builds report focused=false for the foreground page.
function isViewingChat(wins, chatPath) {
  var want = safeDecode(chatPath);
  return wins.some(function (c) {
    if (c.visibilityState !== "visible") return false;
    try {
      return safeDecode(normPath(new URL(c.url).pathname)) === want;
    } catch {
      return false;
    }
  });
}

function tagOf(data) {
  return data.tag || (data.chatId ? "chat-" + data.chatId : "chat");
}

function showStack(reg, o) {
  // o: { tag, name, lines, count, url, chatId, icon, replyToken, renotify }
  var title = o.name + (o.count > 1 ? " (" + o.count + " mesaj)" : "");
  var opts = {
    body: o.lines.join("\n"),
    tag: o.tag,
    renotify: o.renotify,
    icon: o.icon || APP_ICON,
    badge: BADGE,
    data: {
      url: o.url,
      chatId: o.chatId || null,
      name: o.name,
      lines: o.lines,
      count: o.count,
      icon: o.icon || null,
      replyToken: o.replyToken || null,
    },
  };
  if (o.replyToken) {
    opts.actions = [
      { action: "reply", type: "text", title: "Yanıtla", placeholder: "Mesaj yaz…" },
      { action: "read", title: "Okundu" },
    ];
  }
  return reg.showNotification(title, opts);
}

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  var url = data.url || (data.chatId ? "/messages/" + data.chatId : "/messages");
  var tag = tagOf(data);

  event.waitUntil(
    (async function () {
      var wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // The user is already looking at this chat: no notification.
      // (Chrome may show a generic "site updated in the background" notification when a push shows nothing too often.)
      var chatPath = chatPathOf(data, url);
      var reported = viewingChatIds(wins, Date.now());
      var chatKey = data.chatId || safeDecode(chatPath).replace(/^[/]messages[/]/, "");
      if (reported[chatKey] || isViewingChat(wins, chatPath)) {
        wins.forEach(function (c) {
          try {
            if (c.visibilityState === "visible") c.postMessage({ type: "push-suppressed", chatId: data.chatId || null, v: SW_VERSION });
          } catch {
            /* ignore */
          }
        });
        return;
      }
      var existing = await self.registration.getNotifications({ tag: tag });
      var prev = (existing[0] && existing[0].data) || {};
      var lines = (Array.isArray(prev.lines) ? prev.lines : []).concat([data.body || ""]).slice(-MAX_LINES);
      await showStack(self.registration, {
        tag: tag,
        name: data.title || "SigalMedia",
        lines: lines,
        count: (prev.count || 0) + 1,
        url: url,
        chatId: data.chatId,
        icon: data.icon,
        replyToken: data.replyToken || prev.replyToken,
        renotify: true,
      });
    })()
  );
});

// The chat page asks us to drop the stack for a chat that is now open.
self.addEventListener("message", function (event) {
  var d = event.data || {};
  if (d.type === "viewing") {
    var id = (event.source && event.source.id) || "anon";
    if (d.visible && d.chatId) viewing[id] = { chatId: String(d.chatId), ts: Date.now() };
    else delete viewing[id];
    return;
  }
  if (d.type !== "clear-chat" || !d.tag) return;
  event.waitUntil(
    self.registration.getNotifications({ tag: d.tag }).then(function (list) {
      list.forEach(function (n) { n.close(); });
    })
  );
});

async function sendReply(n, text) {
  var d = n.data || {};
  var ok = false;
  try {
    var res = await fetch("/api/push/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: d.replyToken, text: text }),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  var lines = (Array.isArray(d.lines) ? d.lines : [])
    .concat([ok ? "Sen: " + text : "Gönderilemedi: " + text])
    .slice(-MAX_LINES);
  await showStack(self.registration, {
    tag: n.tag,
    name: d.name || n.title || "SigalMedia",
    lines: lines,
    count: d.count || lines.length,
    url: d.url || "/messages",
    chatId: d.chatId,
    icon: d.icon,
    replyToken: d.replyToken,
    renotify: false,
  });
}

async function openChat(url) {
  var wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (var i = 0; i < wins.length; i++) {
    var c = wins[i];
    if (new URL(c.url).origin !== self.location.origin) continue;
    var handled = false;
    // Full URL match (incl. ?reply=1) so an existing window already on the chat still gets the focus hint.
    if (c.url.indexOf("reply=1") === -1 && samePath(c.url, url.split("?")[0])) handled = true;
    else if ("navigate" in c) {
      try {
        await c.navigate(url);
        handled = true;
      } catch {
        /* not controlled: try the next client / openWindow */
      }
    }
    if (handled) {
      try {
        await c.focus();
      } catch {
        /* focus needs user activation; real clicks have it */
      }
      return;
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener("notificationclick", function (event) {
  var n = event.notification;
  var base = (n.data && n.data.url) || "/messages";
  n.close();
  if (event.action === "read") return;
  if (event.action === "reply") {
    var text = typeof event.reply === "string" ? event.reply.trim() : "";
    if (text && n.data && n.data.replyToken) {
      event.waitUntil(sendReply(n, text));
      return;
    }
    // No inline reply support: open the chat with the composer focused.
    event.waitUntil(openChat(base + (base.indexOf("?") === -1 ? "?reply=1" : "&reply=1")));
    return;
  }
  event.waitUntil(openChat(base));
});
