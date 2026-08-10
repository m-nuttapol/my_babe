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
