# Chapter 02 Revision — Hold-to-Slide, Slower, Guided

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the birthday chase easier and self-explanatory: sliding becomes hold-to-slide, the speed curve slows, and the controls are taught by an intro card plus floating hints over the first few obstacles.

**Architecture:** Input splits into an edge-triggered jump and a level-triggered `slideHeld`. `stepPlayer` reads the held value instead of starting a fixed-duration slide. The QTE consumes the *rising edge* of the slide signal. Which obstacles carry a hint is decided in `level.js` as a `hint` flag, so it stays pure and testable.

**Tech Stack:** Plain HTML, Canvas 2D, vanilla JS (classic scripts, IIFE namespaces), Node 24 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-10-chapter-02-birthday-design.md`

## Global Constraints

- No build step, no bundler, no dependencies, no `package.json`.
- Must work opened by double-click (`file://`): classic `<script src>` only, no ES modules, no `fetch()` of local files.
- `rules.js` and `level.js` stay pure and dual-target (browser `window.*` + Node `module.exports`).
- **No fail state.** Tripping costs one heart; no death, no restart; the QTE re-prompts forever.
- Hearts: 16 placed (12 + 4 gift disguises), 10 required.
- Jump still cancels a slide, so holding SLIDE can never trap her.
- The letter text (`LETTER_TEXT` in `game/scenes.js`) and `assets/secret.jpg` remain the user's to supply. Do not invent either.
- Run tests with bare `node --test` from the repo root.
- Work on branch `chapter-hub`. Commit after every task.

## Numbers this revision changes

| Constant | Was | Becomes | Why |
|---|---|---|---|
| `SPEED_START` | 260 | **210** | gentler opening |
| `SPEED_END` | 420 | **340** | gentler overall |
| `SPEED_FINAL` | 520 | **430** | final chase still a step up |
| `LEVEL_LENGTH` | 39600 | **33700** | holds the run at ~118s despite the slower speeds (39600 would be 139s) |
| `SLIDE_DURATION` | 0.75 fixed | **removed** | replaced by `SLIDE_MIN_TIME` |
| `SLIDE_MIN_TIME` | — | **0.25** | a tap still gives a visible slide |
| `HINT_COUNT` | — | **4** | hints on the first four of each obstacle kind |

Verified before writing this plan: at `LEVEL_LENGTH` 33700 the run integrates to 117.9s and the generator produces 58 obstacles (currently 61), so obstacle density is effectively unchanged.

## File Structure

| Path | Change |
|---|---|
| `chapters/02-birthday/game/rules.js` | Constants; `stepPlayer` takes `{jump, slideHeld}`; slide held not timed. |
| `chapters/02-birthday/game/level.js` | Adds `hint: true` to the first `HINT_COUNT` obstacles of each kind. |
| `chapters/02-birthday/game/input.js` | Jump stays edge; slide becomes held. Swipe-down removed. |
| `chapters/02-birthday/game/main.js` | Passes `slideHeld`; QTE uses the slide rising edge. |
| `chapters/02-birthday/game/render.js` | Draws floating hints. |
| `chapters/02-birthday/game/scenes.js` | Adds `showControls(onDone)`. |
| `tests/rules.test.js` | Hold semantics; drop the slide timing-window test; QTE edge test. |
| `tests/level.test.js` | Hint-flag placement; run-length and spacing still hold. |

---

### Task 1: Rules — held slide and the slower curve

**Files:**
- Modify: `chapters/02-birthday/game/rules.js`
- Modify: `tests/rules.test.js`

**Interfaces:**
- Changed: `stepPlayer(p, dt, intent)` where `intent` is now `{jump: boolean, slideHeld: boolean}`. The old `intent.slide` is gone.
- Changed: `C.SLIDE_DURATION` removed; `C.SLIDE_MIN_TIME = 0.25` added.
- `Player` gains nothing — `slideT` now counts *up* as time spent sliding, used only to enforce the minimum.

- [ ] **Step 1: Replace the slide tests with hold-semantics tests**

In `tests/rules.test.js`, delete these three tests entirely:

- `"sliding lasts SLIDE_DURATION then ends"`
- `"a slide cannot start in mid-air"`
- `"the slide timing window is humane at every speed in the level"`

The first two are replaced below. The third is deleted, not replaced: with a held slide the window is unbounded, so the test would assert nothing. Also delete the now-unused `slideWindowMs` helper and drop its line from `"the tightest window is at the start, where she is still learning"` so that test only checks the jump.

Then add:

```js
test("a held slide keeps going well past the old fixed duration", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slideHeld: true });
  assert.equal(p.sliding, true);
  // 2 seconds of holding - far longer than any fixed duration would have allowed
  for (let i = 0; i < 120; i++) p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: true });
  assert.equal(p.sliding, true, "holding must not time out");
});

test("releasing ends the slide", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slideHeld: true });
  for (let i = 0; i < 40; i++) p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: true });
  assert.equal(p.sliding, true);
  p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: false });
  assert.equal(p.sliding, false, "release must stand her up");
});

test("a one-frame tap still slides for SLIDE_MIN_TIME", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slideHeld: true });
  // released immediately afterwards
  p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: false });
  assert.equal(p.sliding, true, "a tap must not flicker for one frame");

  let t = 2 / 60;
  while (p.sliding && t < 2) { p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: false }); t += 1 / 60; }
  assert.ok(t >= C.SLIDE_MIN_TIME, `tap slide lasted ${t.toFixed(3)}s, expected >= ${C.SLIDE_MIN_TIME}`);
  assert.ok(t < C.SLIDE_MIN_TIME + 0.1, `tap slide overran to ${t.toFixed(3)}s`);
});

test("jump cancels a held slide, so holding SLIDE never traps her", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slideHeld: true });
  for (let i = 0; i < 30; i++) p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: true });
  assert.equal(p.sliding, true);
  p = R.stepPlayer(p, 1 / 60, { jump: true, slideHeld: true });
  assert.equal(p.sliding, false, "jump must win over a held slide");
  assert.equal(p.onGround, false);
});

test("a slide cannot start in mid-air, even while held", () => {
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: true, slideHeld: false });
  assert.equal(p.onGround, false);
  p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: true });
  assert.equal(p.sliding, false);
});

test("a slide held across an obstacle never collides with it", () => {
  // Simulate the obstacle sweeping past while she holds the button down.
  let p = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slideHeld: true });
  let worst = false;
  for (let dx = 200; dx > -200; dx -= 4) {
    p = R.stepPlayer(p, 1 / 60, { jump: false, slideHeld: true });
    if (R.boxesOverlap(R.playerBox(p), R.slideObstacleBox(C.PLAYER_X + dx))) worst = true;
  }
  assert.equal(worst, false, "holding slide through a slide obstacle must be safe");
});
```

Every remaining `stepPlayer` call in the file that passed `{ jump: X, slide: Y }` must become `{ jump: X, slideHeld: Y }`. Find them with:

```bash
grep -n "slide:" tests/rules.test.js
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL. The hold tests fail because `slideHeld` is ignored — `p.sliding` stays `false`.

- [ ] **Step 3: Update the constants**

In `chapters/02-birthday/game/rules.js`, replace the slide-duration block:

```js
    SLIDE_W: 60,
    SLIDE_H: 34,
    /*
     * Sliding is HELD, not timed: it lasts as long as the button is down. This
     * removes the timing problem a fixed duration created — at the opening speed
     * a 0.5s slide gave only a 69ms window to press.
     *
     * The minimum exists so a quick tap produces a visible slide instead of a
     * one-frame flicker.
     */
    SLIDE_MIN_TIME: 0.25,
```

and the speed/length block:

```js
    LEVEL_LENGTH: 33700,
```

```js
    SPEED_START: 210,
    SPEED_END: 340,
    SPEED_FINAL: 430,
```

`LEVEL_LENGTH` is 33700 rather than the old 39600 because the slower curve would
otherwise stretch the run from ~118s to ~139s.

- [ ] **Step 4: Make the slide held**

Replace the slide handling in `stepPlayer`:

```js
    // Slide is held: it starts on the ground while the button is down, and lasts
    // until released. slideT counts UP, and only exists to enforce the minimum so
    // a tap does not flicker.
    if (intent && intent.slideHeld && n.onGround && !n.sliding) {
      n.sliding = true;
      n.slideT = 0;
    }
```

and replace the old countdown block with:

```js
    if (n.sliding) {
      n.slideT += dt;
      const released = !(intent && intent.slideHeld);
      if (released && n.slideT >= C.SLIDE_MIN_TIME) {
        n.sliding = false;
        n.slideT = 0;
      }
    }
```

Leaving the ground must also end a slide. In the jump branch, `n.sliding = false`
is already set. Add the same to the landing/airborne path by putting this
immediately after the `if (!n.onGround) { ... }` block:

```js
    // Airborne means not sliding, whatever the button is doing.
    if (!n.onGround && n.sliding) { n.sliding = false; n.slideT = 0; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test`
Expected: PASS.

If `"a one-frame tap still slides for SLIDE_MIN_TIME"` fails by overrunning, the
release check is comparing against the wrong direction — `slideT` must count up.

- [ ] **Step 6: Confirm the run is still about two minutes**

```bash
node -e '
const R=require("./chapters/02-birthday/game/rules.js");
let t=0; for(let x=0;x<R.C.LEVEL_LENGTH;x+=10) t+=10/R.speedAt(x/R.C.LEVEL_LENGTH);
console.log("run time:", t.toFixed(1)+"s");
console.log("speeds:", R.speedAt(0), R.speedAt(0.5).toFixed(0), R.speedAt(0.85));'
```

Expected: ~118s, speeds 210 / 275 / 430.

- [ ] **Step 7: Commit**

```bash
git add chapters/02-birthday/game/rules.js tests/rules.test.js
git commit -m "feat(ch02): make sliding held rather than timed, and slow the speed curve"
```

---

### Task 2: Level — hint flags

**Files:**
- Modify: `chapters/02-birthday/game/level.js`
- Modify: `tests/level.test.js`

**Interfaces:**
- Changed: obstacle entities may carry `hint: true`. Absent means no hint (not `false`), so existing `deepEqual` determinism checks still pass.
- New export: `Level.HINT_COUNT = 4`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/level.test.js`:

```js
test("the first HINT_COUNT obstacles of each kind carry a hint", () => {
  const jumps = obstacles.filter((o) => o.kind === "jump");
  const slides = obstacles.filter((o) => o.kind === "slide");

  assert.equal(jumps.filter((o) => o.hint).length, L.HINT_COUNT);
  assert.equal(slides.filter((o) => o.hint).length, L.HINT_COUNT);

  // and they must be the EARLIEST ones - a hint on obstacle 40 teaches nothing
  for (let i = 0; i < jumps.length; i++) {
    assert.equal(!!jumps[i].hint, i < L.HINT_COUNT, `jump obstacle ${i} hint flag wrong`);
  }
  for (let i = 0; i < slides.length; i++) {
    assert.equal(!!slides[i].hint, i < L.HINT_COUNT, `slide obstacle ${i} hint flag wrong`);
  }
});

test("hints appear early enough in the level to be a tutorial", () => {
  const hinted = obstacles.filter((o) => o.hint);
  const lastHintProgress = Math.max(...hinted.map((o) => o.x / C.LEVEL_LENGTH));
  assert.ok(lastHintProgress < 0.35, `last hint at ${(lastHintProgress * 100).toFixed(0)}% is too late to teach`);
});

test("collectibles never carry hints", () => {
  for (const c of collectibles) assert.ok(!c.hint, "a collectible must not be flagged as a hint");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `L.HINT_COUNT` is `undefined`, so `filter(o => o.hint).length` is compared against `undefined`.

- [ ] **Step 3: Flag the first few of each kind**

In `chapters/02-birthday/game/level.js`, add near the top of the factory:

```js
  // How many of each obstacle kind get a floating control hint. Four is enough
  // to teach a control and few enough to stop feeling like hand-holding.
  const HINT_COUNT = 4;
```

Then, in `buildLevel`, replace the obstacle-kind loop with a version that counts
each kind as it goes:

```js
    const kindSeen = { jump: 0, slide: 0 };
    for (let i = 0; i < obstacleXs.length; i++) {
      // Alternate-ish so neither kind clusters, but not strictly predictable.
      const kind = rand() < 0.55 ? "jump" : "slide";
      const entity = { x: obstacleXs[i], kind: kind };
      // The first few of each kind teach the control that clears them.
      if (kindSeen[kind] < HINT_COUNT) entity.hint = true;
      kindSeen[kind]++;
      entities.push(entity);
    }
```

Add `HINT_COUNT: HINT_COUNT` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS.

If `"hints appear early enough"` fails, one kind is rare at the start — lower the
`0.55` bias toward 0.5 so both kinds appear in the opening stretch.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/level.js tests/level.test.js
git commit -m "feat(ch02): flag the first few obstacles of each kind for control hints"
```

---

### Task 3: Input — edge jump, held slide

**Files:**
- Modify: `chapters/02-birthday/game/input.js`

**Interfaces:**
- Changed: `Input.consume() -> {jump: boolean, slideHeld: boolean}`. `jump` is a one-shot edge; `slideHeld` is the current held state and is **not** cleared by consuming.
- `Input.press(action)` is kept for the test harness: `press("jump")` sets the edge, `press("slide")` sets held for one consume.

- [ ] **Step 1: Rewrite input.js**

Replace the whole body of `chapters/02-birthday/game/input.js`:

```js
/*
 * Input: two different kinds of signal, deliberately.
 *
 *  - JUMP is edge-triggered. One press, one jump; holding the key does nothing
 *    extra. If it were level-triggered, holding Up would re-fire every frame.
 *  - SLIDE is level-triggered. She stays down while the button is held, so the
 *    press moment stops being a timing test.
 *
 * Consumers therefore read `jump` once and `slideHeld` every frame.
 */
(function (root) {
  "use strict";

  let jumpEdge = false;      // set on press, cleared by consume()
  let slideHeld = false;     // mirrors the physical button
  let slideTapEdge = false;  // lets a scripted press() act like a brief hold

  function press(action) {
    if (action === "jump") jumpEdge = true;
    if (action === "slide") slideTapEdge = true;
  }

  function setSlideHeld(v) {
    slideHeld = !!v;
  }

  function consume() {
    const out = { jump: jumpEdge, slideHeld: slideHeld || slideTapEdge };
    jumpEdge = false;
    slideTapEdge = false;
    return out;
  }

  function attach(canvasEl) {
    document.addEventListener("keydown", function (e) {
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") {
        if (!e.repeat) jumpEdge = true;
        e.preventDefault();
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        slideHeld = true;
        e.preventDefault();
      }
    });

    document.addEventListener("keyup", function (e) {
      const k = e.key;
      if (k === "ArrowDown" || k === "s" || k === "S") slideHeld = false;
    });

    // Losing focus mid-hold would otherwise leave her sliding forever.
    window.addEventListener("blur", function () { slideHeld = false; });

    const jumpBtn = document.getElementById("btnJump");
    if (jumpBtn) {
      jumpBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); jumpEdge = true; });
    }

    const slideBtn = document.getElementById("btnSlide");
    if (slideBtn) {
      slideBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); slideHeld = true; });
      // Every way a finger can stop pressing, or she slides forever.
      for (const ev of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
        slideBtn.addEventListener(ev, function () { slideHeld = false; });
      }
    }

    /*
     * Swipe-up still jumps, because a jump is a single press. There is no
     * swipe-down: you cannot hold a swipe, and sliding is now a hold. On a phone,
     * sliding means holding the SLIDE button.
     */
    let startY = null;
    canvasEl.addEventListener("pointerdown", function (e) { startY = e.clientY; });
    canvasEl.addEventListener("pointerup", function (e) {
      if (startY === null) return;
      if (e.clientY - startY < -28) jumpEdge = true;
      startY = null;
    });
  }

  root.Input = {
    press: press,
    setSlideHeld: setSlideHeld,
    consume: consume,
    attach: attach,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 2: Check it parses**

Run: `node --check chapters/02-birthday/game/input.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add chapters/02-birthday/game/input.js
git commit -m "feat(ch02): hold-to-slide input, edge-triggered jump"
```

---

### Task 4: Main — pass the held slide, and edge-detect it for the QTE

**Files:**
- Modify: `chapters/02-birthday/game/main.js`
- Modify: `tests/rules.test.js`

**Interfaces:**
- Consumes: `Input.consume() -> {jump, slideHeld}`; `stepPlayer(p, dt, {jump, slideHeld})`.
- Produces: no new exports. `state.prevSlideHeld` is added so the QTE can see a rising edge.

- [ ] **Step 1: Write the QTE edge test**

Append to `tests/rules.test.js`:

```js
/*
 * The QTE reads an ACTION, and with a held slide the caller must convert the held
 * value into a rising edge before calling qteAdvance. This test pins the rule at
 * the rules level: repeated identical calls advance repeatedly, so the caller is
 * the one who must not repeat them.
 */
test("qteAdvance advances on every call, so callers must edge-detect a held button", () => {
  let q = R.newQte();
  q = R.qteAdvance(q, "jump");
  q = R.qteAdvance(q, "jump");
  assert.equal(q.index, 2, "two calls advance twice - hence main.js must send one call per press");
});
```

- [ ] **Step 2: Run it**

Run: `node --test`
Expected: PASS immediately. This test documents existing behaviour; it exists so
nobody "fixes" `qteAdvance` to swallow repeats and thereby breaks the JUMP→JUMP
part of the sequence, which legitimately needs two presses in a row.

- [ ] **Step 3: Thread slideHeld through main.js**

In `chapters/02-birthday/game/main.js`:

Add `prevSlideHeld: false` to the `state` object.

Replace the two neutral-intent literals — the one in `frame()`'s inner loop — so
that `slide` becomes `slideHeld`:

```js
      intent = { jump: false, slideHeld: false };
```

Replace `handleQte` so it uses the rising edge:

```js
  /*
   * Rising edge only. slideHeld stays true for as long as the button is down, so
   * reading its value would satisfy several prompts from a single hold.
   */
  function handleQte(intent) {
    const slideEdge = intent.slideHeld && !state.prevSlideHeld;
    const action = intent.jump ? "jump" : (slideEdge ? "slide" : null);
    if (!action) return;

    const before = state.qte.index;
    state.qte = R.qteAdvance(state.qte, action);
    if (state.qte.index === before) {
      // Wrong input: shake and ask again. Never a failure.
      state.shake = 12;
      state.qteFlash = 0.35;
      return;
    }
    if (state.qte.done) {
      state.qtePrompt = null;
      state.scene = "catch";
      onCaught();
    } else {
      state.qtePrompt = R.QTE_SEQUENCE[state.qte.index];
    }
  }
```

At the very **end** of `update`, after every other use of `intent`, record the edge
for next time:

```js
    state.prevSlideHeld = intent.slideHeld;
```

- [ ] **Step 4: Check it parses**

Run: `node --check chapters/02-birthday/game/main.js && node --test`
Expected: parses, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/main.js tests/rules.test.js
git commit -m "feat(ch02): thread held slide through the loop, edge-detect it for the QTE"
```

---

### Task 5: The intro control card

**Files:**
- Modify: `chapters/02-birthday/game/scenes.js`
- Modify: `chapters/02-birthday/game/main.js`
- Modify: `chapters/02-birthday/index.html`

**Interfaces:**
- Produces: `Scenes.showControls(onDone)` — shows the control card and calls `onDone` when dismissed.

- [ ] **Step 1: Add styles for the card**

Add to the `<style>` block in `chapters/02-birthday/index.html`:

```css
    .controls { display: flex; flex-direction: column; gap: 14px; margin: 18px 0 4px; }
    .ctrl { display: flex; align-items: center; gap: 14px; text-align: left;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16);
      border-radius: 16px; padding: 14px 16px; }
    .ctrl .key { flex: 0 0 auto; min-width: 84px; text-align: center; padding: 9px 10px;
      border-radius: 11px; background: rgba(255,255,255,.16);
      font: 800 13px/1.25 ui-sans-serif, system-ui; letter-spacing: .06em; }
    .ctrl .what { font: 600 14px/1.45 ui-sans-serif, system-ui; }
    .ctrl .what b { display: block; font-size: 16px; margin-bottom: 2px; }
```

- [ ] **Step 2: Add showControls to scenes.js**

Add to `chapters/02-birthday/game/scenes.js` before the exports:

```js
  /*
   * Shown once, between the cutscene and the countdown. Hold-to-slide is not a
   * convention anyone can guess, so it gets said in words before it is needed.
   */
  function showControls(onDone) {
    show(
      '<p class="line">How to catch him</p>' +
      '<div class="controls">' +
        '<div class="ctrl"><div class="key">⬆<br>TAP</div>' +
          '<div class="what"><b>JUMP</b>over things on the ground</div></div>' +
        '<div class="ctrl"><div class="key">⬇<br>HOLD</div>' +
          '<div class="what"><b>SLIDE</b>hold it down to stay low, release to stand up</div></div>' +
      "</div>" +
      '<button class="tap" id="gotIt">Got it</button>'
    );
    document.getElementById("gotIt").addEventListener("click", function () {
      hide();
      onDone();
    });
  }
```

Add `showControls: showControls` to the exports.

- [ ] **Step 3: Put it in the sequence**

In `chapters/02-birthday/game/main.js`, replace the boot chain:

```js
  root.Scenes.showCutscene(function () {
    root.Audio2.unlock();
    root.Scenes.showControls(function () {
      root.Scenes.showCountdown(function () {
        root.Scenes.hide();
        state.scene = "run";
        root.Audio2.startChiptune();
      });
    });
  });
```

- [ ] **Step 4: Verify in a browser**

Open `chapters/02-birthday/index.html`. Confirm:

1. Cutscene → **control card** → countdown → run.
2. The card explains JUMP as a tap and SLIDE as a hold, and waits for **Got it**
   rather than auto-advancing. It must not be skippable by the cutscene's
   tap-anywhere handler firing through it.
3. Holding `↓` keeps her sliding for as long as you hold, and she stands up on
   release.
4. Holding `↓` and then pressing `↑` jumps out of the slide.

- [ ] **Step 5: Commit**

```bash
git add chapters/02-birthday/game/scenes.js chapters/02-birthday/game/main.js chapters/02-birthday/index.html
git commit -m "feat(ch02): add an intro control card explaining tap-jump and hold-slide"
```

---

### Task 6: Floating hints over the first obstacles

**Files:**
- Modify: `chapters/02-birthday/game/render.js`

**Interfaces:**
- Consumes: `entity.hint` from Task 2.
- Produces: no new exports; `drawEntities` draws the hints.

- [ ] **Step 1: Draw a hint above hinted obstacles**

In `chapters/02-birthday/game/render.js`, add this helper at **module level** —
alongside `emojiFor`, not nested inside `drawEntities`:

```js
  function drawHint(ctx, sx, topY, text) {
    /*
     * Fades in as it approaches and out as it passes, so the hint is loudest
     * exactly when she needs to act on it.
     */
    const distance = Math.abs(sx - C.PLAYER_X);
    const alpha = Math.max(0, Math.min(1, 1 - (distance - 90) / 320));
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 15px ui-sans-serif, system-ui";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText(text, sx, topY - 26);
    ctx.restore();
  }
```

Then in the `jump`/`gift` branch, after the `fillText` of the emoji:

```js
        if (e.hint && e.kind === "jump") drawHint(ctx, sx, box.y, "⬆ TAP");
```

and in the `slide` branch, after its `fillText`:

```js
        if (e.hint) drawHint(ctx, sx, box.y, "⬇ HOLD");
```

Note `ctx.save()`/`restore()` around `globalAlpha` — without it the alpha leaks
into everything drawn afterwards, which would fade the whole scene.

- [ ] **Step 2: Verify in a browser**

Open the chapter and play the first ~30 seconds. Confirm:

1. A yellow `⬆ TAP` floats above each of the first four ground obstacles, and
   `⬇ HOLD` above each of the first four hanging ones.
2. Each hint fades in as it approaches and out as it passes.
3. After the fourth of each kind, hints stop appearing entirely.
4. 🎁 items never show a hint — that would give away the disguise.
5. Nothing else on screen is faded, which would mean the alpha leaked.

- [ ] **Step 3: Commit**

```bash
git add chapters/02-birthday/game/render.js
git commit -m "feat(ch02): float control hints above the first obstacles of each kind"
```

---

### Task 7: Re-verify with the bot, then hand over

**Files:**
- Modify: none expected.

- [ ] **Step 1: Full suite**

Run: `node --test`
Expected: PASS, zero failures. Record the count.

- [ ] **Step 2: Re-run the level report**

```bash
node -e '
const R = require("./chapters/02-birthday/game/rules.js");
const L = require("./chapters/02-birthday/game/level.js");
const lv = L.buildLevel();
const o = lv.entities.filter(e => e.kind==="jump"||e.kind==="slide");
const c = lv.entities.filter(e => e.kind==="heart"||e.kind==="gift");
console.log("obstacles:", o.length, "| hinted:", o.filter(e=>e.hint).length);
console.log("collectibles:", c.length, "| gifts:", c.filter(e=>e.kind==="gift").length);
let t=0; for (let x=0;x<R.C.LEVEL_LENGTH;x+=10) t+=10/R.speedAt(x/R.C.LEVEL_LENGTH);
console.log("run time:", t.toFixed(1)+"s");
const gaps = o.slice(1).map((e,i)=>e.x-o[i].x);
console.log("spacing: min", Math.min(...gaps).toFixed(0), "max", Math.max(...gaps).toFixed(0));'
```

Expected: ~58 obstacles, 8 hinted, 16 collectibles, 4 gifts, ~118s.

- [ ] **Step 3: Re-run the playing bot**

The bot at `<scratchpad>/ch02-bot.js` drives the real loop through a DOM stub. Two
edits are needed for the new input model: it must call `Input.setSlideHeld(true)`
to slide and `setSlideHeld(false)` to release, instead of `press("slide")`, and its
slide logic should hold from when the obstacle is ~300px away until it is behind
her — which is the whole point of the change.

Expected after the edit: **0 trips**, ~118s, and hearts ≥ 10 so the secret is
still reachable. If trips appear, the held slide is being released too early —
check that `setSlideHeld(false)` is not called while an obstacle is still within
`(SLIDE_W + SLIDE_OBS_W)/2` of her.

- [ ] **Step 4: Manual pass — the things no harness can judge**

Play it in a browser, all the way through:

1. Control card is clear, and hold-to-slide feels obvious after reading it.
2. The opening genuinely feels gentler than before.
3. Hints appear on the right obstacles and stop.
4. Holding SLIDE across a hanging obstacle is comfortable, not fiddly.
5. The final chase: pressing and *holding* the SLIDE prompt advances the sequence
   exactly **one** step, not several.
6. On a phone-sized viewport, holding the SLIDE button works and does not scroll
   or select anything.

Point 5 is the regression most likely to slip through, because it only manifests on
one of the four prompts.

- [ ] **Step 5: Report honestly**

Report: test count, which manual checks were run and which were not, and that
`LETTER_TEXT` and `assets/secret.jpg` are **still placeholders**. Do not push or
merge without being asked.

---

## Notes for the implementer

**The one-line summary of this revision:** the slide stopped being a timing test.
Everything else — slower speeds, the control card, the hints — is support for that.

**The trap** is the QTE. `slideHeld` is true for as long as a finger is down, and
the sequence contains a SLIDE prompt. Read the value instead of the edge and one
hold walks through several prompts. `state.prevSlideHeld`, set at the very end of
`update`, is what prevents it.

**The second trap** is a stuck slide. If a `pointerup` is missed — finger dragged
off the button, window blurred mid-hold — she slides forever and trips on every
ground obstacle. That is why Task 3 wires `blur`, `pointercancel`, `pointerleave`
and `lostpointercapture` as well as `pointerup`.
