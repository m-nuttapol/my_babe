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

/*
 * Fairness invariant. Clearing an obstacle is not about whether the jump is tall
 * enough — it is about how many milliseconds she has to press. Both windows are
 * narrowest at the SLOWEST speed, because a shorter travel distance means less
 * room for error, which is the opposite of the intuition.
 */
const MIN_WINDOW_MS = 120;

function jumpWindowMs(speed) {
  const V = -C.JUMP_V;
  const air = (2 * V) / C.GRAVITY;
  const tUp = (V - Math.sqrt(V * V - 2 * C.GRAVITY * C.JUMP_OBS_H)) / C.GRAVITY;
  const half = (C.STAND_W + C.JUMP_OBS_W) / 2;
  const latest = half + tUp * speed;             // leave the ground by here
  const earliest = (air - tUp) * speed - half;   // any earlier and she lands on it
  return ((earliest - latest) / speed) * 1000;
}

function slideWindowMs(speed) {
  const half = (C.SLIDE_W + C.SLIDE_OBS_W) / 2;
  return ((C.SLIDE_DURATION * speed - 2 * half) / speed) * 1000;
}

test("the jump timing window is humane at every speed in the level", () => {
  for (const s of [C.SPEED_START, 320, 380, C.SPEED_END, C.SPEED_FINAL]) {
    const ms = jumpWindowMs(s);
    assert.ok(ms >= MIN_WINDOW_MS, `at ${s}px/s a jump allows only ${ms.toFixed(0)}ms`);
  }
});

test("the slide timing window is humane at every speed in the level", () => {
  for (const s of [C.SPEED_START, 320, 380, C.SPEED_END, C.SPEED_FINAL]) {
    const ms = slideWindowMs(s);
    assert.ok(ms >= MIN_WINDOW_MS, `at ${s}px/s a slide allows only ${ms.toFixed(0)}ms`);
  }
});

test("the tightest window is at the start, where she is still learning", () => {
  assert.ok(jumpWindowMs(C.SPEED_START) < jumpWindowMs(C.SPEED_FINAL));
  assert.ok(slideWindowMs(C.SPEED_START) < slideWindowMs(C.SPEED_FINAL));
});

test("sliding does not sneak her under a ground obstacle", () => {
  const sliding = R.stepPlayer(R.newPlayer(), 1 / 60, { jump: false, slide: true });
  assert.equal(
    R.boxesOverlap(R.playerBox(sliding), R.jumpObstacleBox(C.PLAYER_X)),
    true,
    "a longer slide must not become a way to pass through jump obstacles"
  );
});

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
