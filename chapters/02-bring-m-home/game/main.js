/*
 * Boot, the scene machine, and the main loop.
 *
 * Fixed timestep: the world steps in constant 1/120s slices regardless of frame
 * rate, so a 144Hz laptop and a throttled phone produce the same knockback and
 * the same bullet spacing.
 *
 * The chapter currently runs Zone 1 then Zone 3; Zone 2 will be authored later.
 */
(function (root) {
  "use strict";

  const R = root.Rules;
  const Z = root.Zones;
  const C = R.C;
  const STEP = 1 / 120;
  const MAX_FRAME = 0.25;   // after a tab switch, never simulate more than this

  const STORY_MEMORY_DATA = {
    responsibility: {
      index: 1,
      src: "assets/photos/cafe_suit.jpg",
      text: "ไม่ต้องรีบไปให้ทันทุกอย่างหรอก เหนื่อยก็พัก แล้วค่อยไปต่อนะ<br><br>ไปเที่ยวมั้ย เดี๋ยวพี่พาไปคาเฟ่ หาอะไรอร่อยๆ กินกัน",
    },
    comparison: {
      index: 2,
      src: "assets/photos/horse_suit.jpg",
      text: "ไม่ต้องรีบไปให้ทันใครหรอก แต่ละคนมีจังหวะของตัวเอง<br><br>ถ้าเหนื่อยแล้ว ลองหยุดพัก แล้วไปเล่นม้าหมุนกับพี่นะ",
    },
    work: {
      index: 3,
      src: "assets/photos/swim_suit.jpg",
      text: "มาถึงตรงนี้ได้ เก่งมากแล้วนะ<br><br>ไปว่ายน้ำกันน ชุดพี่สวยป่าวว 555",
    },
  };

  /* How close she has to be before staying with him is even offered. */
  const HEAL_RANGE = 72;

  /* How long the fog barrier takes to dissolve once the heart is placed —
     shared with the airGone sound cue so its fade-out lands exactly when the
     fog itself finishes clearing. */
  const FOG_DISSOLVE_MS = 2400;

  /* Same world Y drawRoomFogOverlay frames the barrier at. The camera cuts
     straight to this while it dissolves, then eases back to following her. */
  const FOG_WORLD_Y = 154;
  const FOG_CAM_RETURN_S = 1.1;

  // Authored world-space bounds of the rug in final-room-centered.png. Keeping
  // the spawn derived from this rectangle makes M stay attached to the rug at
  // every CSS/viewport scale instead of relying on a screen-pixel position.
  const M_ROOM_RUG_BOUNDS = {
    // Converted from the rug pixels in the 1254px authored room plate into
    // the 960x540 game/world plate used by the renderer.
    left: 353,
    right: 541,
    near: 500,
    far: 547,
  };
  // A seated sprite's anchor is at his feet, below the visual centre of his
  // body. Move that anchor deeper into the room so M appears on the rug's
  // centre instead of along its near edge.
  const M_ROOM_SEATED_Y_OFFSET = 28;

  const canvasEl = document.getElementById("game");
  let ctx = root.Render.resize(canvasEl);
  window.addEventListener("resize", function () { ctx = root.Render.resize(canvasEl); });
  root.Input.attach(canvasEl);

  const zones = Z.buildAll();
  /* Retrace every currently authored zone in reverse; Zone 2 can be inserted
     later without another hard-coded index becoming invalid. */
  const RETURN_LEGS = zones.map(function (_, i) { return i; }).reverse();

  /*
   * The room at the end is shaped like a zone so it can go through exactly the
   * same renderer — it is simply a very short one with nothing in it. Its vision
   * base still counts her memories, so the more she found on the way, the better
   * she can see him when she gets there.
   */
  function buildRoom() {
    return {
      index: 2,
      key: "room",
      title: "",
      subtitle: "",
      length: 900,
      base: 230,
      palette: Z.SPECS[2].palette,
      cover: [], memories: [], spawns: [], signs: [], voices: [],
    };
  }

  const state = {
    phase: "cutscene",
    time: 0,

    zone: null,
    zoneIndex: -1,
    camY: 0,

    player: R.newPlayer(C.CORRIDOR_W / 2, 0),
    bullets: [],
    heartWaves: [],
    enemies: [],
    particles: [],
    spawned: new Set(),
    pendingSpawns: [],
    spawnDelay: 0,

    picked: new Set(),
    memories: 0,
    memoryFlash: 0,

    dimT: 0,
    shake: 0,

    colourElapsed: 0,
    colourT: 0,
    pal: null,
    visionR: 400,
    darkAlpha: 1,
    rain: false,

    hostile: true,
    gunEnabled: true,
    hud: false,
    prompt: "",
    promptGlow: false,
    zoneLabel: "",
    progress: null,

    voice: { text: "", alpha: 0 },
    voiceT: 0,
    pressureVoice: { text: "", alpha: 0 },
    pressureVoiceT: 0,
    pressureHitCount: 0,
    voicesShown: new Set(),

    /* One story memory per zone. The first is earned by clearing Zone 1's
       waves, then opening the rare chest with a heart shot. */
    storyMemories: new Set(),
    memoryChest: null,
    lastGuardDrop: null,

    /* Him: null until the room, then present for the rest of the chapter. */
    m: null,
    heal: null,
    healHeld: 0,
    healIndex: -1,
    roomGate: null,
    followDir: { x: 0, y: 1 },

    /* Walking home: which leg, and which way is forward. */
    legIndex: -1,
    goalDir: 1,
    legStartY: 0,
  };

  let acc = 0;
  let last = 0;

  // ------------------------------------------------------------------ helpers

  function seedFor(i) {
    // Stable per-enemy variation for the renderer, with no Math.random in sight.
    return ((i * 2654435761) % 1000) / 1000;
  }

  function spawnParticles(x, y, colour, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 60 + Math.random() * 150;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 6,
        size: 7 + Math.random() * 9,
        life: 0.7 + Math.random() * 0.6,
        maxLife: 1.3,
        colour: colour,
      });
    }
  }

  /*
   * A voice line runs on a 4.2s timer, which can easily outlive the zone that
   * triggered it — the last line of the office was still hanging in the air two
   * scenes later. Anything that changes where she is silences him.
   */
  function silence() {
    state.voice = { text: "", alpha: 0 };
    state.voiceT = 0;
    state.pressureVoice = { text: "", alpha: 0 };
    state.pressureVoiceT = 0;
  }

  function enterZone(index, onReady) {
    silence();
    state.zone = zones[index];
    state.zoneIndex = index;
    state.player = R.newPlayer(C.CORRIDOR_W / 2, 0);
    state.bullets = [];
    state.heartWaves = [];
    state.enemies = [];
    state.particles = [];
    state.spawned = new Set();
    state.pendingSpawns = [];
    state.spawnDelay = 0;
    state.memoryChest = null;
    state.lastGuardDrop = null;
    state.hostile = true;
    state.gunEnabled = true;
    state.goalDir = 1;
    state.legStartY = 0;
    state.rain = state.zone.key === "outside";
    // Zone 1 begins in silence; its music enters only after the title card has
    // cleared. Later zones keep the same track running continuously.
    if (index > 0) root.Audio2.setZone(index);

    state.phase = "card";
    state.hud = false;
    root.Scenes.showZoneCard(state.zone, function () {
      root.Scenes.hide();
      if (index === 0) root.Audio2.setZone(index, 1.5);
      state.hud = true;
      state.phase = "play";
      if (onReady) onReady();
    });
  }

  function enterRoom() {
    silence();
    root.Audio2.silenceAll();
    root.Audio2.sfx("door");
    state.zone = buildRoom();
    state.zoneIndex = 2;
    // The zones' sound bed continuing into the room, same as it carries from
    // one zone to the next, rather than the room opening in silence.
    root.Audio2.setZone(state.zoneIndex);
    /*
     * He has to be on screen the moment the door closes behind her. At 560 he
     * was just past the top edge, so the room opened on an empty floor and the
     * whole point of the scene was something you had to go looking for.
     */
    // Enter from the bottom edge. M remains on the centred rug, so she has a
    // quiet approach through the room before reaching him.
    state.player = R.newPlayer(C.CORRIDOR_W / 2, -720);
    state.bullets = [];
    state.enemies = [];
    state.particles = [];
    state.hostile = false;
    /* The gun is taken away here and never comes back. */
    state.gunEnabled = false;
    state.rain = false;
    // The centred room plate puts the rug at screen centre. With the room camera
    // fixed at y=100, this anchors seated M directly on its open sitting area.
    // M lives in a separate room beyond the puzzle chamber and fog gate.
    const rugWidth = M_ROOM_RUG_BOUNDS.right - M_ROOM_RUG_BOUNDS.left;
    const rugDepth = M_ROOM_RUG_BOUNDS.far - M_ROOM_RUG_BOUNDS.near;
    state.m = {
      // Keep M visually centred on the authored rug at every viewport scale.
      x: M_ROOM_RUG_BOUNDS.left + rugWidth * .5,
      y: M_ROOM_RUG_BOUNDS.near + rugDepth * .5 + M_ROOM_SEATED_Y_OFFSET,
      aimX: 0,
      aimY: -1,
    };
    state.roomGate = {
      pedestals: [
        // Large triangle: two altars near the chamber entrance and the third
        // at the far centre. The middle remains open for walking.
        { x: 260, y: -145, baseOffsetY: 24, interactR: 40, placed: false },
        { x: 640, y: -145, baseOffsetY: 24, interactR: 40, placed: false },
        { x: 450, y: 10, baseOffsetY: 24, interactR: 40, placed: false },
      ],
      heart: { x: 450, y: -93.333, baseOffsetY: 24, interactR: 40 },
      placed: 0,
      waitT: 0,
      collapseT: 0,
      heartReady: false,
      heartRevealT: 0,
      heartPlaced: false,
      openT: 0,
      flashPlayed: false,
      camReturnT: 0,
    };
    state.roomCollisionDebug = false;
    // Stage 2: physical pedestal footprints and non-blocking interactions now
    // derive from the exact same visible-base coordinates.
    state.roomCollisionStage = "pedestals";
    state.roomColliders = {
      bounds: [
        // Safety bounds live just outside the authored floor. They prevent
        // leaving the map, but do not pretend that the entire edge is a wall.
        { x: -18, y: -780, w: 18, h: 1700, colliderType: "bounds", kind: "WORLD BOUND" },
        { x: 900, y: -780, w: 18, h: 1700, colliderType: "bounds", kind: "WORLD BOUND" },
        { x: 0, y: -780, w: 900, h: 18, colliderType: "bounds", kind: "WORLD BOUND" },
        { x: 0, y: 900, w: 900, h: 18, colliderType: "bounds", kind: "WORLD BOUND" },
      ],
      floor: [{
        walkablePolygon: true,
        colliderType: "floorContour",
        kind: "WALKABLE FLOOR",
        // One continuous, feet-centre contour. It follows the inner ruin edge;
        // the entrance and fog doorway remain part of the same connected floor.
        points: [
          // Bottom cliff path in the approach plate. Only exposed tiles are
          // admitted; the desk/rubble bank and mirror/sign bank stay outside.
          { x: 300, y: -760 }, { x: 600, y: -760 },
          { x: 625, y: -710 }, { x: 640, y: -650 },
          { x: 650, y: -590 }, { x: 665, y: -530 },
          { x: 675, y: -470 }, { x: 670, y: -410 },
          { x: 660, y: -355 }, { x: 625, y: -305 },
          // Narrow intentional opening through the horizontal stone wall.
          { x: 548, y: -272 }, { x: 548, y: -238 },
          // Puzzle chamber opens beyond the wall, following its inner ruins.
          { x: 720, y: -222 }, { x: 780, y: -188 },
          { x: 806, y: -120 }, { x: 814, y: -45 },
          { x: 824, y: 45 }, { x: 800, y: 130 },
          // Full-width straight threshold directly under the veil. This is the
          // red line from the visual audit: the player's feet stop here while
          // the puzzle is unsolved, with no reachable floor behind the mist.
          { x: 780, y: 154 }, { x: 120, y: 154 },
          { x: 100, y: 130 },
          { x: 76, y: 45 }, { x: 86, y: -45 },
          { x: 94, y: -120 }, { x: 120, y: -188 },
          { x: 180, y: -222 },
          // Matching left half of the horizontal-wall doorway.
          { x: 352, y: -238 }, { x: 352, y: -272 },
          // Approach-room clean floor boundary around the large desk, boxes,
          // rubble and papers on the left. Small isolated papers remain inside.
          { x: 275, y: -305 }, { x: 240, y: -355 },
          { x: 230, y: -410 }, { x: 225, y: -470 },
          { x: 235, y: -530 }, { x: 250, y: -590 },
          { x: 260, y: -650 }, { x: 275, y: -710 },
        ],
      }],
      solvedFloor: [],
      pedestals: state.roomGate.pedestals.map(function (pedestal, index) {
        return {
          ellipse: true,
          x: pedestal.x,
          y: pedestal.y + pedestal.baseOffsetY,
          rx: 16,
          ry: 5,
          pedestal: true,
          index: index,
          kind: "PEDESTAL",
        };
      }),
      fog: [
        { x: 120, y: 152, w: 660, h: 4, fogBarrier: true, kind: "FOG EXIT — LOCKED" },
      ],
    };
    // SOLVED uses the same exact contour, extended only through the doorway
    // and along M's clean central floor. Keeping two explicit masks makes the
    // navigation state visible in the debug fill and impossible to desync from
    // the fog animation.
    state.roomColliders.solvedFloor = [{
      walkablePolygon: true,
      colliderType: "floorContour",
      kind: "WALKABLE FLOOR — SOLVED",
      points: state.roomColliders.floor[0].points.slice(0, 19)
        .concat([{ x: 780, y: 154 }, { x: 570, y: 244 },
          { x: 570, y: 820 }, { x: 330, y: 820 },
          { x: 330, y: 244 }, { x: 120, y: 154 }])
        .concat(state.roomColliders.floor[0].points.slice(21)),
    }];
    state.zone.cover = state.roomColliders.bounds
      .concat(state.roomColliders.floor)
      .concat(state.roomColliders.pedestals);
    state.healHeld = 0;
    state.healIndex = -1;
    state.heal = R.healState(0);
    state.phase = "room";
    state.hud = true;
    state.zoneLabel = "";
    state.progress = null;
  }

  function startLeg(n) {
    silence();
    state.legIndex = n;
    const zone = zones[RETURN_LEGS[n]];
    state.zone = zone;
    state.zoneIndex = zone.index;
    /*
     * She only walks back the last stretch of each zone, not all of it — the
     * point of the walk home is that the same places are survivable now, not
     * that you play the game twice.
     */
    state.legStartY = zone.length * C.RETURN_SCALE;
    state.goalDir = -1;
    state.player = R.newPlayer(C.CORRIDOR_W / 2, state.legStartY);
    state.bullets = [];
    state.particles = [];
    state.hostile = false;
    state.gunEnabled = false;
    state.rain = zone.key === "outside";
    root.Audio2.setZone(zone.index);
    root.Audio2.warmUp();

    /*
     * Everything that hunted her the first time is still standing in the same
     * places. It just does not come for her anymore — that is the entire message
     * of the ending, so the enemies are placed rather than deleted.
     */
    state.enemies = [];
    for (let i = 0; i < zone.spawns.length; i++) {
      const s = zone.spawns[i];
      if (s.y > state.legStartY) continue;
      const e = R.newEnemy(s.kind, s.x, s.y);
      e.driftA = s.driftA;
      e.seed = seedFor(i);
      e.flash = 0;
      state.enemies.push(e);
    }

    state.m = state.m || { x: C.CORRIDOR_W / 2, y: state.legStartY + 40, aimX: 0, aimY: -1 };
    state.m.x = state.player.x;
    state.m.y = state.player.y + 46;
    state.phase = "return";
    state.hud = true;
  }

  function goHome() {
    state.phase = "home";
    state.hud = false;
    root.Audio2.fadeBed(3);

    // The transition shrinks the real, live frame — captured now, before
    // anything else changes. Once it's shrunk, the shutter sound is the cut
    // straight into RESCUE COMPLETE: no lingering card, no flash-white
    // beat, nothing else shown in between. The eject scene later shows the
    // illustrated keepsake, same as before.
    //
    // canvasEl itself is sized by fit * devicePixelRatio for crisp display —
    // on a Retina screen at a large viewport that can be several thousand
    // pixels across. Encoding that directly with toDataURL is a real,
    // synchronous multi-second freeze; drawing it downscaled onto a small
    // thumbnail canvas first keeps this instant.
    let liveFrame = "assets/photos/couple-photo.png";
    try {
      // .cam-snap-raw displays at the full viewport (scale(1)) on the
      // shrink's first frame. render.js's resize() sets canvasEl's CSS
      // width to C.CANVAS_W * fit, where fit = max(innerWidth/960,
      // innerHeight/540) — on virtually every real viewport fit >= 1, so
      // the canvas is already shown *larger* than 960 logical px. Capturing
      // at the fixed logical width (960) was still smaller than that
      // on-screen size, so the thumbnail got upscaled and looked
      // pixelated. Match the canvas's actual rendered CSS width instead —
      // sharp at 1x — capped well below the DPR-scaled buffer size that
      // caused the freeze.
      const THUMB_W = Math.min(Math.round(canvasEl.getBoundingClientRect().width) || C.CANVAS_W, 2200);
      const thumb = document.createElement("canvas");
      thumb.width = THUMB_W;
      thumb.height = Math.round(canvasEl.height * (THUMB_W / canvasEl.width));
      thumb.getContext("2d").drawImage(canvasEl, 0, 0, thumb.width, thumb.height);
      liveFrame = thumb.toDataURL("image/png");
    } catch (e) { /* ignore — falls back to the illustrated photo */ }
    const keepsake = "assets/photos/couple-photo.png";

    root.Scenes.showEndingSnap(liveFrame, function () {
      root.Audio2.sfx("cameraShutter");
      root.Scenes.showRescue(function () {
        state.phase = "letter";
        root.Scenes.showEnvelope();
      }, keepsake);
    });
  }

  // ------------------------------------------------------------------- update

  function castHeartWave() {
    state.heartWaves.push({
      x: state.player.x,
      y: state.player.y,
      r: 8,
      prevR: 0,
      life: 0.46,
      hit: new Set(),
      chestHit: false,
    });
    state.player = Object.assign({}, state.player, { cooldown: C.HEART_WAVE_COOLDOWN });
    root.Audio2.sfx("shot");
  }

  function releaseSpawns(dt) {
    const due = Z.spawnsDue(state.zone.spawns, state.player.y, state.spawned);
    for (const i of due) {
      state.spawned.add(i);
      state.pendingSpawns.push(i);
    }
    state.spawnDelay = Math.max(0, state.spawnDelay - dt);
    if (!state.pendingSpawns.length || state.spawnDelay > 0) return;
    const i = state.pendingSpawns.shift();
    const s = state.zone.spawns[i];
    const e = R.newEnemy(s.kind, s.x, s.y);
    e.driftA = s.driftA;
    e.seed = seedFor(i);
    e.spawnIndex = i;
    e.flash = 0;
    state.enemies.push(e);
    state.spawnDelay = 0.62;
  }

  function stepHeartWaves(dt) {
    const next = [];
    for (const wave of state.heartWaves) {
      wave.prevR = wave.r;
      wave.r += 470 * dt;
      wave.life -= dt;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.dead) continue;
        const spec = R.enemySpec(e);
        const enemyKey = e.spawnIndex === undefined ? "seed:" + e.seed : "spawn:" + e.spawnIndex;
        if (wave.hit.has(enemyKey)) continue;
        const distance = Math.hypot(wave.x - e.x, wave.y - e.y);
        if (distance > wave.r + spec.r || distance < wave.prevR - spec.r) continue;
        wave.hit.add(enemyKey);

        // Her light does not chip away at them: one touch is enough for every
        // pressure-creature to dissolve, regardless of its old projectile HP.
        const damaged = Object.assign({}, e, { hp: 0, dead: true });
        damaged.seed = e.seed;
        damaged.driftA = e.driftA;
        damaged.flash = 0.08;
        damaged.spawnIndex = e.spawnIndex;
        state.enemies[i] = damaged;

        if (damaged.dead) {
          /*
           * Nothing out here dies violently. A shot document comes apart into
           * paper and is gone — which is why the particles are scraps and the
           * sound is dry.
           */
          spawnParticles(e.x, e.y, state.pal.enemy, e.kind === "shadow" ? 14 : 10);
          root.Audio2.sfx(e.kind === "shadow" ? "shadow" : "paper");
          if (STORY_MEMORY_DATA[state.zone.key] && e.y > state.zone.length - 1000) {
            state.lastGuardDrop = { x: e.x, y: e.y };
          }
        }
      }

      if (!wave.chestHit && state.memoryChest && state.memoryChest.visible &&
          state.memoryChest.stage === "sealed") {
        const chestDistance = Math.hypot(wave.x - state.memoryChest.x, wave.y - state.memoryChest.y);
        if (chestDistance <= wave.r + 30 && chestDistance >= wave.prevR - 30) {
          wave.chestHit = true;
          state.memoryChest.stage = "light";
          spawnParticles(state.memoryChest.x, state.memoryChest.y, "#ffd76f", 24);
          root.Audio2.sfx("hit");
        }
      }
      if (wave.life > 0) next.push(wave);
    }
    state.heartWaves = next;
  }

  function clearLegacyBullets() {
    // Old aimed projectiles are no longer part of gameplay. Keep the array
    // empty for compatibility with the renderer/state shape.
    if (state.bullets.length) state.bullets = [];
  }

  function stepEnemies(dt) {
    const p = state.player;
    // When nothing is hostile, they simply cannot see her — no special case in
    // the pure stepper, just a target it can never reach.
    const tx = state.hostile ? p.x : -1e6;
    const ty = state.hostile ? p.y : -1e6;

    const alive = [];
    for (let e of state.enemies) {
      if (e.dead) continue;
      const seed = e.seed;
      const spawnIndex = e.spawnIndex;
      const flash = Math.max(0, (e.flash || 0) - dt);
      e = R.stepEnemy(e, dt, tx, ty, state.zone.cover);
      e.seed = seed;
      e.spawnIndex = spawnIndex;
      e.flash = flash;

      // Cull anything well behind her, so a long zone does not accumulate a mob.
      if (state.goalDir > 0 ? e.y < p.y - 800 : e.y > p.y + 800) continue;
      alive.push(e);

      if (!state.hostile) continue;
      const spec = R.enemySpec(e);
      const contactR = C.PLAYER_R + spec.r + 52;
      if (Math.hypot(p.x - e.x, p.y - e.y) >= contactR) continue;

      alive.pop();
      const pressureByZone = {
        responsibility: ["พักทีหลัง", "เรายังหยุดไม่ได้", "อีกนิดเดียว... เรายังไหว"],
        comparison: ["คนอื่นไปถึงไหนแล้ว", "เขาไปไกลกว่าแล้วนะ", "ทำไมเรายังอยู่ตรงนี้?"],
        work: ["ต้องดีกว่านี้", "ต้องทำได้ดีกว่านี้"],
      };
      const pressureLines = pressureByZone[state.zone.key] || ["ยังไม่พอ"];
      state.pressureVoice = {
        text: pressureLines[state.pressureHitCount % pressureLines.length],
        alpha: 0,
      };
      state.pressureHitCount += 1;
      state.pressureVoiceT = 3.4;
      state.shake = Math.max(state.shake, C.SHAKE_ON_HIT * 0.45);
      root.Audio2.sfx("hit");
      continue;
    }
    state.enemies = alive;
  }

  function revealZoneMemoryChest() {
    const memoryKey = state.zone.key;
    if (!STORY_MEMORY_DATA[memoryKey] || state.storyMemories.has(memoryKey)) return;
    if (state.memoryChest || state.spawned.size < state.zone.spawns.length ||
        state.pendingSpawns.length > 0 || state.enemies.length > 0) return;
    const drop = state.lastGuardDrop || { x: C.CORRIDOR_W / 2, y: state.zone.length - 420 };
    state.memoryChest = {
      x: R.clamp(drop.x, 365, 535),
      y: R.clamp(drop.y, state.zone.length - 620, state.zone.length - 300),
      visible: true,
      stage: "sealed",
    };
    state.voice = { text: "มีบางอย่างถูกทิ้งไว้ข้างหน้า...", alpha: 0 };
    state.voiceT = 4.2;
  }

  function collectStoryMemory(intent) {
    const chest = state.memoryChest;
    if (!chest || chest.stage !== "light" || !intent.interact) return;
    if (Math.hypot(state.player.x - chest.x, state.player.y - chest.y) > 78) return;
    const memoryKey = state.zone.key;
    const memory = STORY_MEMORY_DATA[memoryKey];
    if (!memory) return;
    chest.stage = "collected";
    state.storyMemories.add(memoryKey);
    root.Audio2.sfx("memory");
    state.phase = "memory";
    state.hud = false;
    root.Scenes.showMemory(
      memory.src,
      memory.text,
      memory.index,
      function () {
        state.phase = "play";
        state.hud = true;
      }
    );
  }

  function stepParticles(dt) {
    const next = [];
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life > 0) next.push(p);
    }
    state.particles = next;
  }

  function collectMemories() {
    const p = state.player;
    for (let i = 0; i < state.zone.memories.length; i++) {
      const key = state.zone.index + ":" + i;
      if (state.picked.has(key)) continue;
      const m = state.zone.memories[i];
      if (!R.circlesHit(p.x, p.y, C.PLAYER_R, m.x, m.y, Z.MEMORY_R)) continue;
      state.picked.add(key);
      state.memories += 1;
      state.memoryFlash = 0.7;
      root.Audio2.sfx("memory");
    }
  }

  function updateVoices(dt) {
    for (let i = 0; i < state.zone.voices.length; i++) {
      const key = state.zone.index + ":" + i;
      if (state.voicesShown.has(key)) continue;
      const v = state.zone.voices[i];
      if (state.player.y < v.y) continue;
      state.voicesShown.add(key);
      state.voice = { text: v.text, alpha: 0 };
      state.voiceT = 4.2;
    }

    if (state.voiceT > 0) {
      state.voiceT -= dt;
      // Fade in over the first half second, out over the last.
      const t = state.voiceT;
      state.voice.alpha = Math.min(1, Math.min((4.2 - t) / 0.5, t / 1.0));
    } else {
      state.voice.alpha = 0;
    }

    if (state.pressureVoiceT > 0) {
      state.pressureVoiceT -= dt;
      const t = state.pressureVoiceT;
      state.pressureVoice.alpha = Math.min(1, Math.min((3.4 - t) / 0.25, t / 0.75));
    } else {
      state.pressureVoice.alpha = 0;
    }
  }

  function followWithM(dt) {
    if (!state.m) return;
    const p = state.player;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 12) {
      state.followDir = { x: p.vx / speed, y: p.vy / speed };
    }
    const target = {
      x: p.x - state.followDir.x * 46,
      y: p.y - state.followDir.y * 46,
    };
    const k = Math.min(1, dt * 4.5);
    state.m.x += (target.x - state.m.x) * k;
    state.m.y += (target.y - state.m.y) * k;
    state.m.aimX = state.followDir.x;
    state.m.aimY = state.followDir.y;
  }

  function clampPlayerY(minY, maxY) {
    if (state.player.y < minY) {
      state.player.y = minY;
      if (state.player.vy < 0) state.player.vy = 0;
    } else if (state.player.y > maxY) {
      state.player.y = maxY;
      if (state.player.vy > 0) state.player.vy = 0;
    }
  }

  function updateHeal(dt, intent) {
    const p = state.player;
    const near = Math.hypot(p.x - state.m.x, p.y - state.m.y) <= HEAL_RANGE;

    if (!near) {
      state.prompt = "ตามหาเขา";
      state.promptGlow = false;
      return;
    }

    state.prompt = "[Spacebar] อยู่ใกล้เขาเพื่อรักษา";
    state.promptGlow = true;
    if (!intent.hold) return;

    state.healHeld += dt;
    state.heal = R.healState(state.healHeld);

    if (state.heal.index !== state.healIndex) {
      state.healIndex = state.heal.index;
      root.Audio2.sfx("beat");
      if (state.heal.line) root.Scenes.say(state.heal.line);
    }

    if (state.heal.done) {
      state.phase = "colour";
      state.colourElapsed = 0;
      root.Audio2.warmUp();
    }
  }

  function update(dt, intent) {
    state.time += dt;

    if (state.memoryFlash > 0) state.memoryFlash = Math.max(0, state.memoryFlash - dt);
    if (state.dimT > 0) state.dimT = Math.max(0, state.dimT - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 42);

    if (state.phase === "play" || state.phase === "return") {
      state.player = R.stepPlayer(state.player, dt, intent, state.zone.cover);
      if (state.phase === "play") clampPlayerY(0, state.zone.length - 90);
      else clampPlayerY(0, state.legStartY);
      const nearMemoryLight = state.memoryChest && state.memoryChest.stage === "light" &&
        Math.hypot(state.player.x - state.memoryChest.x, state.player.y - state.memoryChest.y) <= 78;
      const nearExit = state.player.y >= state.zone.length - 190;
      if (state.gunEnabled && intent.cast && !nearMemoryLight && !nearExit && R.canFire(state.player)) {
        castHeartWave();
      }
      if (state.phase === "play") releaseSpawns(dt);
      stepHeartWaves(dt);
      clearLegacyBullets();
      stepEnemies(dt);
      if (state.phase === "play") revealZoneMemoryChest();
      if (state.phase === "play") collectStoryMemory(intent);
      updateVoices(dt);
      if (state.phase === "return") followWithM(dt);
    } else if (state.phase === "room") {
      // Build the active room collision list from the audited categories on
      // every frame. Never inherit stale corridor/image hitboxes through the
      // zone cover array: only visible room walls, the tiny stone footprints,
      // and (once enabled) the dedicated doorway barrier may block movement.
      const roomCover = []
        .concat((state.roomColliders && state.roomColliders.bounds) || [])
        .concat((state.roomColliders && state.roomColliders.floor) || [])
        .concat((state.roomCollisionStage === "pedestals" && state.roomColliders && state.roomColliders.pedestals) || [])
        .concat((state.roomGate && !state.roomGate.fogUnlocked && state.roomColliders && state.roomColliders.fog) || []);
      state.zone.cover = roomCover;
      const collapseLocked = state.roomGate && state.roomGate.placed === 3 &&
        !state.roomGate.heartPlaced && state.roomGate.collapseT < 7.2;
      // The camera cuts to the fog the moment the heart is placed and holds
      // there — she stands still and watches it clear, same as she stood
      // still for the altar's own reveal above.
      const fogWatchLocked = state.roomGate && state.roomGate.heartPlaced && !state.roomGate.fogUnlocked;
      if (collapseLocked || fogWatchLocked) {
        state.player = Object.assign({}, state.player, { vx: 0, vy: 0 });
      } else {
        state.player = R.stepPlayer(state.player, dt, intent, roomCover, true);
      }
      clampPlayerY(-720, state.zone.length);
      const gate = state.roomGate;
      if (gate && gate.placed < 3) {
        let pedestal = null;
        let nearestDistance = Infinity;
        for (const candidate of gate.pedestals) {
          if (candidate.placed) continue;
          const distance = Math.hypot(state.player.x - candidate.x,
            state.player.y - (candidate.y + candidate.baseOffsetY));
          if (distance < nearestDistance) {
            nearestDistance = distance;
            pedestal = candidate;
          }
        }
        const nearPedestal = pedestal && nearestDistance < pedestal.interactR;
        if (nearPedestal && intent.interact) {
          pedestal.placed = true;
          gate.placed += 1;
          spawnParticles(pedestal.x, pedestal.y, "#ffd98a", 26);
          root.Audio2.sfx("memory");
        }
        state.prompt = nearPedestal ? "กด Space bar วางดาว" : "วางดาวบนแท่นทั้งสาม";
      } else if (gate && !gate.heartReady) {
        state.prompt = "";
        gate.waitT += dt;
        gate.collapseT += dt;
        // A 2.5-second warning rumble, then a fast flash hides the cut.
        if (gate.collapseT < 2.5) {
          state.shake = Math.max(state.shake, 1.8);
        } else if (!gate.flashPlayed) {
          gate.flashPlayed = true;
          root.Audio2.sfx("heartFlash");
        }
        if (gate.waitT >= 2.64) {
          gate.heartReady = true;
          // The flash hides the cut, so the altar is already fully present
          // when the rubble clears; there is no second scale/pop animation.
          gate.heartRevealT = 1;
          // The heart altar becomes solid only when it actually appears. This
          // prevents an invisible collision from blocking the player earlier.
          state.roomColliders.pedestals.push({ ellipse: true, x: gate.heart.x,
            y: gate.heart.y + gate.heart.baseOffsetY,
            rx: 16, ry: 5, heartPedestal: true, kind: "HEART PEDESTAL" });
          if (state.roomCollisionStage === "pedestals") {
            state.zone.cover.push(state.roomColliders.pedestals[state.roomColliders.pedestals.length - 1]);
          }
        }
      } else if (gate && !gate.heartPlaced) {
        gate.collapseT = Math.min(7.2, gate.collapseT + dt);
        gate.heartRevealT = Math.min(1, (gate.heartRevealT || 0) + dt / .7);
        const nearHeart = Math.hypot(state.player.x - gate.heart.x,
          state.player.y - (gate.heart.y + gate.heart.baseOffsetY)) < gate.heart.interactR &&
          gate.collapseT >= 7.1;
        state.prompt = nearHeart ? "กด Space bar วางหัวใจ" : "";
        if (nearHeart && intent.interact) {
          gate.heartPlaced = true;
          spawnParticles(gate.heart.x, gate.heart.y, "#ff8fa3", 48);
          root.Audio2.sfx("beat");
          // The air going out of the room as the fog starts to dissolve — kept
          // quiet to start, then faded to nothing over the same span the fog
          // itself takes, so neither outlasts the other.
          root.Audio2.playClip("airGone");
          root.Audio2.stopClip("airGone", FOG_DISSOLVE_MS);
        }
      } else if (gate) {
        gate.openT = Math.min(1, gate.openT + dt / (FOG_DISSOLVE_MS / 1000));
        // The invisible wall remains for the complete dissolve. Only once the
        // fog has fully gone can she step through into M's room.
        if (gate.openT >= 1 && !gate.fogUnlocked) {
          gate.fogUnlocked = true;
          state.roomColliders.fog = [];
          state.roomColliders.floor = state.roomColliders.solvedFloor;
        }
        if (gate.fogUnlocked) {
          gate.camReturnT = Math.min(1, (gate.camReturnT || 0) + dt / FOG_CAM_RETURN_S);
        }
        state.prompt = gate.openT < 1 ? "" : "เดินไปหาเอ็ม";
      }
      if (!gate || gate.openT >= 0.82) updateHeal(dt, intent);
    } else if (state.phase === "colour") {
      state.player = R.stepPlayer(state.player, dt, intent, state.zone.cover, true);
      clampPlayerY(-720, state.zone.length);
      state.colourElapsed += dt;
      state.colourT = R.colourAt(state.colourElapsed);
      // He is on his feet the moment the ring closed; the heal object stays so
      // the bar keeps reading 100%.
      if (state.colourElapsed > C.COLOUR_RETURN_TIME + 1.4) {
        // No walk back through the zones — straight from standing up to the
        // flash and the ending.
        state.heal = null;
        root.Scenes.clearSay();
        goHome();
      }
    }

    stepParticles(dt);

    // --- everything the renderer reads -------------------------------------
    // Follow her in the room just like every other zone. M is a world object, so
    // he naturally enters the screen only after she has walked far enough —
    // except while the fog is dissolving, where the camera cuts straight to
    // it and holds, then eases back to following her once it's gone.
    const gateCam = state.roomGate;
    if (gateCam && gateCam.heartPlaced && !gateCam.fogUnlocked) {
      state.camY = FOG_WORLD_Y;
    } else if (gateCam && gateCam.fogUnlocked && gateCam.camReturnT < 1) {
      state.camY = R.lerp(FOG_WORLD_Y, state.player.y, gateCam.camReturnT);
    } else {
      state.camY = state.player.y;
    }
    state.pal = R.paletteAt(state.zone.palette, state.colourT);
    state.visionR = R.visionRadius(state.zone.base, state.memories, state.dimT);
    // The dark lifts as the colour comes back, but never all the way: the world
    // is still the world.
    state.darkAlpha = R.lerp(1, 0.22, state.colourT);

    if (state.phase === "play") {
      const doorStop = state.zone.length - 90;
      if (state.player.y > doorStop) {
        state.player.y = doorStop;
        state.player.vy = Math.min(0, state.player.vy);
      }
      const atDoor = state.player.y >= doorStop - 100;
      const needsMemory = !!STORY_MEMORY_DATA[state.zone.key] && !state.storyMemories.has(state.zone.key);
      const chestNear = state.memoryChest && state.memoryChest.stage === "light" &&
        Math.hypot(state.player.x - state.memoryChest.x, state.player.y - state.memoryChest.y) <= 78;
      state.zoneLabel = state.zone.title;
      state.progress = state.player.y / state.zone.length;
      state.prompt = atDoor
        ? (needsMemory
          ? "มีคนลืมความทรงจำบางอย่าง เราหาไปให้เขาจำได้กันเถอะ"
          : "[SPACE] เปิดประตู")
        : (chestNear ? "[SPACE] เก็บความทรงจำ"
          : (state.memoryChest && state.memoryChest.visible && state.memoryChest.stage === "sealed"
            ? "กด Space bar เพื่อปล่อยพลังใส่กล่อง" : "กด Space bar เพื่อปล่อยพลัง"));
      state.promptGlow = atDoor && !needsMemory;
      if (atDoor && !needsMemory && intent.interact) advance();
    } else if (state.phase === "return") {
      state.zoneLabel = state.zone.title;
      state.progress = 1 - state.player.y / state.legStartY;
      state.prompt = "WALK HOME";
      state.promptGlow = false;
      if (state.player.y <= 0) advance();
    }
  }

  function advance() {
    if (state.phase === "play") {
      state.hud = false;
      if (state.zoneIndex < zones.length - 1) {
        enterZone(state.zoneIndex + 1);
      } else {
        state.phase = "door";
        root.Scenes.showDoor(function () { enterRoom(); });
      }
      return;
    }

    // Walking home.
    state.hud = false;
    if (state.legIndex < RETURN_LEGS.length - 1) {
      startLeg(state.legIndex + 1);
    } else {
      goHome();
    }
  }

  // --------------------------------------------------------------------- loop

  function frame(now) {
    if (!last) last = now;
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    acc += elapsed;

    const intent = root.Input.read();
    const live = state.phase === "play" || state.phase === "return" ||
                 state.phase === "room" || state.phase === "colour";

    while (acc >= STEP) {
      if (live) update(STEP, intent);
      acc -= STEP;
    }

    const bagBtn = document.getElementById("memoryBagBtn");
    if (bagBtn) {
      bagBtn.hidden = state.phase !== "play";
      bagBtn.textContent = "🎒 " + state.storyMemories.size + " / 3";
    }

    if (state.zone && state.pal) {
      root.Render.drawWorld(ctx, state);
      root.Render.drawHud(ctx, state);
      root.Input.setAnchor(root.Render.sx(state.player.x), root.Render.PLAYER_SCREEN_Y);
    }

    window.requestAnimationFrame(frame);
  }

  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", function () {
    muteBtn.innerHTML = root.Audio2.toggleMute() ? "&#128263;" : "&#128266;";
  });

  const memoryBagBtn = document.getElementById("memoryBagBtn");
  memoryBagBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (state.phase !== "play") return;
    state.phase = "inventory";
    state.hud = false;
    const order = ["responsibility", "comparison", "work"];
    root.Scenes.showMemoryBag(order.map(function (key) {
      const data = STORY_MEMORY_DATA[key] || { src: "", text: "" };
      return {
        collected: state.storyMemories.has(key),
        src: data.src,
        text: data.text,
      };
    }), function () {
      state.phase = "play";
      state.hud = true;
    });
  });

  root.Game = { state: state, Rules: R, Zones: Z, zones: zones };

  /*
   * TEMP ROOM DEVELOPMENT MODE
   * Keep every cutscene and Zone 1–3 implementation intact, but bypass them
   * while the final room is being tuned. Set this back to false to restore the
   * normal chapter flow.
   */
  const DEV_START_IN_M_ROOM = false;
  // Skips the room puzzle too, straight to the camera/polaroid ending beat —
  // for previewing that scene without replaying the pedestals each time. Set
  // back to false once it's dialed in.
  const DEV_JUMP_TO_ENDING = false;
  if (DEV_JUMP_TO_ENDING) {
    // goHome() used to fire immediately, before either listener below could
    // ever run — so Audio2 was still locked (no real user gesture had
    // happened yet) for every sfx() call the ending beat makes on its own
    // (picOut, cameraShutter), and they all silently no-op'd. Waiting for
    // the first key/tap and unlocking THEN calling goHome() from inside
    // that same real gesture is what actually resumes the audio context —
    // calling unlock() from ordinary script code, with no gesture backing
    // it, doesn't work in most browsers.
    const startEnding = function () {
      root.Audio2.unlock();
      window.removeEventListener("keydown", startEnding);
      window.removeEventListener("touchstart", startEnding);
      // Not goHome() itself — goHome() opens with showEndingSnap(), a
      // freeze-frame capture of the live gameplay canvas. DEV_JUMP_TO_ENDING
      // skips straight here without ever drawing that canvas, so the
      // "capture" is just a blank black rectangle, and showEndingSnap shows
      // it as a visible black flash before cutting to RESCUE COMPLETE. This
      // is the same tail goHome() runs after its own snap step, just
      // without that step — real play (goHome() itself, untouched) always
      // has actual gameplay pixels to capture there.
      state.phase = "home";
      state.hud = false;
      root.Audio2.fadeBed(3);
      root.Scenes.showRescue(function () {
        state.phase = "letter";
        root.Scenes.showEnvelope();
      }, "assets/photos/couple-photo.png");
    };
    window.addEventListener("keydown", startEnding, { once: true });
    window.addEventListener("touchstart", startEnding, { once: true });
  } else if (DEV_START_IN_M_ROOM) {
    // The first key/touch also unlocks WebAudio for the later healing pulse.
    const unlockRoomAudio = function () {
      root.Audio2.unlock();
      window.removeEventListener("keydown", unlockRoomAudio);
      window.removeEventListener("touchstart", unlockRoomAudio);
    };
    window.addEventListener("keydown", unlockRoomAudio, { once: true });
    window.addEventListener("touchstart", unlockRoomAudio, { once: true });
    enterRoom();
  } else {
    root.Scenes.showCutscene(function () {
      root.Audio2.unlock();
      root.Scenes.showControls(function () {
        enterZone(0);
      });
    });
  }

  window.requestAnimationFrame(frame);
})(typeof globalThis !== "undefined" ? globalThis : this);
