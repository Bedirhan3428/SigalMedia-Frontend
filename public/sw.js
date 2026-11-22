/* SigalMedia service worker: web push for chat messages. No caching/fetch handling. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
      if (wins.some(function (c) { return c.visibilityState === "visible" && samePath(c.url, url); })) return;
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
