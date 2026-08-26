# Chapter Hub — Design

**Date:** 2026-08-10
**Repo:** `my_valentine` (`github.com/m-nuttapol/my_valentine`)

## Goal

Turn a one-off Valentine's page into an ongoing anthology. A **main hub** holds many
**chapters**; the current Valentine content becomes Chapter 01.

The driving requirement, in the user's words, is that adding a chapter must not
"cost me to do everytime." Every decision below serves that: adding a chapter is
copying a folder and adding one JSON object. No build step, no server, no framework.

## Decisions

| Question | Decision |
|---|---|
| What is "main"? | A hub you return to. Pick a chapter, play it, come back. |
| Chapter availability | All open. **No date gating** — considered and rejected as too much upkeep per chapter. |
| Chapter count | Unknown. Must look right at 1 chapter and still work at 20. |
| Code structure | Separate page per chapter, sharing files from `shared/`. |
| Hub form | Ring carousel — 3D wheel of rounded photo cards on a dark canvas. |
| Unbuilt chapters | Ghost cards reading "coming soon" (no name teasing — keeps surprises). |
| Ring size | Grows as chapters are added, with a floor of 6 slots. |

## Architecture

```
my_valentine/
  index.html               # MAIN — the hub / ring carousel
  chapters.js              # the only file edited to add a chapter
  shared/
    base.css               # dark canvas, card, typography
    ring.js                # pure ring/manifest logic (unit-tested)
    hub.js                 # hub DOM wiring
  chapters/
    01-valentine/
      index.html           # today's file, moved, asset paths rebased
      cover.jpg
      assets/              # 24 numbered jpgs, cat1-8, boy/girl/couple, songs, SFX
    _template/
      index.html           # starter to copy for the next chapter
  docs/superpowers/specs/
```

Each chapter is its own page. Consequences, all deliberate:

- Chapters are isolated — one breaking cannot take down the hub or its siblings.
- Everything still opens by double-click; no local server, no ES-module constraint.
- Common CSS/JS lives in one place, so an engine fix lands everywhere at once.

### Why no shared engine yet

The obvious alternative was a single-shell app with a real engine (`scene.js`,
`particles.js`, `dialogue.js`) and chapters as JS modules. Rejected **for now**:
it requires breaking up the 1229-line Valentine file up front, and it would mean
designing an engine API against a sample size of one chapter.

Instead: `shared/` holds only what the **hub** needs (`ring.js`, `hub.js`,
`base.css`). No chapter-facing engine is created. Shared chapter code appears only
when a **second** chapter genuinely needs it, so the abstraction gets shaped by
real use. If the shell approach turns out to be right later, three or four similar
chapters will make the correct API obvious.

Concretely: the Valentine chapter keeps its own inline audio handling. It is not
extracted into `shared/audio.js` during this work.

## The chapter manifest

**Why a `.js` file and not `.json`.** The manifest was originally specified as
`chapters.json` loaded with `fetch()`. That does not work: browsers block
`fetch()` against `file://` URLs as a cross-origin request, so double-clicking
`index.html` would show an empty ring. Since opening by double-click is a
requirement, the manifest is a plain script that assigns a global.

```js
// chapters.js
window.CHAPTERS = [
  {
    id: "01-valentine",
    title: "My Valentine",
    subtitle: "the one where she said no nineteen times",
    status: "ready",
  },
  { id: "02", status: "soon" },
];
```

- `status: "ready"` — real card, clickable. Both the entry point
  (`chapters/<id>/index.html`) and the cover (`chapters/<id>/cover.jpg`) are
  derived from `id`, so neither is a field that can drift out of sync.
- `status: "soon"` — ghost card. Only `id` is required; any other fields are
  ignored, so an unbuilt chapter needs no invented content.
- Array order is display order around the ring.

Editing a JS array is no harder than editing JSON, and it costs one `<script>`
tag instead of a local web server.

**Adding a chapter:** copy `chapters/_template/` to `chapters/NN-name/`, drop in
assets, flip that entry to `"ready"` and fill in `title`, `subtitle`, `cover`.

## Hub behavior

**Layout.** Cards sit on a circle in CSS 3D perspective on a near-black canvas,
each `rotateY(i * 360/slots) translateZ(radius)`. The ring tilts slightly on X so
you look down onto it.

**Ring sizing.** `slots = max(6, chapters.length)`, and `radius` scales with
`slots` so cards never overlap as the ring grows. The floor of 6 matters: with one
real chapter, a 1-card "ring" does not read as a ring, so ghosts pad it out.

**Interaction.**

- Drag, trackpad-scroll, or arrow keys spin the ring. Release snaps to the nearest slot.
- Untouched, the ring idles — turning slowly on its own.
- The front card is focused: full colour, with number, title, subtitle, and an
  **Enter** affordance below it. Cards rotating toward the back dim.
- Clicking the focused card enters the chapter (fade to black, then navigate).
- Clicking a *back* card only spins it to the front. This prevents entering the
  wrong chapter by mis-clicking a card you can barely see.
- Ghost cards are inert — no hover, no click, no focus text beyond "coming soon."

**Return path.** A chapter's back link returns to `index.html?from=<id>`, and the
hub opens with that card already at the front rather than resetting to Chapter 01.

**Responsive and accessibility.**

- Narrow screens: tighter radius, swipe to spin.
- `prefers-reduced-motion`: no idle rotation, no spin animation — the ring renders
  as a static fan and snapping is instant.
- Cards are real focusable links, so keyboard tabbing and screen readers work even
  though the visual affordance is a 3D wheel.

## Migrating Valentine

Chapter 01 is today's `index.html` moved to `chapters/01-valentine/index.html`
with its assets under `chapters/01-valentine/assets/`.

**Asset paths.** Most references are static (`song1.mp3`, `cat1.jpg`,
`couple.jpg`, …), but two are built at runtime:

- line ~710: `` catPanelImg.src = `cat${catIdx}.jpg` ``
- line ~1043: `` <img src="${idx+1}.jpg"> ``

So rather than editing paths one by one, introduce a single base constant
(`const ASSETS = "assets/"`) and prefix every reference — static and dynamic —
through it. One concept to get right instead of ~16 independent edits, and future
asset references have an obvious convention to follow.

**Scope discipline.** This migration changes **only** paths and the back link.
No restyling, no refactoring, no behavior changes. Restyling Valentine to match
the hub's dark aesthetic is deliberately deferred; right now it is pink hearts and
that is fine.

## Verification

Split by what is actually testable.

**Automated.** The ring's arithmetic and manifest handling are pure functions in
`shared/ring.js` — slot count, radius, slot angles, snap target, focus-from-URL,
manifest normalization. These are unit-tested with Node's built-in runner
(`node --test tests/`). No dependencies, no package.json, no build step; `ring.js`
exports for Node and assigns a browser global from the same file.

**Manual.** Drag inertia, 3D rendering, audio playback, and the Valentine
animations cannot be covered without a browser automation dependency, which is out
of scope. Those get the checklist below.

The Valentine play-through must be a **full** play-through, because the assets are
spread across all three pages and a broken path is invisible until you reach it.

1. **Page 1** — YES/NO battle: HP hearts render, cat panel cycles through
   `cat1`–`cat8`, boy/girl/couple images load, `song1` plays, `pop`/`ting` fire.
2. **Transition** — 20th NO: `boom1`/`boom2` play, overlay appears, `song2` starts.
3. **Page 2** — glitter heart: glitter layer animates, YES button works.
4. **Page 3** — fridge message: all 24 numbered jpgs (`1.jpg`–`24.jpg`) render.
5. Browser console shows **no 404s** at any point.

Hub checks:

- Renders correctly with 1 real chapter (5 ghosts), and with a temporary
  `chapters.json` of 12 entries.
- Spin, snap, idle, and the click-back-card-spins-to-front rule behave.
- `?from=01-valentine` opens with that card focused.
- Keyboard-only navigation reaches and enters the chapter.
- Reduced-motion setting disables idle rotation.

## Out of scope

Named explicitly so they don't creep in:

- Date gating and countdowns — rejected.
- Build step, bundler, framework, TypeScript.
- Progress saving, sequential unlocking, completion state.
- A shared animation engine.
- Restyling the Valentine chapter.
- Renaming the repo (the Pages URL stays put).
