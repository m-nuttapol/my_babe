/*
 * All three zones, built deterministically.
 *
 * Deterministic on purpose, exactly like the old chapter's level.js: a seeded
 * generator means every run produces the identical corridor, so "are all
 * fourteen memories actually reachable" and "does a desk ever wall off the exit"
 * are unit tests instead of things you find out ninety seconds in.
 *
 * A zone is data only. Nothing here knows how any of it is drawn.
 */
(function (root, factory) {
  const Rules = typeof module !== "undefined" && module.exports
    ? require("./rules.js")
    : root.Rules;
  const api = factory(Rules);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Zones = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Rules) {
  "use strict";

  const C = Rules.C;

  /* Enemies appear this far ahead of her — just off the top of the screen, so
     they walk into view rather than materialising in it. */
  const SPAWN_AHEAD = 520;

  /* No enemy is ever placed within this much of the entrance. The first thing a
     zone does is let her look at it. */
  const SAFE_ENTRY = 900;

  /* The last stretch before the exit is kept clear of cover, so the way out is
     never something you have to find. */
  const EXIT_CLEAR = 300;

  const ICONS = ["\u{1F4F7}", "☕", "\u{1F431}", "\u{1F3AB}", "\u{1F48C}"];

  const MEMORY_R = 16;

  /* Tiny LCG. Deterministic, no dependency, and Math.random is unusable here for
     the same reason it was unusable in the runner. */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /*
   * Per-zone authored constants. `base` is the vision radius before memories:
   * Zone 3 closes in around self-expectation.
   *
   * `quiet` are fractions of the zone's length that get no enemy waves at all.
   * Zone 2's two quiet stretches are the rooms the brief asks for — the ones you
   * can cross behind the desks without firing a shot.
   */
  const SPECS = [
    {
      key: "responsibility",
      title: "ZONE 1 — ความรับผิดชอบ",
      subtitle: "เรื่องที่วางไม่ลง",
      length: 3600,
      base: 1000,
      memories: 5,
      kinds: ["paper", "number", "shadow"],
      coverEvery: 520,
      walkLeft: 330,
      walkRight: 560,
      quiet: [],
      signKind: null,
      signText: [],
      voices: [],
      palette: {
        cold: { floor: "#0c1218", wall: "#141c24", prop: "#202a32", ink: "#77766d", accent: "#b8883d", enemy: "#777568" },
        warm: { floor: "#171a1b", wall: "#252825", prop: "#38372f", ink: "#ead29a", accent: "#f2bd58", enemy: "#c9ad70" },
      },
    },
    {
      key: "comparison",
      title: "ZONE 2 — เสียงรอบตัว",
      subtitle: "สิ่งที่เราเก็บมาคิด",
      length: 3600,
      base: 870,
      memories: 5,
      kinds: ["number", "shadow", "notif"],
      coverEvery: 470,
      walkLeft: 345,
      walkRight: 555,
      quiet: [],
      signKind: null,
      signText: [],
      voices: [],
      palette: {
        cold: { floor: "#0b1021", wall: "#111a31", prop: "#202b49", ink: "#8781b4", accent: "#9e70e8", enemy: "#716a9b" },
        warm: { floor: "#17162b", wall: "#252544", prop: "#39385d", ink: "#ddd2ff", accent: "#bd8cff", enemy: "#afa3d4" },
      },
    },
    {
      key: "work",
      title: "ZONE 3 — ความคาดหวัง",
      subtitle: "เสียงของตัวเองที่ดังขึ้นเรื่อย ๆ",
      length: 3600,
      base: 760,
      memories: 5,
      kinds: ["shadow", "notif", "notif"],
      coverEvery: 430,
      walkLeft: 320,
      walkRight: 590,
      quiet: [[0.30, 0.45], [0.66, 0.79]],
      signKind: null,
      signText: [],
      voices: [
        { at: 0.34, text: "นั่นเสียงใครน่ะ..." },
        { at: 0.62, text: "...เธอมาที่นี่เหรอ" },
        { at: 0.88, text: "...ขอบคุณนะที่เข้ามาถึงตรงนี้" },
      ],
      palette: {
        cold: { floor: "#101318", wall: "#191d24", prop: "#232830", ink: "#78808c", accent: "#4a6a92", enemy: "#7d8797" },
        warm: { floor: "#1b2028", wall: "#2a3340", prop: "#3b4a5c", ink: "#cfe0f0", accent: "#7fb6ef", enemy: "#a9c6e2" },
      },
    },
  ];

  function inAnyRange(t, ranges) {
    for (const r of ranges) {
      if (t >= r[0] && t <= r[1]) return true;
    }
    return false;
  }

  function overlapsAnyRect(x, y, r, rects) {
    for (const rect of rects) {
      if (Rules.resolveCircleRect(x, y, r, rect)) return true;
    }
    return false;
  }

  function buildCover(spec, rand) {
    const rects = [];
    const minX = C.WALL + 30;
    const maxX = C.CORRIDOR_W - C.WALL - 30;
    /*
     * Bounding the band start is not enough: a block is jittered down from `y`
     * and then has its own height, so the last band could still put cover inside
     * the exit run-up. Anything that would is dropped outright.
     */
    const limit = spec.length - EXIT_CLEAR;

    for (let y = 700; y < limit; y += spec.coverEvery) {
      // Two to three blocks per band, left-ish and right-ish, so there is always
      // a way through but never a straight sprint.
      const count = 2 + (rand() < 0.4 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const w = 90 + Math.floor(rand() * 150);
        const h = 46 + Math.floor(rand() * 70);
        // Spread the blocks across `count` lanes so two never land on top of
        // each other and seal the corridor.
        const laneW = (maxX - minX) / count;
        const laneX = minX + laneW * i;
        const x = laneX + rand() * Math.max(1, laneW - w);
        const yy = y + rand() * (spec.coverEvery * 0.45);
        if (yy + h > limit) continue;
        rects.push({
          x: Math.min(x, maxX - w),
          y: yy,
          w: w,
          h: h,
        });
      }
    }
    return rects;
  }

  function buildMemories(spec, cover, rand) {
    const out = [];
    const minX = spec.walkLeft + 35;
    const maxX = spec.walkRight - 35;

    for (let i = 0; i < spec.memories; i++) {
      // Evenly spread down the zone, so they are a trail rather than a pile.
      const y = spec.length * ((i + 0.6) / (spec.memories + 0.4));
      let x = minX + rand() * (maxX - minX);
      let placed = { x: x, y: y };

      /*
       * Nudge off any cover it landed inside. A memory you cannot pick up is a
       * memory that silently costs her vision for the whole rest of the run, so
       * this walks it out rather than hoping.
       */
      for (let tries = 0; tries < 24 && overlapsAnyRect(placed.x, placed.y, MEMORY_R, cover); tries++) {
        x = minX + rand() * (maxX - minX);
        placed = { x: x, y: y + (rand() - 0.5) * 160 };
      }
      out.push({ x: placed.x, y: placed.y, icon: ICONS[out.length % ICONS.length] });
    }
    return out;
  }

  function buildSpawns(spec, rand) {
    const out = [];
    // Exactly two compact waves per zone, placed between the three end-thoughts.
    // Zone 1's final wave guards the exit itself. It still enters detection
    // range early enough that the player sees the group arrive before the door.
    const waveY = [spec.length - 1550, spec.length - (spec.key === "responsibility" ? 520 : 850)];
    for (const y of waveY) {
      const count = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const kind = spec.kinds[Math.floor(rand() * spec.kinds.length)];
        const r = Rules.ENEMIES[kind].r;
        out.push({
          kind: kind,
          x: spec.walkLeft + r + rand() * (spec.walkRight - spec.walkLeft - 2 * r),
          y: y + i * 52 + rand() * 35,
          driftA: rand() * Math.PI * 2,
        });
      }
    }
    return out;
  }

  function buildSigns(spec, rand) {
    if (!spec.signKind) return [];
    const out = [];
    for (let y = 500; y < spec.length - 200; y += 340 + rand() * 260) {
      const onLeft = rand() < 0.5;
      out.push({
        kind: spec.signKind,
        x: onLeft ? C.WALL + 8 : C.CORRIDOR_W - C.WALL - 8,
        side: onLeft ? -1 : 1,
        y: y,
        text: spec.signText[Math.floor(rand() * spec.signText.length)],
      });
    }
    return out;
  }

  function buildPaintedSceneryCover(spec) {
    // Boundaries sampled from the authored 960px-square backgrounds, top to
    // bottom. Short rectangles form an invisible stepped contour around the
    // painted furniture instead of covering it with one giant wall.
    const profiles = {
      responsibility: {
        left:  [345, 350, 342, 360, 338, 350, 355, 340, 348, 358, 342, 350],
        right: [610, 605, 615, 598, 620, 608, 602, 618, 610, 600, 616, 606],
      },
      comparison: {
        left:  [338, 344, 342, 350, 346, 340, 348, 342, 350, 344, 338, 346],
        right: [612, 606, 610, 602, 608, 614, 606, 612, 604, 610, 616, 608],
      },
      work: {
        left:  [320, 310, 300, 325, 305, 270, 260, 285, 300, 270, 260, 320],
        right: [640, 630, 650, 660, 690, 675, 700, 690, 650, 625, 650, 640],
      },
      outside: {
        left:  [270, 260, 250, 280, 245, 235, 255, 275, 250, 240, 260, 280],
        right: [680, 690, 675, 650, 670, 700, 690, 665, 680, 700, 675, 660],
      },
    };
    const profile = profiles[spec.key];
    const rects = [];
    const bandH = C.CANVAS_W / profile.left.length;
    const anchor = C.CANVAS_H * 0.58;
    const offsetX = (C.CANVAS_W - C.CORRIDOR_W) / 2;

    for (let tile = -1; tile <= Math.ceil(spec.length / C.CANVAS_W) + 1; tile++) {
      for (let i = 0; i < profile.left.length; i++) {
        const worldY = anchor - (i + 1) * bandH + tile * C.CANVAS_W;
        const y = Math.max(0, worldY);
        const bottom = Math.min(spec.length, worldY + bandH + 2);
        if (bottom <= y) continue;
        const leftW = Math.max(0, profile.left[i] - offsetX);
        const rightX = Math.min(C.CORRIDOR_W, profile.right[i] - offsetX);
        rects.push({ x: 0, y: y, w: leftW, h: bottom - y });
        rects.push({ x: rightX, y: y, w: C.CORRIDOR_W - rightX, h: bottom - y });
      }
    }
    return rects;
  }

  function buildZone(index) {
    const spec = SPECS[index];
    // Seed per zone, so editing zone 2 cannot reshuffle zone 1.
    const rand = rng(20260811 + index * 7919);
    const cover = buildPaintedSceneryCover(spec);
    return {
      index: index,
      key: spec.key,
      title: spec.title,
      subtitle: spec.subtitle,
      length: spec.length,
      base: spec.base,
      palette: spec.palette,
      cover: cover,
      memories: buildMemories(spec, cover, rand),
      spawns: buildSpawns(spec, rand),
      signs: buildSigns(spec, rand),
      voices: spec.voices.map(function (v) {
        return { y: v.at * spec.length, text: v.text };
      }),
    };
  }

  function buildAll() {
    return SPECS.map(function (_, i) { return buildZone(i); });
  }

  /* Which spawns have come into range and are not placed yet. */
  function spawnsDue(spawns, playerY, spawnedIdx) {
    const out = [];
    for (let i = 0; i < spawns.length; i++) {
      if (spawnedIdx.has(i)) continue;
      if (spawns[i].y - playerY <= SPAWN_AHEAD) out.push(i);
    }
    return out;
  }

  /* Everything within a vertical band of the camera, for drawing. */
  function inBand(items, y0, y1) {
    return items.filter(function (it) {
      const y = it.y;
      const h = it.h || 0;
      return y + h >= y0 && y <= y1;
    });
  }

  return {
    SPECS: SPECS,
    ICONS: ICONS,
    MEMORY_R: MEMORY_R,
    SPAWN_AHEAD: SPAWN_AHEAD,
    SAFE_ENTRY: SAFE_ENTRY,
    EXIT_CLEAR: EXIT_CLEAR,
    buildZone: buildZone,
    buildAll: buildAll,
    spawnsDue: spawnsDue,
    inBand: inBand,
    rng: rng,
  };
});
