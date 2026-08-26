/*
 * Pure rules for BRING M HOME: constants, top-down movement, bullets, enemies,
 * geometry, the vision curve, the heal ramp and the colour return.
 *
 * No DOM, no canvas, no audio — so Node can require it and every number that
 * decides whether the game is fair or even finishable is a unit test rather
 * than something you discover on the fourth playthrough.
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

    /*
     * The world is a vertical corridor. worldY grows FORWARD (deeper into the
     * zone) and is drawn upward on screen, so "walk up" and "make progress" are
     * the same gesture. worldX is the full corridor width; the camera only ever
     * scrolls vertically, which is why there is no horizontal camera maths
     * anywhere in render.js.
     */
    CORRIDOR_W: 900,
    WALL: 34,

    PLAYER_R: 16,
    MOVE_ACCEL: 1500,
    MOVE_MAX: 205,
    /*
     * Exponential drag rather than a flat friction, so releasing the keys
     * decelerates smoothly at any speed. Higher = stickier stop.
     */
    MOVE_DRAG: 9,

    /*
     * Getting hit is the only punishment in the game, and it is deliberately not
     * a punishment you can lose to. She staggers, gets shoved, and her light
     * dims — nothing more. INVULN is longer than STAGGER so one enemy sitting on
     * top of her cannot chain-hit through the recovery.
     */
    STAGGER_TIME: 0.45,
    INVULN_TIME: 0.9,
    KNOCKBACK: 280,
    SHAKE_ON_HIT: 16,

    BULLET_SPEED: 640,
    BULLET_LIFE: 1.05,
    BULLET_R: 5,
    FIRE_COOLDOWN: 0.16,
    HEART_WAVE_COOLDOWN: 0.58,

    /*
     * Enemies chase inside AGGRO_R while they can see her, and keep chasing for
     * LOSE_SIGHT_TIME after the line of sight breaks. That grace is what makes a
     * desk feel like cover instead of an on/off switch: duck behind one and they
     * press at it for a beat before losing interest and drifting.
     */
    AGGRO_R: 620,
    LOSE_SIGHT_TIME: 1.2,
    DRIFT_SPEED: 34,

    /*
     * Vision. Each zone starts from its own base radius and every ❤️ MEMORY adds
     * MEMORY_LIGHT to it, permanently, for the rest of the run.
     *
     * VISION_FLOOR is the promise that the game stays finishable: even in Zone 3
     * with zero memories collected and freshly hit, the lit circle never shrinks
     * below this. Without the floor, "collect nothing" would be a soft lose
     * state, and this game does not have those.
     */
    MEMORY_LIGHT: 22,
    VISION_FLOOR: 120,
    VISION_DIM_TIME: 1.5,
    VISION_DIM_MULT: 0.62,
    MEMORIES_TOTAL: 15,

    /* The room at the end. */
    M_START_HP: 8,
    /*
     * 1.25s per step, seven steps, so a full heal is 7.5s of holding. Long
     * enough to stop being a button press and start being a decision to stay.
     */
    HEAL_STEP_TIME: 1.25,
    COLOUR_RETURN_TIME: 3.2,

    /* The walk home replays each zone at this fraction of its length. */
    RETURN_SCALE: 0.3,
  };

  /* Exactly the numbers from the brief, in order. The last one is the end. */
  const HEAL_STEPS = [8, 21, 36, 52, 71, 89, 100];

  /*
   * One line surfaces as she passes certain steps. Keyed by step index, so the
   * words are pinned to the percentages rather than to a wall-clock timer.
   */
  const HEAL_LINES = {
    0: "ขอบคุณนะ",
    3: "ที่ตามหาเราจนเจอ",
    6: "กลับบ้านกันนะ",
  };

  /*
   * Enemy archetypes. hp above 1 exists so Zone 2 and 3 do not feel like Zone 1
   * with a new coat of paint — a shadow takes two hits, so backing away while
   * firing becomes a thing you do.
   */
  const ENEMIES = {
    paper:  { speed: 95,  r: 20, hp: 1, glyph: "paper"  },
    number: { speed: 132, r: 15, hp: 1, glyph: "number" },
    shadow: { speed: 80,  r: 24, hp: 2, glyph: "shadow" },
    notif:  { speed: 145, r: 16, hp: 1, glyph: "notif"  },
    shape:  { speed: 105, r: 22, hp: 2, glyph: "shape"  },
  };

  // ---------------------------------------------------------------- geometry

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function corridorMinX() {
    return C.WALL + C.PLAYER_R;
  }

  function corridorMaxX() {
    return C.CORRIDOR_W - C.WALL - C.PLAYER_R;
  }

  function circlesHit(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const rr = ar + br;
    return dx * dx + dy * dy < rr * rr;
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  /*
   * Segment vs axis-aligned box, by the slab method. Used for line of sight and
   * for stopping bullets at cover, which are the same question asked twice.
   */
  function segIntersectsRect(x0, y0, x1, y1, rect) {
    const d = [x1 - x0, y1 - y0];
    const p = [x0, y0];
    const lo = [rect.x, rect.y];
    const hi = [rect.x + rect.w, rect.y + rect.h];
    let t0 = 0;
    let t1 = 1;

    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        // Parallel to this slab: either inside it for the whole segment or never.
        if (p[i] < lo[i] || p[i] > hi[i]) return false;
        continue;
      }
      let a = (lo[i] - p[i]) / d[i];
      let b = (hi[i] - p[i]) / d[i];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return false;
    }
    return true;
  }

  function segBlocked(x0, y0, x1, y1, rects) {
    for (const r of rects) {
      if (segIntersectsRect(x0, y0, x1, y1, r)) return true;
    }
    return false;
  }

  /*
   * Push a circle out of a box, returning the corrected centre or null if it was
   * never overlapping. Cover is solid for her AND for enemies, which is what
   * buys line-of-sight cover without a single line of pathfinding: a shadow
   * presses against the desk, cannot see her, and gives up.
   */
  function resolveCircleRect(x, y, r, rect) {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;

    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      return { x: nx + (dx / d) * r, y: ny + (dy / d) * r };
    }

    // Dead centre inside the box: leave by the nearest wall.
    const left = x - rect.x;
    const right = rect.x + rect.w - x;
    const top = y - rect.y;
    const bottom = rect.y + rect.h - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rect.x - r, y: y };
    if (m === right) return { x: rect.x + rect.w + r, y: y };
    if (m === top) return { x: x, y: rect.y - r };
    return { x: x, y: rect.y + rect.h + r };
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i];
      const b = points[j];
      if (((a.y > y) !== (b.y > y)) &&
          x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  function closestPointOnPolygon(x, y, points) {
    let best = { x: points[0].x, y: points[0].y };
    let bestD2 = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t = len2 > 0 ? clamp(((x - a.x) * abx + (y - a.y) * aby) / len2, 0, 1) : 0;
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = { x: px, y: py }; }
    }
    return best;
  }

  function resolveCover(x, y, r, rects) {
    let cx = x;
    let cy = y;
    for (const rect of rects) {
      let out = null;
      // Walkable polygons are permissions, not solid objects. stepPlayer tests
      // candidate foot positions against them before resolving solid cover.
      if (rect.walkablePolygon) continue;
      if (rect.ellipse) {
        // Pedestal footprint: collide her circular feet against an expanded
        // ellipse, not against the transparent bounds of the artwork.
        const ax = rect.rx + r;
        const ay = rect.ry + r;
        const dx = cx - rect.x;
        const dy = cy - rect.y;
        const q = (dx * dx) / (ax * ax) + (dy * dy) / (ay * ay);
        if (q < 1) {
          if (Math.abs(dx) + Math.abs(dy) < 1e-7) {
            out = { x: rect.x, y: rect.y - ay };
          } else {
            const scale = 1 / Math.sqrt(q);
            out = { x: rect.x + dx * scale, y: rect.y + dy * scale };
          }
        }
      } else {
        out = resolveCircleRect(cx, cy, r, rect);
      }
      if (out) { cx = out.x; cy = out.y; }
    }
    return { x: cx, y: cy };
  }

  // ------------------------------------------------------------------ player

  function newPlayer(x, y) {
    return {
      x: x, y: y, vx: 0, vy: 0,
      staggerT: 0, invulnT: 0, cooldown: 0,
      aimX: 1, aimY: 0,
    };
  }

  /*
   * intent: { mx, my, aimX, aimY, shoot }
   *   mx/my  desired direction, any magnitude — normalised here so keyboard
   *          diagonals are not faster than cardinals, and so a half-pushed
   *          thumbstick walks at half speed.
   *   aimX/Y unit vector she is pointing.
   *
   * Movement input is ignored while staggering: that is the whole cost of a hit.
   * Velocity is not, so the knockback still carries her.
   */
  function stepPlayer(p, dt, intent, cover, freeRoomX) {
    const n = {
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      staggerT: p.staggerT, invulnT: p.invulnT, cooldown: p.cooldown,
      aimX: p.aimX, aimY: p.aimY,
    };

    if (intent) {
      const len = Math.hypot(intent.mx || 0, intent.my || 0);
      if (len > 1e-6 && n.staggerT <= 0) {
        const scale = Math.min(1, len) / len;
        n.vx += (intent.mx * scale) * C.MOVE_ACCEL * dt;
        n.vy += (intent.my * scale) * C.MOVE_ACCEL * dt;
      }
      const alen = Math.hypot(intent.aimX || 0, intent.aimY || 0);
      if (alen > 1e-6) {
        n.aimX = intent.aimX / alen;
        n.aimY = intent.aimY / alen;
      }
    }

    // Drag, then clamp. Clamping after drag means the cap is a cap on the
    // result, not something drag can sneak past on a long frame.
    const drag = Math.exp(-C.MOVE_DRAG * dt);
    n.vx *= drag;
    n.vy *= drag;
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > C.MOVE_MAX) {
      n.vx = (n.vx / speed) * C.MOVE_MAX;
      n.vy = (n.vy / speed) * C.MOVE_MAX;
    }

    const oldX = n.x;
    const oldY = n.y;
    const candidateX = n.x + n.vx * dt;
    const candidateY = n.y + n.vy * dt;
    const walkable = cover && cover.find(function (shape) { return shape.walkablePolygon; });

    if (!walkable || pointInPolygon(candidateX, candidateY, walkable.points)) {
      n.x = candidateX;
      n.y = candidateY;
    } else {
      // Reject positions outside the authored floor. Try each axis separately
      // so her feet slide naturally along irregular walls instead of snapping
      // to a random closest edge or becoming stuck at a corner.
      const canMoveX = pointInPolygon(candidateX, oldY, walkable.points);
      const canMoveY = pointInPolygon(oldX, candidateY, walkable.points);
      n.x = canMoveX ? candidateX : oldX;
      n.y = canMoveY ? candidateY : oldY;
      if (!canMoveX) n.vx = 0;
      if (!canMoveY) n.vy = 0;
    }

    if (cover && cover.length) {
      const out = resolveCover(n.x, n.y, C.PLAYER_R, cover);
      n.x = out.x;
      n.y = out.y;
    }
    // Normal zones use the narrow global corridor. Dedicated rooms provide
    // their own visible wall colliders and must not inherit this invisible
    // corridor clamp.
    if (!freeRoomX) n.x = clamp(n.x, corridorMinX(), corridorMaxX());

    if (n.staggerT > 0) n.staggerT = Math.max(0, n.staggerT - dt);
    if (n.invulnT > 0) n.invulnT = Math.max(0, n.invulnT - dt);
    if (n.cooldown > 0) n.cooldown = Math.max(0, n.cooldown - dt);

    return n;
  }

  function canFire(p) {
    return p.cooldown <= 0 && p.staggerT <= 0;
  }

  function newBullet(p) {
    return {
      x: p.x + p.aimX * (C.PLAYER_R + 6),
      y: p.y + p.aimY * (C.PLAYER_R + 6),
      vx: p.aimX * C.BULLET_SPEED,
      vy: p.aimY * C.BULLET_SPEED,
      life: C.BULLET_LIFE,
    };
  }

  function stepBullet(b, dt) {
    return {
      x: b.x + b.vx * dt,
      y: b.y + b.vy * dt,
      vx: b.vx, vy: b.vy,
      life: b.life - dt,
    };
  }

  function bulletAlive(b, cover) {
    if (b.life <= 0) return false;
    if (b.x < 0 || b.x > C.CORRIDOR_W) return false;
    if (cover) {
      for (const rect of cover) {
        if (pointInRect(b.x, b.y, rect)) return false;
      }
    }
    return true;
  }

  /*
   * A hit. Returns a new player, or the same one if she is still invulnerable
   * from the last one — callers use identity to decide whether to shake the
   * screen and dim the light.
   */
  function applyHit(p, fromX, fromY) {
    if (p.invulnT > 0) return p;
    let dx = p.x - fromX;
    let dy = p.y - fromY;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    return Object.assign({}, p, {
      vx: dx * C.KNOCKBACK,
      vy: dy * C.KNOCKBACK,
      staggerT: C.STAGGER_TIME,
      invulnT: C.INVULN_TIME,
    });
  }

  // ----------------------------------------------------------------- enemies

  function newEnemy(kind, x, y) {
    const spec = ENEMIES[kind];
    return {
      kind: kind, x: x, y: y,
      hp: spec.hp,
      awareT: 0,       // counts down; > 0 means still hunting
      /* Drift heading, so an unaware enemy wanders instead of standing still. */
      driftA: 0,
      dead: false,
    };
  }

  function enemySpec(e) {
    return ENEMIES[e.kind];
  }

  function enemySees(e, px, py, cover) {
    const spec = ENEMIES[e.kind];
    const dx = px - e.x;
    const dy = py - e.y;
    if (dx * dx + dy * dy > C.AGGRO_R * C.AGGRO_R) return false;
    void spec;
    return !segBlocked(e.x, e.y, px, py, cover || []);
  }

  function stepEnemy(e, dt, px, py, cover) {
    const spec = ENEMIES[e.kind];
    const n = {
      kind: e.kind, x: e.x, y: e.y, hp: e.hp,
      awareT: e.awareT, driftA: e.driftA, dead: e.dead,
    };

    if (enemySees(n, px, py, cover)) n.awareT = C.LOSE_SIGHT_TIME;
    else if (n.awareT > 0) n.awareT = Math.max(0, n.awareT - dt);

    if (n.awareT > 0) {
      const dx = px - n.x;
      const dy = py - n.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        n.x += (dx / d) * spec.speed * dt;
        n.y += (dy / d) * spec.speed * dt;
      }
    } else {
      n.x += Math.cos(n.driftA) * C.DRIFT_SPEED * dt;
      n.y += Math.sin(n.driftA) * C.DRIFT_SPEED * dt;
    }

    if (cover && cover.length) {
      const out = resolveCover(n.x, n.y, spec.r, cover);
      n.x = out.x;
      n.y = out.y;
    }
    n.x = clamp(n.x, C.WALL + spec.r, C.CORRIDOR_W - C.WALL - spec.r);

    return n;
  }

  function damageEnemy(e) {
    const hp = e.hp - 1;
    return Object.assign({}, e, { hp: hp, dead: hp <= 0 });
  }

  // ------------------------------------------------------------------ vision

  /*
   * How far she can see. Monotonic non-decreasing in `memories` — that is the
   * whole promise of the mechanic, and it is a test — and never below
   * VISION_FLOOR, which is the promise that the game can always be finished.
   */
  function visionRadius(zoneBase, memories, dimT) {
    const lit = zoneBase + memories * C.MEMORY_LIGHT;
    const dimmed = dimT > 0 ? lit * C.VISION_DIM_MULT : lit;
    return Math.max(C.VISION_FLOOR, dimmed);
  }

  // --------------------------------------------------------------- the heal

  /*
   * Hold time in, state out. `percent` is snapped to HEAL_STEPS because the
   * brief shows discrete numbers ticking over; `fill` is the continuous 0..1
   * for the ring, so the ring can sweep smoothly while the number jumps.
   */
  function healState(heldTime) {
    const last = HEAL_STEPS.length - 1;
    const raw = heldTime / C.HEAL_STEP_TIME;
    const index = Math.min(last, Math.max(0, Math.floor(raw)));
    const done = index >= last;
    const fill = done ? 1 : clamp(raw / last, 0, 1);
    return {
      index: index,
      percent: HEAL_STEPS[index],
      fill: fill,
      line: Object.prototype.hasOwnProperty.call(HEAL_LINES, index) ? HEAL_LINES[index] : null,
      done: done,
    };
  }

  function healFullTime() {
    return (HEAL_STEPS.length - 1) * C.HEAL_STEP_TIME;
  }

  // ------------------------------------------------------------ colour return

  function colourAt(elapsed) {
    return clamp(elapsed / C.COLOUR_RETURN_TIME, 0, 1);
  }

  /* #rrggbb pair -> #rrggbb between them. The only colour maths in the game: */
  function mixHex(a, b, t) {
    const k = clamp(t, 0, 1);
    const out = ["#"];
    for (let i = 1; i < 7; i += 2) {
      const av = parseInt(a.slice(i, i + 2), 16);
      const bv = parseInt(b.slice(i, i + 2), 16);
      const v = Math.round(lerp(av, bv, k));
      out.push(v.toString(16).padStart(2, "0"));
    }
    return out.join("");
  }

  /* Blend a whole {key: hex} palette pair in one call. */
  function paletteAt(pair, t) {
    const out = {};
    for (const key of Object.keys(pair.cold)) {
      out[key] = mixHex(pair.cold[key], pair.warm[key], t);
    }
    return out;
  }

  return {
    C: C,
    HEAL_STEPS: HEAL_STEPS,
    HEAL_LINES: HEAL_LINES,
    ENEMIES: ENEMIES,

    clamp: clamp,
    lerp: lerp,
    corridorMinX: corridorMinX,
    corridorMaxX: corridorMaxX,
    circlesHit: circlesHit,
    pointInRect: pointInRect,
    segIntersectsRect: segIntersectsRect,
    segBlocked: segBlocked,
    resolveCircleRect: resolveCircleRect,
    pointInPolygon: pointInPolygon,
    closestPointOnPolygon: closestPointOnPolygon,
    resolveCover: resolveCover,

    newPlayer: newPlayer,
    stepPlayer: stepPlayer,
    canFire: canFire,
    applyHit: applyHit,

    newBullet: newBullet,
    stepBullet: stepBullet,
    bulletAlive: bulletAlive,

    newEnemy: newEnemy,
    enemySpec: enemySpec,
    enemySees: enemySees,
    stepEnemy: stepEnemy,
    damageEnemy: damageEnemy,

    visionRadius: visionRadius,
    healState: healState,
    healFullTime: healFullTime,
    colourAt: colourAt,
    mixHex: mixHex,
    paletteAt: paletteAt,
  };
});
