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

test("entitiesInWindow returns only what is inside the window", () => {
  const es = [{ x: 10, kind: "jump" }, { x: 200, kind: "slide" }, { x: 5000, kind: "jump" }];
  assert.deepEqual(L.entitiesInWindow(es, 0, 300).map((e) => e.x), [10, 200]);
  assert.deepEqual(L.entitiesInWindow(es, 300, 6000).map((e) => e.x), [5000]);
  assert.deepEqual(L.entitiesInWindow(es, 6000, 7000), []);
});
