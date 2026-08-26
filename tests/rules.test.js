const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../chapters/02-bring-m-home/game/rules.js");
const C = R.C;

const NO_INTENT = { mx: 0, my: 0, aimX: 1, aimY: 0, shoot: false };

function runFrames(p, n, intent, cover, dt) {
  let s = p;
  for (let i = 0; i < n; i++) s = R.stepPlayer(s, dt || 1 / 120, intent || NO_INTENT, cover || []);
  return s;
}

function mid() {
  return R.newPlayer(C.CORRIDOR_W / 2, 0);
}

// ------------------------------------------------------------------- movement

test("a new player is still, unstaggered and able to fire", () => {
  const p = mid();
  assert.equal(p.vx, 0);
  assert.equal(p.vy, 0);
  assert.equal(p.staggerT, 0);
  assert.equal(R.canFire(p), true);
});

test("stepPlayer does not mutate its input", () => {
  const p = mid();
  const copy = JSON.parse(JSON.stringify(p));
  R.stepPlayer(p, 1 / 120, { mx: 1, my: 1, aimX: 0, aimY: 1, shoot: true }, []);
  assert.deepEqual(p, copy);
});

test("a diagonal is not faster than a cardinal", () => {
  const straight = runFrames(mid(), 240, { mx: 0, my: 1, aimX: 1, aimY: 0 });
  const diagonal = runFrames(mid(), 240, { mx: 1, my: 1, aimX: 1, aimY: 0 });
  const a = Math.hypot(straight.vx, straight.vy);
  const b = Math.hypot(diagonal.vx, diagonal.vy);
  assert.ok(Math.abs(a - b) < 0.5, `cardinal ${a} vs diagonal ${b} must match`);
});

test("a half-pushed stick walks at less than full speed", () => {
  const full = runFrames(mid(), 240, { mx: 0, my: 1, aimX: 1, aimY: 0 });
  const half = runFrames(mid(), 240, { mx: 0, my: 0.5, aimX: 1, aimY: 0 });
  assert.ok(Math.hypot(half.vx, half.vy) < Math.hypot(full.vx, full.vy) * 0.75);
});

test("top speed is capped at MOVE_MAX however long she runs", () => {
  const p = runFrames(mid(), 1200, { mx: 1, my: 1, aimX: 1, aimY: 0 });
  assert.ok(Math.hypot(p.vx, p.vy) <= C.MOVE_MAX + 1e-6);
});

test("she cannot walk into the corridor walls", () => {
  const left = runFrames(mid(), 600, { mx: -1, my: 0, aimX: 1, aimY: 0 });
  const right = runFrames(mid(), 600, { mx: 1, my: 0, aimX: 1, aimY: 0 });
  assert.ok(left.x >= R.corridorMinX() - 1e-6, `${left.x} must stay inside`);
  assert.ok(right.x <= R.corridorMaxX() + 1e-6, `${right.x} must stay inside`);
});

test("letting go brings her to a stop", () => {
  const moving = runFrames(mid(), 240, { mx: 0, my: 1, aimX: 1, aimY: 0 });
  const stopped = runFrames(moving, 240, NO_INTENT);
  assert.ok(Math.hypot(stopped.vx, stopped.vy) < 1, "drag must settle her");
});

test("aim is normalised and survives a frame with no aim input", () => {
  const p = R.stepPlayer(mid(), 1 / 120, { mx: 0, my: 0, aimX: 3, aimY: 4 }, []);
  assert.ok(Math.abs(Math.hypot(p.aimX, p.aimY) - 1) < 1e-9);
  const q = R.stepPlayer(p, 1 / 120, { mx: 0, my: 0, aimX: 0, aimY: 0 }, []);
  assert.equal(q.aimX, p.aimX);
  assert.equal(q.aimY, p.aimY);
});

// -------------------------------------------------------------------- getting hit

test("a hit staggers her, makes her invulnerable and shoves her away", () => {
  const p = mid();
  const hit = R.applyHit(p, p.x, p.y - 20);   // enemy below her
  assert.equal(hit.staggerT, C.STAGGER_TIME);
  assert.equal(hit.invulnT, C.INVULN_TIME);
  assert.ok(hit.vy > 0, "knockback must push away from the enemy");
});

test("invulnerability means one enemy cannot hit twice in a row", () => {
  const p = mid();
  const first = R.applyHit(p, p.x + 20, p.y);
  const second = R.applyHit(first, p.x + 20, p.y);
  assert.equal(second, first, "a second hit inside invuln must be the same object");
});

test("invulnerability outlasts the stagger, so recovery is never a free hit", () => {
  assert.ok(C.INVULN_TIME > C.STAGGER_TIME);
});

test("movement input is ignored while staggering, but knockback still carries", () => {
  const staggered = Object.assign({}, mid(), { staggerT: C.STAGGER_TIME, vx: 0, vy: 0 });
  const pushed = R.stepPlayer(staggered, 1 / 120, { mx: 1, my: 0, aimX: 1, aimY: 0 }, []);
  assert.equal(pushed.vx, 0, "she gets no thrust while staggered");

  const flung = Object.assign({}, mid(), { staggerT: C.STAGGER_TIME, vx: 200, vy: 0 });
  assert.ok(R.stepPlayer(flung, 1 / 120, NO_INTENT, []).x > flung.x, "velocity still applies");
});

test("she cannot fire while staggered, and the cooldown expires on its own", () => {
  const staggered = Object.assign({}, mid(), { staggerT: C.STAGGER_TIME });
  assert.equal(R.canFire(staggered), false);
  const cooling = Object.assign({}, mid(), { cooldown: C.FIRE_COOLDOWN });
  assert.equal(R.canFire(cooling), false);
  const recovered = runFrames(cooling, 240, NO_INTENT);
  assert.equal(R.canFire(recovered), true);
});

// ---------------------------------------------------------------------- bullets

test("a bullet leaves from the muzzle, travels along the aim and expires", () => {
  const p = Object.assign({}, mid(), { aimX: 0, aimY: 1 });
  let b = R.newBullet(p);
  assert.ok(b.y > p.y, "spawns ahead of her, not inside her");
  const y0 = b.y;
  for (let i = 0; i < 30; i++) b = R.stepBullet(b, 1 / 120);
  assert.ok(b.y > y0);
  assert.equal(R.bulletAlive(b, []), true);

  let old = R.newBullet(p);
  for (let i = 0; i < 200; i++) old = R.stepBullet(old, 1 / 120);
  assert.equal(R.bulletAlive(old, []), false, "must die after BULLET_LIFE");
});

test("cover stops bullets", () => {
  const b = { x: 400, y: 400, vx: 0, vy: 1, life: 1 };
  const desk = { x: 350, y: 350, w: 120, h: 100 };
  assert.equal(R.bulletAlive(b, [desk]), false);
  assert.equal(R.bulletAlive(b, [{ x: 0, y: 0, w: 50, h: 50 }]), true);
});

test("a bullet that leaves the corridor sideways is gone", () => {
  assert.equal(R.bulletAlive({ x: -5, y: 100, vx: 0, vy: 0, life: 1 }, []), false);
  assert.equal(R.bulletAlive({ x: C.CORRIDOR_W + 5, y: 100, vx: 0, vy: 0, life: 1 }, []), false);
});

// ---------------------------------------------------------------------- geometry

test("segIntersectsRect sees a crossing and ignores a miss", () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 };
  assert.equal(R.segIntersectsRect(0, 150, 300, 150, rect), true, "straight through");
  assert.equal(R.segIntersectsRect(0, 50, 300, 50, rect), false, "passes above");
  assert.equal(R.segIntersectsRect(150, 0, 150, 300, rect), true, "vertical through");
  assert.equal(R.segIntersectsRect(0, 0, 40, 40, rect), false, "stops short");
});

test("resolveCircleRect pushes a circle out and reports a clean miss as null", () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 };
  assert.equal(R.resolveCircleRect(400, 400, 16, rect), null);

  const out = R.resolveCircleRect(95, 150, 16, rect);
  assert.ok(out && out.x < 100 - 15.9, "pushed clear of the left edge");

  // Dead centre: must still come out, by the nearest wall.
  const inside = R.resolveCircleRect(150, 190, 16, rect);
  assert.ok(inside && inside.y > 200, "leaves by the bottom, which is nearest");
});

test("resolveCover cannot leave her inside any of the boxes", () => {
  const boxes = [
    { x: 100, y: 100, w: 120, h: 60 },
    { x: 180, y: 130, w: 120, h: 60 },
  ];
  const out = R.resolveCover(190, 145, C.PLAYER_R, boxes);
  for (const b of boxes) {
    assert.equal(R.resolveCircleRect(out.x, out.y, C.PLAYER_R, b), null, "clear of " + JSON.stringify(b));
  }
});

test("cover is solid: she cannot walk through a desk", () => {
  const desk = { x: 0, y: 300, w: C.CORRIDOR_W, h: 80 };
  const p = runFrames(R.newPlayer(C.CORRIDOR_W / 2, 200), 900, { mx: 0, my: 1, aimX: 1, aimY: 0 }, [desk]);
  assert.ok(p.y < desk.y, `stopped at ${p.y}, must not pass ${desk.y}`);
});

// ---------------------------------------------------------------------- enemies

test("an enemy hunts her and closes the distance", () => {
  let e = R.newEnemy("paper", 400, 600);
  const px = 400;
  const py = 200;
  const before = Math.hypot(e.x - px, e.y - py);
  for (let i = 0; i < 120; i++) e = R.stepEnemy(e, 1 / 120, px, py, []);
  assert.ok(Math.hypot(e.x - px, e.y - py) < before, "must get closer");
  assert.ok(e.awareT > 0, "and stay aware while it can see her");
});

test("an enemy too far away never notices her", () => {
  const e = R.newEnemy("paper", 400, 400);
  assert.equal(R.enemySees(e, 400, 400 + C.AGGRO_R + 50, []), false);
  assert.equal(R.enemySees(e, 400, 400 + C.AGGRO_R - 50, []), true);
});

test("a desk between them breaks line of sight", () => {
  const e = R.newEnemy("shadow", 400, 600);
  const desk = { x: 300, y: 380, w: 200, h: 70 };
  assert.equal(R.enemySees(e, 400, 200, []), true, "clear line");
  assert.equal(R.enemySees(e, 400, 200, [desk]), false, "blocked by the desk");
});

test("she can break away: awareness lapses after LOSE_SIGHT_TIME behind cover", () => {
  const desk = { x: 300, y: 380, w: 200, h: 70 };
  let e = Object.assign(R.newEnemy("shadow", 400, 600), { awareT: C.LOSE_SIGHT_TIME });
  const steps = Math.ceil((C.LOSE_SIGHT_TIME + 0.1) * 120);
  for (let i = 0; i < steps; i++) e = R.stepEnemy(e, 1 / 120, 400, 200, [desk]);
  assert.equal(e.awareT, 0, "gives up and goes back to drifting");
});

test("enemies are stopped by cover and stay inside the corridor", () => {
  const desk = { x: 200, y: 380, w: 400, h: 70 };
  let e = R.newEnemy("paper", 400, 600);
  for (let i = 0; i < 600; i++) e = R.stepEnemy(e, 1 / 120, 400, 200, [desk]);
  assert.equal(R.resolveCircleRect(e.x, e.y, R.enemySpec(e).r, desk), null, "never inside the desk");
  assert.ok(e.x >= C.WALL, "inside the left wall");
  assert.ok(e.x <= C.CORRIDOR_W - C.WALL, "inside the right wall");
});

test("a two-hp enemy takes two shots", () => {
  const shadow = R.newEnemy("shadow", 0, 0);
  assert.equal(shadow.hp, 2);
  const once = R.damageEnemy(shadow);
  assert.equal(once.dead, false);
  assert.equal(R.damageEnemy(once).dead, true);
});

test("a one-hp enemy dies to a single shot", () => {
  assert.equal(R.damageEnemy(R.newEnemy("paper", 0, 0)).dead, true);
});

test("circlesHit is true on overlap and false on a touch", () => {
  assert.equal(R.circlesHit(0, 0, 10, 15, 0, 10), true);
  assert.equal(R.circlesHit(0, 0, 10, 20, 0, 10), false, "exactly touching is not a hit");
});

// ----------------------------------------------------------------------- vision

test("every memory makes the world brighter, and none makes it darker", () => {
  const base = 150;
  let prev = -Infinity;
  for (let m = 0; m <= C.MEMORIES_TOTAL; m++) {
    const r = R.visionRadius(base, m, 0);
    assert.ok(r > prev, `memory ${m} must not shrink vision (${r} after ${prev})`);
    prev = r;
  }
});

test("zone 3 is finishable with zero memories: vision never drops below the floor", () => {
  const darkest = R.visionRadius(150, 0, C.VISION_DIM_TIME);
  assert.ok(darkest >= C.VISION_FLOOR, `${darkest} must respect the floor`);
  assert.ok(darkest >= C.PLAYER_R * 4, "and still show more than her own body");
});

test("being hit dims the light, temporarily", () => {
  const lit = R.visionRadius(760, 6, 0);
  const dim = R.visionRadius(760, 6, 1.2);
  assert.ok(dim < lit);
  assert.equal(R.visionRadius(760, 6, 0), lit, "and comes back when the timer runs out");
});

test("all memories are a visible upgrade in the dark zone", () => {
  const none = R.visionRadius(150, 0, 0);
  const all = R.visionRadius(150, C.MEMORIES_TOTAL, 0);
  assert.ok(all > none * 1.7, `${none} -> ${all} should be a real difference`);
});

// ------------------------------------------------------------------- the heal

test("the heal starts at 8% and ends at exactly 100%", () => {
  assert.equal(R.healState(0).percent, C.M_START_HP);
  assert.equal(R.HEAL_STEPS[0], C.M_START_HP);
  assert.equal(R.healState(R.healFullTime()).percent, 100);
  assert.equal(R.healState(R.healFullTime()).done, true);
});

test("the heal passes through every one of the seven numbers, in order", () => {
  const seen = [];
  for (let t = 0; t <= R.healFullTime() + 0.5; t += 1 / 120) {
    const p = R.healState(t).percent;
    if (seen[seen.length - 1] !== p) seen.push(p);
  }
  assert.deepEqual(seen, R.HEAL_STEPS);
});

test("holding longer than needed cannot push it past 100", () => {
  assert.equal(R.healState(9999).percent, 100);
  assert.equal(R.healState(9999).fill, 1);
});

test("the ring fill only ever sweeps forward", () => {
  let prev = -1;
  for (let t = 0; t <= R.healFullTime(); t += 1 / 120) {
    const f = R.healState(t).fill;
    assert.ok(f >= prev, `fill went backwards at ${t}`);
    prev = f;
  }
});

test("each line is pinned to a percentage, and the last one is the goodbye", () => {
  const lines = [];
  for (let i = 0; i < R.HEAL_STEPS.length; i++) {
    const line = R.healState(i * C.HEAL_STEP_TIME + 0.01).line;
    if (line) lines.push(line);
  }
  assert.deepEqual(lines, [
    "ขอบคุณนะที่เดินเข้ามาในชีวิต",
    "ถึงระหว่างทางจะไม่ง่ายเลย",
    "แต่เราก็ยังจับมือผ่านมันมาด้วยกัน",
    "ขอโทษสำหรับบางครั้งที่ทำตัวไม่น่ารัก",
    "ขอบคุณที่ยังอยู่ข้างกันเสมอ",
    "จนวันนี้ทุกอย่างค่อย ๆ ดีขึ้น",
    "จากนี้ก็ไปด้วยกันต่ออีกนาน ๆ นะ",
  ]);
  assert.equal(R.healState(R.healFullTime()).line, "จากนี้ก็ไปด้วยกันต่ออีกนาน ๆ นะ");
});

test("the heal is long enough to be a decision, not a button press", () => {
  assert.ok(R.healFullTime() >= 6, `${R.healFullTime()}s`);
});

// ------------------------------------------------------------- colour return

test("colour comes back from nothing to everything, and stops there", () => {
  assert.equal(R.colourAt(0), 0);
  assert.equal(R.colourAt(C.COLOUR_RETURN_TIME), 1);
  assert.equal(R.colourAt(C.COLOUR_RETURN_TIME * 10), 1);
  assert.ok(R.colourAt(C.COLOUR_RETURN_TIME / 2) > 0.4);
});

test("mixHex interpolates and returns the ends untouched", () => {
  assert.equal(R.mixHex("#000000", "#ffffff", 0), "#000000");
  assert.equal(R.mixHex("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(R.mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(R.mixHex("#131319", "#ffffff", 0), "#131319");
});

test("mixHex clamps out-of-range t instead of producing nonsense", () => {
  assert.equal(R.mixHex("#000000", "#ffffff", -3), "#000000");
  assert.equal(R.mixHex("#000000", "#ffffff", 7), "#ffffff");
});

test("paletteAt blends every key of a palette pair", () => {
  const pair = {
    cold: { floor: "#000000", ink: "#101010" },
    warm: { floor: "#ffffff", ink: "#303030" },
  };
  const cold = R.paletteAt(pair, 0);
  assert.deepEqual(cold, pair.cold);
  assert.deepEqual(R.paletteAt(pair, 1), pair.warm);
  assert.equal(R.paletteAt(pair, 0.5).ink, "#202020");
});
