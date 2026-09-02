# Active Recall

A standalone study app: read a lesson section, hide it, write what you
remember from memory, then reveal the original and compare. It is a
learning tool, not a note-taking app.

## Running it

No build step. Serve the folder statically and open `index.html`, e.g.:

```
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

## Architecture

- `index.html` — shell, font loading, script includes.
- `style.css` — design tokens (`--background`, `--surface`, `--foreground`,
  `--muted`, `--border`, `--accent`, `--success`, `--warning`, `--error`)
  plus every component/screen style. Light and dark variants of the
  tokens both exist; dark follows `prefers-color-scheme` or a manual
  toggle in the header.
- `data.js` — the data layer. This repo has no backend, so each "table"
  from the spec (`subjects`, `topics`, `subtopics`, `lessons`,
  `lesson_sections`, `recall_notes`, `active_recall_sessions`) is a JSON
  array in `localStorage`, accessed only through the `Table` helper
  (`list`/`get`/`insert`/`update`). Every caller goes through `data.js`,
  not `localStorage` directly, so swapping this for a real API later is a
  matter of reimplementing this one file. Seed content (Biology, Chemistry,
  Physics with a full Cell Organelles lesson) is inserted once on first
  load and never overwrites user data.
- `app.js` — a small hash router (`#/home`, `#/learn`, `#/lesson/:id/section/:id`,
  `#/recall/:id/:id`, `#/compare/:noteId`, `#/history`, `#/progress`,
  `#/learn/lesson/:id/edit`, …) and the screens/components themselves
  (`LessonViewer`, `RecallEditor`, `RecallComparison`+`RecallRating`,
  `ReviewCard`, `ProgressIndicator`, `SubjectSelector`/`TopicSelector`).
  There is no UI framework in this repo, so "components" are render
  functions returning HTML strings with a `mount()` callback that wires
  up listeners — composable, but not a real component runtime.
- `sw.js` + `reminders-shared.js` — the service worker and the small
  shared module (due-review heuristic + IndexedDB constants) it loads via
  `importScripts`, used only by the reminders feature below.

## Adding your own content

The seed content (Biology/Chemistry/Physics) is a starting point, not a
ceiling — "+ Add Subject" on the Learn screen, then "+ Add Topic" and
"+ Add Lesson" one level down, create real rows in the same tables the
seed data uses. A new lesson opens straight into a content editor
(`#/learn/lesson/:id/edit`) for writing its sections; the pencil icon on
any lesson row in the Lessons list returns to that editor later. Nothing
distinguishes "seed" rows from "user" rows in the schema — both are just
`lessons`/`lesson_sections` records — so this doesn't yet support
editing or deleting the seed lessons themselves, only adding new ones and
editing what you add.

## Study reminders (installed-app notifications)

Home has a "Study Reminders" card that requests notification permission
and, where the browser supports it, registers a **Periodic Background
Sync** (`review-reminder` tag) so a service worker can notify you about
due reviews even if the app isn't open. This is the only mechanism for
"remind me later" available to a static site with no push server — there
is no backend here to send a real push message.

Two real limits worth knowing:

- **Browser support.** Periodic Background Sync is Chromium-only (Chrome/
  Edge on Android and desktop). Safari/iOS and Firefox don't implement it,
  so there "Turn on Reminders" still enables notification permission (in
  case real push support lands later) but the honest fallback is: open
  the app and check Review.
- **No install, no reliable firing.** Even on Chromium, periodic sync only
  starts firing once the browser's own site-engagement heuristics are
  satisfied for the *installed* app (added to home screen / "Install
  app") — there's no permission prompt for this part, and the interval you
  request is a minimum, not a guarantee.

Because a service worker can't read the page's `localStorage`, `data.js`
mirrors just the fields the due-review check needs (`id`, `self_rating`,
`updated_at`) into a small IndexedDB store (`Data.syncReminderMirror()`,
called whenever a recall gets rated). `sw.js` reads that mirror on
`periodicsync` and calls `registration.showNotification()` using the
exact same heuristic as `Data.notesDueForReview()` — both pull it from
`reminders-shared.js` so the two can't drift apart.

## What's implemented vs. deferred

Phases A–C from the spec are fully implemented: lessons/sections, the
read → hide → recall → write flow, and reveal/compare/self-rating, plus
recall history and a light per-subject "average recall quality" progress
view (Phase D, kept intentionally simple — no charting library).

Phase E (wiring into a real spaced-repetition scheduler) is **not**
implemented, by design — the spec calls for staying conservative about
self-reported performance. What exists instead: `data.js`'s
`srsSignalForRating()` maps each 1–4 self-rating to a conservative label
("strong" / "normal" / "weak" / "early-review") and it's stored on the
session record, so a future SRS engine has a signal to read without any
schema change. The "Today's Review" queue on Home/History is a simple
heuristic (poor/okay recalls older than a day, anything untouched for 3+
days) standing in for a real scheduler.

The future-AI-analysis feature (missing/incorrect concept detection,
suggested flashcards) described in the spec is explicitly out of scope
for this milestone and not implemented; nothing in the data model blocks
adding it later since `recall_notes.content` and the matching
`lesson_sections.content` are both already stored as plain text.

## Fonts

See `fonts/README.md` — the primary typeface is TH Mali Grade 6, which is
not bundled here since no font file was available at implementation time.
The app currently falls back to Noto Sans Thai (Google Fonts) so Thai text
stays comfortable to read in the meantime.
