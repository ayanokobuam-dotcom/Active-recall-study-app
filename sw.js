/* =========================================================================
   Active Recall — service worker
   -------------------------------------------------------------------------
   Two jobs: (1) cache the app shell so the installed app opens instantly
   and works offline, and (2) — the reason this exists — wake up on a
   periodic background sync and nudge the user back for a review, reading
   the due-for-review signal from the small IndexedDB mirror data.js keeps
   updated (a service worker can't read the page's localStorage).

   Periodic Background Sync is Chromium-only (Chrome/Edge on Android and
   desktop) and only activates once the installed app has enough browser
   "engagement" — there is no user-facing prompt for it, it just starts
   working after a bit of regular use. See README.md for what this does
   and does not guarantee on other browsers.
   ========================================================================= */

importScripts("reminders-shared.js");

var CACHE_NAME = "active-recall-v1";
var APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./reminders-shared.js",
  "./manifest.json",
  "./favicon.svg",
  "./icons/favicon-32.png",
  "./icons/favicon-48.png",
  "./icons/favicon-192.png",
  "./icons/favicon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(APP_SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/* Stale-while-revalidate: serve from cache instantly (offline-friendly),
   refresh the cache in the background for next time. Only same-origin GET
   requests — the Google Fonts stylesheet/files pass straight through. */
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });
      return cached || network;
    })
  );
});

/* ----------------------------------------------------------------- */
/* Review reminders                                                    */
/* ----------------------------------------------------------------- */

function openReminderDb() {
  return new Promise(function (resolve) {
    if (!("indexedDB" in self)) {
      resolve(null);
      return;
    }
    var req = indexedDB.open(ReminderShared.DB_NAME, ReminderShared.DB_VERSION);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(ReminderShared.STORE)) {
        req.result.createObjectStore(ReminderShared.STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      resolve(null);
    };
  });
}

function readMirroredNotes() {
  return openReminderDb().then(function (db) {
    if (!db) return [];
    return new Promise(function (resolve) {
      var tx = db.transaction(ReminderShared.STORE, "readonly");
      var req = tx.objectStore(ReminderShared.STORE).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        resolve([]);
      };
    });
  });
}

function notifyIfDue() {
  return readMirroredNotes().then(function (notes) {
    var due = ReminderShared.dueNotes(notes);
    if (!due.length) return;
    return self.registration.showNotification("Active Recall", {
      body:
        due.length === 1
          ? "You have 1 recall ready to review."
          : "You have " + due.length + " recalls ready to review.",
      icon: "icons/favicon-192.png",
      badge: "icons/favicon-192.png",
      tag: "review-reminder",
      renotify: true,
      data: { url: "./#/history" }
    });
  });
}

self.addEventListener("periodicsync", function (event) {
  if (event.tag === "review-reminder") event.waitUntil(notifyIfDue());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if ("focus" in clientList[i]) {
          clientList[i].navigate(url);
          return clientList[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
