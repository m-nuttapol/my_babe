# Chapter 02 — "Catch Me If You Can, Birthday Edition" — Design

**Date:** 2026-08-10
**Chapter id:** `02-birthday`
**Depends on:** the chapter hub (`docs/superpowers/specs/2026-08-10-chapter-hub-design.md`)

## Goal

A side-scrolling chase. You run off with the birthday present; she is the player
and has to catch you. Catching you opens the gift, and the game dissolves into a
real letter.

This is the first chapter that is a *game* rather than a page, so it is much
larger than Chapter 01. It still obeys the project's rules: no build step, no
dependencies, works when opened by double-click.

## Decisions

| Question | Decision |
|---|---|
| Hitting an obstacle | Stumble + **lose one heart**. Never a death, never a restart. |
| Sliding | **Held** — down while the button is held, no fixed duration. |
| Difficulty | Slower speed curve than the first build; the game was too hard. |
| Guidance | Intro control card **and** floating hints over the first four of each obstacle kind. |
| Characters | Their real faces (cropped from `Pic1.JPG`) on code-drawn bodies. No sprites. |
| Run length | ~120 seconds. |
| Music | **Chiptune (WebAudio) during the run**, piano cover the moment the letter appears. |
| Final QTE | **Cannot be failed.** A missed prompt re-prompts. |
| Skip-to-letter link | **None.** She plays it. |
| Secret (10+ hearts) | An unseen photo with a caption. |

### Why there is no fail state anywhere

Tripping costs a heart, the QTE re-prompts forever, and there is no death or
restart. So the run always ends with the letter — the only variable is how many
hearts she finishes with. That is what makes "no skip link" safe: there is nothing
to get stuck on. The worst case is arriving at the letter with 3 hearts instead of
10 and not seeing the secret.

### Hearts: 16 placed, 10 required

Because a trip *removes* a heart, a strict 10-of-10 would mean one mistake kills
the secret. So more are placed than are needed.

The count is 16 — **12 plain hearts plus 4 disguised as 🎁**. The 🎁 items are drawn
at jump-obstacle size and position, so they read as something to avoid, but they
are collectibles. The split matters: a player who dodges every 🎁 because she
assumes it is an obstacle still ends on 12, which survives two trips. A player who
works out the trick ends on 16 and survives six. The disguise therefore rewards
curiosity without punishing caution — which a 14/10 split would not have done,
since dodging all four 🎁 would leave exactly 10 and make any single trip fatal to
the secret.

## Architecture

```
chapters/02-birthday/
  index.html          # thin shell: <canvas>, HUD, DOM overlays, script tags
  cover.jpg           # square crop of Pic2, for the hub ring card
  assets/
    face-you.png      # ~256px crop from Pic1
    face-her.png      # ~256px crop from Pic1
    couple.jpg        # Pic2, downscaled for the letter page
    secret.jpg        # the unseen photo (SUPPLIED BY USER)
    stay-with-me.mp3  # piano cover, renamed from the original spaced filename
  game/
    rules.js          # PURE: physics, collision, hearts, gap, speed, QTE. Tested.
    level.js          # PURE: level data + window queries. Tested.
    render.js         # canvas drawing only
    input.js          # keyboard, on-screen buttons, swipe
    scenes.js         # cutscene / run / catch / letter DOM overlays
    audio.js          # WebAudio chiptune + piano playback
    main.js           # boot + fixed-timestep loop
```

Loaded as classic `<script src>` in dependency order, each an IIFE assigning to a
namespace (`window.Rules`, `window.Level`, …). **Not** ES modules — those fail on
`file://`, and double-click has to keep working. This mirrors the `ring.js` /
`hub.js` split from Chapter 01: pure logic in files Node can `require`, DOM and
canvas in files it cannot.

**Canvas for the run, DOM for the story.** The chase is a scrolling world with
dozens of entities, which is canvas work. The cutscene, the letter and the secret
are text and photographs, which is DOM work.

### Why the file split is what it is

`rules.js` holds every number that decides whether the game is fair — jump arc,
hitboxes, collision, speed curve, gap curve, heart accounting, QTE progression.
All of it is pure and unit-tested, because these are the things that are painful
to tune by replaying a two-minute level. `render.js` is deliberately dumb: it
takes a state object and draws it, and it owns no rules.

## Canvas and world

- Logical canvas **960×540**, scaled to fit the viewport with letterboxing, backed
  by `devicePixelRatio` for sharpness.
- Ground line at `y = 430`.
- She is drawn at a fixed screen `x = 260`; the world scrolls past her.
- `LEVEL_LENGTH = 39600` world px. `progress = worldX / LEVEL_LENGTH`.

### Speed curve

`speedAt(progress)` ramps **210 → 340 px/s** across the first 85%, then jumps to
**430 px/s** for the final chase. `LEVEL_LENGTH` is tuned so this still integrates
to about 120 seconds.

These were originally 260 → 420 → 520. They came down after playtesting said the
game was too hard: a gentler opening gives her room to learn the controls before
anything is demanding.

### Player physics

| Quantity | Value |
|---|---|
| Gravity | 1800 px/s² |
| Jump velocity | −620 px/s (≈107px high, ≈0.69s airborne) |
| Standing hitbox | 44 × 72 |
| Sliding hitbox | 60 × 34 |
| Slide | **held**, minimum 0.25s, cannot start while airborne |

### Obstacles

- **JUMP** obstacles: 46 wide × 54 high, sitting on the ground — 📦 box, 🐱 sleeping
  cat, ☕ spilled coffee, 🧸 toy.
- **SLIDE** obstacles: 70 tall, hanging with a **48px gap** beneath — 🎈 balloon,
  Happy Birthday banner, tree branch.
- **🎁 fake obstacles**: drawn at jump-obstacle size and position, but they are
  collectibles worth one heart. No collision.

A 107px jump clears a 54px obstacle comfortably, and a 34px slide hitbox passes
under a 48px gap with 14px to spare. Both have margin on purpose: this is a gift,
not a precision platformer. (An earlier draft said 40px gap against a 36px hitbox,
which leaves only 4px — precise enough to feel unfair, so both numbers moved.)

### Sliding is held, not timed

Slide begins when the button is **held** and she is on the ground, and continues
until she releases it, jumps, or leaves the ground. There is no maximum. A 0.25s
minimum means a quick tap still produces a visible slide rather than a one-frame
flicker.

This replaces a fixed 0.75s slide. A timed slide made the *press moment* the
challenge — at the opening speed the window was 69ms before the duration was
widened, and even at 0.75s it was a timing test. Holding removes the timing
question entirely: she can press early and stay down until the thing has passed.
That is the single biggest reason the chapter is now easier.

Jump still cancels a slide, so holding SLIDE never traps her.

### HUD

Minimal, and never covering the ground line where the obstacles are:

- **Top left** — `❤️ 7/10`, the count needed for the secret. It flashes red on a
  trip so losing one is legible rather than mysterious.
- **Top centre** — a thin progress bar. The closing gap already communicates the
  chase, but the bar tells her the run is finite, which matters when there is no
  skip link.
- **Top right** — mute toggle.

## The chase

`gapAt(progress)` closes from **380px to 90px** across the first 85%, so she is
visibly gaining the whole time. A trip adds 60px back. During the final chase the
gap closes to zero across the four prompts.

**Checkpoints at 20 / 40 / 60 / 80%.** Each shows a banner with your taunt for
2.2s without pausing the run:

1. `Too slow 😌`
2. `Getting closer 👀`
3. `Okay... you're actually fast.`
4. `WAIT— 😭`

## Scenes

A single scene state machine: `cutscene → countdown → run → finalChase → catch →
gift → letter → secret`.

**Cutscene.** You walk in with 🎁, she reaches for it, `Oh, you want this? 😏`,
you turn and bolt. `HEY! THAT'S MY PRESENT!` / `CATCH ME IF YOU CAN!`

**Countdown.** `3... 2... 1... GO!`

**Final chase.** At 85%: `FINAL CHASE` banner, speed to 520, chiptune tempo ×1.35.
Then `JUMP → JUMP → SLIDE → JUMP`. Each prompt waits indefinitely for the correct
input; a wrong input shakes and re-prompts. 0.9s between prompts.

**Catch.** She reaches you, both stop, `Okay okay! You win 😂`, gift handed over,
`TAP TO OPEN`.

**Letter.** Tap → ✨ → the canvas dissolves and the DOM letter fades in: `couple.jpg`,
**Happy Birthday ❤️**, and the letter text. **The piano cover starts here** — the
first real music in the chapter, at the moment the pixel world becomes a real page.

**Secret.** With 10+ hearts, `🔓 SECRET UNLOCKED` appears below the letter; opening
it reveals `secret.jpg` with a caption.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Jump (press) | `↑`, `W`, `Space` | large left button, or swipe up |
| Slide (hold) | hold `↓` or `S` | hold the large right button |

Swipe-down is gone: you cannot hold a swipe. On a phone, sliding means holding the
SLIDE button. Swipe-up to jump still works, because a jump is a single press.

**Two kinds of signal.** Jump is edge-triggered — one press, one jump, and holding
the key does nothing extra. Slide is level-triggered — its value is read every
frame. The QTE must use the *rising edge* of the slide signal, not its value, or
holding the button would satisfy several prompts at once.

### Guidance

Two layers, because the controls are now unusual enough to need saying out loud:

1. **An intro card** between the cutscene and the countdown: `⬆ JUMP over things on
   the ground` and `⬇ HOLD to SLIDE under things`, dismissed by tapping.
2. **Floating hints in the world** — a `⬆` or `⬇ HOLD` above the **first four
   obstacles of each kind** as they approach, then nothing. Which obstacles carry a
   hint is a `hint` flag set during level generation, so it is pure and testable
   rather than a magic number inside the renderer.

The on-screen buttons are always visible on touch devices, sized for thumbs at the
bottom corners.

## Audio

- **Chiptune**, synthesized with WebAudio oscillators — no audio file, and the
  tempo ramp for the final chase is free. Fits the pixel half.
- **Piano cover** (`stay-with-me.mp3`) plays only on the letter page.
- Browsers block autoplay until a gesture, and the cutscene already needs a tap to
  start, so audio is unlocked there.
- A mute toggle is always available.

## Testing

**Automated** (`node --test`) over `rules.js` and `level.js`:

- Jump arc reaches at least obstacle height and returns to ground.
- Sliding hitbox fits under a slide obstacle; standing hitbox does not.
- A held slide persists indefinitely; releasing ends it; the 0.25s minimum holds
  through a one-frame tap; jump cancels it; it cannot start airborne.
- A slide held from before an obstacle until after it never collides. (This
  replaces the old slide *timing-window* test, which is meaningless now that the
  window is unbounded. The jump timing-window test stays.)
- The QTE advances exactly **once** when the slide button is held down across many
  frames — the rising-edge requirement.
- Level generation flags exactly four `jump` and four `slide` obstacles with
  `hint: true`, and they are the earliest of each kind.
- Collision detection: overlap, touching edges, clean misses.
- `speedAt` and `gapAt` are monotonic and hit their endpoints.
- Heart accounting: collect increments, trip decrements, never below zero.
- `secretUnlocked` is true at exactly 10.
- Checkpoint crossing fires once per checkpoint, in order, and never twice.
- QTE: correct input advances, wrong input re-prompts without advancing, and the
  sequence is `JUMP, JUMP, SLIDE, JUMP`.
- Level: exactly 16 collectibles of which 4 are 🎁 disguises, 4 checkpoints at the
  right progress values, obstacle spacing never tighter than a jump's landing
  distance at that point's speed.

That last one matters: it is the automated check that the level is *possible*.

**Manual**, because it cannot be automated without a browser-automation
dependency: whether it feels good, whether the faces read, audio, and the letter
transition.

## Accepted limitation

`prefers-reduced-motion` will disable parallax and screen shake, but a runner
cannot honour it fully — the world has to move. Combined with having no skip link,
someone motion-sensitive could not reach the letter. That is accepted knowingly:
this is a gift for one specific person, not a public site.

## Build order

Vertical slices, each independently playable:

1. Canvas, loop, ground, her running and jumping/sliding — grey boxes, no art.
2. Level data, obstacles, collision, trip, hearts, HUD.
3. You as the runner ahead, the gap curve, checkpoints and taunts.
4. Faces and drawn bodies replacing the grey boxes.
5. Cutscene and countdown.
6. Final chase and the QTE.
7. Catch, gift, letter page, secret.
8. Chiptune, piano, mute.
9. Hub wiring: `cover.jpg`, and `chapters.js` flipped to `ready`.

## Still needed from the user

- **The letter text.** Built against an obvious placeholder until it arrives.
- **`secret.jpg`** — the unseen photo, plus its caption.

`Pic1.JPG` (5MB) is only the source for the two face crops and does not need to
ship; it can be deleted from `assets/` once the crops are made.

## Out of scope

- Score, leaderboard, or replay.
- Multiple levels or difficulty settings.
- Saving progress or heart count between visits.
- Sprite art.
- Touching Chapter 01 or the hub, beyond adding this chapter to the manifest.
