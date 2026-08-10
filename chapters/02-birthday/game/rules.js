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
    /*
     * 0.75s, not the 0.5s originally specced. At the level's opening speed of
     * 260px/s a 0.5s slide covers 130px against a 112px collision zone, leaving
     * a 69ms window to press — tighter than the jump's and tighter than human
     * timing. 0.75s gives ~320ms there. See the timing-window test.
     */
    SLIDE_DURATION: 0.75,

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

  const QTE_SEQUENCE = ["jump", "jump", "slide", "jump"];

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

  return {
    C: C,
    newPlayer: newPlayer,
    stepPlayer: stepPlayer,
    playerBox: playerBox,
    boxesOverlap: boxesOverlap,
    jumpObstacleBox: jumpObstacleBox,
    slideObstacleBox: slideObstacleBox,
    collectibleBox: collectibleBox,
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
  };
});
