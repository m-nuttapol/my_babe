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
