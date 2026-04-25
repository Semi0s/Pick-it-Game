self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = payload.title || "PICK-IT!";
  const options = {
    body: payload.body || "",
    data: payload.data || {},
    icon: "/images/pickit-logo.png",
    badge: "/images/pickit-logo.png"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/leaderboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(href);
      }

      return undefined;
    })
  );
});
