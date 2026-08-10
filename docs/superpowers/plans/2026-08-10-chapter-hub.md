# Chapter Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a single-page Valentine site into an anthology — a main hub showing chapters as a 3D ring carousel, with the existing Valentine content moved into Chapter 01.

**Architecture:** Static site, no build step. Each chapter is its own self-contained page under `chapters/<id>/`. The hub is `index.html` at the root, driven by a `chapters.js` manifest. Ring arithmetic lives in `shared/ring.js` as pure functions (unit-tested under Node); DOM wiring lives in `shared/hub.js`.

**Tech Stack:** Plain HTML, CSS (CSS 3D transforms), vanilla JS (classic `<script>`, no modules), Node 24 built-in test runner for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-10-chapter-hub-design.md`

## Global Constraints

- **No build step, no bundler, no framework, no TypeScript, no npm dependencies.** There is no `package.json` and none is to be created.
- **Must work when opened by double-click (`file://`).** This forbids `fetch()` for local files and forbids ES modules (`type="module"`). Use classic `<script src>` only.
- `shared/ring.js` must work in **both** the browser (assigns `window.Ring`) and Node (`module.exports`) from one file, so tests can import it without a build.
- **The Valentine chapter's behavior must not change.** The migration touches asset paths and adds a back link. No restyling, no refactoring, no logic changes.
- Repo stays named `my_valentine`; the GitHub Pages URL must not change.
- No date gating, no countdowns, no progress saving, no sequential unlocking, no shared chapter engine (`shared/audio.js` is explicitly NOT created).
- Ghost cards read `coming soon` — they never tease a chapter name.
- Ring slot count: `max(6, chapters.length)`. The floor of 6 is required so one real chapter still reads as a ring.
- Card size is `150px` square, border-radius `18px`.
- Commit after every task. Work on a branch, not directly on `main`.

## File Structure

| Path | Responsibility |
|---|---|
| `chapters.js` | Manifest. `window.CHAPTERS` array. The only file edited to add a chapter. |
| `shared/ring.js` | Pure functions: manifest normalization, slot/radius/angle math, snap target, focus-from-URL. No DOM. |
| `shared/hub.js` | DOM wiring: builds cards, drag/scroll/keyboard spin, snap, idle rotation, focus text, enter transition. |
| `shared/base.css` | Dark canvas, stage perspective, card, ghost card, focus panel, responsive, reduced-motion. |
| `index.html` | Hub markup + script tags. Thin — no logic inline. |
| `chapters/01-valentine/index.html` | Today's Valentine page, moved. Asset paths rebased, back link added. |
| `chapters/01-valentine/assets/*` | All 44 Valentine media files. |
| `chapters/01-valentine/cover.jpg` | Ring card cover. |
| `chapters/_template/index.html` | Starter page to copy for the next chapter. |
| `chapters/_template/README.md` | The add-a-chapter procedure. |
| `tests/ring.test.js` | Unit tests for `shared/ring.js`. |

`ring.js` is split from `hub.js` deliberately: it makes the arithmetic testable without a DOM, and keeps each file small enough to hold in context at once.

---

### Task 0: Branch

- [ ] **Step 1: Create the working branch**

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine
git checkout -b chapter-hub
git status --short
```

Expected: on branch `chapter-hub`, only `.gitignore` untracked.

- [ ] **Step 2: Commit the gitignore and design spec**

```bash
git add .gitignore docs/superpowers/specs/2026-08-10-chapter-hub-design.md docs/superpowers/plans/2026-08-10-chapter-hub.md
git commit -m "docs: add chapter hub design spec and implementation plan"
```

---

### Task 1: Ring logic (pure functions, unit-tested)

**Files:**
- Create: `shared/ring.js`
- Test: `tests/ring.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces — all on `window.Ring` in the browser and `module.exports` in Node:
  - `normalizeChapters(raw: unknown) -> Chapter[]`
  - `padToSlots(chapters: Chapter[], slots: number) -> Chapter[]`
  - `ringSlots(count: number) -> number`
  - `ringRadius(slots: number, cardSize: number) -> number`
  - `slotAngle(index: number, slots: number) -> number`
  - `nearestSlotIndex(rotation: number, slots: number) -> number`
  - `snapRotation(rotation: number, slots: number) -> number`
  - `focusIndexFromSearch(search: string, chapters: Chapter[]) -> number`
- `Chapter` shape: `{ id, status: "ready"|"soon", title: string|null, subtitle: string, cover: string|null, href: string|null }`

- [ ] **Step 1: Write the failing tests**

Create `tests/ring.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const Ring = require("../shared/ring.js");

test("normalizeChapters derives href and cover from id for ready chapters", () => {
  const out = Ring.normalizeChapters([
    { id: "01-valentine", title: "My Valentine", subtitle: "hi", status: "ready" },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    id: "01-valentine",
    status: "ready",
    title: "My Valentine",
    subtitle: "hi",
    cover: "chapters/01-valentine/cover.jpg",
    href: "chapters/01-valentine/index.html",
  });
});

test("normalizeChapters strips content from soon chapters", () => {
  const out = Ring.normalizeChapters([
    { id: "02", title: "Birthday", subtitle: "leaked", cover: "x.jpg", status: "soon" },
  ]);
  assert.deepEqual(out[0], {
    id: "02",
    status: "soon",
    title: null,
    subtitle: "",
    cover: null,
    href: null,
  });
});

test("normalizeChapters defaults missing status to soon", () => {
  const out = Ring.normalizeChapters([{ id: "03" }]);
  assert.equal(out[0].status, "soon");
});

test("normalizeChapters falls back to id when a ready chapter has no title", () => {
  const out = Ring.normalizeChapters([{ id: "04-x", status: "ready" }]);
  assert.equal(out[0].title, "04-x");
  assert.equal(out[0].subtitle, "");
});

test("normalizeChapters skips entries without a usable id", () => {
  const out = Ring.normalizeChapters([{ id: "" }, { title: "no id" }, null, { id: "05" }]);
  assert.deepEqual(out.map((c) => c.id), ["05"]);
});

test("normalizeChapters returns empty array for non-array input", () => {
  assert.deepEqual(Ring.normalizeChapters(undefined), []);
  assert.deepEqual(Ring.normalizeChapters({ id: "01" }), []);
});

test("ringSlots keeps a floor of six so one chapter still reads as a ring", () => {
  assert.equal(Ring.ringSlots(0), 6);
  assert.equal(Ring.ringSlots(1), 6);
  assert.equal(Ring.ringSlots(6), 6);
  assert.equal(Ring.ringSlots(7), 7);
  assert.equal(Ring.ringSlots(20), 20);
});

test("ringRadius grows with slot count so cards never overlap", () => {
  const six = Ring.ringRadius(6, 150);
  const twelve = Ring.ringRadius(12, 150);
  assert.ok(twelve > six, `expected ${twelve} > ${six}`);
  // chord between adjacent card centres must be at least the card size
  for (const slots of [6, 8, 12, 20]) {
    const r = Ring.ringRadius(slots, 150);
    const chord = 2 * r * Math.sin(Math.PI / slots);
    assert.ok(chord >= 150, `slots=${slots} chord=${chord} must be >= 150`);
  }
});

test("padToSlots fills the remainder with numbered ghosts", () => {
  const chapters = Ring.normalizeChapters([{ id: "01-valentine", status: "ready" }]);
  const padded = Ring.padToSlots(chapters, 6);
  assert.equal(padded.length, 6);
  assert.equal(padded[0].id, "01-valentine");
  assert.deepEqual(padded.slice(1).map((c) => c.status), ["soon", "soon", "soon", "soon", "soon"]);
  assert.deepEqual(padded.slice(1).map((c) => c.id), ["02", "03", "04", "05", "06"]);
});

test("padToSlots does not truncate when there are more chapters than slots", () => {
  const chapters = Ring.normalizeChapters([{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.equal(Ring.padToSlots(chapters, 2).length, 3);
});

test("slotAngle spreads slots evenly around the circle", () => {
  assert.equal(Ring.slotAngle(0, 6), 0);
  assert.equal(Ring.slotAngle(1, 6), 60);
  assert.equal(Ring.slotAngle(5, 6), 300);
});

test("nearestSlotIndex reports which card is at the front", () => {
  assert.equal(Ring.nearestSlotIndex(0, 6), 0);
  assert.equal(Ring.nearestSlotIndex(-60, 6), 1);
  assert.equal(Ring.nearestSlotIndex(-70, 6), 1);
  assert.equal(Ring.nearestSlotIndex(-300, 6), 5);
  assert.equal(Ring.nearestSlotIndex(60, 6), 5);
});

test("nearestSlotIndex stays in range after many turns in either direction", () => {
  for (const rotation of [-3600, -725, -361, 361, 1440]) {
    const i = Ring.nearestSlotIndex(rotation, 6);
    assert.ok(i >= 0 && i < 6, `rotation=${rotation} gave ${i}`);
  }
});

test("snapRotation lands on a slot without unwinding the ring", () => {
  assert.equal(Ring.snapRotation(-70, 6), -60);
  assert.equal(Ring.snapRotation(-50, 6), -60);
  // near a full turn, snap to the nearby multiple rather than back to zero
  assert.equal(Ring.snapRotation(-355, 6), -360);
  assert.equal(Ring.snapRotation(-725, 6), -720);
});

test("snapRotation is a fixed point on an exact slot", () => {
  assert.equal(Ring.snapRotation(-120, 6), -120);
});

test("focusIndexFromSearch finds the chapter named in the query string", () => {
  const chapters = Ring.normalizeChapters([{ id: "01-a" }, { id: "02-b" }, { id: "03-c" }]);
  assert.equal(Ring.focusIndexFromSearch("?from=02-b", chapters), 1);
  assert.equal(Ring.focusIndexFromSearch("?from=03-c&x=1", chapters), 2);
});

test("focusIndexFromSearch falls back to the first chapter", () => {
  const chapters = Ring.normalizeChapters([{ id: "01-a" }, { id: "02-b" }]);
  assert.equal(Ring.focusIndexFromSearch("", chapters), 0);
  assert.equal(Ring.focusIndexFromSearch("?from=nope", chapters), 0);
  assert.equal(Ring.focusIndexFromSearch("?other=1", chapters), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../shared/ring.js'`

- [ ] **Step 3: Write the implementation**

Create `shared/ring.js`:

```js
/*
 * Pure ring + manifest logic. No DOM access, so it can be unit-tested under Node.
 * Loaded as a classic script in the browser (assigns window.Ring) and required
 * from tests in Node — one file, no build step.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Ring = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MIN_SLOTS = 6;
  // Adjacent cards must not touch: leave 15% of a card width between centres.
  const CARD_GAP_FACTOR = 1.15;

  function normalizeChapters(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!id) continue;
      if (entry.status === "ready") {
        out.push({
          id: id,
          status: "ready",
          title: typeof entry.title === "string" && entry.title.trim() ? entry.title : id,
          subtitle: typeof entry.subtitle === "string" ? entry.subtitle : "",
          cover: "chapters/" + id + "/cover.jpg",
          href: "chapters/" + id + "/index.html",
        });
      } else {
        // Unbuilt: ignore every other field so nothing leaks onto a ghost card.
        out.push({ id: id, status: "soon", title: null, subtitle: "", cover: null, href: null });
      }
    }
    return out;
  }

  function ringSlots(count) {
    const n = Number.isFinite(count) ? Math.floor(count) : 0;
    return Math.max(MIN_SLOTS, n);
  }

  function ringRadius(slots, cardSize) {
    const n = Math.max(3, slots);
    // Invert chord = 2R sin(pi/n) so the gap between neighbours is honoured.
    return (cardSize * CARD_GAP_FACTOR) / (2 * Math.sin(Math.PI / n));
  }

  function padToSlots(chapters, slots) {
    const out = chapters.slice();
    for (let i = out.length; i < slots; i++) {
      out.push({
        id: String(i + 1).padStart(2, "0"),
        status: "soon",
        title: null,
        subtitle: "",
        cover: null,
        href: null,
      });
    }
    return out;
  }

  function slotAngle(index, slots) {
    return (index * 360) / slots;
  }

  function nearestSlotIndex(rotation, slots) {
    const step = 360 / slots;
    const raw = Math.round(-rotation / step);
    return ((raw % slots) + slots) % slots;
  }

  function snapRotation(rotation, slots) {
    const step = 360 / slots;
    return Math.round(rotation / step) * step;
  }

  function focusIndexFromSearch(search, chapters) {
    const match = /[?&]from=([^&]*)/.exec(search || "");
    if (!match) return 0;
    const id = decodeURIComponent(match[1]);
    const index = chapters.findIndex(function (c) {
      return c.id === id;
    });
    return index < 0 ? 0 : index;
  }

  return {
    normalizeChapters: normalizeChapters,
    padToSlots: padToSlots,
    ringSlots: ringSlots,
    ringRadius: ringRadius,
    slotAngle: slotAngle,
    nearestSlotIndex: nearestSlotIndex,
    snapRotation: snapRotation,
    focusIndexFromSearch: focusIndexFromSearch,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: PASS — all tests, 0 failures. If `ringRadius` fails the chord assertion, `CARD_GAP_FACTOR` is below 1.0; it must be >= 1.0.

- [ ] **Step 5: Commit**

```bash
git add shared/ring.js tests/ring.test.js
git commit -m "feat: add pure ring geometry and chapter manifest logic"
```

---

### Task 2: Move Valentine into Chapter 01

**Files:**
- Move: `index.html` -> `chapters/01-valentine/index.html`
- Move: all 44 media files -> `chapters/01-valentine/assets/`
- Create: `chapters/01-valentine/cover.jpg` (copy of `couple.jpg`)
- Modify: `chapters/01-valentine/index.html` — asset paths, back link

**Interfaces:**
- Consumes: nothing.
- Produces: a working chapter page at `chapters/01-valentine/index.html` whose back link points at `../../index.html?from=01-valentine`. Task 3's manifest depends on this exact path.

**Note for the reviewer:** at the end of this task the repo root has **no** `index.html`. That is expected — Task 3 creates the hub there. The site is intentionally incomplete between these two commits.

- [ ] **Step 1: Move the files with git so history follows**

```bash
mkdir -p chapters/01-valentine/assets
git mv index.html chapters/01-valentine/index.html
git mv *.jpg *.mp3 chapters/01-valentine/assets/
cp chapters/01-valentine/assets/couple.jpg chapters/01-valentine/cover.jpg
ls chapters/01-valentine/assets | wc -l
```

Expected: `44` files in `assets/` (24 numbered jpgs + cat1-8 + boy/girl/couple/cat + 7 audio). Root now contains no `.jpg` or `.mp3`.

- [ ] **Step 2: Confirm the exact set of asset references before editing**

```bash
grep -nE '\.(jpg|mp3)' chapters/01-valentine/index.html
```

Expected: references at roughly lines 429, 440, 480, 499-506, 525-531, 710, 1043, 1125, 1134. Two are built at runtime and must not be missed:

- `catPanelImg.src = \`cat${catIdx}.jpg\`` (~line 710)
- `<img src="${idx+1}.jpg" ...>` (~line 1043)

- [ ] **Step 3: Add a single asset base constant**

Insert near the top of the first `<script>` block in `chapters/01-valentine/index.html` (just before the existing audio setup around line 520):

```js
  // All media for this chapter lives in ./assets/. Every asset reference in this
  // file goes through ASSETS so the folder can move without a hunt-and-peck edit.
  const ASSETS = "assets/";
```

- [ ] **Step 4: Rebase every asset path**

Static HTML attributes — prefix with `assets/`:

```html
<img src="assets/boy.jpg" alt="boy" />
<img id="catPanelImg" src="assets/cat1.jpg" alt="cat" />
<img src="assets/girl.jpg" alt="girl" />
<audio id="song1" src="assets/song1.mp3" preload="auto" loop></audio>
<audio id="song2" src="assets/song2.mp3" preload="auto" loop></audio>
<audio id="song3" src="assets/song3.mp3" preload="auto" loop></audio>
<audio id="boom1" src="assets/boom1.mp3" preload="auto"></audio>
<audio id="boom2" src="assets/boom2.mp3" preload="auto"></audio>
<audio id="tingSound" src="assets/ting.mp3" preload="auto"></audio>
```

There are **two** `<audio id="tingSound">` tags (~line 506 and ~line 1134) and both need the prefix.

The `couple.jpg` reference (~line 1125):

```html
<img src="assets/couple.jpg" alt="valentine"
```

JS constructions — route through `ASSETS`:

```js
    boom1: new Audio(ASSETS + "boom1.mp3"),
    boom2: new Audio(ASSETS + "boom2.mp3"),
    pop: new Audio(ASSETS + "pop.mp3"),
```

```js
      song1: ASSETS + "song1.mp3",
      song2: ASSETS + "song2.mp3",
      song3: ASSETS + "song3.mp3",
```

The two runtime-built paths:

```js
    if (catPanelImg) catPanelImg.src = `${ASSETS}cat${catIdx}.jpg`;
```

```js
          <img src="${ASSETS}${idx+1}.jpg" alt="p${idx+1}">
```

- [ ] **Step 5: Verify no bare asset paths remain**

```bash
grep -nE '(src|Audio\()\s*=?\s*["`][^"`]*\.(jpg|mp3)' chapters/01-valentine/index.html \
  | grep -v 'assets/' | grep -v '\${ASSETS}'
```

Expected: **no output**. Any line printed is a path that was missed.

- [ ] **Step 6: Add the back link**

Insert immediately after the opening `<body>` tag:

```html
  <a class="chapter-back" href="../../index.html?from=01-valentine"
     aria-label="back to chapters">&#8592; chapters</a>
  <style>
    .chapter-back{position:fixed;top:14px;left:14px;z-index:9999;padding:8px 14px;
      border-radius:999px;background:rgba(0,0,0,.55);color:#fff;text-decoration:none;
      font:500 12px/1 ui-sans-serif,system-ui;letter-spacing:.1em;text-transform:uppercase;
      backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.25)}
    .chapter-back:hover{background:rgba(0,0,0,.8)}
  </style>
```

- [ ] **Step 7: Full manual play-through**

Open `chapters/01-valentine/index.html` by double-click. With DevTools console open, walk the whole thing:

1. Page 1: boy and girl images load. Press **Start Music** — `song1` plays. Click **NO**; cat panel image changes (cycles `cat1`-`cat8`), `pop`/`ting` fire, HP hearts decrement.
2. Click **NO** twenty times total. On the 20th: `boom1`/`boom2` play, overlay appears, `song2` starts.
3. Page 2: glitter animates, **YES** button works.
4. Page 3: all 24 photos (`1.jpg`-`24.jpg`) render — scroll through every one. `couple.jpg` shows.
5. Console shows **zero** 404s and zero errors for the entire run.
6. The back link is visible top-left. It will 404 until Task 3 — that is expected; confirm the URL it points at is `../../index.html?from=01-valentine`.

Do not skip step 4. The 24 numbered photos are the only consumer of the runtime-built path, so a mistake there is invisible until this screen.

- [ ] **Step 8: Commit**

```bash
git add -A chapters/01-valentine
git commit -m "refactor: move valentine page into chapters/01-valentine with rebased asset paths"
```

---

### Task 3: Hub renders the ring

**Files:**
- Create: `chapters.js`
- Create: `shared/base.css`
- Create: `shared/hub.js`
- Create: `index.html`

**Interfaces:**
- Consumes: `window.Ring` from Task 1 (`normalizeChapters`, `padToSlots`, `ringSlots`, `ringRadius`, `slotAngle`, `nearestSlotIndex`, `focusIndexFromSearch`); the chapter page at `chapters/01-valentine/index.html` from Task 2.
- Produces `window.Hub`, exposed for debugging in the console:
  - `setRotation(deg: number) -> void` — applies the transform and updates focus state
  - `getRotation() -> number`
  - `rotationForSlot(index: number) -> number` — nearest equivalent angle putting slot `index` at the front
  - `enter(href: string) -> void` — fade to black, then navigate
  - `slots: number`, `cards: Chapter[]`, `cardEls: Element[]`, `focusedIndex() -> number`
- Task 4 appends to this same IIFE and uses the in-scope bindings (`setRotation`, `rotation`, `focused`, `cards`, `cardEls`, `stage`, `ringEl`, `enter`, `rotationForSlot`, `slots`) directly — it does not go through `window.Hub`.

Static ring only in this task: correct geometry, correct focus text, working Enter. Spin and drag arrive in Task 4.

- [ ] **Step 1: Create the manifest**

Create `chapters.js`:

```js
/*
 * The chapter manifest. This is the only file you edit to add a chapter.
 *
 * Adding one:
 *   1. cp -r chapters/_template chapters/07-something
 *   2. put your media in chapters/07-something/assets/
 *   3. save a square cover as chapters/07-something/cover.jpg
 *   4. flip that entry below to status:"ready" and fill in title + subtitle
 *
 * Both the page URL (chapters/<id>/index.html) and the cover
 * (chapters/<id>/cover.jpg) are derived from `id`. Do not add path fields.
 *
 * status:"soon" renders an unclickable "coming soon" ghost card. Only `id`
 * matters for those — every other field is ignored, so nothing spoils.
 */
window.CHAPTERS = [
  {
    id: "01-valentine",
    title: "My Valentine",
    subtitle: "the one where she said no nineteen times",
    status: "ready",
  },
  { id: "02", status: "soon" },
  { id: "03", status: "soon" },
  { id: "04", status: "soon" },
  { id: "05", status: "soon" },
  { id: "06", status: "soon" },
];
```

- [ ] **Step 2: Create the stylesheet**

Create `shared/base.css`:

```css
:root {
  --card: 150px;
  --ink: #fafafa;
  --dim: #a1a1aa;
  --faint: #52525b;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: #000;
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif;
  overscroll-behavior: none;
}

.hub {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 44%, #14141c 0%, #000 70%);
}

.hub-hint {
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  text-align: center;
  margin: 0;
  font: 400 11px/1 ui-monospace, monospace;
  color: var(--faint);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.stage {
  position: absolute;
  inset: 0;
  perspective: 1200px;
  touch-action: none;          /* we handle drag ourselves */
  cursor: grab;
}
.stage:active { cursor: grabbing; }

.ring {
  position: absolute;
  top: 42%;
  left: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}

.card {
  position: absolute;
  width: var(--card);
  height: var(--card);
  top: calc(var(--card) / -2);
  left: calc(var(--card) / -2);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
  background: #0e0e14;
  display: block;
  text-decoration: none;
  transition: opacity 0.25s ease, filter 0.25s ease;
}

.card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Cards rotated away from the viewer recede. Set by hub.js. */
.card[data-back="true"] { opacity: 0.45; filter: brightness(0.65) saturate(0.8); }

.card--ghost {
  border: 1.5px dashed rgba(255, 255, 255, 0.22);
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.card--ghost span {
  font: 500 11px/1.5 ui-monospace, monospace;
  color: var(--faint);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: center;
  padding: 0 14px;
}

.focus {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 38px;
  text-align: center;
  pointer-events: none;
}
.focus > * { pointer-events: auto; }

.focus-num {
  margin: 0;
  font: 500 11px/1 ui-monospace, monospace;
  color: #71717a;
  letter-spacing: 0.22em;
}

.focus-name {
  margin: 9px 0 6px;
  font: 600 27px/1.25 ui-serif, Georgia, serif;
  color: var(--ink);
}

.focus-sub {
  margin: 0;
  font: 400 13px/1.4 ui-sans-serif, system-ui;
  color: var(--dim);
}

.focus-enter {
  display: inline-block;
  margin-top: 16px;
  padding: 9px 22px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  font: 500 12px/1 ui-sans-serif, system-ui;
  color: var(--ink);
  text-decoration: none;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transition: background 0.2s ease;
}
.focus-enter:hover { background: rgba(255, 255, 255, 0.12); }
.focus-enter[hidden] { display: none; }

.card:focus-visible,
.focus-enter:focus-visible {
  outline: 2px solid #a78bfa;
  outline-offset: 3px;
}

.fade {
  position: fixed;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.45s ease;
  z-index: 100;
}
.fade[data-on="true"] { opacity: 1; }

@media (max-width: 620px) {
  :root { --card: 108px; }
  .focus-name { font-size: 21px; }
  .focus-sub { font-size: 12px; padding: 0 24px; }
}

@media (prefers-reduced-motion: reduce) {
  .card, .fade, .focus-enter { transition: none; }
  .ring { transition: none !important; }
}
```

- [ ] **Step 3: Create the hub markup**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Chapters</title>
  <link rel="stylesheet" href="shared/base.css" />
</head>
<body>
  <main class="hub">
    <p class="hub-hint" id="hint">drag to spin &middot; click a card to enter</p>

    <div class="stage" id="stage">
      <div class="ring" id="ring"></div>
    </div>

    <div class="focus">
      <p class="focus-num" id="focusNum"></p>
      <h1 class="focus-name" id="focusName"></h1>
      <p class="focus-sub" id="focusSub"></p>
      <a class="focus-enter" id="focusEnter" href="#">Enter</a>
    </div>
  </main>

  <div class="fade" id="fade"></div>

  <script src="chapters.js"></script>
  <script src="shared/ring.js"></script>
  <script src="shared/hub.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create the hub wiring**

Create `shared/hub.js`:

```js
/*
 * Hub DOM wiring. All arithmetic lives in shared/ring.js — this file only
 * builds elements, applies transforms, and routes events.
 */
(function () {
  "use strict";

  const R = window.Ring;
  const stage = document.getElementById("stage");
  const ringEl = document.getElementById("ring");
  const fadeEl = document.getElementById("fade");
  const numEl = document.getElementById("focusNum");
  const nameEl = document.getElementById("focusName");
  const subEl = document.getElementById("focusSub");
  const enterEl = document.getElementById("focusEnter");

  const chapters = R.normalizeChapters(window.CHAPTERS);
  const slots = R.ringSlots(chapters.length);
  const cards = R.padToSlots(chapters, slots);
  const cardSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card")) || 150;
  const radius = R.ringRadius(slots, cardSize);

  let rotation = 0;
  let focused = -1;

  const cardEls = cards.map(function (chapter, i) {
    const el = document.createElement(chapter.status === "ready" ? "a" : "div");
    el.className = "card" + (chapter.status === "ready" ? "" : " card--ghost");
    el.dataset.slot = String(i);
    el.style.transform = "rotateY(" + R.slotAngle(i, slots) + "deg) translateZ(" + radius + "px)";

    if (chapter.status === "ready") {
      el.href = chapter.href;
      el.setAttribute("aria-label", chapter.title);
      const img = document.createElement("img");
      img.src = chapter.cover;
      img.alt = chapter.title;
      el.appendChild(img);
    } else {
      el.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.innerHTML = "Chapter " + chapter.id + "<br>coming soon";
      el.appendChild(span);
    }

    ringEl.appendChild(el);
    return el;
  });

  function setRotation(deg) {
    rotation = deg;
    ringEl.style.transform = "rotateY(" + deg + "deg) rotateX(-8deg)";
    const index = R.nearestSlotIndex(deg, slots);
    cardEls.forEach(function (el, i) {
      el.dataset.back = String(i !== index);
    });
    if (index !== focused) {
      focused = index;
      renderFocus(cards[index]);
    }
  }

  function renderFocus(chapter) {
    if (chapter.status === "ready") {
      numEl.textContent = "CHAPTER " + chapter.id.split("-")[0];
      nameEl.textContent = chapter.title;
      subEl.textContent = chapter.subtitle;
      enterEl.hidden = false;
      enterEl.href = chapter.href;
    } else {
      numEl.textContent = "CHAPTER " + chapter.id;
      nameEl.textContent = "coming soon";
      subEl.textContent = "";
      enterEl.hidden = true;
      enterEl.removeAttribute("href");
    }
  }

  function rotationForSlot(index) {
    // Choose the equivalent angle closest to the current rotation so the ring
    // takes the short way round instead of unwinding.
    const step = 360 / slots;
    const base = -index * step;
    const turns = Math.round((rotation - base) / 360);
    return base + turns * 360;
  }

  function enter(href) {
    fadeEl.dataset.on = "true";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(function () {
      window.location.href = href;
    }, reduced ? 0 : 450);
  }

  enterEl.addEventListener("click", function (event) {
    event.preventDefault();
    const chapter = cards[focused];
    if (chapter.status === "ready") enter(chapter.href);
  });

  // Start on the chapter we came back from, or the first one.
  setRotation(rotationForSlot(R.focusIndexFromSearch(window.location.search, cards)));

  window.Hub = {
    setRotation: setRotation,
    getRotation: function () { return rotation; },
    rotationForSlot: rotationForSlot,
    enter: enter,
    slots: slots,
    cards: cards,
    cardEls: cardEls,
    focusedIndex: function () { return focused; },
  };
})();
```

- [ ] **Step 5: Verify the static ring in a browser**

Open `index.html` by double-click. Confirm:

1. Six cards on a ring, tilted, evenly spaced, none overlapping.
2. Slot 0 shows `couple.jpg` at the front, full brightness; the other five are dashed ghosts reading "Chapter 02 / coming soon" and are dimmed.
3. Focus panel reads `CHAPTER 01` / `My Valentine` / the subtitle, with an **Enter** button.
4. Clicking **Enter** fades to black and loads the Valentine page.
5. On the Valentine page, the back link returns to the hub and the URL is `index.html?from=01-valentine`.
6. Console shows no errors and no 404s.

- [ ] **Step 6: Verify the ghost focus state**

Temporarily edit `chapters.js` and change `01-valentine`'s `status` to `"soon"`. Reload: every card is a ghost, the focus panel reads "coming soon", and **Enter** is hidden (not merely disabled). Revert the edit.

- [ ] **Step 7: Commit**

```bash
git add chapters.js shared/base.css shared/hub.js index.html
git commit -m "feat: add chapter hub with static ring carousel"
```

---

### Task 4: Spin, snap, and idle

**Files:**
- Modify: `shared/hub.js` (append an interaction block before the closing `})();`)

**Interfaces:**
- Consumes: the in-scope bindings created in Task 3 — `setRotation`, `rotation`, `focused`, `cards`, `cardEls`, `stage`, `ringEl`, `enter`, `rotationForSlot`, `slots` — plus `window.Ring.snapRotation`. This code goes **inside** the existing IIFE in `shared/hub.js`; it will throw `ReferenceError` if placed after the closing `})();`.
- Produces: no new API.

- [ ] **Step 1: Add drag, wheel, keyboard, snap, and idle**

Append inside the IIFE in `shared/hub.js`, just before `window.Hub = {`:

```js
  // ---- interaction ----------------------------------------------------------

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DRAG_DEG_PER_PX = 0.35;
  const IDLE_DELAY_MS = 2500;
  const IDLE_DEG_PER_SEC = 3.5;

  let dragging = false;
  let dragStartX = 0;
  let dragStartRotation = 0;
  let dragMoved = 0;
  let lastInputAt = 0;
  let lastFrameAt = 0;

  function markInput() {
    lastInputAt = performance.now();
  }

  function animateTo(deg) {
    ringEl.style.transition = reducedMotion.matches ? "none" : "transform 0.4s cubic-bezier(.22,.61,.36,1)";
    setRotation(deg);
    window.setTimeout(function () {
      ringEl.style.transition = "none";
    }, 420);
  }

  function snap() {
    animateTo(window.Ring.snapRotation(rotation, slots));
  }

  stage.addEventListener("pointerdown", function (event) {
    dragging = true;
    dragMoved = 0;
    dragStartX = event.clientX;
    dragStartRotation = rotation;
    ringEl.style.transition = "none";
    stage.setPointerCapture(event.pointerId);
    markInput();
  });

  stage.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    const dx = event.clientX - dragStartX;
    dragMoved = Math.max(dragMoved, Math.abs(dx));
    setRotation(dragStartRotation + dx * DRAG_DEG_PER_PX);
    markInput();
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    snap();
    markInput();
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("wheel", function (event) {
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    setRotation(rotation + delta * 0.25);
    markInput();
    window.clearTimeout(stage._wheelTimer);
    stage._wheelTimer = window.setTimeout(snap, 140);
  }, { passive: false });

  document.addEventListener("keydown", function (event) {
    const step = 360 / slots;
    if (event.key === "ArrowLeft") {
      animateTo(window.Ring.snapRotation(rotation, slots) + step);
    } else if (event.key === "ArrowRight") {
      animateTo(window.Ring.snapRotation(rotation, slots) - step);
    } else if (event.key === "Enter") {
      const chapter = cards[focused];
      if (chapter.status === "ready" && document.activeElement === document.body) {
        event.preventDefault();
        enter(chapter.href);
      }
      return;
    } else {
      return;
    }
    event.preventDefault();
    markInput();
  });

  // A click on a card that is NOT at the front only brings it forward. Without
  // this you enter the wrong chapter by mis-clicking a card you can barely see.
  cardEls.forEach(function (el, i) {
    el.addEventListener("click", function (event) {
      if (dragMoved > 6) {          // that was a drag, not a click
        event.preventDefault();
        return;
      }
      const chapter = cards[i];
      if (chapter.status !== "ready") {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (i !== focused) {
        animateTo(rotationForSlot(i));
        markInput();
        return;
      }
      enter(chapter.href);
    });
  });

  function tick(now) {
    if (!reducedMotion.matches && !dragging && now - lastInputAt > IDLE_DELAY_MS) {
      const dt = lastFrameAt ? (now - lastFrameAt) / 1000 : 0;
      if (dt > 0 && dt < 0.5) setRotation(rotation - IDLE_DEG_PER_SEC * dt);
    }
    lastFrameAt = now;
    window.requestAnimationFrame(tick);
  }
  markInput();
  window.requestAnimationFrame(tick);
```

- [ ] **Step 2: Manual interaction check**

Open `index.html`. Confirm each:

1. Drag left/right — the ring follows the pointer, then snaps to the nearest card on release.
2. Trackpad two-finger scroll spins it; it snaps ~140ms after you stop.
3. Left/Right arrow keys move exactly one card per press.
4. Leave it alone for ~3 seconds — it starts turning slowly on its own. Touch it and idle stops.
5. Spin so a ghost is at the front — the focus panel reads "coming soon", Enter is hidden, and clicking the ghost does nothing.
6. Spin the Valentine card to the back and click it — it rotates to the front and does **not** navigate. Click it again at the front — it enters.
7. Drag across the Valentine card and release — it does **not** navigate (drag must not count as a click).
8. Spin several full turns in one direction — cards stay evenly spaced and the focus text keeps tracking the front card.

- [ ] **Step 3: Verify reduced-motion**

Enable macOS **System Settings > Accessibility > Display > Reduce motion**, reload, and confirm: no idle rotation, no animated snap (it jumps), and Enter navigates immediately with no fade. Turn it back off.

- [ ] **Step 4: Commit**

```bash
git add shared/hub.js
git commit -m "feat: add drag, scroll, keyboard spin with snap and idle rotation"
```

---

### Task 5: Growth and responsive checks

**Files:**
- Modify: `tests/ring.test.js` (add growth cases)
- Modify: `shared/base.css` only if the stress test exposes a problem

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4.
- Produces: no new API.

This task is proof the hub survives growth. The spec requires it work at 1 chapter and at 20.

- [ ] **Step 1: Add growth tests**

Append to `tests/ring.test.js`:

```js
test("ring grows past the six-slot floor as chapters are added", () => {
  const many = Array.from({ length: 14 }, (_, i) => ({
    id: String(i + 1).padStart(2, "0") + "-c",
    status: "ready",
  }));
  const chapters = Ring.normalizeChapters(many);
  const slots = Ring.ringSlots(chapters.length);
  assert.equal(slots, 14);
  assert.equal(Ring.padToSlots(chapters, slots).length, 14);
  const angles = Array.from({ length: slots }, (_, i) => Ring.slotAngle(i, slots));
  assert.equal(new Set(angles).size, slots, "every slot must sit at a distinct angle");
});

test("every slot is reachable as a focus target at any ring size", () => {
  for (const slots of [6, 7, 14, 20]) {
    const step = 360 / slots;
    for (let i = 0; i < slots; i++) {
      assert.equal(Ring.nearestSlotIndex(-i * step, slots), i, `slots=${slots} i=${i}`);
    }
  }
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/`
Expected: PASS, 0 failures.

- [ ] **Step 3: Stress the hub with 12 chapters**

Temporarily replace the array in `chapters.js` with 12 entries — the real Valentine plus 11 more marked `"ready"` with `id`s `02-x` through `12-x`. Their covers will 404 (no `cover.jpg` exists), which is fine and is itself the check: a missing cover must leave a dark card, not a broken-image icon or a collapsed layout.

Confirm in the browser:

1. 12 cards, evenly spaced, **not overlapping** — the radius grew.
2. The whole ring stays inside the viewport at a 1280px-wide window.
3. Drag, snap, and arrow keys still move exactly one card per step.
4. Focus text tracks correctly all the way around.

If cards overlap, raise `CARD_GAP_FACTOR` in `shared/ring.js` and re-run `node --test tests/`. If the ring overflows the viewport, cap the stage scale in `shared/base.css` rather than shrinking the radius.

Then **revert `chapters.js`** to the real 6-entry manifest.

- [ ] **Step 4: Responsive check**

Resize to 390px wide (or use DevTools iPhone emulation) and confirm:

1. Cards shrink to 108px and the ring still fits with no horizontal scroll.
2. Swipe spins the ring and it snaps.
3. Focus name and subtitle do not overflow or clip.

- [ ] **Step 5: Keyboard and screen-reader check**

1. Load the hub and press **Tab** repeatedly: focus reaches the Valentine card and the Enter button, each with a visible purple outline.
2. Ghost cards are **skipped** by Tab (they are `div`s, not links).
3. With the Valentine card focused, press **Enter** — it navigates to the chapter.

- [ ] **Step 6: Commit**

```bash
git add tests/ring.test.js shared/base.css shared/ring.js
git commit -m "test: cover ring growth and verify hub at twelve chapters"
```

---

### Task 6: The add-a-chapter template

**Files:**
- Create: `chapters/_template/index.html`
- Create: `chapters/_template/assets/.gitkeep`
- Create: `chapters/_template/README.md`

**Interfaces:**
- Consumes: the back-link pattern from Task 2, the manifest format from Task 3.
- Produces: the copyable starting point. This is the deliverable that makes the whole project's goal — cheap chapter authoring — actually true.

- [ ] **Step 1: Create the template page**

Create `chapters/_template/index.html`:

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chapter</title>
  <style>
    /* This chapter owns its own look. Nothing here is shared with the hub
       except the back link below, so you can style it however you want. */
    html, body { margin: 0; height: 100%; background: #08080c; color: #fafafa;
      font-family: ui-sans-serif, system-ui, sans-serif; }
    .chapter-back { position: fixed; top: 14px; left: 14px; z-index: 9999;
      padding: 8px 14px; border-radius: 999px; background: rgba(0,0,0,.55);
      color: #fff; text-decoration: none; font: 500 12px/1 ui-sans-serif, system-ui;
      letter-spacing: .1em; text-transform: uppercase; backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,.25); }
    .chapter-back:hover { background: rgba(0,0,0,.8); }
    .stage { display: flex; align-items: center; justify-content: center;
      height: 100%; text-align: center; padding: 24px; }
  </style>
</head>
<body>
  <!-- Replace CHAPTER_ID with this folder's name, e.g. 02-birthday -->
  <a class="chapter-back" href="../../index.html?from=CHAPTER_ID"
     aria-label="back to chapters">&#8592; chapters</a>

  <div class="stage">
    <div>
      <h1>New chapter</h1>
      <p>Put your media in <code>assets/</code> and build the scene here.</p>
    </div>
  </div>

  <script>
    // Reference media through this constant so the folder can move later:
    //   <img src="..."> becomes  img.src = ASSETS + "photo.jpg"
    const ASSETS = "assets/";
  </script>
</body>
</html>
```

- [ ] **Step 2: Keep the empty assets folder in git**

```bash
mkdir -p chapters/_template/assets
touch chapters/_template/assets/.gitkeep
```

- [ ] **Step 3: Write the procedure**

Create `chapters/_template/README.md`:

```markdown
# Adding a chapter

Four steps. No build, no server — everything opens by double-click.

1. **Copy this folder**, naming it `NN-name` (two-digit number, then a short slug):

       cp -r chapters/_template chapters/02-birthday

2. **Drop your media** into `chapters/02-birthday/assets/`.

3. **Save a square cover** as `chapters/02-birthday/cover.jpg`. It is shown on the
   ring card, so roughly 600x600 is plenty. This filename is not configurable —
   the hub derives it from the folder name.

4. **Edit `chapters.js`** at the repo root. Change the matching `{ id: "02",
   status: "soon" }` entry to:

       { id: "02-birthday", title: "Happy Birthday", subtitle: "one line of flavour", status: "ready" },

   The `id` must equal the folder name exactly — the page URL and the cover path
   are both derived from it.

Then in your new `index.html`, replace `CHAPTER_ID` in the back link with the
folder name (`02-birthday`), so the back arrow returns to the hub with your card
already at the front.

## Notes

- Adding a chapter beyond the sixth is fine — the ring grows and its radius widens.
- Deleting a chapter: remove the folder and its `chapters.js` entry. If that drops
  the total below six, ghosts fill the gap again automatically.
- Chapters share nothing but the back link. Each one can look completely different.
  If two chapters end up needing the same code, that is the moment to move it into
  `shared/` — not before.
```

- [ ] **Step 4: Verify the template actually works**

```bash
cp -r chapters/_template chapters/99-test
```

Edit `chapters/99-test/index.html` replacing `CHAPTER_ID` with `99-test`, add
`{ id: "99-test", title: "Test", subtitle: "scratch", status: "ready" }` to
`chapters.js`, and copy any square image to `chapters/99-test/cover.jpg`.

Confirm: the hub shows 7 cards (ring grew past 6), the test card's cover renders,
clicking it enters the template page, and its back link returns to the hub with
the test card focused.

Then remove the scratch chapter:

```bash
rm -rf chapters/99-test
```

and delete its entry from `chapters.js`. Reload: back to 6 slots, 1 real + 5 ghosts.

- [ ] **Step 5: Commit**

```bash
git add chapters/_template chapters.js
git commit -m "docs: add chapter template and add-a-chapter procedure"
```

---

### Task 7: Final verification and integration

**Files:**
- Modify: none expected.

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/`
Expected: PASS, 0 failures. Record the actual count in the commit or PR body.

- [ ] **Step 2: Confirm the working tree is clean of scratch edits**

```bash
git status --short
cat chapters.js
```

Expected: clean tree; `chapters.js` has exactly the real Valentine entry plus five `"soon"` entries. No `99-test`, no 12-chapter stress array.

- [ ] **Step 3: Full end-to-end run**

Open `index.html` by double-click, console open:

1. Hub renders: 1 real card + 5 ghosts.
2. Enter the Valentine chapter.
3. **Complete play-through** — click NO twenty times, through the boom transition, the glitter page, and the fridge page with all 24 photos. Zero 404s, zero console errors.
4. Back link returns to the hub with the Valentine card at the front.

- [ ] **Step 4: Confirm nothing was left at the repo root**

```bash
ls *.jpg *.mp3 2>&1
```

Expected: `no matches found` — all media now lives under `chapters/01-valentine/assets/`.

- [ ] **Step 5: Report**

Report to the user: test count and result, which manual checks passed, and anything
that did not. Do **not** claim completion on any check that was skipped.

Then ask whether to merge `chapter-hub` into `main` and push, or leave it on the
branch. Deploying changes what is live on GitHub Pages, so do not push without
being asked.

---

## Notes for the implementer

**What is NOT tested automatically, and why.** Drag inertia, 3D transforms, audio
playback, and the Valentine animations would need a browser-automation dependency,
which the no-dependencies constraint rules out. Those are covered by the manual
checklists in Tasks 2, 3, 4, 5, and 7 — which means those checklists are the only
safety net there is. Actually run them; do not read them and assume.

**The one genuinely risky step** is Task 2 step 4. Two asset paths are built at
runtime, and the one feeding the 24 numbered photos is only exercised on the third
page of the chapter. Getting it wrong looks like success until you click NO twenty
times.

**If Valentine breaks and you cannot see why:** `git diff` the chapter file against
its pre-move state. The migration should contain nothing but asset-path changes,
the `ASSETS` constant, and the back link. Any other difference is a bug you
introduced.
