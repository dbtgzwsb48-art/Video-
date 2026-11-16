// Einfacher Service Worker: App-Hülle offline verfügbar, Daten kommen immer live von Firebase.
const CACHE = "eh-v4";
const SHELL = ["./", "index.html", "style.css", "app.js", "firebase-config.js", "manifest.webmanifest",
  "vendor/firebase-app.js", "vendor/firebase-auth.js", "vendor/firebase-firestore.js", "vendor/firebase-functions.js", "icons/icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/__/")) return;
  // Netzwerk zuerst, damit Updates sofort ankommen; Cache nur als Fallback offline.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});

// Push-Nachrichten (Firebase Cloud Messaging) anzeigen und beim Antippen die App öffnen.
self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { notification: { title: "Einkaufshelden", body: e.data ? e.data.text() : "" } }; }
  const n = p.notification || {};
  const link = (p.data && p.data.link) || (p.fcmOptions && p.fcmOptions.link) || "#meine";
  e.waitUntil(self.registration.showNotification(n.title || "Einkaufshelden", {
    body: n.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", lang: "de", data: { link },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "#meine";
  const url = new URL("./" + (link.startsWith("#") ? link : "#meine"), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
