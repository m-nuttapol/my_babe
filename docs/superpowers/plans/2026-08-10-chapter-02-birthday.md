# Chapter 02 — Birthday Chase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Chapter 02 — a 2-minute side-scrolling chase where the player catches the gift-thief, ending in a letter reveal with a heart-gated secret.

**Architecture:** Static chapter folder under `chapters/02-birthday/`. All game rules (physics, collision, curves, hearts, QTE) live in two pure, unit-tested files (`game/rules.js`, `game/level.js`) that load in both the browser and Node. Canvas renders the run; DOM handles the cutscene, letter and secret. Classic `<script src>` only.

**Tech Stack:** Plain HTML, Canvas 2D, vanilla JS (classic scripts, IIFE namespaces), WebAudio for the chiptune, Node 24 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-10-chapter-02-birthday-design.md`

## Global Constraints

- **No build step, no bundler, no framework, no npm dependencies.** No `package.json`.
- **Must work opened by double-click (`file://`).** No `fetch()` of local files, no ES modules. Classic `<script src>` only.
- Pure-logic files must work in **both** browser (assign `window.Rules` / `window.Level`) and Node (`module.exports`) from one file — same UMD-ish tail as `shared/ring.js`.
- **No fail state anywhere.** Tripping costs a heart. No death, no restart, no game over. The QTE re-prompts forever.
- **No skip-to-letter link.**
- Hearts: **16 placed (12 hearts + 4 disguised as 🎁), 10 required** for the secret.
- Ghost/secret content the user still owes: the letter text and `secret.jpg`. Build against clearly-marked placeholders; never invent a letter and present it as final.
- Do not modify Chapter 01 or `shared/`. The only file touched outside `chapters/02-birthday/` is `chapters.js`.
- Run `node --test` (bare — **not** `node --test tests/`, which fails on Node 24).
- Commit after every task. Work on branch `chapter-hub` (already checked out) or a branch off it.

## World constants (single source of truth — Task 1 defines these)

| Name | Value | Note |
|---|---|---|
| `CANVAS_W` / `CANVAS_H` | 960 / 540 | logical size, letterboxed |
| `GROUND_Y` | 430 | feet rest here |
| `PLAYER_X` | 260 | fixed screen x |
| `LEVEL_LENGTH` | 39600 | world px |
| `GRAVITY` | 1800 | px/s² |
| `JUMP_V` | −620 | px/s → 107px high, 0.69s airborne |
| `STAND_W` / `STAND_H` | 44 / 72 | |
| `SLIDE_W` / `SLIDE_H` | 60 / 34 | |
| `SLIDE_DURATION` | 0.5 | s |
| `JUMP_OBS_W` / `JUMP_OBS_H` | 46 / 54 | on ground |
| `SLIDE_OBS_H` | 70 | bottom edge at `GROUND_Y - SLIDE_GAP` |
| `SLIDE_GAP` | 48 | 14px clearance for a sliding player |
| `COLLECT_R` | 18 | collectible radius |
| `HEART_LOW_Y` / `HEART_HIGH_Y` | `GROUND_Y-70` / `GROUND_Y-150` | high ones need a jump |
| `STUMBLE_TIME` | 0.6 | s |
| `STUMBLE_SPEED_MULT` | 0.55 | |
| `STUMBLE_GAP_BONUS` | 60 | px handed back to the thief |
| `FINAL_CHASE_AT` | 0.85 | progress |
| `HEARTS_REQUIRED` | 10 | |

## File Structure

| Path | Responsibility |
|---|---|
| `chapters/02-birthday/index.html` | Shell: canvas, HUD, DOM overlays, script tags. No logic. |
| `chapters/02-birthday/game/rules.js` | PURE. Constants, physics step, hitboxes, collision, speed/gap curves, hearts, checkpoints, QTE. Unit-tested. |
| `chapters/02-birthday/game/level.js` | PURE. Deterministic level generation + window queries. Unit-tested. |
| `chapters/02-birthday/game/render.js` | Canvas drawing only. Owns no rules. |
| `chapters/02-birthday/game/input.js` | Keyboard, on-screen buttons, swipe → intent flags. |
| `chapters/02-birthday/game/audio.js` | WebAudio chiptune, piano playback, mute. |
| `chapters/02-birthday/game/scenes.js` | DOM overlays: cutscene, countdown, banners, catch, letter, secret. |
| `chapters/02-birthday/game/main.js` | Boot, fixed-timestep loop, scene state machine, wiring. |
| `chapters/02-birthday/assets/` | faces, couple photo, secret photo, mp3. |
| `tests/rules.test.js` | Tests for `rules.js`. |
| `tests/level.test.js` | Tests for `level.js`. |

`rules.js` and `level.js` are separate because level generation *consumes* the rules (spacing depends on the speed curve) and because the "is this level even possible" test belongs with the level, not the physics.

---

### Task 0: Scaffold and asset preparation

**Files:**
- Create: `chapters/02-birthday/` tree
- Modify: `chapters/02-birthday/assets/` (rename mp3, add crops, cover, downscaled couple photo)

**Interfaces:**
- Consumes: nothing.
- Produces: `assets/face-you.png`, `assets/face-her.png`, `assets/couple.jpg`, `assets/stay-with-me.mp3`, `cover.jpg`, and a placeholder `assets/secret.jpg`. Task 7 and Task 10 load these by exact filename.

- [ ] **Step 1: Confirm the user's raw assets are present**

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine
ls -la chapters/02-birthday/assets/
```

Expected: `Pic1.JPG` (3672×4896), `Pic2.JPG` (1284×2282), and one `.mp3` with spaces in its name.

- [ ] **Step 2: Rename the song to a URL-safe filename**

```bash
cd chapters/02-birthday/assets
mv "Chanyeol, Punch - Stay With Me, Goblin OST (Piano Cover by Riyandi Kusuma).mp3" stay-with-me.mp3
ls stay-with-me.mp3
```

- [ ] **Step 3: Cut the two face crops**

These offsets are verified — tighter variants clipped his chin and left cheek. `sips --cropOffset` takes **y then x**.

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine/chapters/02-birthday/assets
sips -c 1250 1250 --cropOffset 2320 400  Pic1.JPG --out face-you.png
sips -c 1250 1250 --cropOffset 2450 1830 Pic1.JPG --out face-her.png
sips -Z 256 face-you.png face-her.png
sips -g pixelWidth -g pixelHeight face-you.png face-her.png
```

Expected: both 256×256.

- [ ] **Step 4: Look at both crops before trusting them**

Open `face-you.png` and `face-her.png`. Each must contain a complete head — no clipped chin, no cut-off cheek. They get masked to a circle at ~48px, so background at the corners is fine, but a clipped face is not.

If either is wrong, adjust the `--cropOffset` y/x and re-cut. Increasing x moves the crop window right.

- [ ] **Step 5: Make the couple photo and the hub cover**

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine/chapters/02-birthday
sips -Z 1400 assets/Pic2.JPG --out assets/couple.jpg
sips -c 1284 1284 --cropOffset 500 0 assets/Pic2.JPG --out cover.jpg
sips -Z 600 cover.jpg
sips -g pixelWidth -g pixelHeight cover.jpg assets/couple.jpg
```

Expected: `cover.jpg` 600×600, `assets/couple.jpg` max side 1400. Open `cover.jpg` — both faces should be in frame, since this is the ring card.

- [ ] **Step 6: Create a placeholder secret photo so nothing blocks**

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine/chapters/02-birthday/assets
cp couple.jpg secret.jpg
```

This is a stand-in. It MUST be reported to the user as a placeholder at the end — do not let a duplicate couple photo ship as "the secret".

- [ ] **Step 7: Drop the 5MB source photo**

`Pic1.JPG` exists only to cut the faces from, and shipping 5MB to a phone for two 256px heads is waste.

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine/chapters/02-birthday/assets
rm Pic1.JPG Pic2.JPG
ls -la
```

Expected remaining: `couple.jpg`, `face-her.png`, `face-you.png`, `secret.jpg`, `stay-with-me.mp3`.

- [ ] **Step 8: Commit**

```bash
cd /Users/nattapolprayoonsoontorn/workspace/mydoodooduty/my_valentine
git add chapters/02-birthday docs/superpowers/specs/2026-08-10-chapter-02-birthday-design.md docs/superpowers/plans/2026-08-10-chapter-02-birthday.md
git commit -m "feat(ch02): scaffold birthday chapter and prepare assets"
```

---

### Task 1: Rules — constants, physics, hitboxes, collision

**Files:**
- Create: `chapters/02-birthday/game/rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces on `window.Rules` (browser) and `module.exports` (Node):
  - `C` — the constants object, every name from the World constants table above
  - `newPlayer() -> Player` where `Player = {y, vy, onGround, sliding, slideT, stumbleT}`
  - `stepPlayer(p: Player, dt: number, intent: {jump: boolean, slide: boolean}) -> Player` (returns a new object, does not mutate)
  - `playerBox(p: Player) -> Box` where `Box = {x, y, w, h}` (`y` is the top edge)
  - `boxesOverlap(a: Box, b: Box) -> boolean`
  - `jumpObstacleBox(screenX: number) -> Box`
  - `slideObstacleBox(screenX: number) -> Box`
  - `collectibleBox(screenX: number, y: number) -> Box`

- [ ] **Step 1: Write the failing tests**

Create `tests/rules.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../chapters/02-birthday/game/rules.js");
const C = R.C;

function runFrames(p, n, dt, intent) {
  let s = p;
  for (let i = 0; i < n; i++) s = R.stepPlayer(s, dt, intent || { jump: false, slide: false });
  return s;
}

test("a new player stands on the ground, not jumping or sliding", () => {
  const p = R.newPlayer();
  assert.equal(p.y, C.GROUND_Y);
  assert.equal(p.vy, 0);
  assert.equal(p.onGround, true);
  assert.equal(p.sliding, false);
});

test("stepPlayer does not mutate its input", () => {
  const p = R.newPlayer();
  const copy = JSON.parse(JSON.stringify(p));
  R.stepPlayer(p, 1 / 60, { jump: true, slide: false });
  assert.deepEqual(p, copy);
});

test("a jump rises high enough to clear a jump obstacle and lands again", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slide: false });
  assert.equal(p.onGround, false);
  let highest = p.y;
  for (let i = 0; i < 200 && !p.onGround; i++) {
    p = R.stepPlayer(p, 1 / 60, { jump: false, slide: false });
    highest = Math.min(highest, p.y);
  }
  const rise = C.GROUND_Y - highest;
  assert.ok(rise >= C.JUMP_OBS_H + 30, `rise ${rise} must clear a ${C.JUMP_OBS_H}px obstacle with margin`);
  assert.equal(p.onGround, true, "must come back down");
  assert.equal(p.y, C.GROUND_Y);
  assert.equal(p.vy, 0);
});

test("jump airtime is about 0.69s", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slide: false });
  let t = 1 / 60;
  while (!p.onGround && t < 5) { p = R.stepPlayer(p, 1 / 60, { jump: false, slide: false }); t += 1 / 60; }
  assert.ok(Math.abs(t - 0.69) < 0.06, `airtime ${t.toFixed(3)}s should be ~0.69s`);
});

test("holding jump in mid-air does not double-jump", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slide: false });
  const firstVy = p.vy;
  p = R.stepPlayer(p, 1 / 60, { jump: true, slide: false });
  assert.ok(p.vy > firstVy, "vy must be decaying toward the ground, not reset by a held jump");
});

test("sliding lasts SLIDE_DURATION then ends", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slide: true });
  assert.equal(p.sliding, true);
  p = runFrames(p, Math.ceil(C.SLIDE_DURATION * 60) + 2, 1 / 60);
  assert.equal(p.sliding, false);
});

test("a slide cannot start in mid-air", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slide: false });
  p = R.stepPlayer(p, 1 / 60, { jump: false, slide: true });
  assert.equal(p.sliding, false);
});

test("the standing hitbox sits on the ground and is STAND_W by STAND_H", () => {
  const b = R.playerBox(R.newPlayer());
  assert.equal(b.w, C.STAND_W);
  assert.equal(b.h, C.STAND_H);
  assert.equal(b.y + b.h, C.GROUND_Y, "bottom edge must be the ground");
});

test("the sliding hitbox is shorter and wider", () => {
  const p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slide: true });
  const b = R.playerBox(p);
  assert.equal(b.h, C.SLIDE_H);
  assert.equal(b.w, C.SLIDE_W);
  assert.equal(b.y + b.h, C.GROUND_Y);
});

test("boxesOverlap: real overlap, shared edge, and clean miss", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(R.boxesOverlap(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  // touching edges must NOT collide - this is the forgiveness rule
  assert.equal(R.boxesOverlap(a, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(R.boxesOverlap(a, { x: 0, y: 10, w: 10, h: 10 }), false);
  assert.equal(R.boxesOverlap(a, { x: 20, y: 0, w: 10, h: 10 }), false);
});

test("running into a jump obstacle collides; jumping over it does not", () => {
  const obs = R.jumpObstacleBox(C.PLAYER_X);
  assert.equal(R.boxesOverlap(R.playerBox(R.newPlayer()), obs), true, "standing must hit it");

  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slide: false });
  let cleared = false;
  for (let i = 0; i < 200 && !p.onGround; i++) {
    p = R.stepPlayer(p, 1 / 60, { jump: false, slide: false });
    if (!R.boxesOverlap(R.playerBox(p), obs)) cleared = true;
  }
  assert.ok(cleared, "at the top of a jump she must be clear of the obstacle");
});

test("a slide obstacle hits a standing player and misses a sliding one", () => {
  const obs = R.slideObstacleBox(C.PLAYER_X);
  assert.equal(R.boxesOverlap(R.playerBox(R.newPlayer()), obs), true, "standing must hit it");

  const sliding = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slide: true });
  assert.equal(R.boxesOverlap(R.playerBox(sliding), obs), false, "sliding must pass under");
});

test("the sliding player clears a slide obstacle by a forgiving margin", () => {
  const obs = R.slideObstacleBox(C.PLAYER_X);
  const sliding = R.playerBox(R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slide: true }));
  const margin = sliding.y - (obs.y + obs.h);
  assert.ok(margin >= 10, `only ${margin}px of slide clearance - too precise for a gift`);
});

test("a low heart is collected just by running; a high one needs a jump", () => {
  const low = R.collectibleBox(C.PLAYER_X, C.HEART_LOW_Y);
  const high = R.collectibleBox(C.PLAYER_X, C.HEART_HIGH_Y);
  const standing = R.playerBox(R.newPlayer());
  assert.equal(R.boxesOverlap(standing, low), true, "low hearts should be free");
  assert.equal(R.boxesOverlap(standing, high), false, "high hearts must require a jump");

  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slide: false });
  let reached = false;
  for (let i = 0; i < 200 && !p.onGround; i++) {
    p = R.stepPlayer(p, 1 / 60, { jump: false, slide: false });
    if (R.boxesOverlap(R.playerBox(p), high)) reached = true;
  }
  assert.ok(reached, "a jump must be able to reach a high heart");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `Cannot find module '../chapters/02-birthday/game/rules.js'`

- [ ] **Step 3: Write the implementation**

Create `chapters/02-birthday/game/rules.js`:

```js
/*
 * Pure game rules for the birthday chase: constants, physics, hitboxes,
 * collision, curves, hearts and the QTE. No DOM, no canvas, no audio — so Node
 * can require it and the numbers that decide fairness can be tested.
 *
 * Loaded as a classic script in the browser (assigns window.Rules) and required
 * in tests. Same dual tail as shared/ring.js. No build step.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const C = {
    CANVAS_W: 960,
    CANVAS_H: 540,
    GROUND_Y: 430,
    PLAYER_X: 260,
    LEVEL_LENGTH: 39600,

    GRAVITY: 1800,
    JUMP_V: -620,

    STAND_W: 44,
    STAND_H: 72,
    SLIDE_W: 60,
    SLIDE_H: 34,
    SLIDE_DURATION: 0.5,

    JUMP_OBS_W: 46,
    JUMP_OBS_H: 54,
    SLIDE_OBS_W: 52,
    SLIDE_OBS_H: 70,
    SLIDE_GAP: 48,

    COLLECT_R: 18,
    HEART_LOW_Y: 430 - 70,
    HEART_HIGH_Y: 430 - 150,

    STUMBLE_TIME: 0.6,
    STUMBLE_SPEED_MULT: 0.55,
    STUMBLE_GAP_BONUS: 60,

    SPEED_START: 260,
    SPEED_END: 420,
    SPEED_FINAL: 520,
    GAP_START: 380,
    GAP_END: 90,

    FINAL_CHASE_AT: 0.85,
    HEARTS_REQUIRED: 10,
    HEARTS_PLACED: 16,
    GIFT_DISGUISES: 4,
  };

  function newPlayer() {
    return { y: C.GROUND_Y, vy: 0, onGround: true, sliding: false, slideT: 0, stumbleT: 0 };
  }

  function stepPlayer(p, dt, intent) {
    const n = {
      y: p.y, vy: p.vy, onGround: p.onGround,
      sliding: p.sliding, slideT: p.slideT, stumbleT: p.stumbleT,
    };

    // A slide only starts from the ground, and never while already sliding.
    if (intent && intent.slide && n.onGround && !n.sliding) {
      n.sliding = true;
      n.slideT = C.SLIDE_DURATION;
    }

    // Jumping cancels a slide; you cannot jump in the air (no double jump).
    if (intent && intent.jump && n.onGround) {
      n.vy = C.JUMP_V;
      n.onGround = false;
      n.sliding = false;
      n.slideT = 0;
    }

    if (!n.onGround) {
      n.vy += C.GRAVITY * dt;
      n.y += n.vy * dt;
      if (n.y >= C.GROUND_Y) {
        n.y = C.GROUND_Y;
        n.vy = 0;
        n.onGround = true;
      }
    }

    if (n.sliding) {
      n.slideT -= dt;
      if (n.slideT <= 0) { n.sliding = false; n.slideT = 0; }
    }

    if (n.stumbleT > 0) {
      n.stumbleT = Math.max(0, n.stumbleT - dt);
    }

    return n;
  }

  function playerBox(p) {
    const w = p.sliding ? C.SLIDE_W : C.STAND_W;
    const h = p.sliding ? C.SLIDE_H : C.STAND_H;
    return { x: C.PLAYER_X - w / 2, y: p.y - h, w: w, h: h };
  }

  // Strict inequalities: boxes that merely touch do not collide. Deliberate —
  // a pixel-perfect graze should not cost a heart.
  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function jumpObstacleBox(screenX) {
    return {
      x: screenX - C.JUMP_OBS_W / 2,
      y: C.GROUND_Y - C.JUMP_OBS_H,
      w: C.JUMP_OBS_W,
      h: C.JUMP_OBS_H,
    };
  }

  function slideObstacleBox(screenX) {
    const bottom = C.GROUND_Y - C.SLIDE_GAP;
    return {
      x: screenX - C.SLIDE_OBS_W / 2,
      y: bottom - C.SLIDE_OBS_H,
      w: C.SLIDE_OBS_W,
      h: C.SLIDE_OBS_H,
    };
  }

  function collectibleBox(screenX, y) {
    return {
      x: screenX - C.COLLECT_R,
      y: y - C.COLLECT_R,
      w: C.COLLECT_R * 2,
      h: C.COLLECT_R * 2,
    };
  }

  return {
    C: C,
    newPlayer: newPlayer,
    stepPlayer: stepPlayer,
    playerBox: playerBox,
    boxesOverlap: boxesOverlap,
    jumpObstacleBox: jumpObstacleBox,
    slideObstacleBox: slideObstacleBox,
    collectibleBox: collectibleBox,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS. Chapter 01's 25 tests must still pass too.

If "only Npx of slide clearance" fails, `SLIDE_GAP` and `SLIDE_H` are inconsistent — the gap minus the hitbox height must be ≥ 10.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/rules.js tests/rules.test.js
git commit -m "feat(ch02): add pure physics, hitboxes and collision rules"
```

---

### Task 2: Rules — curves, hearts, checkpoints, QTE

**Files:**
- Modify: `chapters/02-birthday/game/rules.js`
- Modify: `tests/rules.test.js`

**Interfaces:**
- Consumes: `C`, from Task 1.
- Produces, added to the same exports object:
  - `speedAt(progress: number) -> number`
  - `gapAt(progress: number) -> number`
  - `effectiveSpeed(progress: number, stumbleT: number) -> number`
  - `collectHeart(n: number) -> number`
  - `heartsAfterTrip(n: number) -> number`
  - `secretUnlocked(n: number) -> boolean`
  - `checkpointsCrossed(prevX: number, x: number, checkpointXs: number[]) -> number[]` (indices)
  - `QTE_SEQUENCE: string[]` — `["jump", "jump", "slide", "jump"]`
  - `newQte() -> {index: number, misses: number, done: boolean}`
  - `qteAdvance(q, action: "jump"|"slide") -> q` (new object)

- [ ] **Step 1: Write the failing tests**

Append to `tests/rules.test.js`:

```js
test("speed ramps from SPEED_START to SPEED_END then jumps for the final chase", () => {
  assert.equal(R.speedAt(0), C.SPEED_START);
  assert.ok(Math.abs(R.speedAt(C.FINAL_CHASE_AT - 0.001) - C.SPEED_END) < 2);
  assert.equal(R.speedAt(C.FINAL_CHASE_AT), C.SPEED_FINAL);
  assert.equal(R.speedAt(1), C.SPEED_FINAL);
});

test("speed never decreases before the final chase", () => {
  let prev = -Infinity;
  for (let p = 0; p < C.FINAL_CHASE_AT; p += 0.01) {
    const s = R.speedAt(p);
    assert.ok(s >= prev, `speed dipped at progress ${p}`);
    prev = s;
  }
});

test("the run lasts about 120 seconds", () => {
  // integrate dx/speed over the level
  let t = 0;
  const stepPx = 20;
  for (let x = 0; x < C.LEVEL_LENGTH; x += stepPx) {
    t += stepPx / R.speedAt(x / C.LEVEL_LENGTH);
  }
  assert.ok(t > 95 && t < 145, `level takes ${t.toFixed(1)}s, should be ~120s`);
});

test("the gap closes from GAP_START to GAP_END and never widens", () => {
  assert.equal(R.gapAt(0), C.GAP_START);
  assert.ok(Math.abs(R.gapAt(C.FINAL_CHASE_AT) - C.GAP_END) < 2);
  let prev = Infinity;
  for (let p = 0; p <= C.FINAL_CHASE_AT; p += 0.01) {
    const g = R.gapAt(p);
    assert.ok(g <= prev + 1e-9, `gap widened at progress ${p}`);
    prev = g;
  }
});

test("stumbling slows her down, and only while the stumble lasts", () => {
  assert.equal(R.effectiveSpeed(0.5, 0), R.speedAt(0.5));
  assert.ok(R.effectiveSpeed(0.5, 0.3) < R.speedAt(0.5));
  assert.equal(R.effectiveSpeed(0.5, 0.3), R.speedAt(0.5) * C.STUMBLE_SPEED_MULT);
});

test("hearts go up on collect, down on a trip, and never below zero", () => {
  assert.equal(R.collectHeart(0), 1);
  assert.equal(R.collectHeart(15), 16);
  assert.equal(R.heartsAfterTrip(5), 4);
  assert.equal(R.heartsAfterTrip(0), 0, "a trip at zero hearts must not go negative");
});

test("the secret unlocks at exactly HEARTS_REQUIRED", () => {
  assert.equal(R.secretUnlocked(C.HEARTS_REQUIRED - 1), false);
  assert.equal(R.secretUnlocked(C.HEARTS_REQUIRED), true);
  assert.equal(R.secretUnlocked(C.HEARTS_REQUIRED + 4), true);
});

test("dodging every gift still leaves enough hearts to survive two trips", () => {
  const withoutGifts = C.HEARTS_PLACED - C.GIFT_DISGUISES;
  assert.ok(
    withoutGifts - 2 >= C.HEARTS_REQUIRED,
    `${withoutGifts} hearts minus two trips must still reach ${C.HEARTS_REQUIRED}`
  );
});

test("checkpoints fire once each, in order, and never twice", () => {
  const cps = [100, 200, 300];
  assert.deepEqual(R.checkpointsCrossed(0, 50, cps), []);
  assert.deepEqual(R.checkpointsCrossed(50, 150, cps), [0]);
  assert.deepEqual(R.checkpointsCrossed(150, 150, cps), []);
  assert.deepEqual(R.checkpointsCrossed(150, 350, cps), [1, 2], "a big frame may cross two at once");
  assert.deepEqual(R.checkpointsCrossed(350, 400, cps), []);
});

test("the QTE sequence is JUMP JUMP SLIDE JUMP", () => {
  assert.deepEqual(R.QTE_SEQUENCE, ["jump", "jump", "slide", "jump"]);
});

test("correct QTE inputs advance and finish the sequence", () => {
  let q = R.newQte();
  assert.equal(q.done, false);
  for (const action of R.QTE_SEQUENCE) q = R.qteAdvance(q, action);
  assert.equal(q.done, true);
  assert.equal(q.misses, 0);
});

test("a wrong QTE input re-prompts instead of failing or advancing", () => {
  let q = R.newQte();
  q = R.qteAdvance(q, "slide");           // sequence wants jump
  assert.equal(q.index, 0, "must not advance");
  assert.equal(q.misses, 1, "must record the miss");
  assert.equal(q.done, false, "there is no fail state");
  q = R.qteAdvance(q, "jump");
  assert.equal(q.index, 1, "the right input still works after a miss");
});

test("qteAdvance does not mutate and ignores input once done", () => {
  let q = R.newQte();
  const snapshot = JSON.parse(JSON.stringify(q));
  R.qteAdvance(q, "jump");
  assert.deepEqual(q, snapshot);

  for (const action of R.QTE_SEQUENCE) q = R.qteAdvance(q, action);
  const after = R.qteAdvance(q, "slide");
  assert.equal(after.index, R.QTE_SEQUENCE.length);
  assert.equal(after.misses, 0, "a stray input after the catch must not count");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `R.speedAt is not a function`

- [ ] **Step 3: Write the implementation**

In `chapters/02-birthday/game/rules.js`, insert before the `return {` block:

```js
  const QTE_SEQUENCE = ["jump", "jump", "slide", "jump"];

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function speedAt(progress) {
    if (progress >= C.FINAL_CHASE_AT) return C.SPEED_FINAL;
    const t = Math.max(0, progress) / C.FINAL_CHASE_AT;
    return lerp(C.SPEED_START, C.SPEED_END, t);
  }

  function gapAt(progress) {
    if (progress >= C.FINAL_CHASE_AT) return C.GAP_END;
    const t = Math.max(0, progress) / C.FINAL_CHASE_AT;
    return lerp(C.GAP_START, C.GAP_END, t);
  }

  function effectiveSpeed(progress, stumbleT) {
    const base = speedAt(progress);
    return stumbleT > 0 ? base * C.STUMBLE_SPEED_MULT : base;
  }

  function collectHeart(n) {
    return n + 1;
  }

  function heartsAfterTrip(n) {
    return Math.max(0, n - 1);
  }

  function secretUnlocked(n) {
    return n >= C.HEARTS_REQUIRED;
  }

  // Half-open interval (prevX, x] so a checkpoint fires exactly once even if a
  // long frame skips past several of them.
  function checkpointsCrossed(prevX, x, checkpointXs) {
    const out = [];
    for (let i = 0; i < checkpointXs.length; i++) {
      const cx = checkpointXs[i];
      if (prevX < cx && cx <= x) out.push(i);
    }
    return out;
  }

  function newQte() {
    return { index: 0, misses: 0, done: false };
  }

  function qteAdvance(q, action) {
    if (q.done) return { index: q.index, misses: q.misses, done: true };
    if (action === QTE_SEQUENCE[q.index]) {
      const index = q.index + 1;
      return { index: index, misses: q.misses, done: index >= QTE_SEQUENCE.length };
    }
    return { index: q.index, misses: q.misses + 1, done: false };
  }
```

And extend the returned object with:

```js
    speedAt: speedAt,
    gapAt: gapAt,
    effectiveSpeed: effectiveSpeed,
    collectHeart: collectHeart,
    heartsAfterTrip: heartsAfterTrip,
    secretUnlocked: secretUnlocked,
    checkpointsCrossed: checkpointsCrossed,
    QTE_SEQUENCE: QTE_SEQUENCE,
    newQte: newQte,
    qteAdvance: qteAdvance,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS.

If "the run lasts about 120 seconds" fails, adjust `LEVEL_LENGTH` — not the speed curve, which the feel depends on.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/rules.js tests/rules.test.js
git commit -m "feat(ch02): add speed and gap curves, heart accounting, checkpoints and QTE"
```

---

### Task 3: Level generation

**Files:**
- Create: `chapters/02-birthday/game/level.js`
- Test: `tests/level.test.js`

**Interfaces:**
- Consumes: `window.Rules` / `require("./rules.js")` — `C`, `speedAt`.
- Produces on `window.Level` / `module.exports`:
  - `buildLevel() -> {entities: Entity[], checkpointXs: number[]}` — deterministic, same output every call
  - `Entity = {x: number, kind: "jump"|"slide"|"heart"|"gift", y?: number}` (`y` only on `heart`)
  - `entitiesInWindow(entities: Entity[], x0: number, x1: number) -> Entity[]`
  - `minSpacingAt(progress: number) -> number` — the closest two obstacles may be and still be clearable

- [ ] **Step 1: Write the failing tests**

Create `tests/level.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../chapters/02-birthday/game/rules.js");
const L = require("../chapters/02-birthday/game/level.js");
const C = R.C;

const level = L.buildLevel();
const obstacles = level.entities.filter((e) => e.kind === "jump" || e.kind === "slide");
const collectibles = level.entities.filter((e) => e.kind === "heart" || e.kind === "gift");

test("buildLevel is deterministic", () => {
  assert.deepEqual(L.buildLevel(), L.buildLevel());
});

test("entities are sorted by x and inside the level", () => {
  for (let i = 1; i < level.entities.length; i++) {
    assert.ok(level.entities[i].x >= level.entities[i - 1].x, `unsorted at index ${i}`);
  }
  for (const e of level.entities) {
    assert.ok(e.x > 0 && e.x < C.LEVEL_LENGTH, `entity outside the level at ${e.x}`);
  }
});

test("the level places exactly HEARTS_PLACED collectibles, GIFT_DISGUISES of them gifts", () => {
  assert.equal(collectibles.length, C.HEARTS_PLACED);
  assert.equal(collectibles.filter((e) => e.kind === "gift").length, C.GIFT_DISGUISES);
  assert.equal(collectibles.filter((e) => e.kind === "heart").length, C.HEARTS_PLACED - C.GIFT_DISGUISES);
});

test("hearts sit at one of the two documented heights", () => {
  for (const h of collectibles.filter((e) => e.kind === "heart")) {
    assert.ok(
      h.y === C.HEART_LOW_Y || h.y === C.HEART_HIGH_Y,
      `heart at unexpected height ${h.y}`
    );
  }
});

test("some hearts require a jump and some do not", () => {
  const hearts = collectibles.filter((e) => e.kind === "heart");
  assert.ok(hearts.some((h) => h.y === C.HEART_HIGH_Y), "no hearts require skill");
  assert.ok(hearts.some((h) => h.y === C.HEART_LOW_Y), "no hearts are free");
});

test("both obstacle kinds appear", () => {
  assert.ok(obstacles.some((o) => o.kind === "jump"));
  assert.ok(obstacles.some((o) => o.kind === "slide"));
});

test("THE LEVEL IS POSSIBLE: no two obstacles are closer than a jump can recover", () => {
  for (let i = 1; i < obstacles.length; i++) {
    const gap = obstacles[i].x - obstacles[i - 1].x;
    const need = L.minSpacingAt(obstacles[i].x / C.LEVEL_LENGTH);
    assert.ok(gap >= need, `obstacles ${i - 1}->${i} are ${gap.toFixed(0)}px apart, need ${need.toFixed(0)}px`);
  }
});

test("minSpacingAt grows with speed, because a fast jump travels further", () => {
  assert.ok(L.minSpacingAt(0.8) > L.minSpacingAt(0.1));
});

test("no obstacle sits on top of a collectible", () => {
  for (const c of collectibles) {
    for (const o of obstacles) {
      assert.ok(
        Math.abs(c.x - o.x) > C.JUMP_OBS_W,
        `collectible at ${c.x} overlaps obstacle at ${o.x}`
      );
    }
  }
});

test("the first obstacle gives her room to get going", () => {
  assert.ok(obstacles[0].x >= 900, `first obstacle at ${obstacles[0].x} is too soon`);
});

test("nothing is placed inside the final chase, which is scripted", () => {
  const finalX = C.FINAL_CHASE_AT * C.LEVEL_LENGTH;
  for (const e of level.entities) {
    assert.ok(e.x < finalX, `entity at ${e.x} intrudes on the final chase`);
  }
});

test("checkpoints are at 20/40/60/80 percent", () => {
  assert.deepEqual(
    level.checkpointXs.map((x) => Math.round((x / C.LEVEL_LENGTH) * 100)),
    [20, 40, 60, 80]
  );
});

test("entitiesInWindow returns only what is inside the window", () => {
  const es = [{ x: 10, kind: "jump" }, { x: 200, kind: "slide" }, { x: 5000, kind: "jump" }];
  assert.deepEqual(L.entitiesInWindow(es, 0, 300).map((e) => e.x), [10, 200]);
  assert.deepEqual(L.entitiesInWindow(es, 300, 6000).map((e) => e.x), [5000]);
  assert.deepEqual(L.entitiesInWindow(es, 6000, 7000), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `Cannot find module '../chapters/02-birthday/game/level.js'`

- [ ] **Step 3: Write the implementation**

Create `chapters/02-birthday/game/level.js`:

```js
/*
 * The level: a deterministic list of obstacles and collectibles, plus the
 * checkpoint positions.
 *
 * Deterministic on purpose. A seeded generator means the level is identical on
 * every run, so "is this level actually possible" is a unit test instead of a
 * thing you find out by replaying two minutes.
 */
(function (root, factory) {
  const Rules = typeof module !== "undefined" && module.exports
    ? require("./rules.js")
    : root.Rules;
  const api = factory(Rules);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Level = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Rules) {
  "use strict";

  const C = Rules.C;

  // Airtime of a full jump, from the same constants the physics uses.
  const AIRTIME = (2 * -C.JUMP_V) / C.GRAVITY;

  /*
   * The closest two obstacles may be. She has to land and be ready again, so:
   * the distance travelled during a jump, plus a reaction buffer. Faster later
   * in the level means a jump covers more ground, so the floor rises with speed.
   */
  function minSpacingAt(progress) {
    return Rules.speedAt(progress) * AIRTIME + 150;
  }

  // Tiny LCG. Deterministic, no dependency, and Math.random is unusable here
  // because the level must be identical every run for the tests to mean anything.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildLevel() {
    const rand = rng(20260810);
    const finalX = C.FINAL_CHASE_AT * C.LEVEL_LENGTH;
    const entities = [];

    // --- obstacles ---------------------------------------------------------
    const obstacleXs = [];
    let x = 950;
    while (true) {
      const progress = x / C.LEVEL_LENGTH;
      const spacing = minSpacingAt(progress) * (1.12 + rand() * 0.5);
      const next = x + spacing;
      if (next >= finalX - 400) break;
      obstacleXs.push(next);
      x = next;
    }
    for (let i = 0; i < obstacleXs.length; i++) {
      // Alternate-ish so neither kind clusters, but not strictly predictable.
      const kind = rand() < 0.55 ? "jump" : "slide";
      entities.push({ x: obstacleXs[i], kind: kind });
    }

    // --- collectibles ------------------------------------------------------
    /*
     * Placed at the midpoint between consecutive obstacles, which guarantees
     * they never overlap one. Spread evenly across the whole run so hearts are
     * not all clumped at the start.
     */
    const midpoints = [];
    for (let i = 1; i < obstacleXs.length; i++) {
      midpoints.push((obstacleXs[i - 1] + obstacleXs[i]) / 2);
    }

    const total = C.HEARTS_PLACED;
    const chosen = [];
    for (let i = 0; i < total; i++) {
      const idx = Math.floor(((i + 0.5) / total) * midpoints.length);
      chosen.push(midpoints[Math.min(idx, midpoints.length - 1)]);
    }

    /*
     * Gifts are spaced out among the collectibles rather than adjacent, so the
     * disguise gets discovered gradually instead of all at once.
     */
    const giftEvery = Math.floor(total / C.GIFT_DISGUISES);
    let gifts = 0;
    for (let i = 0; i < chosen.length; i++) {
      const makeGift = gifts < C.GIFT_DISGUISES && i % giftEvery === Math.floor(giftEvery / 2);
      if (makeGift) {
        gifts++;
        entities.push({ x: chosen[i], kind: "gift" });
      } else {
        entities.push({
          x: chosen[i],
          kind: "heart",
          y: rand() < 0.45 ? C.HEART_HIGH_Y : C.HEART_LOW_Y,
        });
      }
    }

    entities.sort(function (a, b) { return a.x - b.x; });

    return {
      entities: entities,
      checkpointXs: [0.2, 0.4, 0.6, 0.8].map(function (p) { return p * C.LEVEL_LENGTH; }),
    };
  }

  function entitiesInWindow(entities, x0, x1) {
    return entities.filter(function (e) { return e.x >= x0 && e.x <= x1; });
  }

  return {
    buildLevel: buildLevel,
    entitiesInWindow: entitiesInWindow,
    minSpacingAt: minSpacingAt,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS.

Two failures are likely and each has a specific fix:

- *"places exactly 16 collectibles"* — `midpoints` is shorter than 16, meaning too few obstacles. Lower the `1.12 + rand()*0.5` spacing multiplier.
- *"no obstacle sits on top of a collectible"* — a midpoint landed within `JUMP_OBS_W` of an obstacle, which happens when two obstacles are unusually close. Widen the minimum spacing multiplier.
- *"exactly 4 gifts"* — `giftEvery` arithmetic did not produce four hits; log `chosen.length` and `giftEvery` and adjust the modulo offset.

- [ ] **Step 5: Print the level for a human sanity check**

```bash
node -e '
const R = require("./chapters/02-birthday/game/rules.js");
const L = require("./chapters/02-birthday/game/level.js");
const lv = L.buildLevel();
const o = lv.entities.filter(e => e.kind==="jump"||e.kind==="slide");
const c = lv.entities.filter(e => e.kind==="heart"||e.kind==="gift");
console.log("obstacles:", o.length, "| collectibles:", c.length,
            "| gifts:", c.filter(e=>e.kind==="gift").length);
console.log("high hearts:", c.filter(e=>e.y===R.C.HEART_HIGH_Y).length,
            "| low hearts:", c.filter(e=>e.y===R.C.HEART_LOW_Y).length);
let t=0; for (let x=0;x<R.C.LEVEL_LENGTH;x+=20) t+=20/R.speedAt(x/R.C.LEVEL_LENGTH);
console.log("run time:", t.toFixed(1)+"s");
'
```

Expected: roughly 40–70 obstacles, exactly 16 collectibles, 4 gifts, a mix of heart heights, ~120s. If obstacles are under 25 the run will feel empty — tighten the spacing multiplier and re-run the tests.

- [ ] **Step 6: Commit**

```bash
git add chapters/02-birthday/game/level.js tests/level.test.js
git commit -m "feat(ch02): add deterministic level generation with a possibility test"
```

---

### Task 4: Shell, loop, and a running player

**Files:**
- Create: `chapters/02-birthday/index.html`
- Create: `chapters/02-birthday/game/input.js`
- Create: `chapters/02-birthday/game/render.js`
- Create: `chapters/02-birthday/game/main.js`

**Interfaces:**
- Consumes: `window.Rules`, `window.Level`.
- Produces:
  - `window.Input = {intent: {jump, slide}, consume() -> {jump, slide}, attach(canvasEl)}` — `consume()` returns the pending intent and clears it, so one keypress is one action
  - `window.Render = {resize(canvasEl), drawWorld(ctx, state), drawHud(ctx, state)}`
  - `window.Game = {state}` for debugging
  - `state` shape: `{scene, worldX, prevWorldX, player, hearts, entities, checkpointXs, hitIds: Set, collectedIds: Set, shake, qte, taunt}`

Deliverable: grey boxes, but she runs, jumps and slides against a scrolling ground.

- [ ] **Step 1: Create the shell**

Create `chapters/02-birthday/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Catch Me If You Can</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b1020; overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #fff;
      -webkit-user-select: none; user-select: none; }
    #wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
    canvas { display: block; background: #0b1020; touch-action: none; }

    .chapter-back { position: fixed; top: 12px; left: 12px; z-index: 60; padding: 7px 13px;
      border-radius: 999px; background: rgba(0,0,0,.5); color: #fff; text-decoration: none;
      font: 500 11px/1 ui-sans-serif, system-ui; letter-spacing: .1em; text-transform: uppercase;
      border: 1px solid rgba(255,255,255,.25); }

    /* Touch controls: only on devices that actually need them. */
    #touch { position: fixed; bottom: 0; left: 0; right: 0; height: 132px; display: none;
      z-index: 50; pointer-events: none; }
    @media (pointer: coarse) { #touch { display: flex; } }
    #touch button { pointer-events: auto; flex: 1; margin: 12px; border: 0; border-radius: 20px;
      background: rgba(255,255,255,.14); color: #fff; font: 800 20px/1 ui-sans-serif, system-ui;
      letter-spacing: .12em; backdrop-filter: blur(6px); }
    #touch button:active { background: rgba(255,255,255,.3); }
  </style>
</head>
<body>
  <a class="chapter-back" href="../../index.html?from=02-birthday">&#8592; chapters</a>

  <div id="wrap"><canvas id="game"></canvas></div>

  <div id="touch">
    <button id="btnJump" aria-label="jump">JUMP</button>
    <button id="btnSlide" aria-label="slide">SLIDE</button>
  </div>

  <script src="game/rules.js"></script>
  <script src="game/level.js"></script>
  <script src="game/input.js"></script>
  <script src="game/render.js"></script>
  <script src="game/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create input handling**

Create `chapters/02-birthday/game/input.js`:

```js
/*
 * Input: keyboard, on-screen buttons, and vertical swipes, all reduced to two
 * one-shot intents.
 *
 * One-shot matters. If `jump` stayed true while the key was held, holding Up
 * would re-trigger on every frame; the physics blocks double jumps but the QTE
 * would eat several prompts from one press.
 */
(function (root) {
  "use strict";

  const pending = { jump: false, slide: false };

  function press(action) {
    if (action === "jump") pending.jump = true;
    if (action === "slide") pending.slide = true;
  }

  function consume() {
    const out = { jump: pending.jump, slide: pending.slide };
    pending.jump = false;
    pending.slide = false;
    return out;
  }

  function attach(canvasEl) {
    document.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") { press("jump"); e.preventDefault(); }
      else if (k === "ArrowDown" || k === "s" || k === "S") { press("slide"); e.preventDefault(); }
    });

    const jumpBtn = document.getElementById("btnJump");
    const slideBtn = document.getElementById("btnSlide");
    if (jumpBtn) jumpBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); press("jump"); });
    if (slideBtn) slideBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); press("slide"); });

    // Swipe anywhere on the canvas, for players who ignore the buttons.
    let startY = null;
    canvasEl.addEventListener("pointerdown", function (e) { startY = e.clientY; });
    canvasEl.addEventListener("pointerup", function (e) {
      if (startY === null) return;
      const dy = e.clientY - startY;
      if (dy < -28) press("jump");
      else if (dy > 28) press("slide");
      startY = null;
    });
  }

  root.Input = { press: press, consume: consume, attach: attach, pending: pending };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 3: Create the renderer**

Create `chapters/02-birthday/game/render.js`:

```js
/*
 * Canvas drawing. Takes state, draws pixels, decides nothing. Every gameplay
 * number comes from Rules.
 */
(function (root) {
  "use strict";

  const C = root.Rules.C;
  let scale = 1;

  function resize(canvasEl) {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(window.innerWidth / C.CANVAS_W, window.innerHeight / C.CANVAS_H);
    scale = fit;
    canvasEl.style.width = C.CANVAS_W * fit + "px";
    canvasEl.style.height = C.CANVAS_H * fit + "px";
    canvasEl.width = Math.round(C.CANVAS_W * fit * dpr);
    canvasEl.height = Math.round(C.CANVAS_H * fit * dpr);
    const ctx = canvasEl.getContext("2d");
    ctx.setTransform(fit * dpr, 0, 0, fit * dpr, 0, 0);
    return ctx;
  }

  function background(ctx, worldX) {
    const g = ctx.createLinearGradient(0, 0, 0, C.CANVAS_H);
    g.addColorStop(0, "#101736");
    g.addColorStop(1, "#1d2a54");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // Two parallax layers, slowest at the back.
    ctx.fillStyle = "rgba(255,255,255,.05)";
    for (let i = 0; i < 14; i++) {
      const hx = ((i * 260 - worldX * 0.15) % (C.CANVAS_W + 300) + C.CANVAS_W + 300) % (C.CANVAS_W + 300) - 150;
      ctx.beginPath();
      ctx.moveTo(hx - 150, C.GROUND_Y);
      ctx.lineTo(hx, C.GROUND_Y - 120 - (i % 3) * 34);
      ctx.lineTo(hx + 150, C.GROUND_Y);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,.09)";
    for (let i = 0; i < 20; i++) {
      const bx = ((i * 170 - worldX * 0.4) % (C.CANVAS_W + 200) + C.CANVAS_W + 200) % (C.CANVAS_W + 200) - 100;
      ctx.fillRect(bx, C.GROUND_Y - 60 - (i % 4) * 20, 46, 60 + (i % 4) * 20);
    }
  }

  function ground(ctx, worldX) {
    ctx.fillStyle = "#0a0f22";
    ctx.fillRect(0, C.GROUND_Y, C.CANVAS_W, C.CANVAS_H - C.GROUND_Y);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, C.GROUND_Y);
    ctx.lineTo(C.CANVAS_W, C.GROUND_Y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const tx = ((i * 80 - worldX) % (C.CANVAS_W + 80) + C.CANVAS_W + 80) % (C.CANVAS_W + 80) - 40;
      ctx.beginPath();
      ctx.moveTo(tx, C.GROUND_Y + 14);
      ctx.lineTo(tx + 40, C.GROUND_Y + 14);
      ctx.stroke();
    }
  }

  // Placeholder body. Task 7 replaces this with faces and limbs.
  function blockBody(ctx, box, colour) {
    ctx.fillStyle = colour;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }

  function drawWorld(ctx, state) {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    background(ctx, state.worldX);
    ground(ctx, state.worldX);
    blockBody(ctx, root.Rules.playerBox(state.player), "#ffd0e0");
    ctx.restore();
  }

  function drawHud(ctx, state) {
    ctx.fillStyle = "#fff";
    ctx.font = "700 18px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("progress " + Math.round((state.worldX / C.LEVEL_LENGTH) * 100) + "%", 16, 30);
  }

  root.Render = { resize: resize, drawWorld: drawWorld, drawHud: drawHud, blockBody: blockBody };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Create the loop**

Create `chapters/02-birthday/game/main.js`:

```js
/*
 * Boot and the main loop.
 *
 * Fixed timestep: physics runs in constant 1/120s steps regardless of frame
 * rate, so a 144Hz laptop and a throttled phone produce the same jump arc.
 * Without this, jump height would depend on the display.
 */
(function (root) {
  "use strict";

  const R = root.Rules;
  const C = R.C;
  const STEP = 1 / 120;
  const MAX_FRAME = 0.25;   // after a tab-switch, never simulate more than this

  const canvasEl = document.getElementById("game");
  let ctx = root.Render.resize(canvasEl);
  window.addEventListener("resize", function () { ctx = root.Render.resize(canvasEl); });
  root.Input.attach(canvasEl);

  const built = root.Level.buildLevel();

  const state = {
    scene: "run",
    worldX: 0,
    prevWorldX: 0,
    player: R.newPlayer(),
    hearts: 0,
    entities: built.entities,
    checkpointXs: built.checkpointXs,
    hitIds: new Set(),
    collectedIds: new Set(),
    shake: 0,
    qte: R.newQte(),
    taunt: null,
  };

  let acc = 0;
  let last = 0;

  function update(dt, intent) {
    const progress = state.worldX / C.LEVEL_LENGTH;
    state.player = R.stepPlayer(state.player, dt, intent);
    state.prevWorldX = state.worldX;
    state.worldX += R.effectiveSpeed(progress, state.player.stumbleT) * dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
  }

  function frame(now) {
    if (!last) last = now;
    let elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    acc += elapsed;

    // Input is consumed once per frame and applied to the first physics step,
    // so one press is exactly one action.
    let intent = root.Input.consume();
    while (acc >= STEP) {
      update(STEP, intent);
      intent = { jump: false, slide: false };
      acc -= STEP;
    }

    root.Render.drawWorld(ctx, state);
    root.Render.drawHud(ctx, state);
    window.requestAnimationFrame(frame);
  }

  root.Game = { state: state };
  window.requestAnimationFrame(frame);
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 5: Verify in a browser**

Open `chapters/02-birthday/index.html` by double-click. Confirm:

1. The scene renders: gradient sky, parallax hills and buildings scrolling right-to-left, a ground line, a pink block for her.
2. `↑` / `W` / `Space` makes the block jump in an arc and land.
3. `↓` / `S` squashes it briefly (the slide hitbox).
4. Holding `↑` does **not** produce repeated jumps.
5. The progress readout climbs.
6. No console errors.
7. The back link goes to the hub.

- [ ] **Step 6: Confirm the fixed timestep actually works**

In DevTools, throttle CPU (Performance → CPU 4× slowdown) and jump. The arc must look the same height as unthrottled — slower, but the same shape. If the jump gets shorter under load, the accumulator is wrong.

- [ ] **Step 7: Honour prefers-reduced-motion as far as a runner can**

A scrolling game cannot be motion-free, but the decorative motion can go. Add near the top of `render.js`:

```js
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
```

In `background()`, skip both parallax layers when it matches — the world still scrolls, but nothing extra moves behind it:

```js
  function background(ctx, worldX) {
    const g = ctx.createLinearGradient(0, 0, 0, C.CANVAS_H);
    g.addColorStop(0, "#101736");
    g.addColorStop(1, "#1d2a54");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    if (reducedMotion.matches) return;
    // ...existing hill and building loops unchanged...
  }
```

And in `drawWorld`, suppress screen shake:

```js
    if (state.shake > 0 && !reducedMotion.matches) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
```

Verify: enable macOS **Accessibility → Display → Reduce motion**, reload, and confirm the background is a flat gradient and a trip no longer shakes the screen — but the game still plays. Turn it back off.

This is a partial accommodation, and the spec says so. With no skip link, someone who genuinely cannot tolerate the scrolling cannot reach the letter. That is a knowing trade-off, not an oversight.

- [ ] **Step 8: Commit**

```bash
git add chapters/02-birthday/index.html chapters/02-birthday/game/input.js chapters/02-birthday/game/render.js chapters/02-birthday/game/main.js
git commit -m "feat(ch02): add canvas shell, fixed-timestep loop, and a running player"
```

---

### Task 5: Obstacles, collectibles, tripping, HUD

**Files:**
- Modify: `chapters/02-birthday/game/render.js`
- Modify: `chapters/02-birthday/game/main.js`

**Interfaces:**
- Consumes: `Rules.jumpObstacleBox`, `slideObstacleBox`, `collectibleBox`, `boxesOverlap`, `heartsAfterTrip`, `collectHeart`; `Level.entitiesInWindow`.
- Produces: `state.hearts` maintained; `state.hitIds` / `state.collectedIds` prevent double-counting; `Render.drawEntities(ctx, state)`.

- [ ] **Step 1: Add entity drawing to render.js**

Add to `chapters/02-birthday/game/render.js`, before the `root.Render =` line:

```js
  const JUMP_EMOJI = ["\u{1F4E6}", "\u{1F431}", "☕", "\u{1F9F8}"];   // box, cat, coffee, toy
  const SLIDE_EMOJI = ["\u{1F388}", "\u{1F3F7}", "\u{1F33F}"];           // balloon, banner, branch

  function emojiFor(entity) {
    // Stable per-entity choice: same obstacle always looks the same.
    const i = Math.abs(Math.round(entity.x)) % 997;
    if (entity.kind === "jump") return JUMP_EMOJI[i % JUMP_EMOJI.length];
    if (entity.kind === "slide") return SLIDE_EMOJI[i % SLIDE_EMOJI.length];
    return entity.kind === "gift" ? "\u{1F381}" : "❤️";
  }

  function screenXFor(entity, worldX) {
    return entity.x - worldX + C.PLAYER_X;
  }

  function drawEntities(ctx, state) {
    const from = state.worldX - C.PLAYER_X - 80;
    const to = state.worldX + C.CANVAS_W;
    const visible = root.Level.entitiesInWindow(state.entities, from, to);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const e of visible) {
      const sx = screenXFor(e, state.worldX);
      const id = e.x;

      if (e.kind === "jump" || e.kind === "gift") {
        const box = root.Rules.jumpObstacleBox(sx);
        if (e.kind === "gift" && state.collectedIds.has(id)) continue;
        ctx.font = "44px system-ui";
        ctx.fillText(emojiFor(e), sx, box.y + box.h / 2);
      } else if (e.kind === "slide") {
        const box = root.Rules.slideObstacleBox(sx);
        // A line from the ceiling makes it read as hanging, not floating.
        ctx.strokeStyle = "rgba(255,255,255,.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, box.y + 10);
        ctx.stroke();
        ctx.font = "52px system-ui";
        ctx.fillText(emojiFor(e), sx, box.y + box.h / 2);
      } else {
        if (state.collectedIds.has(id)) continue;
        ctx.font = "30px system-ui";
        ctx.fillText(emojiFor(e), sx, e.y);
      }
    }
  }
```

Then extend the exports to `{ resize, drawWorld, drawEntities, drawHud, blockBody }`, and call `drawEntities` from inside `drawWorld` — after `ground(...)`, before the player, so she draws in front:

```js
    background(ctx, state.worldX);
    ground(ctx, state.worldX);
    drawEntities(ctx, state);
    blockBody(ctx, root.Rules.playerBox(state.player), "#ffd0e0");
```

- [ ] **Step 2: Replace drawHud with the real HUD**

Replace the whole `drawHud` function in `render.js`:

```js
  function drawHud(ctx, state) {
    // Hearts, top left. Flashes red briefly after a trip so a lost heart is
    // legible rather than mysterious.
    const flashing = state.heartFlash > 0;
    ctx.font = "700 20px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = flashing ? "#ff5470" : "#fff";
    ctx.fillText("❤️ " + state.hearts + "/" + C.HEARTS_REQUIRED, 18, 34);

    // Thin progress bar, top centre. Tells her the run is finite.
    const barW = 260;
    const barX = (C.CANVAS_W - barW) / 2;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(barX, 22, barW, 6);
    ctx.fillStyle = "#ffd0e0";
    const p = Math.max(0, Math.min(1, state.worldX / C.LEVEL_LENGTH));
    ctx.fillRect(barX, 22, barW * p, 6);

    if (state.taunt) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "800 34px ui-sans-serif, system-ui";
      ctx.fillText(state.taunt, C.CANVAS_W / 2, 130);
    }
  }
```

- [ ] **Step 3: Wire collision, collection and tripping into main.js**

Add `heartFlash: 0` to the `state` object, then replace `update` in `main.js`:

```js
  function trip() {
    state.hearts = R.heartsAfterTrip(state.hearts);
    state.player = Object.assign({}, state.player, { stumbleT: C.STUMBLE_TIME });
    state.gapBonus += C.STUMBLE_GAP_BONUS;
    state.shake = 14;
    state.heartFlash = 0.6;
  }

  function resolveEntities() {
    const pbox = R.playerBox(state.player);
    const from = state.worldX - C.PLAYER_X - 80;
    const to = state.worldX + C.CANVAS_W;

    for (const e of root.Level.entitiesInWindow(state.entities, from, to)) {
      const sx = e.x - state.worldX + C.PLAYER_X;
      const id = e.x;

      if (e.kind === "jump" || e.kind === "slide") {
        if (state.hitIds.has(id)) continue;
        // Invulnerable while stumbling, so one obstacle cannot cost two hearts.
        if (state.player.stumbleT > 0) continue;
        const obox = e.kind === "jump" ? R.jumpObstacleBox(sx) : R.slideObstacleBox(sx);
        if (R.boxesOverlap(pbox, obox)) {
          state.hitIds.add(id);
          trip();
        }
      } else {
        if (state.collectedIds.has(id)) continue;
        const cbox = e.kind === "gift"
          ? R.jumpObstacleBox(sx)                      // gifts sit where a jump obstacle would
          : R.collectibleBox(sx, e.y);
        if (R.boxesOverlap(pbox, cbox)) {
          state.collectedIds.add(id);
          state.hearts = R.collectHeart(state.hearts);
        }
      }
    }
  }

  function update(dt, intent) {
    const progress = state.worldX / C.LEVEL_LENGTH;
    state.player = R.stepPlayer(state.player, dt, intent);
    state.prevWorldX = state.worldX;
    state.worldX += R.effectiveSpeed(progress, state.player.stumbleT) * dt;
    resolveEntities();
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
    if (state.heartFlash > 0) state.heartFlash = Math.max(0, state.heartFlash - dt);
  }
```

Also add `gapBonus: 0` to `state` — Task 6 uses it, and `trip()` writes it now.

- [ ] **Step 4: Verify in a browser**

Open the chapter. Confirm:

1. Emoji obstacles scroll in: 📦 🐱 ☕ 🧸 on the ground, 🎈 🏷 🌿 hanging with a line to the ceiling.
2. Running into a ground obstacle shakes the screen and the heart counter flashes red.
3. Jumping over ground obstacles and sliding under hanging ones avoids the trip entirely.
4. ❤️ collectibles vanish when touched and the count rises. Some need a jump.
5. 🎁 items look like obstacles but **add** a heart when you run into them.
6. A trip never drops hearts below `0/10`.
7. One obstacle costs exactly **one** heart, never two.

Point 7 is the one to actually test: walk into an obstacle and watch the counter change by exactly 1.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/render.js chapters/02-birthday/game/main.js
git commit -m "feat(ch02): add obstacles, collectibles, tripping and the HUD"
```

---

### Task 6: The thief, the closing gap, checkpoints and taunts

**Files:**
- Modify: `chapters/02-birthday/game/render.js`
- Modify: `chapters/02-birthday/game/main.js`

**Interfaces:**
- Consumes: `Rules.gapAt`, `Rules.checkpointsCrossed`; `state.gapBonus` from Task 5.
- Produces: `state.thiefScreenX` (number), `state.taunt` (string|null), `Render.drawThief(ctx, state)`.

- [ ] **Step 1: Add the taunt lines and gap tracking to main.js**

Add near the top of the IIFE in `main.js`:

```js
  const TAUNTS = [
    "Too slow \u{1F60C}",
    "Getting closer \u{1F440}",
    "Okay... you're actually fast.",
    "WAIT— \u{1F62D}",
  ];
  const TAUNT_TIME = 2.2;
```

Add to `state`: `thiefScreenX: C.PLAYER_X + C.GAP_START`, `tauntT: 0`.

Then add to `update`, after the `worldX` advance:

```js
    // The thief's lead shrinks with progress, and a stumble hands some back.
    // gapBonus decays so a trip costs ground temporarily, not permanently.
    const targetGap = R.gapAt(state.worldX / C.LEVEL_LENGTH) + state.gapBonus;
    state.thiefScreenX = C.PLAYER_X + targetGap;
    if (state.gapBonus > 0) state.gapBonus = Math.max(0, state.gapBonus - dt * 22);

    for (const i of R.checkpointsCrossed(state.prevWorldX, state.worldX, state.checkpointXs)) {
      state.taunt = TAUNTS[i];
      state.tauntT = TAUNT_TIME;
    }
    if (state.tauntT > 0) {
      state.tauntT -= dt;
      if (state.tauntT <= 0) state.taunt = null;
    }
```

- [ ] **Step 2: Draw the thief**

Add to `render.js` before the exports:

```js
  function drawThief(ctx, state) {
    // Placeholder block; Task 7 gives him a face and legs.
    const box = {
      x: state.thiefScreenX - C.STAND_W / 2,
      y: C.GROUND_Y - C.STAND_H,
      w: C.STAND_W,
      h: C.STAND_H,
    };
    blockBody(ctx, box, "#bfe3ff");

    // The present he is running away with.
    ctx.font = "26px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u{1F381}", box.x + box.w + 6, box.y + 28);
  }
```

Call it from `drawWorld`, after `drawEntities` and before the player, and add `drawThief` to the exports.

- [ ] **Step 3: Verify in a browser**

1. A blue block runs ahead of her carrying 🎁, and visibly gets closer over the run.
2. At roughly 20/40/60/80% a taunt appears for about two seconds, in the right order: `Too slow 😌`, `Getting closer 👀`, `Okay... you're actually fast.`, `WAIT— 😭`.
3. Each taunt fires exactly once — no flicker, no repeat.
4. Tripping visibly pushes him further ahead, and the distance recovers over a few seconds.

- [ ] **Step 4: Commit**

```bash
git add chapters/02-birthday/game/render.js chapters/02-birthday/game/main.js
git commit -m "feat(ch02): add the thief, closing gap, checkpoints and taunts"
```

---

### Task 7: Real faces and drawn bodies

**Files:**
- Modify: `chapters/02-birthday/game/render.js`

**Interfaces:**
- Consumes: `assets/face-you.png`, `assets/face-her.png` from Task 0.
- Produces: `Render.drawRunner(ctx, box, faceImg, phase, pose)` where `pose` is `"run" | "jump" | "slide"`; replaces `blockBody` for both characters.

- [ ] **Step 1: Load the face images**

Add near the top of `render.js`:

```js
  const faces = { you: new Image(), her: new Image() };
  faces.you.src = "assets/face-you.png";
  faces.her.src = "assets/face-her.png";
```

- [ ] **Step 2: Draw a body with a circle-masked face**

Add to `render.js`:

```js
  /*
   * A runner: circle-cropped photo head on a code-drawn body. Bodies are drawn
   * rather than spritesheeted so the poses actually change shape — which is the
   * whole reason for not using emoji runners.
   *
   * `phase` is a continuously increasing number; the legs are driven off its
   * sine so the cycle is smooth and needs no frame counter.
   */
  function drawRunner(ctx, box, faceImg, phase, pose) {
    const cx = box.x + box.w / 2;
    const headR = 21;
    const sliding = pose === "slide";

    ctx.save();

    if (sliding) {
      // Pivot the whole body toward horizontal.
      ctx.translate(cx, C.GROUND_Y);
      ctx.rotate(-Math.PI / 2.6);
      ctx.translate(-cx, -C.GROUND_Y);
    }

    const hipY = sliding ? C.GROUND_Y - 12 : box.y + box.h - 26;
    const headY = sliding ? C.GROUND_Y - 22 : box.y + headR - 2;

    // torso
    ctx.strokeStyle = "#f7f7fb";
    ctx.lineCap = "round";
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(cx, headY + headR - 2);
    ctx.lineTo(cx, hipY);
    ctx.stroke();

    // legs
    const swing = pose === "jump" ? 0.9 : Math.sin(phase) * 0.9;
    const legLen = 26;
    ctx.lineWidth = 8;
    for (const dir of [1, -1]) {
      const a = Math.PI / 2 + swing * dir;
      ctx.beginPath();
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx + Math.cos(a) * legLen, hipY + Math.sin(a) * legLen);
      ctx.stroke();
    }

    // one arm, counter-swinging
    ctx.lineWidth = 7;
    const armA = Math.PI / 2 - (pose === "jump" ? 1.5 : Math.sin(phase + Math.PI) * 1.1);
    ctx.beginPath();
    ctx.moveTo(cx, headY + headR + 8);
    ctx.lineTo(cx + Math.cos(armA) * 20, headY + headR + 8 + Math.sin(armA) * 20);
    ctx.stroke();

    // head: circular clip so a rectangular photo reads as a character
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#2a3352";
    ctx.fill();
    ctx.clip();
    if (faceImg && faceImg.complete && faceImg.naturalWidth) {
      ctx.drawImage(faceImg, cx - headR, headY - headR, headR * 2, headR * 2);
    }
    ctx.restore();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
```

- [ ] **Step 3: Use it for both characters**

In `drawWorld`, replace the `blockBody(...)` player call with:

```js
    const pose = state.player.sliding ? "slide" : (state.player.onGround ? "run" : "jump");
    drawRunner(ctx, root.Rules.playerBox(state.player), faces.her, state.phase, pose);
```

In `drawThief`, replace `blockBody(box, "#bfe3ff")` with:

```js
    drawRunner(ctx, box, faces.you, state.phase * 1.05, "run");
```

Add `drawRunner` to the exports.

- [ ] **Step 4: Drive the animation phase**

In `main.js`, add `phase: 0` to `state`, and inside `update`, after the player step:

```js
    // Legs cycle faster the faster she runs, so the run never looks like it is
    // sliding along the ground.
    state.phase += dt * (6 + R.speedAt(state.worldX / C.LEVEL_LENGTH) / 60);
```

- [ ] **Step 5: Verify in a browser**

1. Both characters have real photo faces in circles, hers behind, yours ahead with 🎁.
2. Legs alternate while running, and cycle faster as the level speeds up.
3. Jumping shows a tucked pose, not a running one.
4. Sliding rotates the body toward horizontal and the head drops near the ground.
5. Faces are not stretched or off-centre. If a face is clipped badly, re-cut the crop from Task 0 Step 3 rather than fiddling with `headR`.

- [ ] **Step 6: Commit**

```bash
git add chapters/02-birthday/game/render.js chapters/02-birthday/game/main.js
git commit -m "feat(ch02): draw both runners with real faces on animated bodies"
```

---

### Task 8: Cutscene and countdown

**Files:**
- Create: `chapters/02-birthday/game/scenes.js`
- Modify: `chapters/02-birthday/index.html`
- Modify: `chapters/02-birthday/game/main.js`

**Interfaces:**
- Produces: `window.Scenes = {showCutscene(onDone), showCountdown(onDone), showBanner(text, ms), showCatch(onOpen), showLetter(hearts), el(id)}`.
- `state.scene` becomes meaningful: `"cutscene" | "countdown" | "run" | "finalChase" | "catch" | "letter"`. Only `"run"` and `"finalChase"` advance the world.

- [ ] **Step 1: Add the overlay markup and styles**

In `index.html`, add before the `<script>` tags:

```html
  <div id="overlay" class="overlay" hidden>
    <div id="overlayInner" class="overlay-inner"></div>
  </div>
```

And add to the `<style>` block:

```css
    .overlay { position: fixed; inset: 0; z-index: 55; display: flex; align-items: center;
      justify-content: center; background: rgba(6,9,20,.82); backdrop-filter: blur(3px);
      padding: 24px; text-align: center; }
    .overlay[hidden] { display: none; }
    .overlay-inner { max-width: 560px; }
    .line { font: 800 clamp(20px, 4.4vw, 34px)/1.3 ui-sans-serif, system-ui; margin: 0 0 14px; }
    .line.small { font-size: clamp(15px, 3vw, 20px); font-weight: 600; opacity: .85; }
    .count { font: 900 clamp(60px, 16vw, 130px)/1 ui-sans-serif, system-ui; }
    .tap { margin-top: 22px; padding: 12px 26px; border-radius: 999px; border: 1px solid rgba(255,255,255,.4);
      background: transparent; color: #fff; font: 700 13px/1 ui-sans-serif, system-ui;
      letter-spacing: .16em; text-transform: uppercase; cursor: pointer; }
    .tap:hover { background: rgba(255,255,255,.14); }
```

- [ ] **Step 2: Create scenes.js**

Create `chapters/02-birthday/game/scenes.js`:

```js
/*
 * DOM overlays for everything that is story rather than gameplay: the opening
 * cutscene, the countdown, the catch, and the letter.
 *
 * These are DOM and not canvas because they are text and photographs, and
 * because real text is selectable, scalable and accessible for free.
 */
(function (root) {
  "use strict";

  const overlay = document.getElementById("overlay");
  const inner = document.getElementById("overlayInner");

  function show(html) {
    inner.innerHTML = html;
    overlay.hidden = false;
  }

  function hide() {
    overlay.hidden = true;
    inner.innerHTML = "";
  }

  /*
   * Plays a list of {html, ms} beats in order. Tapping skips to the next beat —
   * a cutscene you cannot hurry is a cutscene people resent.
   */
  function playBeats(beats, onDone) {
    let i = 0;
    let timer = 0;

    function next() {
      window.clearTimeout(timer);
      if (i >= beats.length) {
        overlay.removeEventListener("pointerdown", next);
        onDone();
        return;
      }
      const beat = beats[i++];
      show(beat.html);
      timer = window.setTimeout(next, beat.ms);
    }

    overlay.addEventListener("pointerdown", next);
    next();
  }

  function showCutscene(onDone) {
    playBeats([
      { html: '<p class="line">\u{1F381} A present!</p><p class="line small">tap to continue</p>', ms: 2200 },
      { html: '<p class="line">Oh, you want this? \u{1F60F}</p>', ms: 2000 },
      { html: '<p class="line">HEY! THAT’S MY PRESENT!</p>', ms: 1900 },
      { html: '<p class="line">CATCH ME IF YOU CAN!</p>', ms: 1700 },
    ], onDone);
  }

  function showCountdown(onDone) {
    playBeats([
      { html: '<p class="count">3</p>', ms: 700 },
      { html: '<p class="count">2</p>', ms: 700 },
      { html: '<p class="count">1</p>', ms: 700 },
      { html: '<p class="count">GO!</p>', ms: 500 },
    ], onDone);
  }

  root.Scenes = {
    show: show,
    hide: hide,
    playBeats: playBeats,
    showCutscene: showCutscene,
    showCountdown: showCountdown,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

Add `<script src="game/scenes.js"></script>` to `index.html`, after `render.js` and before `main.js`.

- [ ] **Step 3: Gate the loop on the scene**

In `main.js`, change `state.scene` to start as `"cutscene"`, and wrap the physics in `frame`:

```js
    let intent = root.Input.consume();
    const running = state.scene === "run" || state.scene === "finalChase";
    while (acc >= STEP) {
      if (running) update(STEP, intent);
      intent = { jump: false, slide: false };
      acc -= STEP;
    }
```

And at the bottom, before starting the loop:

```js
  root.Scenes.showCutscene(function () {
    root.Scenes.showCountdown(function () {
      root.Scenes.hide();
      state.scene = "run";
    });
  });
```

- [ ] **Step 4: Verify in a browser**

1. On load the cutscene plays its four lines; the world is visible behind but **frozen**.
2. Tapping advances a beat early.
3. `3 2 1 GO!` counts down, then the overlay clears and she starts running.
4. Jump/slide during the cutscene does nothing and is not queued up to fire the moment the run starts.

Point 4 matters: `Input.consume()` runs every frame even while paused, which drains stale presses.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/index.html chapters/02-birthday/game/scenes.js chapters/02-birthday/game/main.js
git commit -m "feat(ch02): add opening cutscene and countdown"
```

---

### Task 9: Final chase and the QTE

**Files:**
- Modify: `chapters/02-birthday/game/main.js`
- Modify: `chapters/02-birthday/game/render.js`

**Interfaces:**
- Consumes: `Rules.QTE_SEQUENCE`, `newQte`, `qteAdvance`, `FINAL_CHASE_AT`.
- Produces: `state.qtePrompt` (`"jump"|"slide"|null`), `state.qteFlash` (number), and the transition into `state.scene === "catch"`.

- [ ] **Step 1: Enter the final chase**

In `main.js` `update`, after the gap block:

```js
    if (state.scene === "run" && state.worldX / C.LEVEL_LENGTH >= C.FINAL_CHASE_AT) {
      state.scene = "finalChase";
      state.taunt = "FINAL CHASE";
      state.tauntT = 1.8;
      state.qte = R.newQte();
      state.qtePrompt = R.QTE_SEQUENCE[0];
      state.qteGapStart = state.thiefScreenX - C.PLAYER_X;
    }
```

Add to `state`: `qtePrompt: null`, `qteFlash: 0`, `qteGapStart: C.GAP_END`.

- [ ] **Step 2: Handle QTE input**

In `main.js`, replace the `update` signature body's use of `intent` with an explicit QTE branch. Insert at the very start of `update`:

```js
    if (state.scene === "finalChase" && state.qtePrompt) {
      const action = intent.jump ? "jump" : (intent.slide ? "slide" : null);
      if (action) {
        const before = state.qte.index;
        state.qte = R.qteAdvance(state.qte, action);
        if (state.qte.index === before) {
          // Wrong input: shake and ask again. Never a failure.
          state.shake = 12;
          state.qteFlash = 0.35;
        }
        if (state.qte.done) {
          state.qtePrompt = null;
          state.scene = "catch";
          onCaught();
        } else {
          state.qtePrompt = R.QTE_SEQUENCE[state.qte.index];
        }
      }
    }
```

And close the gap across the sequence — add after the existing gap block:

```js
    if (state.scene === "finalChase") {
      // Reel him in one prompt at a time, so the catch lands exactly on the
      // last input rather than at an arbitrary distance.
      const done = state.qte.index / R.QTE_SEQUENCE.length;
      state.thiefScreenX = C.PLAYER_X + state.qteGapStart * (1 - done);
    }
```

- [ ] **Step 3: Draw the prompt**

Add to `drawHud` in `render.js`, at the end:

```js
    if (state.qtePrompt) {
      const label = state.qtePrompt === "jump" ? "JUMP ⬆" : "SLIDE ⬇";
      ctx.textAlign = "center";
      ctx.font = "900 clamp(30px, 6vw, 56px) ui-sans-serif, system-ui";
      ctx.fillStyle = state.qteFlash > 0 ? "#ff5470" : "#fff";
      ctx.fillText(label, C.CANVAS_W / 2, 230);
      ctx.font = "600 15px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText("FINAL CHASE", C.CANVAS_W / 2, 268);
    }
```

Add `if (state.qteFlash > 0) state.qteFlash = Math.max(0, state.qteFlash - dt);` to `update` in `main.js`.

- [ ] **Step 4: Stub the catch so this task is testable on its own**

Add to `main.js`:

```js
  function onCaught() {
    // Task 10 replaces this with the catch beat and the letter.
    state.taunt = "Okay okay! You win \u{1F602}";
    state.tauntT = 99;
  }
```

- [ ] **Step 5: Verify in a browser**

Reaching 85% takes ~100s. To skip ahead, run in the console: `Game.state.worldX = Rules.C.LEVEL_LENGTH * 0.84`.

1. At 85% the speed jumps, `FINAL CHASE` appears, and a big `JUMP ⬆` prompt shows.
2. Correct inputs advance through `JUMP, JUMP, SLIDE, JUMP`.
3. A **wrong** input shakes, flashes the prompt red, and asks for the same thing again — it never advances and never fails.
4. The thief is reeled in one step per prompt, reaching her exactly on the fourth.
5. On the fourth input, `Okay okay! You win 😂` appears and the world stops.

Point 3 is the requirement most likely to regress. Deliberately press the wrong key at each of the four prompts.

- [ ] **Step 6: Commit**

```bash
git add chapters/02-birthday/game/main.js chapters/02-birthday/game/render.js
git commit -m "feat(ch02): add final chase and the unfailable QTE"
```

---

### Task 10: Catch, gift, letter and secret

**Files:**
- Modify: `chapters/02-birthday/game/scenes.js`
- Modify: `chapters/02-birthday/index.html`
- Modify: `chapters/02-birthday/game/main.js`

**Interfaces:**
- Consumes: `Rules.secretUnlocked`, `state.hearts`, `assets/couple.jpg`, `assets/secret.jpg`.
- Produces: `Scenes.showCatch(onOpen)`, `Scenes.showLetter(hearts)`.

- [ ] **Step 1: Add letter styling**

Add to the `<style>` block in `index.html`:

```css
    .letter { position: fixed; inset: 0; z-index: 70; overflow-y: auto;
      background: linear-gradient(180deg, #fff6f8 0%, #ffeaf0 100%); color: #2a2530;
      padding: 40px 22px 80px; }
    .letter[hidden] { display: none; }
    .letter-inner { max-width: 620px; margin: 0 auto; text-align: center; }
    .letter img.couple { width: 100%; max-width: 420px; border-radius: 20px;
      box-shadow: 0 18px 50px rgba(0,0,0,.22); }
    .letter h1 { font: 700 clamp(28px, 6vw, 44px)/1.2 ui-serif, Georgia, serif; margin: 26px 0 6px; }
    .letter .body { text-align: left; font: 400 16px/1.85 ui-serif, Georgia, serif;
      white-space: pre-line; margin: 22px 0 0; }
    .letter .placeholder { background: #fff3c4; border: 1px dashed #c9a227; border-radius: 12px;
      padding: 14px 16px; font-family: ui-monospace, monospace; font-size: 13px; text-align: left; }
    .secret { margin-top: 34px; padding-top: 26px; border-top: 1px solid rgba(0,0,0,.12); }
    .secret button { padding: 13px 26px; border-radius: 999px; border: 0; background: #2a2530;
      color: #fff; font: 700 13px/1 ui-sans-serif, system-ui; letter-spacing: .16em;
      text-transform: uppercase; cursor: pointer; }
    .secret img { width: 100%; max-width: 420px; border-radius: 18px; margin-top: 18px;
      box-shadow: 0 18px 50px rgba(0,0,0,.22); }
    .locked { margin-top: 34px; font: 500 13px/1.6 ui-sans-serif, system-ui; opacity: .6; }
```

And add the letter container before the scripts:

```html
  <div id="letter" class="letter" hidden><div class="letter-inner" id="letterInner"></div></div>
```

- [ ] **Step 2: Add the catch and letter scenes**

Add to `scenes.js` before the exports:

```js
  const LETTER_TEXT = null;   // ← the user still owes the real letter text

  function showCatch(onOpen) {
    playBeats([
      { html: '<p class="line">Okay okay! You win \u{1F602}</p>', ms: 2000 },
      { html: '<p class="line">\u{1F381}</p><p class="line small">here, it’s yours</p>', ms: 1600 },
    ], function () {
      show(
        '<p class="line">\u{1F381}</p>' +
        '<button class="tap" id="tapOpen">Tap to open</button>'
      );
      document.getElementById("tapOpen").addEventListener("click", function () {
        show('<p class="count">✨</p>');
        window.setTimeout(function () { hide(); onOpen(); }, 900);
      });
    });
  }

  function showLetter(hearts) {
    const unlocked = root.Rules.secretUnlocked(hearts);
    const body = LETTER_TEXT
      ? '<p class="body">' + LETTER_TEXT + "</p>"
      : '<div class="placeholder">PLACEHOLDER — the real letter text goes here.\n' +
        "Set LETTER_TEXT at the top of game/scenes.js.</div>";

    const secret = unlocked
      ? '<div class="secret"><button id="secretBtn">\u{1F513} Secret unlocked</button>' +
        '<div id="secretBody"></div></div>'
      : '<p class="locked">There was something else hidden in there — ' +
        hearts + "/" + root.Rules.C.HEARTS_REQUIRED +
        " hearts. Maybe next time \u{1F49E}</p>";

    document.getElementById("letterInner").innerHTML =
      '<img class="couple" src="assets/couple.jpg" alt="us" />' +
      "<h1>Happy Birthday ❤️</h1>" +
      body + secret;

    document.getElementById("letter").hidden = false;

    const btn = document.getElementById("secretBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("secretBody").innerHTML =
          '<img src="assets/secret.jpg" alt="secret" />' +
          '<div class="placeholder">PLACEHOLDER — replace assets/secret.jpg with the ' +
          "real unseen photo, and put its caption here.</div>";
        btn.disabled = true;
      });
    }
  }
```

Add `showCatch` and `showLetter` to the exports.

- [ ] **Step 3: Wire it up**

Replace `onCaught` in `main.js`:

```js
  function onCaught() {
    root.Scenes.showCatch(function () {
      state.scene = "letter";
      root.Scenes.showLetter(state.hearts);
    });
  }
```

- [ ] **Step 4: Verify in a browser**

Skip ahead with `Game.state.worldX = Rules.C.LEVEL_LENGTH * 0.84`, and set hearts both ways to test both endings.

With `Game.state.hearts = 12`:

1. QTE completes → `Okay okay! You win 😂` → 🎁 → `Tap to open` → ✨ → the letter page fades in.
2. Couple photo, **Happy Birthday ❤️**, and a clearly-marked yellow placeholder where the letter goes.
3. `🔓 Secret unlocked` appears; clicking it reveals the photo plus its own placeholder note.
4. The letter page scrolls on a phone-sized window.

With `Game.state.hearts = 4`:

5. No secret button. Instead the gentle "there was something else hidden in there — 4/10 hearts" line. It must not read as a punishment.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/index.html chapters/02-birthday/game/scenes.js chapters/02-birthday/game/main.js
git commit -m "feat(ch02): add catch, gift opening, letter page and heart-gated secret"
```

---

### Task 11: Audio — chiptune run, piano letter

**Files:**
- Create: `chapters/02-birthday/game/audio.js`
- Modify: `chapters/02-birthday/index.html`
- Modify: `chapters/02-birthday/game/main.js`
- Modify: `chapters/02-birthday/game/scenes.js`

**Interfaces:**
- Produces: `window.Audio2 = {unlock(), startChiptune(), setTempoMultiplier(m), stopChiptune(), playPiano(), sfx(name), toggleMute() -> boolean, muted() -> boolean}`.

Named `Audio2` because `window.Audio` is the built-in audio element constructor, and Chapter 01 uses it.

- [ ] **Step 1: Create audio.js**

Create `chapters/02-birthday/game/audio.js`:

```js
/*
 * Audio. Two very different jobs:
 *
 *  - The run gets a chiptune synthesized with WebAudio oscillators. No file to
 *    load, and the tempo ramp for the final chase is a single multiplier.
 *  - The letter gets the real piano cover, starting the moment the pixel world
 *    becomes a real page. That contrast is the point.
 */
(function (root) {
  "use strict";

  let actx = null;
  let master = null;
  let muted = false;
  let step = 0;
  let timer = null;
  let tempo = 1;

  // A minor-ish loop; cheerful but with a chase pulse. Semitones from A3.
  const MELODY = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 7, 3];
  const BASS = [-12, -12, -5, -5, -10, -10, -3, -3];
  const BASE_STEP_MS = 125;

  function hz(semi) {
    return 220 * Math.pow(2, semi / 12);
  }

  function ensure() {
    if (actx) return actx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    actx = new Ctor();
    master = actx.createGain();
    master.gain.value = 0.16;
    master.connect(actx.destination);
    return actx;
  }

  function blip(freq, dur, type, gain) {
    if (!actx || muted) return;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.5, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(actx.currentTime + dur + 0.02);
  }

  function tick() {
    if (!actx) return;
    blip(hz(MELODY[step % MELODY.length]), 0.12, "square", 0.45);
    if (step % 2 === 0) blip(hz(BASS[(step / 2) % BASS.length]), 0.2, "triangle", 0.5);
    step++;
    timer = window.setTimeout(tick, BASE_STEP_MS / tempo);
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  function startChiptune() {
    if (!ensure() || timer) return;
    tick();
  }

  function stopChiptune() {
    window.clearTimeout(timer);
    timer = null;
  }

  function setTempoMultiplier(m) {
    tempo = m;
  }

  const piano = new window.Audio("assets/stay-with-me.mp3");
  piano.loop = true;
  piano.volume = 0.85;

  function playPiano() {
    stopChiptune();
    if (muted) return;
    const p = piano.play();
    if (p && p.catch) p.catch(function () { /* blocked until a gesture; harmless */ });
  }

  function sfx(name) {
    if (name === "jump") blip(660, 0.09, "square", 0.4);
    else if (name === "slide") blip(300, 0.12, "sawtooth", 0.35);
    else if (name === "heart") { blip(880, 0.08, "square", 0.45); blip(1320, 0.1, "square", 0.3); }
    else if (name === "trip") blip(120, 0.26, "sawtooth", 0.6);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.16;
    piano.muted = muted;
    return muted;
  }

  root.Audio2 = {
    unlock: unlock,
    startChiptune: startChiptune,
    stopChiptune: stopChiptune,
    setTempoMultiplier: setTempoMultiplier,
    playPiano: playPiano,
    sfx: sfx,
    toggleMute: toggleMute,
    muted: function () { return muted; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

Add `<script src="game/audio.js"></script>` before `scenes.js` in `index.html`.

- [ ] **Step 2: Add a mute button**

In `index.html`, after the back link:

```html
  <button id="muteBtn" class="chapter-back" style="left:auto;right:12px;cursor:pointer"
          aria-label="mute">&#128266;</button>
```

In `main.js`, near the bottom:

```js
  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", function () {
    muteBtn.innerHTML = root.Audio2.toggleMute() ? "&#128263;" : "&#128266;";
  });
```

- [ ] **Step 3: Hook audio to gameplay**

In `main.js`:

- In the cutscene start block, call `root.Audio2.unlock();` inside the first `showCutscene` callback chain, and `root.Audio2.startChiptune();` when `state.scene` becomes `"run"`.
- When entering `finalChase`, add `root.Audio2.setTempoMultiplier(1.35);`
- In `trip()`, add `root.Audio2.sfx("trip");`
- Where a collectible is taken, add `root.Audio2.sfx("heart");`
- In `update`, when a jump or slide actually starts, play the matching sfx. Detect it by comparing before/after:

```js
    const before = state.player;
    state.player = R.stepPlayer(state.player, dt, intent);
    if (!before.onGround !== !state.player.onGround && before.onGround) root.Audio2.sfx("jump");
    if (!before.sliding && state.player.sliding) root.Audio2.sfx("slide");
```

In `scenes.js`, inside `showLetter`, as the first statement: `root.Audio2.playPiano();`

- [ ] **Step 4: Verify in a browser**

1. Chiptune starts when the run does, not before (browsers block audio until a gesture; the cutscene tap provides it).
2. Jump, slide, heart and trip each make a distinct sound.
3. At `FINAL CHASE` the chiptune audibly speeds up.
4. When the letter appears, the chiptune **stops** and the piano cover starts. This is the emotional beat — confirm there is no overlap.
5. The mute button silences everything including the piano, and the icon toggles.
6. Reloading and muting immediately produces no sound at all.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/audio.js chapters/02-birthday/index.html chapters/02-birthday/game/main.js chapters/02-birthday/game/scenes.js
git commit -m "feat(ch02): add chiptune run music, sfx, and the piano letter track"
```

---

### Task 12: Hub wiring and final verification

**Files:**
- Modify: `chapters.js`

- [ ] **Step 1: Add the chapter to the manifest**

In `chapters.js`, replace the `{ id: "02", status: "soon" }` entry with:

```js
  {
    id: "02-birthday",
    title: "Catch Me If You Can",
    subtitle: "the one where you stole your own present",
    status: "ready",
  },
```

- [ ] **Step 2: Verify the hub picks it up**

```bash
node -e '
global.window = {};
require("./chapters.js");
const Ring = require("./shared/ring.js");
const fs = require("fs");
const cards = Ring.padToSlots(Ring.normalizeChapters(window.CHAPTERS), Ring.ringSlots(window.CHAPTERS.length));
let bad = 0;
for (const c of cards) {
  if (c.status !== "ready") continue;
  for (const p of [c.href, c.cover]) { const ok = fs.existsSync(p); if (!ok) bad++; console.log(" ", ok?"OK  ":"MISS", p); }
}
console.log("ready chapters:", cards.filter(c=>c.status==="ready").length);
process.exit(bad?1:0);'
```

Expected: both chapters' `index.html` and `cover.jpg` resolve, 2 ready chapters.

- [ ] **Step 3: Run the whole suite**

Run: `node --test`
Expected: PASS with zero failures. Record the count.

- [ ] **Step 4: Full end-to-end play**

Open the root `index.html`, spin the ring to Chapter 02, enter, and play the **entire** run without console shortcuts — cutscene, ~2 minutes of chase, all four taunts, the final chase, the catch, the letter.

Confirm: no console errors, no 404s, framerate stays smooth, and the back link returns to the hub with the Chapter 02 card focused.

- [ ] **Step 5: Play it once on a phone-sized viewport**

DevTools iPhone emulation, or the real phone. Confirm the two big touch buttons appear and work, swipes work, the canvas letterboxes without cropping, and the letter page scrolls.

- [ ] **Step 6: Commit**

```bash
git add chapters.js
git commit -m "feat(ch02): add birthday chapter to the hub manifest"
```

- [ ] **Step 7: Report honestly**

Report to the user:

- Test count and result.
- Which manual checks were actually performed and which were not.
- **The two placeholders that are still placeholders**: the letter text (`LETTER_TEXT` in `game/scenes.js`) and `assets/secret.jpg` (currently a copy of the couple photo). These must be called out — shipping a birthday gift with a duplicate photo as "the secret" would be worse than shipping nothing.
- Do not push or merge without being asked.

---

## Notes for the implementer

**What is NOT automated, and why.** Feel — jump weight, whether the difficulty ramp is fair, whether the faces read at 42px, whether the piano lands — cannot be tested without a browser-automation dependency the project forbids. The unit tests cover the *arithmetic* of fairness: that the level is completable, that a slide clears with margin, that hearts cannot go negative, that the QTE cannot fail. Everything else is the manual checklists.

**The most valuable test in the suite** is `THE LEVEL IS POSSIBLE` in `tests/level.test.js`. It is the only thing standing between a tuning change and an unwinnable level, and unlike the others it would take two minutes of play to discover by hand.

**The riskiest tasks** are 5 and 9. Task 5 can double-count a trip if the stumble invulnerability or `hitIds` bookkeeping is wrong — one obstacle must cost exactly one heart. Task 9 must never advance on a wrong input; test it by deliberately pressing the wrong key at every prompt.

**Do not invent the letter.** The placeholder is deliberately ugly and yellow so it cannot ship unnoticed.
