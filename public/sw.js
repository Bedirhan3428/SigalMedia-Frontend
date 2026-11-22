/* SigalMedia service worker: web push for chat messages. No caching/fetch handling. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function samePath(clientUrl, path) {
  try {
    return new URL(clientUrl).pathname === path;
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = data.url || (data.chatId ? "/messages/" + data.chatId : "/messages");
  const title = data.title || "SigalMedia";

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // The user is already looking at this chat: no notification.
      if (wins.some((c) => c.visibilityState === "visible" && samePath(c.url, url))) return;
      await self.registration.showNotification(title, {
        body: data.body || "",
        tag: data.tag || (data.chatId ? "chat-" + data.chatId : "chat"),
        renotify: true,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { url, chatId: data.chatId || null },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/messages";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        let handled = samePath(c.url, url);
        if (!handled && "navigate" in c) {
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
    })()
  );
});
