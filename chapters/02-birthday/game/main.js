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

  const TAUNTS = [
    "Too slow \u{1F60C}",
    "Getting closer \u{1F440}",
    "Okay... you're actually fast.",
    "WAIT— \u{1F62D}",
  ];
  const TAUNT_TIME = 2.2;

  const canvasEl = document.getElementById("game");
  let ctx = root.Render.resize(canvasEl);
  window.addEventListener("resize", function () { ctx = root.Render.resize(canvasEl); });
  root.Input.attach(canvasEl);

  const built = root.Level.buildLevel();

  const state = {
    scene: "cutscene",
    worldX: 0,
    prevWorldX: 0,
    player: R.newPlayer(),
    hearts: 0,
    entities: built.entities,
    checkpointXs: built.checkpointXs,
    hitIds: new Set(),
    collectedIds: new Set(),
    shake: 0,
    heartFlash: 0,
    gapBonus: 0,
    thiefScreenX: C.PLAYER_X + C.GAP_START,
    phase: 0,
    taunt: null,
    tauntT: 0,
    qte: R.newQte(),
    qtePrompt: null,
    qteFlash: 0,
    qteGapStart: C.GAP_END,
    prevSlideHeld: false,
  };

  let acc = 0;
  let last = 0;

  function trip() {
    state.hearts = R.heartsAfterTrip(state.hearts);
    state.player = Object.assign({}, state.player, { stumbleT: C.STUMBLE_TIME });
    state.gapBonus += C.STUMBLE_GAP_BONUS;
    state.shake = 14;
    state.heartFlash = 0.6;
    root.Audio2.sfx("trip");
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
          root.Audio2.sfx("heart");
        }
      }
    }
  }

  function onCaught() {
    root.Scenes.showCatch(function () {
      state.scene = "letter";
      root.Scenes.showLetter(state.hearts);
    });
  }

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

  function update(dt, intent) {
    if (state.scene === "finalChase" && state.qtePrompt) handleQte(intent);

    const progress = state.worldX / C.LEVEL_LENGTH;

    const before = state.player;
    state.player = R.stepPlayer(state.player, dt, intent);
    if (before.onGround && !state.player.onGround) root.Audio2.sfx("jump");
    if (!before.sliding && state.player.sliding) root.Audio2.sfx("slide");

    state.prevWorldX = state.worldX;
    state.worldX += R.effectiveSpeed(progress, state.player.stumbleT) * dt;

    // Legs cycle faster the faster she runs, so the run never looks like it is
    // sliding along the ground.
    state.phase += dt * (6 + R.speedAt(progress) / 60);

    resolveEntities();

    if (state.scene === "finalChase") {
      // Reel him in one prompt at a time, so the catch lands exactly on the
      // last input rather than at an arbitrary distance.
      const done = state.qte.index / R.QTE_SEQUENCE.length;
      state.thiefScreenX = C.PLAYER_X + state.qteGapStart * (1 - done);
    } else {
      // The thief's lead shrinks with progress, and a stumble hands some back.
      // gapBonus decays so a trip costs ground temporarily, not permanently.
      state.thiefScreenX = C.PLAYER_X + R.gapAt(progress) + state.gapBonus;
      if (state.gapBonus > 0) state.gapBonus = Math.max(0, state.gapBonus - dt * 22);
    }

    for (const i of R.checkpointsCrossed(state.prevWorldX, state.worldX, state.checkpointXs)) {
      state.taunt = TAUNTS[i];
      state.tauntT = TAUNT_TIME;
    }

    if (state.scene === "run" && state.worldX / C.LEVEL_LENGTH >= C.FINAL_CHASE_AT) {
      state.scene = "finalChase";
      state.taunt = "FINAL CHASE";
      state.tauntT = 1.8;
      state.qte = R.newQte();
      state.qtePrompt = R.QTE_SEQUENCE[0];
      state.qteGapStart = state.thiefScreenX - C.PLAYER_X;
      root.Audio2.setTempoMultiplier(1.35);
    }

    if (state.tauntT > 0) {
      state.tauntT -= dt;
      if (state.tauntT <= 0) state.taunt = null;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
    if (state.heartFlash > 0) state.heartFlash = Math.max(0, state.heartFlash - dt);
    if (state.qteFlash > 0) state.qteFlash = Math.max(0, state.qteFlash - dt);

    // Last thing, after every other read of intent: this is what makes the QTE
    // see one action per press instead of one per frame held.
    state.prevSlideHeld = intent.slideHeld;
  }

  function frame(now) {
    if (!last) last = now;
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    acc += elapsed;

    // Input is consumed once per frame and applied to the first physics step,
    // so one press is exactly one action. It is consumed even while paused,
    // which drains presses made during the cutscene instead of queueing them.
    let intent = root.Input.consume();
    const running = state.scene === "run" || state.scene === "finalChase";
    while (acc >= STEP) {
      if (running) update(STEP, intent);
      /*
       * Only the first physics step of a frame gets the press, so one press is
       * one jump. slideHeld is carried through every step, because a held button
       * is still held for the whole frame.
       */
      intent = { jump: false, slideHeld: intent.slideHeld };
      acc -= STEP;
    }

    root.Render.drawWorld(ctx, state);
    root.Render.drawHud(ctx, state);
    window.requestAnimationFrame(frame);
  }

  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", function () {
    muteBtn.innerHTML = root.Audio2.toggleMute() ? "&#128263;" : "&#128266;";
  });

  root.Game = { state: state, Rules: R };

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

  window.requestAnimationFrame(frame);
})(typeof globalThis !== "undefined" ? globalThis : this);
