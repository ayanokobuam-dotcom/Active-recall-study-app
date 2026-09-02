/* =========================================================================
   Active Recall — reminder constants shared by the page and the service
   worker
   -------------------------------------------------------------------------
   A service worker has no access to the page's localStorage, so the
   "due for review" signal it needs for a background notification has to
   live somewhere both sides can reach: a small IndexedDB mirror, kept in
   sync by data.js (see Data.syncReminderMirror) and read by sw.js.
   This file defines the mirror's name/version/store and the exact same
   "due" heuristic as Data.notesDueForReview(), loaded by both index.html
   (a plain <script>) and sw.js (importScripts) so the two never drift.
   ========================================================================= */

(function (global) {
  "use strict";

  function dueNotes(notes) {
    var now = Date.now();
    var DAY = 24 * 60 * 60 * 1000;
    return notes.filter(function (n) {
      if (typeof n.self_rating !== "number") return false;
      var age = now - new Date(n.updated_at).getTime();
      if (n.self_rating <= 2 && age > DAY) return true;
      if (age > 3 * DAY) return true;
      return false;
    });
  }

  global.ReminderShared = {
    DB_NAME: "activeRecallReminders",
    DB_VERSION: 1,
    STORE: "dueChecks",
    dueNotes: dueNotes
  };
})(typeof self !== "undefined" ? self : this);
