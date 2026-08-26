const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../chapters/02-bring-m-home/game/rules.js");
const Z = require("../chapters/02-bring-m-home/game/zones.js");
const C = R.C;

const zones = Z.buildAll();

/*
 * Can she actually get from the entrance to the exit?
 *
 * A flood fill over a grid of standing positions. A cell is walkable if a circle
 * of her radius centred there is clear of every piece of cover and inside the
 * walls. If the fill reaches the exit band, the zone is possible — which is the
 * one property about these corridors that cannot be eyeballed, because the cover
 * is generated.
 */
function walkable(zone, cell) {
  const step = cell || 18;
  const minX = R.corridorMinX();
  const maxX = R.corridorMaxX();
  const cols = Math.max(1, Math.floor((maxX - minX) / step) + 1);
  // ceil, so the last row is at or past the exit rather than one cell short of it.
  const rows = Math.ceil(zone.length / step) + 1;

  function free(cx, cy) {
    const x = minX + cx * step;
    const y = cy * step;
    for (const rect of zone.cover) {
      // Only rects that could possibly reach this cell.
      if (rect.y - C.PLAYER_R > y || rect.y + rect.h + C.PLAYER_R < y) continue;
      if (R.resolveCircleRect(x, y, C.PLAYER_R, rect)) return false;
    }
    return true;
  }

  const seen = new Uint8Array(cols * rows);
  const stack = [];
  for (let cx = 0; cx < cols; cx++) {
    if (free(cx, 0)) { seen[cx] = 1; stack.push([cx, 0]); }
  }
  assert.ok(stack.length > 0, zone.key + ": the entrance itself must be standable");

  let deepest = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cy > deepest) deepest = cy;
    const around = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of around) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const i = ny * cols + nx;
      if (seen[i]) continue;
      if (!free(nx, ny)) continue;
      seen[i] = 1;
      stack.push([nx, ny]);
    }
  }
  return { deepestY: deepest * step, reached: seen, cols: cols, step: step, minX: minX };
}

test("all three zones are active in story order", () => {
  assert.equal(zones.length, 3);
  assert.deepEqual(zones.map((z) => z.key), ["responsibility", "comparison", "work"]);
  assert.deepEqual(zones.map((z) => z.index), [0, 1, 2]);
  assert.equal(zones[0].title, "ZONE 1 — ความรับผิดชอบ");
  assert.equal(zones[1].title, "ZONE 2 — เสียงรอบตัว");
  assert.equal(zones[2].title, "ZONE 3 — ความคาดหวัง");
});

test("building a zone twice gives the identical zone", () => {
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(Z.buildZone(i), Z.buildZone(i), "zone " + i + " must be deterministic");
  }
});

test("every zone is walkable from the entrance all the way to the exit", () => {
  for (const zone of zones) {
    const { deepestY } = walkable(zone);
    assert.ok(
      deepestY >= zone.length,
      zone.key + ": flood fill only reached y=" + Math.round(deepestY) + " of " + zone.length
    );
  }
});

test("the zones add up to the run length the chapter is designed around", () => {
  const total = zones.reduce((n, z) => n + z.length, 0);
  // ~110px/s of real forward progress once she is dodging and shooting.
  const seconds = total / 110;
  assert.ok(seconds > 80 && seconds < 120, `${Math.round(seconds)}s of zones is off target`);
});

// ------------------------------------------------------------------ memories

test("the memories across all three zones come to MEMORIES_TOTAL", () => {
  const total = zones.reduce((n, z) => n + z.memories.length, 0);
  assert.equal(total, C.MEMORIES_TOTAL, "the vision curve is tuned for exactly this many");
});

test("every memory is inside the corridor", () => {
  for (const zone of zones) {
    for (const m of zone.memories) {
      assert.ok(m.x >= C.WALL, zone.key + ": memory at x=" + m.x + " is in the left wall");
      assert.ok(m.x <= C.CORRIDOR_W - C.WALL, zone.key + ": memory at x=" + m.x + " is in the right wall");
      assert.ok(m.y > 0 && m.y < zone.length, zone.key + ": memory at y=" + m.y + " is outside the zone");
    }
  }
});

test("no memory is stuck inside a piece of cover", () => {
  for (const zone of zones) {
    for (const m of zone.memories) {
      for (const rect of zone.cover) {
        assert.equal(
          R.resolveCircleRect(m.x, m.y, Z.MEMORY_R, rect),
          null,
          zone.key + ": memory " + m.icon + " at " + Math.round(m.x) + "," + Math.round(m.y) + " is inside cover"
        );
      }
    }
  }
});

test("every memory sits on a spot she can actually stand on", () => {
  for (const zone of zones) {
    const { reached, cols, step, minX } = walkable(zone);
    for (const m of zone.memories) {
      const cx = Math.round((m.x - minX) / step);
      const cy = Math.round(m.y / step);
      const col = Math.min(cols - 1, Math.max(0, cx));
      assert.equal(
        reached[cy * cols + col],
        1,
        zone.key + ": memory at " + Math.round(m.x) + "," + Math.round(m.y) + " is not reachable"
      );
    }
  }
});

test("memories are spread down each zone rather than clumped", () => {
  for (const zone of zones) {
    const ys = zone.memories.map((m) => m.y).sort((a, b) => a - b);
    assert.ok(ys[0] < zone.length * 0.4, zone.key + ": nothing to find early on");
    assert.ok(ys[ys.length - 1] > zone.length * 0.55, zone.key + ": nothing to find late on");
  }
});

test("memories use the five icons from the brief", () => {
  const used = new Set();
  for (const zone of zones) for (const m of zone.memories) used.add(m.icon);
  for (const icon of used) assert.ok(Z.ICONS.includes(icon), icon + " is not one of the five");
  assert.equal(used.size, Z.ICONS.length, "all five should show up across the run");
});

// -------------------------------------------------------------------- enemies

test("nothing is waiting for her at the entrance of a zone", () => {
  for (const zone of zones) {
    for (const s of zone.spawns) {
      assert.ok(s.y >= Z.SAFE_ENTRY, zone.key + ": a " + s.kind + " spawns at y=" + Math.round(s.y));
    }
  }
});

test("every spawn is a known enemy kind, placed inside the corridor", () => {
  for (const zone of zones) {
    for (const s of zone.spawns) {
      const spec = R.ENEMIES[s.kind];
      assert.ok(spec, zone.key + ": unknown enemy kind " + s.kind);
      assert.ok(s.x >= C.WALL + spec.r - 1e-9, zone.key + ": " + s.kind + " overlaps the left wall");
      assert.ok(s.x <= C.CORRIDOR_W - C.WALL - spec.r + 1e-9, zone.key + ": " + s.kind + " overlaps the right wall");
      assert.ok(s.y < zone.length, zone.key + ": " + s.kind + " spawns past the exit");
    }
  }
});

test("every zone has enemies, and none of them has an unplayable crowd", () => {
  for (const zone of zones) {
    assert.ok(zone.spawns.length >= 4 && zone.spawns.length <= 8, zone.key + ": two normal-sized waves");
  }
});

test("every zone has exactly two separated monster waves", () => {
  for (const zone of zones) {
    const first = zone.spawns.filter((s) => s.y < zone.length - 1200);
    const second = zone.spawns.filter((s) => s.y >= zone.length - 1200);
    assert.ok(first.length >= 2 && first.length <= 4, zone.key + ": first wave");
    assert.ok(second.length >= 2 && second.length <= 4, zone.key + ": second wave");
  }
});

test("each zone fields the enemies it was authored for", () => {
  for (let i = 0; i < zones.length; i++) {
    const allowed = new Set(Z.SPECS[i].kinds);
    for (const s of zones[i].spawns) {
      assert.ok(allowed.has(s.kind), zones[i].key + " should not field a " + s.kind);
    }
  }
});

test("spawnsDue only releases what has come into range, and only once", () => {
  const zone = zones[0];
  const done = new Set();
  const early = Z.spawnsDue(zone.spawns, 0, done);
  assert.equal(early.length, 0, "nothing is due while she is still at the door");

  const deep = Z.spawnsDue(zone.spawns, zone.spawns[0].y - Z.SPAWN_AHEAD, done);
  assert.ok(deep.length > 0, "walking in should release the first wave");
  for (const i of deep) done.add(i);
  assert.deepEqual(Z.spawnsDue(zone.spawns, zone.spawns[0].y - Z.SPAWN_AHEAD, done), [], "and never release it twice");
});

// ----------------------------------------------------------------------- cover

test("painted scenery hitboxes stay inside the world", () => {
  for (const zone of zones) {
    for (const rect of zone.cover) {
      assert.ok(rect.x >= 0, zone.key + ": cover starts outside the world");
      assert.ok(rect.x + rect.w <= C.CORRIDOR_W, zone.key + ": cover leaves the world");
      assert.ok(rect.w > 0 && rect.h > 0, zone.key + ": zero-sized cover");
    }
  }
});

test("the painted scenery leaves a clear central route to the exit", () => {
  for (const zone of zones) {
    const leftEdge = Math.max(...zone.cover.filter((r) => r.x === 0).map((r) => r.w));
    const rightEdge = Math.min(...zone.cover.filter((r) => r.x > 0).map((r) => r.x));
    assert.ok(leftEdge < rightEdge, zone.key + ": needs a central route");
    assert.ok(rightEdge - leftEdge > C.PLAYER_R * 5, zone.key + ": route is too narrow");
  }
});

test("authored scenery margins use stepped contour hitboxes", () => {
  assert.ok(zones.every((z) => z.cover.length > 20));
  assert.equal(C.WALL, 34, "the visible background should not be covered by black wall bands");
});

// ---------------------------------------------------------------- signs, voices

test("blue monitor signs are removed from all active zones", () => {
  for (const zone of zones) {
    assert.equal(zone.signs.length, 0, zone.key + ": should only use neon thought signs");
  }
});

test("M's voice follows her through Zone 3", () => {
  assert.equal(zones[0].voices.length, 0);
  assert.equal(zones[1].voices.length, 0);
  assert.ok(zones[2].voices.length > 0);
  assert.equal(zones[2].voices[0].text, "นั่นเสียงใครน่ะ...", "the first thing she hears");
  for (const zone of zones) {
    for (const v of zone.voices) {
      assert.ok(v.y > 0 && v.y < zone.length, zone.key + ": a voice line lands outside the zone");
    }
  }
});

test("every sign is on one of the two walls", () => {
  for (const zone of zones) {
    for (const s of zone.signs) {
      assert.ok(s.side === -1 || s.side === 1);
      assert.ok(s.y > 0 && s.y < zone.length);
    }
  }
});

// ---------------------------------------------------------------------- vision

test("Zone 3 is darker than Zone 1", () => {
  assert.equal(zones[0].base, 1000);
  assert.equal(zones[1].base, 870);
  assert.equal(zones[2].base, 760);
});

test("every zone has both a cold and a warm palette, keyed the same", () => {
  for (const zone of zones) {
    const cold = Object.keys(zone.palette.cold).sort();
    const warm = Object.keys(zone.palette.warm).sort();
    assert.deepEqual(cold, warm, zone.key + ": palette pair must have matching keys");
    assert.ok(cold.includes("floor") && cold.includes("ink") && cold.includes("enemy"));
    for (const key of cold) {
      assert.match(zone.palette.cold[key], /^#[0-9a-f]{6}$/, zone.key + "." + key);
      assert.match(zone.palette.warm[key], /^#[0-9a-f]{6}$/, zone.key + "." + key);
    }
  }
});

test("the warm palette is genuinely brighter than the cold one", () => {
  function luma(hex) {
    return parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  }
  for (const zone of zones) {
    for (const key of Object.keys(zone.palette.cold)) {
      assert.ok(
        luma(zone.palette.warm[key]) > luma(zone.palette.cold[key]),
        zone.key + "." + key + " must lift when the colour comes back"
      );
    }
  }
});

// ------------------------------------------------------------------- drawing

test("inBand returns what the camera can see and drops what it cannot", () => {
  const items = [{ y: 0, h: 10 }, { y: 500 }, { y: 1200, h: 40 }];
  assert.deepEqual(Z.inBand(items, 400, 900), [{ y: 500 }]);
  assert.equal(Z.inBand(items, 0, 2000).length, 3);
  assert.equal(Z.inBand(items, 5000, 6000).length, 0);
});
