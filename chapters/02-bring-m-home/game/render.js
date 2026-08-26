/*
 * Canvas drawing. Takes state, draws pixels, decides nothing — every gameplay
 * number comes from Rules and every piece of level geometry from Zones.
 *
 * The world is top-down and the camera only scrolls vertically, so there are
 * exactly two coordinate helpers in the whole file: sx() and sy().
 */
(function (root) {
  "use strict";

  const R = root.Rules;
  const C = R.C;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /*
   * Canvas takes no CSS, so ctx.font has to name the family itself. Only for text
   * that is words — the emoji draws deliberately stay on system-ui, because no
   * text face covers emoji and naming one there buys nothing.
   */
  const TEXT_FACE = '"KC Nightmare", "iannnnn-DOG", ui-sans-serif, system-ui';

  /* She sits below centre, so more of the screen is the part she is walking into. */
  const PLAYER_SCREEN_Y = C.CANVAS_H * 0.58;
  const OFFSET_X = (C.CANVAS_W - C.CORRIDOR_W) / 2;

  const faces = { her: new Image(), m: new Image() };
  faces.her.src = "assets/photos/face-her.png";
  faces.m.src = "assets/photos/face-you.png";

  /* Game-ready transparent strip derived from the supplied character concept. */
  const characterSheet = new Image();
  const characterSprites = { run: [], idle: null };
  characterSheet.src = "assets/scenes/character-sprites.png";
  const memoryChestImage = new Image();
  memoryChestImage.src = "assets/scenes/memory-chest-rare.png";
  const mSheet = new Image();
  const mSprites = { run: [], slumped: null, recover: null, idle: null, happy: null };
  mSheet.src = "assets/scenes/m-sprites.png";
  const zoneBackgrounds = { responsibility: new Image(), comparison: new Image(), work: new Image(), room: new Image(), outside: new Image() };
  const roomApproachBackground = new Image();
  const roomPuzzleBackground = new Image();
  const roomMistBackground = new Image();
  const roomFogBack = new Image();
  const roomFogMain = new Image();
  const roomFogFront = new Image();
  const roomFogFace = new Image();
  const roomFogLayerCanvas = document.createElement("canvas");
  const roomFogLayerCtx = roomFogLayerCanvas.getContext("2d");
  const starConcept = new Image();
  const pedestalSheet = new Image();
  const floatingGemSheet = new Image();
  zoneBackgrounds.responsibility.src = "assets/scenes/zone1-responsibility.png";
  zoneBackgrounds.comparison.src = "assets/scenes/zone2-comparison.png";
  zoneBackgrounds.work.src = "assets/scenes/zone1-expectations.png";
  zoneBackgrounds.room.src = "assets/scenes/final-room-centered.png";
  roomApproachBackground.src = "assets/scenes/final-room-approach.png";
  roomPuzzleBackground.src = "assets/scenes/final-puzzle-chamber.png";
  roomMistBackground.src = "assets/scenes/magical-mist-veil.png?v=20260813";
  roomFogBack.src = "assets/scenes/fog-back.png?v=20260813-monster";
  roomFogMain.src = "assets/scenes/fog-main.png?v=20260813-monster";
  roomFogFront.src = "assets/scenes/fog-front.png?v=20260813-monster";
  roomFogFace.src = "assets/scenes/fog-face.png?v=20260813-monster";
  starConcept.src = "assets/scenes/star.png";
  pedestalSheet.src = "assets/scenes/stardraft2-sprites.png";
  floatingGemSheet.src = "assets/scenes/star-heart-float.png";
  zoneBackgrounds.outside.src = "assets/scenes/zone2-storm.png";

  function extractCharacterSprite(rect) {
    const source = document.createElement("canvas");
    source.width = rect.w;
    source.height = rect.h;
    const sctx = source.getContext("2d");
    sctx.drawImage(characterSheet, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return source;
  }

  characterSheet.onload = function () {
    const cell = Math.floor(characterSheet.naturalWidth / 5);
    const top = 90;
    const h = Math.min(520, characterSheet.naturalHeight - top);
    const runRects = [1, 2, 3, 4].map(function (i) {
      return { x: i * cell, y: top, w: i === 4 ? characterSheet.naturalWidth - i * cell : cell, h: h };
    });
    characterSprites.run = runRects.map(extractCharacterSprite);
    characterSprites.idle = extractCharacterSprite({ x: 0, y: top, w: cell, h: h });
  };

  mSheet.onload = function () {
    const h = mSheet.naturalHeight;
    // Crop from M's sheet explicitly; the heroine uses a different source.
    function cropM(i) {
      // Integer frame edges prevent the neighbouring frame leaking in as the
      // black crescent that appeared above M's head.
      const nominalX = Math.floor(i * mSheet.naturalWidth / 8);
      const nominalEnd = Math.floor((i + 1) * mSheet.naturalWidth / 8);
      // Some poses extend a few pixels beyond their nominal eighth of the
      // generated strip. Include overlap, then the connected-component pass
      // below discards any detached pixels belonging to the next pose.
      const overlap = 52;
      const frameX = Math.max(0, nominalX - overlap);
      const frameEnd = Math.min(mSheet.naturalWidth, nominalEnd + overlap);
      const cell = frameEnd - frameX;
      const source = document.createElement("canvas");
      source.width = cell;
      source.height = h;
      const sourceCtx = source.getContext("2d");
      sourceCtx.drawImage(mSheet, frameX, 0, cell, h, 0, 0, cell, h);
      const imageData = sourceCtx.getImageData(0, 0, source.width, source.height);
      const pixels = imageData.data;
      // Generated sprite sheets sometimes contain tiny detached marks beside a
      // frame (the black crescent seen above M's head). Keep only the largest
      // connected opaque shape, which is the character himself.
      const seen = new Uint8Array(source.width * source.height);
      let largest = [];
      for (let start = 0; start < seen.length; start++) {
        if (seen[start] || pixels[start * 4 + 3] < 12) continue;
        const stack = [start];
        const component = [];
        seen[start] = 1;
        while (stack.length) {
          const at = stack.pop();
          component.push(at);
          const px = at % source.width;
          const py = Math.floor(at / source.width);
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            if ((!ox && !oy) || px + ox < 0 || px + ox >= source.width || py + oy < 0 || py + oy >= source.height) continue;
            const next = (py + oy) * source.width + px + ox;
            if (!seen[next] && pixels[next * 4 + 3] >= 12) {
              seen[next] = 1;
              stack.push(next);
            }
          }
        }
        if (component.length > largest.length) largest = component;
      }
      const keep = new Uint8Array(source.width * source.height);
      for (const at of largest) keep[at] = 1;
      for (let at = 0; at < keep.length; at++) {
        if (!keep[at]) pixels[at * 4 + 3] = 0;
      }
      sourceCtx.putImageData(imageData, 0, 0);
      let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          if (pixels[(y * source.width + x) * 4 + 3] < 12) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) return source;
      const pad = 5;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(source.width - 1, maxX + pad); maxY = Math.min(source.height - 1, maxY + pad);
      const trimmed = document.createElement("canvas");
      trimmed.width = maxX - minX + 1;
      trimmed.height = maxY - minY + 1;
      trimmed.getContext("2d").drawImage(source, minX, minY, trimmed.width, trimmed.height,
        0, 0, trimmed.width, trimmed.height);
      return trimmed;
    }
    mSprites.run = [0, 1, 2, 3].map(cropM);
    mSprites.slumped = cropM(4);
    mSprites.recover = cropM(5);
    mSprites.idle = cropM(6);
    mSprites.happy = cropM(7);
  };

  /* The darkness is composited on its own layer so the lit area can be punched
     out of it. Doing this with a single gradient fill is not possible once the
     light is both a circle around her and a cone along her aim. */
  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d");

  function resize(canvasEl) {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.max(window.innerWidth / C.CANVAS_W, window.innerHeight / C.CANVAS_H);
    canvasEl.style.width = C.CANVAS_W * fit + "px";
    canvasEl.style.height = C.CANVAS_H * fit + "px";
    canvasEl.width = Math.round(C.CANVAS_W * fit * dpr);
    canvasEl.height = Math.round(C.CANVAS_H * fit * dpr);
    const ctx = canvasEl.getContext("2d");
    ctx.setTransform(fit * dpr, 0, 0, fit * dpr, 0, 0);
    mask.width = C.CANVAS_W;
    mask.height = C.CANVAS_H;
    return ctx;
  }

  function sx(worldX) {
    return worldX + OFFSET_X;
  }

  function sy(worldY, camY) {
    // worldY grows forward and is drawn upward, hence the subtraction.
    return PLAYER_SCREEN_Y - (worldY - camY);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function heartPath(ctx, x, y, size, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.scale(size / 24, size / 24);
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.bezierCurveTo(-3, 5, -11, 0, -11, -6);
    ctx.bezierCurveTo(-11, -13, -2, -15, 0, -9);
    ctx.bezierCurveTo(2, -15, 11, -13, 11, -6);
    ctx.bezierCurveTo(11, 0, 3, 5, 0, 9);
    ctx.closePath();
    ctx.restore();
  }

  function bandTop(camY) {
    return camY + PLAYER_SCREEN_Y + 120;
  }

  function bandBottom(camY) {
    return camY - (C.CANVAS_H - PLAYER_SCREEN_Y) - 120;
  }

  // ------------------------------------------------------------------- world

  function floorAndWalls(ctx, state) {
    const pal = state.pal;
    ctx.fillStyle = pal.floor;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    const background = state.zone && zoneBackgrounds[state.zone.key];
    if (background && background.complete && background.naturalWidth) {
      const tile = C.CANVAS_W;
      ctx.save();
      ctx.globalAlpha = 0.98;
      if (state.zone && state.zone.key === "room") {
        // Three non-overlapping world plates, each exactly one viewport high:
        // approach (-540), puzzle (0), M's room (+540). No tiling, repetition,
        // or camera-relative placement, so their architecture joins cleanly.
        const approachY = sy(-540, state.camY) - C.CANVAS_H / 2;
        const puzzleY = sy(0, state.camY) - C.CANVAS_H / 2;
        const mRoomY = sy(540, state.camY) - C.CANVAS_H / 2;
        if (roomApproachBackground.complete && roomApproachBackground.naturalWidth) {
          ctx.drawImage(roomApproachBackground, 0, approachY, C.CANVAS_W, C.CANVAS_H);
        }
        if (roomPuzzleBackground.complete && roomPuzzleBackground.naturalWidth) {
          ctx.drawImage(roomPuzzleBackground, 0, puzzleY, C.CANVAS_W, C.CANVAS_H);
        }
        ctx.drawImage(background, 0, mRoomY, C.CANVAS_W, C.CANVAS_H);
      } else {
        const scrollY = ((state.camY % tile) + tile) % tile;
        for (let y = scrollY - tile; y < C.CANVAS_H; y += tile) {
          ctx.drawImage(background, 0, y, tile, tile);
        }
      }
      ctx.restore();
    } else {
      const step = 72;
      ctx.strokeStyle = pal.wall;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.62;
      const first = Math.floor(bandBottom(state.camY) / step) * step;
      for (let y = first; y <= bandTop(state.camY); y += step) {
        const py = sy(y, state.camY);
        ctx.beginPath();
        ctx.moveTo(sx(C.WALL), py);
        ctx.lineTo(sx(C.CORRIDOR_W - C.WALL), py + Math.sin(y * .013) * 3);
        ctx.stroke();
      }
      for (let x = C.WALL; x <= C.CORRIDOR_W - C.WALL; x += step) {
        ctx.beginPath();
        ctx.moveTo(sx(x), 0);
        ctx.lineTo(sx(x), C.CANVAS_H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = pal.ink;
      ctx.globalAlpha = 0.12;
      const seedStart = Math.floor(bandBottom(state.camY) / 110);
      for (let i = seedStart; i < seedStart + 14; i++) {
        const wx = C.WALL + 45 + ((i * 197) % (C.CORRIDOR_W - C.WALL * 2 - 90));
        const wy = i * 110 + ((i * 47) % 67);
        const px = sx(wx);
        const py = sy(wy, state.camY);
        ctx.save();
        ctx.translate(px, py - 88);
        ctx.rotate((i % 7) * .31);
        ctx.fillRect(-7, -3, 14, 6);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    if (!(background && background.complete && background.naturalWidth)) {
      ctx.fillStyle = pal.wall;
      ctx.fillRect(0, 0, sx(C.WALL), C.CANVAS_H);
      ctx.fillRect(sx(C.CORRIDOR_W - C.WALL), 0, C.CANVAS_W - sx(C.CORRIDOR_W - C.WALL), C.CANVAS_H);
    }

    const vignette = ctx.createRadialGradient(C.CANVAS_W / 2, C.CANVAS_H / 2, 100,
      C.CANVAS_W / 2, C.CANVAS_H / 2, 560);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(2,1,8,.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
  }

  function drawCover(ctx, state) {
    const pal = state.pal;
    const visible = root.Zones.inBand(state.zone.cover, bandBottom(state.camY), bandTop(state.camY));
    for (const rect of visible) {
      const x = sx(rect.x);
      const y = sy(rect.y + rect.h, state.camY);
      // A stack of folders/books with a warm lantern tucked beside it.
      ctx.fillStyle = "rgba(0,0,0,.32)";
      roundedRect(ctx, x + 5, y + 8, rect.w, rect.h, 8);
      ctx.fill();
      const layers = Math.max(2, Math.min(5, Math.round(rect.h / 22)));
      for (let i = 0; i < layers; i++) {
        const ly = y + rect.h - ((i + 1) * rect.h / layers);
        ctx.fillStyle = i % 2 ? pal.prop : pal.wall;
        roundedRect(ctx, x + (i % 2) * 5, ly, rect.w - 6, rect.h / layers + 3, 5);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,220,180,.12)";
        ctx.stroke();
      }
      const lx = x + 14;
      const ly = y - 5;
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 58);
      glow.addColorStop(0, "rgba(255,187,105,.34)");
      glow.addColorStop(1, "rgba(255,170,90,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 58, ly - 58, 116, 116);
      ctx.fillStyle = "#ffd08a";
      ctx.fillRect(lx - 3, ly - 8, 6, 13);
      ctx.fillStyle = "#ffefc4";
      ctx.beginPath();
      ctx.arc(lx, ly - 10, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEndThoughts(ctx, state) {
    if (!state.zone || state.zone.key !== "work" || state.goalDir < 0) return;
    const thoughts = [
      "ทำไมฉันทำได้แค่นี้ล่ะ?",
      "ฉันน่าจะทำได้ดีกว่านี้",
      "ฉันต้องเก่งกว่านี้",
      "เป็นได้แค่นี้เองเหรอ?",
      "ยังไม่ดีพอ",
      "ยังไม่พอ",
    ];
    const firstY = 300;
    const gap = (state.zone.length - 520 - firstY) / (thoughts.length - 1);
    const finalStart = thoughts.length;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < thoughts.length; i++) {
      const worldY = firstY + i * gap;
      const py = sy(worldY, state.camY);
      if (py < -70 || py > C.CANVAS_H + 70) continue;
      const pressure = i / (thoughts.length - 1);
      const left = i % 2 === 0;
      const px = left ? 185 : C.CANVAS_W - 185;
      ctx.font = "400 " + Math.round(24 + pressure * 12) + "px " + TEXT_FACE;

      if (i >= finalStart) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((i % 2 ? 1 : -1) * (.08 + (i - finalStart) * .025));
        ctx.fillStyle = "rgba(239,92,117," + (.62 + (i - finalStart) * .1) + ")";
        ctx.shadowColor = "#ef3f61";
        ctx.shadowBlur = 18 + (i - finalStart) * 5;
        ctx.fillText(thoughts[i], 0, 0);
        ctx.restore();
        continue;
      }

      const measured = ctx.measureText(thoughts[i]).width;
      const w = Math.min(290, Math.max(200, measured + 48));
      const h = 68;

      ctx.save();
      ctx.translate(px, py - 88);
      ctx.rotate((i % 2 ? 1 : -1) * 0.025);
      ctx.shadowColor = "#ef3f61";
      ctx.shadowBlur = 8 + pressure * 13;
      ctx.fillStyle = "rgba(17,9,16," + (.52 + pressure * .26) + ")";
      ctx.strokeStyle = "rgba(232,84,105," + (.52 + pressure * .42) + ")";
      ctx.lineWidth = 2;
      roundedRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fill();
      ctx.stroke();

      // A small speech-tail makes each panel read as an intrusive thought.
      ctx.beginPath();
      const tailX = left ? w * .32 : -w * .32;
      ctx.moveTo(tailX - 10, h / 2);
      ctx.lineTo(tailX + (left ? 24 : -24), h / 2 + 18);
      ctx.lineTo(tailX + 10, h / 2);
      ctx.stroke();

      ctx.fillStyle = "#ef8c98";
      ctx.shadowBlur = 6 + pressure * 13;
      ctx.fillText(thoughts[i], 0, 2, w - 34);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawResponsibilitySigns(ctx, state) {
    if (!state.zone || state.zone.key !== "responsibility" || state.goalDir < 0) return;
    const lines = [
      "ยังมีเรื่องที่เราต้องจัดการ",
      "ขอทำตรงนี้ให้เสร็จก่อน",
      "เดี๋ยวค่อยพักก็ได้",
      "ทำไมสิ่งที่ต้องแบกถึงไม่ลดลงเลย ยังมีคนรออยู่",
      "ขออันนี้ก่อน",
      "พักทีหลัง",
      "เรายังหยุดไม่ได้",
      "อีกนิดเดียว",
      "อีกนิดเดียว... เรายังไหว",
    ];
    const firstY = 420;
    const gap = (state.zone.length - 620 - firstY) / (lines.length - 1);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < lines.length; i++) {
      const py = sy(firstY + i * gap, state.camY);
      if (py < -80 || py > C.CANVAS_H + 80) continue;
      const left = i % 2 === 0;
      const px = left ? 185 : C.CANVAS_W - 185;
      ctx.font = "400 25px " + TEXT_FACE;
      const w = Math.min(290, Math.max(200, ctx.measureText(lines[i]).width + 42));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((left ? -1 : 1) * .025);
      ctx.fillStyle = "rgba(19,17,11,.84)";
      ctx.strokeStyle = "rgba(233,178,83,.88)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#d99d3f";
      ctx.shadowBlur = 14;
      roundedRect(ctx, -w / 2, -34, w, 68, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f0ca7a";
      ctx.shadowBlur = 8;
      ctx.fillText(lines[i], 0, 1, w - 28);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawComparisonSigns(ctx, state) {
    if (!state.zone || state.zone.key !== "comparison" || state.goalDir < 0) return;
    const lines = [
      "คนอื่นไปถึงไหนแล้ว", "เขาไปไกลกว่าแล้วนะ", "เร็วกว่า",
      "เก่งกว่า", "ตามทันไหม?", "ทำไมเรายังอยู่ตรงนี้?", "คนอื่นทำได้แล้วนะ",
    ];
    const firstY = 390;
    const gap = (state.zone.length - 610 - firstY) / (lines.length - 1);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < lines.length; i++) {
      const py = sy(firstY + i * gap, state.camY);
      if (py < -80 || py > C.CANVAS_H + 80) continue;
      const left = i % 2 === 0;
      const px = left ? 185 : C.CANVAS_W - 185;
      ctx.font = "400 " + (i > 4 ? 27 : 24) + "px " + TEXT_FACE;
      const w = Math.min(290, Math.max(180, ctx.measureText(lines[i]).width + 42));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((left ? -1 : 1) * .025);
      ctx.fillStyle = "rgba(10,8,27,.88)";
      ctx.strokeStyle = "rgba(176,112,245,.92)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#9a5de1";
      ctx.shadowBlur = 16;
      roundedRect(ctx, -w / 2, -34, w, 68, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d5b4ff";
      ctx.shadowBlur = 9;
      ctx.fillText(lines[i], 0, 1, w - 26);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWhisperFigures(ctx, state) {
    if (!state.zone || state.zone.key !== "work" || state.goalDir < 0) return;
    const count = 6;
    const firstY = 300;
    const gap = (state.zone.length - 520 - firstY) / (count - 1);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const py = sy(firstY + i * gap, state.camY);
      if (py < -90 || py > C.CANVAS_H + 90) continue;
      const left = i % 2 === 0;
      const px = left ? 270 : C.CANVAS_W - 270;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(left ? 1 : -1, 1);
      ctx.fillStyle = "rgba(3,2,8,.9)";
      ctx.shadowColor = "rgba(226,69,98,.45)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(0, 20, 31, 52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(2, -34, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef6d86";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(-7, -36, 4, 7, -0.25, 0, Math.PI * 2);
      ctx.ellipse(10, -36, 4, 7, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(239,109,134,.62)";
      ctx.lineWidth = 2;
      for (let n = 0; n < 3; n++) {
        ctx.beginPath();
        ctx.moveTo(24, -24 + n * 10);
        ctx.quadraticCurveTo(42, -30 + n * 12, 55, -21 + n * 11);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawExitDoor(ctx, state) {
    // M's room is the end of the line — there's nowhere further to exit to.
    if (!state.zone || state.goalDir < 0 || state.zone.key === "room") return;
    const x = sx(C.CORRIDOR_W / 2);
    const y = sy(state.zone.length - 28, state.camY);
    if (y < -120 || y > C.CANVAS_H + 120) return;
    const near = state.player.y >= state.zone.length - 190;
    ctx.save();
    ctx.translate(x, y);

    // At the threshold, the same thought closes in from every side as neon
    // notification boards, echoing the PING! signs from the visual reference.
    if (state.zone.key === "work") {
      const signOffsets = [[-225, -92], [225, -82], [-235, 88], [235, 98]];
      ctx.font = "400 25px " + TEXT_FACE;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < signOffsets.length; i++) {
        ctx.save();
        ctx.translate(signOffsets[i][0], signOffsets[i][1]);
        ctx.rotate((i % 2 ? 1 : -1) * .035);
        ctx.shadowColor = "#ef3f61";
        ctx.shadowBlur = near ? 20 : 11;
        ctx.fillStyle = "rgba(20,9,17,.84)";
        ctx.strokeStyle = "#ed6678";
        ctx.lineWidth = 2.5;
        roundedRect(ctx, -112, -30, 224, 60, 7);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-9, 30);
        ctx.lineTo(0, 42);
        ctx.lineTo(9, 30);
        ctx.stroke();
        ctx.fillStyle = "#f18a99";
        ctx.shadowBlur = 12;
        ctx.fillText("ฉันยังไม่ดีพอ", 0, 1, 198);
        ctx.restore();
      }
    }

    const responsibility = state.zone.key === "responsibility";
    ctx.shadowColor = responsibility ? "#e5ac4e" : (near ? "#ff819d" : "rgba(255,167,112,.5)");
    ctx.shadowBlur = near ? 30 : 15;
    ctx.fillStyle = "#21151d";
    ctx.strokeStyle = responsibility ? "#e0aa53" : (near ? "#ff8098" : "#b66e69");
    ctx.lineWidth = 4;
    roundedRect(ctx, -68, -46, 136, 92, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(239,116,137,.16)";
    roundedRect(ctx, -54, -35, 108, 70, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,190,162,.42)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffd19e";
    ctx.beginPath();
    ctx.arc(42, 3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSigns(ctx, state) {
    const pal = state.pal;
    const visible = root.Zones.inBand(state.zone.signs, bandBottom(state.camY), bandTop(state.camY));
    ctx.textBaseline = "middle";

    for (const s of visible) {
      const x = sx(s.x);
      const y = sy(s.y, state.camY);

      if (s.kind === "monitor") {
        // A screen on the wall, still saying its line into an empty office.
        const w = 96;
        const h = 62;
        const mx = s.side < 0 ? x : x - w;
        ctx.fillStyle = pal.prop;
        ctx.fillRect(mx, y - h / 2, w, h);
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
        ctx.fillStyle = pal.accent;
        ctx.font = "700 11px " + TEXT_FACE;
        ctx.textAlign = "center";
        // Wrap on spaces so MEETING IN 5 MINUTES fits a small screen.
        const words = s.text.split(" ");
        const lines = [];
        let line = "";
        for (const word of words) {
          const next = line ? line + " " + word : word;
          if (next.length > 9 && line) { lines.push(line); line = word; } else { line = next; }
        }
        if (line) lines.push(line);
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], mx + w / 2, y - ((lines.length - 1) * 13) / 2 + i * 13);
        }
      }
    }
  }

  function drawMemories(ctx, state) {
    const visible = root.Zones.inBand(state.zone.memories, bandBottom(state.camY), bandTop(state.camY));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < state.zone.memories.length; i++) {
      const m = state.zone.memories[i];
      if (!visible.includes(m)) continue;
      if (state.picked.has(state.zone.index + ":" + i)) continue;

      const x = sx(m.x);
      const y = sy(m.y, state.camY);
      const pulse = reducedMotion.matches ? 1 : 1 + Math.sin(state.time * 2.5 + i) * 0.08;

      // Its own little pool of light — the object is the light, which is the
      // whole conceit of the mechanic.
      const g = ctx.createRadialGradient(x, y, 0, x, y, 54 * pulse);
      g.addColorStop(0, "rgba(255,232,190,.34)");
      g.addColorStop(1, "rgba(255,232,190,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 54 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 26 * pulse + "px system-ui";
      ctx.fillText(m.icon, x, y);
    }
  }

  function drawMemoryChest(ctx, state) {
    const chest = state.memoryChest;
    if (!chest || !chest.visible || chest.stage === "collected" || state.goalDir < 0) return;
    const x = sx(chest.x);
    const y = sy(chest.y, state.camY);
    if (y < -100 || y > C.CANVAS_H + 100) return;
    const pulse = reducedMotion.matches ? 1 : 1 + Math.sin(state.time * 3.2) * .07;
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 92 * pulse);
    glow.addColorStop(0, "rgba(255,211,105,.42)");
    glow.addColorStop(.55, "rgba(170,91,244,.20)");
    glow.addColorStop(1, "rgba(170,91,244,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 92 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    if (chest.stage === "sealed" && memoryChestImage.complete && memoryChestImage.naturalWidth) {
      // Smaller than a character: it reads as a dropped reward, not scenery.
      ctx.drawImage(memoryChestImage, -28, -28, 56, 56);
    } else if (chest.stage === "light") {
      // Once broken, only the memory-light remains for her to approach.
      ctx.rotate(reducedMotion.matches ? 0 : state.time * .65);
      ctx.strokeStyle = "rgba(255,220,126,.74)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 20 + i * 9, i * 1.7, i * 1.7 + Math.PI * 1.05);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff4bf";
      ctx.shadowColor = "#ffd56e";
      ctx.shadowBlur = 24;
      heartPath(ctx, 0, 0, 24, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // ----------------------------------------------------------------- enemies

  function drawEnemy(ctx, state, e) {
    const spec = R.enemySpec(e);
    const pal = state.pal;
    const x = sx(e.x);
    const y = sy(e.y, state.camY);
    const wob = reducedMotion.matches ? 0 : Math.sin(state.time * 3 + e.seed * 9) * 0.14;
    const hurt = e.flash > 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = hurt ? "#fff2f7" : "#090711";
    ctx.strokeStyle = hurt ? "#ff9fc2" : "rgba(117,78,135,.35)";

    // Every threat shares the same shadow-creature language from the concept;
    // size and small accessories still distinguish the gameplay archetypes.
    ctx.shadowColor = hurt ? "#ff82b5" : "rgba(83,35,105,.72)";
    ctx.shadowBlur = hurt ? 24 : 12;
    ctx.beginPath();
    ctx.ellipse(0, 3, spec.r * 1.12, spec.r * .88,
      wob * .5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-spec.r * .72, -spec.r * .3);
    ctx.lineTo(-spec.r * .48, -spec.r * 1.02);
    ctx.lineTo(-spec.r * .08, -spec.r * .54);
    ctx.lineTo(spec.r * .42, -spec.r * .98);
    ctx.lineTo(spec.r * .66, -spec.r * .28);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = hurt ? "#fff" : "#ff77bd";
    ctx.shadowColor = "#ff58b0";
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.ellipse(-6, -4, 2.5, 4, -.15, 0, Math.PI * 2);
    ctx.ellipse(6, -4, 2.5, 4, .15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (e.kind === "paper" || e.kind === "notif") {
      ctx.fillStyle = "rgba(232,208,218,.82)";
      ctx.rotate(wob);
      roundedRect(ctx, -spec.r * .9, spec.r * .55, spec.r * 1.8, 9, 3);
      ctx.fill();
      if (e.kind === "notif") {
        ctx.fillStyle = "#ff639f";
        ctx.beginPath();
        ctx.arc(spec.r * .75, spec.r * .53, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.kind === "number") {
      ctx.font = "800 " + spec.r * 1.05 + "px " + TEXT_FACE;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,205,224,.8)";
      ctx.fillText(String(Math.floor(e.seed * 90) + 10), 0, spec.r * .72);
    }

    if (state.zone.key === "work" && state.player.y > state.zone.length - 700) {
      ctx.font = "400 20px " + TEXT_FACE;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#ef7890";
      ctx.shadowColor = "#ef3f61";
      ctx.shadowBlur = 12;
      ctx.fillText("ยังไม่พอ", 0, -spec.r - 13);
    }

    ctx.restore();
  }

  function drawBullets(ctx, state) {
    for (const b of state.bullets) {
      const x = sx(b.x);
      const y = sy(b.y, state.camY);
      // A short tail along the direction of travel, so a shot reads as a shot
      // rather than as a dot that teleports.
      const grad = ctx.createLinearGradient(x, y, x - b.vx * .028, y + b.vy * .028);
      grad.addColorStop(0, "rgba(255,224,242,1)");
      grad.addColorStop(1, "rgba(255,79,160,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - b.vx * 0.028, y + b.vy * 0.028);
      ctx.stroke();
      ctx.fillStyle = "#fff3f9";
      ctx.shadowColor = "#ff58a6";
      ctx.shadowBlur = 15;
      heartPath(ctx, x, y, 15, Math.atan2(-b.vy, b.vx) - Math.PI / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawHeartWaves(ctx, state) {
    for (const wave of state.heartWaves || []) {
      const x = sx(wave.x);
      const y = sy(wave.y, state.camY);
      const alpha = Math.max(0, Math.min(1, wave.life / .24));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ff5fad";
      ctx.shadowColor = "#ff4fa0";
      ctx.shadowBlur = 28;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(x, y, wave.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,239,197,.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, wave.r - 7), 0, Math.PI * 2);
      ctx.stroke();

      // A crown of hearts travels on the expanding edge, so this reads as a
      // heart wave even in peripheral vision rather than as a plain shockwave.
      ctx.fillStyle = "#fff1f7";
      ctx.shadowColor = "#ff4f9f";
      ctx.shadowBlur = 16;
      const heartCount = 12;
      for (let i = 0; i < heartCount; i++) {
        const a = (i / heartCount) * Math.PI * 2 + state.time * .7;
        const hx = x + Math.cos(a) * wave.r;
        const hy = y + Math.sin(a) * wave.r;
        heartPath(ctx, hx, hy, 14, a - Math.PI / 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParticles(ctx, state) {
    for (const p of state.particles) {
      const x = sx(p.x);
      const y = sy(p.y, state.camY);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.colour === state.pal.enemy ? "#ff7eb8" : p.colour;
      ctx.shadowColor = "#ff6baa";
      ctx.shadowBlur = 7;
      heartPath(ctx, 0, 0, p.size, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- figures

  /*
   * A figure seen from a raised three-quarter angle: body and gun rotate to face
   * the aim, the photo head stays upright. The head has to stay upright or it
   * stops being a photograph of a person and starts being a texture.
   */
  function drawFigure(ctx, faceImg, x, y, aimX, aimY, opts) {
    const o = opts || {};
    const scale = o.scale || 1;
    /*
     * The head is deliberately smaller than the torso and sits well above its
     * centre. Earlier it was both bigger and centred, and the result was a
     * floating photograph: the body was entirely behind the face at every angle.
     */
    const headR = 13 * scale;
    const headLift = 13 * scale;
    const angle = Math.atan2(-aimY, aimX);

    // Ground shadow, so she is standing on the floor rather than floating over it.
    ctx.fillStyle = "rgba(0,0,0,.38)";
    ctx.beginPath();
    ctx.ellipse(x, y + 19 * scale, 20 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (!o.slumped) {
      // Torso: wide across the shoulders, narrow front-to-back, sat below the head.
      ctx.fillStyle = o.coat || "#e9e9f2";
      ctx.beginPath();
      ctx.ellipse(0, 0, 14 * scale, 19 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      if (o.armed) {
        ctx.strokeStyle = o.coat || "#e9e9f2";
        ctx.lineWidth = 6 * scale;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(6 * scale, -9 * scale);
        ctx.lineTo(21 * scale, -4 * scale);
        ctx.stroke();
        // Heart Lantern Wand: a warm gold stem with a bright heart at its tip.
        ctx.strokeStyle = "#e7a56e";
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        ctx.moveTo(19 * scale, -4 * scale);
        ctx.lineTo(38 * scale, -4 * scale);
        ctx.stroke();
        ctx.fillStyle = "#fff0f7";
        ctx.shadowColor = "#ff66ad";
        ctx.shadowBlur = 18 * scale;
        heartPath(ctx, 43 * scale, -4 * scale, 14 * scale, -Math.PI / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else {
      // Sitting: knees up, shoulders dropped forward.
      ctx.fillStyle = o.coat || "#c9d2de";
      ctx.beginPath();
      ctx.ellipse(0, 3 * scale, 13 * scale, 16 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = o.coat || "#c9d2de";
      ctx.lineWidth = 7 * scale;
      ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(2 * scale, side * 7 * scale);
        ctx.lineTo(17 * scale, side * 11 * scale);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Head: circle-clipped photo, always upright.
    const hy = y - (o.slumped ? 7 * scale : headLift);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, hy, headR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#2a3352";
    ctx.fill();
    ctx.clip();
    if (faceImg && faceImg.complete && faceImg.naturalWidth) {
      ctx.drawImage(faceImg, x - headR, hy - headR, headR * 2, headR * 2);
    }
    ctx.restore();

    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = o.rim || "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.arc(x, hy, headR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Persists across frames so idle facing (outside the room) keeps whichever
  // way she was last actually walked, instead of snapping back to the idle
  // art's default orientation the instant she stops.
  let playerFacingLeft = false;

  function drawPlayer(ctx, state) {
    const p = state.player;
    const x = sx(p.x);
    const y = sy(p.y, state.camY);
    // Blink while invulnerable, so the free window after a hit is legible.
    if (p.invulnT > 0 && !reducedMotion.matches && Math.floor(state.time * 14) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    const aura = ctx.createRadialGradient(x, y, 0, x, y, 76);
    aura.addColorStop(0, "rgba(255,188,132,.23)");
    aura.addColorStop(.58, "rgba(255,146,183,.09)");
    aura.addColorStop(1, "rgba(255,130,180,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, 76, 0, Math.PI * 2);
    ctx.fill();
    const speed = Math.hypot(p.vx || 0, p.vy || 0);
    const frames = characterSprites.run;
    const sprite = speed > 22 && frames.length
      ? frames[Math.floor(state.time * 8) % frames.length]
      : characterSprites.idle;

    if (Math.abs(p.vx || 0) > 4) playerFacingLeft = p.vx < 0;

    if (sprite) {
      const h = 92;
      const w = h * (sprite.width / sprite.height);
      ctx.save();
      ctx.translate(x, y + 18);
      const idle = sprite === characterSprites.idle;
      // Standing still in the room, next to him: face him rather than
      // whichever way she was last walking. Standing still anywhere else:
      // keep facing whichever way she was last actually walking, instead of
      // snapping to the idle art's default the instant she stops. Running
      // keeps its own left/right from the current velocity, untouched.
      const faceM = idle && state.zone && state.zone.key === "room" && state.m;
      const flipLeft = faceM ? p.x > state.m.x : (idle ? playerFacingLeft : (p.vx || 0) < -4);
      if (flipLeft) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -w / 2, -h + 8, w, h);
      ctx.restore();

      // Casting is radial now, so there is no aim arrow/heart attached to her.
    } else {
      drawFigure(ctx, faces.her, x, y, p.aimX, p.aimY, {
        armed: state.gunEnabled,
        coat: "#f6edf0",
        rim: "#ffb2cd",
      });
    }
    ctx.globalAlpha = 1;
  }

  /*
   * M, in the room and then walking home. `heal` is null everywhere except the
   * room, where it carries the ring and the percentage.
   */
  function drawM(ctx, state) {
    if (!state.m) return;
    const x = sx(state.m.x);
    const y = sy(state.m.y, state.camY);
    const heal = state.heal;

    // The recovery is intentionally stepped: each completed part of the heal
    // returns a little more colour/light instead of making him bright at once.
    const healStep = heal ? Math.floor(heal.fill * 5 + 0.0001) / 5 : 1;

    if (heal) {
      // His own pool of light, brightening as he comes back.
      const glow = 68 + healStep * 112;
      const g = ctx.createRadialGradient(x, y, 0, x, y, glow);
      g.addColorStop(0, "rgba(255,214,196," + (0.035 + healStep * 0.3) + ")");
      g.addColorStop(1, "rgba(255,214,196,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fill();
    }

    let sprite = null;
    if (heal && !heal.done) {
      sprite = heal.fill < .56 ? mSprites.slumped : mSprites.recover;
    } else if (heal && heal.done) {
      sprite = mSprites.happy;
    } else {
      sprite = mSprites.idle;
    }

    if (sprite) {
      // She is 92px tall, but her sprite sheet crop is a plain grid cell with
      // a lot of headroom baked in — her actual body only fills ~78% of that
      // 92px box. M's crop is trimmed tight to his silhouette (~97% fill), so
      // matching the raw 92 number reads visibly bigger than her. 74 is what
      // actually makes his visible body match hers (measured against both
      // sprite sheets directly, not eyeballed). He's shorter still (64) while
      // slumped and healing.
      const spriteH = (heal && !heal.done) ? 64 : 74;
      const spriteW = spriteH * (sprite.width / sprite.height);
      ctx.save();
      ctx.translate(x, y + 18);
      if (heal && !heal.done) {
        const brightness = 0.24 + healStep * 0.76;
        const saturation = 0.18 + healStep * 0.82;
        ctx.filter = "brightness(" + brightness + ") saturate(" + saturation + ")";
      }
      ctx.drawImage(sprite, -spriteW / 2, -spriteH + 10, spriteW, spriteH);
      ctx.restore();
    } else {
      drawFigure(ctx, faces.m, x, y, state.m.aimX || 0, state.m.aimY || 1, {
        slumped: !!heal && !heal.done,
        coat: "#cdd6e2",
        rim: "rgba(255,255,255,.7)",
      });
    }

    if (!heal) return;

    // A heart directly over his head, filling like a liquid gauge as `fill`
    // rises — the ring/bar this replaced sat centred on the whole canvas,
    // detached from him; this stays pinned to his own x so it reads as his.
    const heartSize = 30;
    const heartCx = x;
    const heartCy = y - 96;
    drawHeartGauge(ctx, heartCx, heartCy, heartSize, heal.fill, heal.done);
  }

  /* Bezier heart centred at (cx, cy + size/2), size tall/wide. */
  function heartPath(ctx, cx, cy, size) {
    const top = cy + size * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx, cy, cx - size / 2, cy, cx - size / 2, top);
    ctx.bezierCurveTo(
      cx - size / 2, cy + (size + size * 0.3) / 2,
      cx, cy + (size + size * 0.3) / 2,
      cx, cy + size
    );
    ctx.bezierCurveTo(
      cx, cy + (size + size * 0.3) / 2,
      cx + size / 2, cy + (size + size * 0.3) / 2,
      cx + size / 2, top
    );
    ctx.bezierCurveTo(cx + size / 2, cy, cx, cy, cx, top);
    ctx.closePath();
  }

  function drawHeartGauge(ctx, cx, cy, size, fill, done) {
    ctx.save();
    heartPath(ctx, cx, cy, size);
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fill();

    ctx.save();
    heartPath(ctx, cx, cy, size);
    ctx.clip();
    const fillTop = cy + size - size * R.clamp(fill, 0, 1);
    ctx.fillStyle = done ? "#ff8fa3" : "#ffc2ce";
    ctx.fillRect(cx - size, fillTop, size * 2, size * 2);
    ctx.restore();

    heartPath(ctx, cx, cy, size);
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawRoomStarAndMist(ctx, state) {
    const gate = state.roomGate;
    if (!gate || state.zone.key !== "room") return;
    const points = gate.pedestals.concat([gate.heart]);

    // Dormant constellation engraved across the chamber floor. Each placed
    // star wakes only its own branch; the centre remains visually open.
    const heartScreen = { x: sx(points[3].x), y: sy(points[3].y, state.camY) + 18 };
    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < 3; i++) {
      const p = points[i];
      const px = sx(p.x);
      const py = sy(p.y, state.camY) + 18;
      const active = !!p.placed;
      ctx.strokeStyle = active ? "rgba(238,174,205,.34)" : "rgba(132,116,145,.13)";
      ctx.lineWidth = active ? 1.7 : 1.1;
      ctx.shadowColor = active ? "rgba(255,141,196,.5)" : "transparent";
      ctx.shadowBlur = active ? 7 : 0;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(heartScreen.x, heartScreen.y);
      ctx.stroke();

      // A faint five-point floor mark and restrained local halo around each
      // altar make it feel installed in the ancient chamber, not pasted on it.
      ctx.save();
      ctx.translate(px, py + 2);
      ctx.strokeStyle = active ? "rgba(245,185,211,.3)" : "rgba(145,126,153,.12)";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      for (let n = 0; n < 10; n++) {
        const a = -Math.PI / 2 + n * Math.PI / 5;
        const rr = n % 2 ? 18 : 34;
        const xx = Math.cos(a) * rr;
        const yy = Math.sin(a) * rr * .45;
        if (!n) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      const halo = ctx.createRadialGradient(px, py, 0, px, py, 62);
      halo.addColorStop(0, active ? "rgba(255,162,201,.11)" : "rgba(162,130,172,.035)");
      halo.addColorStop(1, "rgba(255,150,200,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(px, py + 5, 62, 25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Only after all stars are placed do the three branches converge visibly
    // on the still-empty heart point during its short reveal beat.
    if (gate.placed === 3 && !gate.heartReady) {
      const reveal = R.clamp(gate.waitT / 1.6, 0, 1);
      ctx.fillStyle = "rgba(255,209,229," + (.08 + reveal * .22) + ")";
      ctx.shadowColor = "#ffb5d3";
      ctx.shadowBlur = 10 * reveal;
      ctx.beginPath();
      ctx.arc(heartScreen.x, heartScreen.y, 3 + reveal * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i < points.length; i++) {
      const isHeart = i === 3;
      // After the third star, the centre shines and fractures before the
      // heart pedestal appears. Only this short reveal moves; placed altars
      // stay completely still.
      if (isHeart && !gate.heartReady) {
        if (gate.placed === 3 && gate.waitT > .35 && pedestalSheet.complete && pedestalSheet.naturalWidth) {
          const reveal = R.clamp((gate.waitT - .35) / 1.15, 0, 1);
          const sourceW = pedestalSheet.naturalWidth / 5;
          const drawW = 58 + reveal * 38;
          const drawH = drawW * pedestalSheet.naturalHeight / sourceW;
          ctx.save();
          ctx.globalAlpha = Math.sin(reveal * Math.PI) * .95;
          ctx.translate(sx(points[3].x), sy(points[3].y, state.camY));
          ctx.drawImage(pedestalSheet, sourceW * 2, 0, sourceW, pedestalSheet.naturalHeight,
            -drawW / 2, -drawH + 24, drawW, drawH);
          ctx.restore();
        }
        continue;
      }
      const p = points[i];
      const x = sx(p.x);
      const y = sy(p.y, state.camY);
      const lit = isHeart ? gate.heartPlaced : !!p.placed;
      ctx.save();
      // Every pedestal shares the same world-space centre. The heart pedestal
      // sits directly in front of the middle star pedestal without an X offset.
      ctx.translate(x, y);
      if (pedestalSheet.complete && pedestalSheet.naturalWidth) {
        const frame = isHeart ? (lit ? 4 : 3) : (lit ? 1 : 0);
        const sourceX = Math.floor(frame * pedestalSheet.naturalWidth / 5);
        const sourceEnd = Math.floor((frame + 1) * pedestalSheet.naturalWidth / 5);
        const sourceW = sourceEnd - sourceX;
        // Keep the authored sprite compact next to the 92px heroine.
        const drawW = isHeart && lit ? 92 : 82;
        const drawH = drawW * (pedestalSheet.naturalHeight / sourceW);
        if (isHeart && !lit) {
          // The heart altar rises with a quick soft pop after the centre light
          // breaks. It settles completely and does not keep pulsing.
          const t = R.clamp(gate.heartRevealT || 0, 0, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          ctx.globalAlpha = t;
          ctx.translate(0, (1 - eased) * 22);
          ctx.scale(.72 + eased * .28, .72 + eased * .28);
          ctx.drawImage(pedestalSheet, sourceX, 0, sourceW, pedestalSheet.naturalHeight,
            -drawW / 2, -drawH + 28, drawW, drawH);
        } else if (!isHeart && lit) {
          // The pedestal and collectible are deliberately separate elements.
          // Draw the complete empty altar once; it never moves or scales.
          const emptySourceW = pedestalSheet.naturalWidth / 5;
          ctx.drawImage(pedestalSheet, 0, 0, emptySourceW, pedestalSheet.naturalHeight,
            -drawW / 2, -drawH + 28, drawW, drawH);

          // A small pool of light sits in the slot, directly below the star.
          const slotY = -38;
          const glow = ctx.createRadialGradient(0, slotY, 1, 0, slotY, 18);
          glow.addColorStop(0, "rgba(255,245,205,.98)");
          glow.addColorStop(.35, "rgba(255,167,194,.78)");
          glow.addColorStop(1, "rgba(255,130,183,0)");
          ctx.fillStyle = glow;
          ctx.save();
          ctx.scale(1, .42);
          ctx.beginPath();
          ctx.arc(0, slotY / .42, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // The star is its own complete transparent asset, so it can never be
          // clipped by the pedestal frame and can move independently.
          const gemW = floatingGemSheet.naturalWidth / 2;
          const starW = 43;
          const starH = starW * floatingGemSheet.naturalHeight / gemW;
          const wiggleY = reducedMotion.matches ? 0 : Math.sin(state.time * 1.8 + i * 1.3) * 5;
          if (floatingGemSheet.complete && floatingGemSheet.naturalWidth) {
            ctx.drawImage(floatingGemSheet, 0, 0, gemW, floatingGemSheet.naturalHeight,
              -starW / 2, slotY - 24 - starH + wiggleY, starW, starH);
          }
        } else if (isHeart && lit && floatingGemSheet.complete && floatingGemSheet.naturalWidth) {
          // Activated heart uses the same separated treatment as the stars:
          // fixed empty pedestal, independent floating heart, subtle motion.
          const emptyHeartX = Math.floor(3 * pedestalSheet.naturalWidth / 5);
          const emptyHeartW = Math.floor(4 * pedestalSheet.naturalWidth / 5) - emptyHeartX;
          ctx.drawImage(pedestalSheet, emptyHeartX, 0, emptyHeartW, pedestalSheet.naturalHeight,
            -drawW / 2, -drawH + 28, drawW, drawH);
          const gemW = floatingGemSheet.naturalWidth / 2;
          const heartW = 47;
          const heartH = heartW * floatingGemSheet.naturalHeight / gemW;
          const wiggleY = reducedMotion.matches ? 0 : Math.sin(state.time * 1.65 + 1.2) * 4;
          ctx.drawImage(floatingGemSheet, gemW, 0, gemW, floatingGemSheet.naturalHeight,
            -heartW / 2, -59 - heartH + wiggleY, heartW, heartH);
        } else {
          ctx.drawImage(pedestalSheet, sourceX, 0, sourceW, pedestalSheet.naturalHeight,
            -drawW / 2, -drawH + 28, drawW, drawH);
        }
      }
      ctx.restore();
    }
  }

  function drawRoomFogOverlay(ctx, state) {
    const gate = state.roomGate;
    if (!gate || state.zone.key !== "room" || !roomFogMain.complete ||
        !roomFogMain.naturalWidth) return;
    const open = gate.openT || 0;
    if (open >= 1) return;

    const visualState = gate.fogUnlocked ? "opened" :
      gate.heartPlaced ? "opening" :
      gate.heartReady ? "haunted" :
      gate.placed > 0 ? "disturbed" : "idle";
    const doorW = 560;
    const doorX = C.CANVAS_W / 2 - doorW / 2;
    const naturalAspect = roomFogMain.naturalWidth / roomFogMain.naturalHeight;
    const wallH = doorW / naturalAspect;
    const barrierY = sy(154, state.camY);
    const wallY = barrierY - wallH;
    const targetIntensity = visualState === "disturbed" ? 1.35 : visualState === "haunted" ? 1.5 : 1;
    // Never let an input/state change alter the animation phase in one frame.
    // Ease only the visual density while every texture keeps flowing at its
    // original continuous speed.
    if (!Number.isFinite(gate._fogVisualIntensity)) gate._fogVisualIntensity = 1;
    gate._fogVisualIntensity += (targetIntensity - gate._fogVisualIntensity) * .025;
    const intensity = gate._fogVisualIntensity;
    const fadeOpen = 1 - (open * open * (3 - 2 * open));
    ctx.save();

    // Flow the texture inside a fixed doorway frame. Each layer has its own
    // timing, opacity and source phase; the PNG bounds never become gameplay
    // collision and the authored aspect ratio is preserved.
    const drawFlowLayer = function (image, alpha, speed, phase, widthScale, yOffset) {
      if (!image.complete || !image.naturalWidth) return;
      const dw = doorW * widthScale;
      const dh = dw / (image.naturalWidth / image.naturalHeight);
      const dx = C.CANVAS_W / 2 - dw / 2;
      const dy = barrierY - dh + yOffset;
      const sourceShift = reducedMotion.matches ? 0 :
        ((state.time * speed + phase) % 1 + 1) % 1 * image.naturalWidth;
      const bufferScale = window.devicePixelRatio > 1 ? 1.5 : 1;
      const bw = Math.max(1, Math.ceil(dw * bufferScale));
      const bh = Math.max(1, Math.ceil(dh * bufferScale));
      if (roomFogLayerCanvas.width !== bw || roomFogLayerCanvas.height !== bh) {
        roomFogLayerCanvas.width = bw;
        roomFogLayerCanvas.height = bh;
      }
      const bctx = roomFogLayerCtx;
      bctx.setTransform(bufferScale, 0, 0, bufferScale, 0, 0);
      bctx.clearRect(0, 0, dw, dh);
      const drawFlow = function () {
        const firstW = image.naturalWidth - sourceShift;
        const firstDW = dw * firstW / image.naturalWidth;
        bctx.drawImage(image, sourceShift, 0, firstW, image.naturalHeight,
          0, 0, firstDW, dh);
        if (sourceShift > 0) bctx.drawImage(image, 0, 0, sourceShift, image.naturalHeight,
          firstDW, 0, dw - firstDW, dh);
      };
      drawFlow();

      // Feather all authored edges so the moving texture dissolves naturally
      // into the room. Two masks avoid the squared-off left/right and top
      // edges without changing the fog's dimensions or its collision line.
      bctx.globalCompositeOperation = "destination-in";
      let mask = bctx.createLinearGradient(0, 0, dw, 0);
      mask.addColorStop(0, "rgba(0,0,0,0)");
      mask.addColorStop(.07, "rgba(0,0,0,.45)");
      mask.addColorStop(.16, "rgba(0,0,0,1)");
      mask.addColorStop(.84, "rgba(0,0,0,1)");
      mask.addColorStop(.93, "rgba(0,0,0,.45)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      bctx.fillStyle = mask;
      bctx.fillRect(0, 0, dw, dh);
      mask = bctx.createLinearGradient(0, 0, 0, dh);
      mask.addColorStop(0, "rgba(0,0,0,0)");
      mask.addColorStop(.12, "rgba(0,0,0,.62)");
      mask.addColorStop(.3, "rgba(0,0,0,1)");
      mask.addColorStop(.92, "rgba(0,0,0,1)");
      mask.addColorStop(1, "rgba(0,0,0,.82)");
      bctx.fillStyle = mask;
      bctx.fillRect(0, 0, dw, dh);
      bctx.globalCompositeOperation = "source-over";
      bctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.save();
      ctx.globalAlpha = alpha * fadeOpen;
      ctx.filter = "saturate(.76) brightness(.72)";
      // Opening is a stationary dissolve. Moving the two halves outward made
      // the barrier feel mechanical and caused a visible positional snap.
      ctx.drawImage(roomFogLayerCanvas, dx, dy, dw, dh);
      ctx.restore();
    };
    drawFlowLayer(roomFogBack, .18 * intensity, .010, .16, 1.05, -3);
    drawFlowLayer(roomFogMain, .31 * intensity, -.016, .43, 1, 0);
    drawFlowLayer(roomFogFront, .15 * intensity, .024, .71, .96, 2);

    // The monster is embedded in the mist with blurred, unstable ghost copies.
    // It never becomes fully crisp or fully opaque.
    if ((visualState === "haunted" || visualState === "opening") &&
        roomFogFace.complete && roomFogFace.naturalWidth) {
      const reveal = visualState === "opening" ? fadeOpen :
        Math.min(1, Math.max(0, (gate.heartRevealT || 0) / .8));
      const jitter = reducedMotion.matches ? 0 : Math.sin(state.time * 5.1) * 3;
      const fw = 155 + Math.sin(state.time * 2.3) * 4;
      const fh = fw;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.globalCompositeOperation = i === 2 ? "screen" : "source-over";
        ctx.globalAlpha = reveal * (.07 + i * .025);
        ctx.filter = `blur(${10 - i * 2}px) saturate(.65) brightness(.7)`;
        const jx = jitter * (i - 1);
        const jy = Math.cos(state.time * (3.2 + i)) * 2;
        ctx.drawImage(roomFogFace, C.CANVAS_W / 2 - fw / 2 + jx,
          wallY + wallH * .12 + jy, fw, fh);
        ctx.restore();
      }
    }

    // State-sensitive motes fade in place with the veil.
    const moteCount = visualState === "disturbed" || visualState === "haunted" ? 11 : 6;
    ctx.globalAlpha = (.11 + intensity * .025) * fadeOpen;
    if (!reducedMotion.matches) {
      ctx.fillStyle = "#d5b0ff";
      for (let i = 0; i < moteCount; i++) {
        const phase = state.time * (.18 + intensity * .04) + i * 2.1;
        const px = doorX + 18 + ((i * 47 + Math.sin(phase) * 12) % (doorW - 36));
        const py = wallY + 12 + ((i * 29 + state.time * 4 * intensity) % Math.max(24, wallH - 20));
        ctx.beginPath();
        ctx.arc(px, py, 1 + i % 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRoomBeyondMistDarkness(ctx, state) {
    if (!state.zone || state.zone.key !== "room" || !state.roomGate) return;

    // Everything beyond the mist belongs to M's quiet room. It remains almost
    // black even after the centre path opens; the lantern is the only local
    // source that lets his silhouette and the rug show through — until he's
    // healed. colourT ramps 0->1 only once healing completes (see the
    // "colour" phase in main.js), so this fades away in step with that,
    // and he reads exactly as lit as she is by the time he's on his feet.
    const dim = 1 - (state.colourT || 0);
    if (dim <= 0.001) return;
    const mistY = sy(280, state.camY);
    const lanternX = sx(state.m.x + 105);
    const lanternY = sy(state.m.y + 12, state.camY);
    const shade = ctx.createRadialGradient(
      lanternX, lanternY, 24,
      lanternX, lanternY, 245
    );
    shade.addColorStop(0, "rgba(8,6,12,.26)");
    shade.addColorStop(.32, "rgba(7,6,12,.5)");
    shade.addColorStop(.72, "rgba(3,3,9,.8)");
    shade.addColorStop(1, "rgba(1,2,7,.92)");

    ctx.save();
    ctx.globalAlpha = dim;
    ctx.beginPath();
    ctx.rect(0, 0, C.CANVAS_W, Math.max(0, mistY + 8));
    ctx.clip();
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // A very restrained warm halo makes the light read as a lantern rather
    // than a second player spotlight.
    const warm = ctx.createRadialGradient(
      lanternX, lanternY, 0,
      lanternX, lanternY, 105
    );
    warm.addColorStop(0, "rgba(255,207,132,.16)");
    warm.addColorStop(1, "rgba(255,176,92,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(lanternX - 110, lanternY - 110, 220, 220);
    ctx.restore();
  }

  // ----------------------------------------------------------------- weather

  function drawRain(ctx, state) {
    if (!state.rain || reducedMotion.matches) return;
    ctx.strokeStyle = "rgba(190,210,235,.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      // Deterministic per-streak position, animated by time — cheaper and calmer
      // than a real particle system, and it never clumps.
      const seed = i * 12.9898;
      const px = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1 * C.CANVAS_W;
      const speed = 700 + (((Math.cos(seed) * 12345.6789) % 1 + 1) % 1) * 500;
      const py = (state.time * speed + i * 97) % (C.CANVAS_H + 60) - 30;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 3, py + 16);
      ctx.stroke();
    }
  }

  /*
   * Darkness, punched through with her light: a soft circle around her and a
   * wider cone along the aim. Drawn on the mask layer, then laid over the world.
   */
  function drawDarkness(ctx, state) {
    // The final area has authored lighting by room: the approach and puzzle
    // chamber stay readable, while drawRoomBeyondMistDarkness darkens only the
    // separate room behind the fog. A player-centred mask here would dim both
    // rooms and erase that contrast.
    if (state.zone && state.zone.key === "room") return;
    if (state.darkAlpha <= 0.001) return;
    const r = state.visionR;
    const x = sx(state.player.x);
    const y = sy(state.player.y, state.camY);

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = "#04040a";
    mctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    mctx.globalCompositeOperation = "destination-out";

    const near = mctx.createRadialGradient(x, y, 0, x, y, r);
    near.addColorStop(0, "rgba(0,0,0,1)");
    near.addColorStop(0.55, "rgba(0,0,0,.96)");
    near.addColorStop(1, "rgba(0,0,0,0)");
    mctx.fillStyle = near;
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fill();

    // The forward throw of the torch, offset along the aim.
    const fx = x + state.player.aimX * r * 0.55;
    const fy = y - state.player.aimY * r * 0.55;
    const far = mctx.createRadialGradient(fx, fy, 0, fx, fy, r * 0.9);
    far.addColorStop(0, "rgba(0,0,0,.85)");
    far.addColorStop(1, "rgba(0,0,0,0)");
    mctx.fillStyle = far;
    mctx.beginPath();
    mctx.arc(fx, fy, r * 0.9, 0, Math.PI * 2);
    mctx.fill();

    mctx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.globalAlpha = state.darkAlpha;
    ctx.drawImage(mask, 0, 0, C.CANVAS_W, C.CANVAS_H);
    ctx.restore();
  }

  function drawHeartCollapseCut(ctx, state) {
    const gate = state.roomGate;
    if (!gate || gate.placed < 3) return;
    const t = gate.collapseT || 0;
    if (t <= 0 || t >= 11.5) return;
    // Keep the authored rock choreography, but stretch it across a deliberate
    // 5.5-second collapse after a 2.5-second warning rumble.
    const rockT = Math.max(0, (t - 2.5) * (1.82 / 5.5));

    // The rubble is deterministic so the cut looks composed instead of
    // flickering differently every frame. Rows settle from the bottom upward
    // until they briefly cover the whole view.
    const rubbleFade = t < 10 ? 1 : 1 - R.clamp((t - 10) / 1.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = rubbleFade;

    // 0.10s: the centre seal fractures before any substantial stone falls.
    const crackIn = R.clamp((rockT - .1) / .14, 0, 1);
    const crackOut = 1 - R.clamp((rockT - .68) / .18, 0, 1);
    if (crackIn > 0 && crackOut > 0) {
      const crackX = sx(gate.heart.x);
      const crackY = sy(gate.heart.y + gate.heart.baseOffsetY, state.camY);
      ctx.save();
      ctx.globalAlpha = crackIn * crackOut;
      ctx.translate(crackX, crackY);
      ctx.strokeStyle = "rgba(224,190,146,.78)";
      ctx.shadowColor = "rgba(255,200,135,.55)";
      ctx.shadowBlur = 5;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7 + .18;
        const len = 18 + (i % 3) * 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 2);
        ctx.lineTo(Math.cos(a) * len * .55 + Math.sin(a) * 3,
          Math.sin(a) * len * .28 - Math.cos(a) * 2);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len * .52);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Phase 1: tiny chips and grit warn that the ceiling is failing. These
    // accelerate under gravity and tumble freely; they do not form the cover.
    for (let i = 0; i < 90; i++) {
      const seed = (i * 73 + 11) % 127;
      const delay = .1 + (seed % 19) * .014;
      const chipT = R.clamp((rockT - delay) / .94, 0, 1);
      if (chipT <= 0 || chipT >= 1) continue;
      const size = 4 + (seed % 12);
      const x = ((i * 89 + seed * 17) % (C.CANVAS_W + 40)) - 20;
      const y = -18 + chipT * chipT * (C.CANVAS_H + 80);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(chipT * (2 + seed % 5));
      if (collapseRockSheet.complete && collapseRockSheet.naturalWidth) {
        const sprite = seed % 16;
        const spriteCol = sprite % 4;
        const spriteRow = Math.floor(sprite / 4);
        const sourceX = Math.floor(spriteCol * collapseRockSheet.naturalWidth / 4);
        const sourceY = Math.floor(spriteRow * collapseRockSheet.naturalHeight / 4);
        const sourceEndX = Math.floor((spriteCol + 1) * collapseRockSheet.naturalWidth / 4);
        const sourceEndY = Math.floor((spriteRow + 1) * collapseRockSheet.naturalHeight / 4);
        ctx.filter = "brightness(.72) saturate(.62)";
        ctx.drawImage(collapseRockSheet, sourceX, sourceY,
          sourceEndX - sourceX, sourceEndY - sourceY,
          -size, -size * .72, size * 2, size * 1.44);
      }
      ctx.restore();
    }

    // The back pile is made entirely from overlapping stone sprites—there is
    // no opaque colour-card hiding the scene. Heavy slabs land in a tight,
    // offset masonry pattern so the rocks themselves become the wipe.
    for (let i = 0; i < 126; i++) {
      const row = Math.floor(i / 14);
      const col = i % 14;
      const seed = (i * 61 + 23) % 131;
      const delay = .82 + row * .055 + (col % 4) * .018;
      const fall = R.clamp((rockT - delay) / .4, 0, 1);
      if (fall <= 0) continue;
      const eased = 1 - Math.pow(1 - fall, 3);
      const w = 148 + (seed % 48);
      const h = 108 + ((seed * 5) % 38);
      const targetX = col * 74 - 22 + (seed % 29) - 14;
      const targetY = row * 67 + 20 + ((seed * 3) % 21) - 10;
      const y = -h - row * 46 + (targetY + h + row * 46) * eased;
      const sprite = seed % 16;
      const spriteCol = sprite % 4;
      const spriteRow = Math.floor(sprite / 4);
      const sourceX = Math.floor(spriteCol * collapseRockSheet.naturalWidth / 4);
      const sourceY = Math.floor(spriteRow * collapseRockSheet.naturalHeight / 4);
      const sourceEndX = Math.floor((spriteCol + 1) * collapseRockSheet.naturalWidth / 4);
      const sourceEndY = Math.floor((spriteRow + 1) * collapseRockSheet.naturalHeight / 4);
      ctx.save();
      ctx.translate(targetX + w / 2, y + h / 2);
      ctx.rotate(((seed % 11) - 5) * .018 * (1 - eased));
      ctx.filter = "brightness(.47) saturate(.52)";
      ctx.drawImage(collapseRockSheet, sourceX, sourceY,
        sourceEndX - sourceX, sourceEndY - sourceY,
        -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Phases 2 and 3: medium rubble follows the chips; the largest structural
    // slabs arrive last and finally close every remaining gap.
    for (let i = 0; i < 112; i++) {
      const row = Math.floor(i / 14);
      const col = i % 14;
      const seed = (i * 47 + 19) % 101;
      // Escalate the collapse: chips arrive first, then medium rubble, then
      // genuinely heavy slabs that overlap and take over the frame.
      const w = 36 + row * 17 + (seed % 21);
      const h = 31 + row * 13 + ((seed * 7) % 17);
      const targetX = col * 72 - 28 + (seed % 39) - 19;
      const targetY = C.CANVAS_H - 34 - row * 72 + ((seed * 3) % 35) - 17;
      const delay = .52 + row * .09 + (col % 5) * .022;
      const fall = R.clamp((rockT - delay) / .55, 0, 1);
      const eased = 1 - Math.pow(1 - fall, 3);
      const y = -h - row * 38 + (targetY + h + row * 38) * eased;
      const angle = ((seed % 9) - 4) * .035 * (1 - eased);
      ctx.save();
      ctx.translate(targetX + w / 2, y + h / 2);
      ctx.rotate(angle);
      if (collapseRockSheet.complete && collapseRockSheet.naturalWidth) {
        const sprite = seed % 16;
        const spriteCol = sprite % 4;
        const spriteRow = Math.floor(sprite / 4);
        const sourceX = Math.floor(spriteCol * collapseRockSheet.naturalWidth / 4);
        const sourceY = Math.floor(spriteRow * collapseRockSheet.naturalHeight / 4);
        const sourceEndX = Math.floor((spriteCol + 1) * collapseRockSheet.naturalWidth / 4);
        const sourceEndY = Math.floor((spriteRow + 1) * collapseRockSheet.naturalHeight / 4);
        ctx.filter = "brightness(.56) saturate(.58)";
        ctx.drawImage(collapseRockSheet, sourceX, sourceY,
          sourceEndX - sourceX, sourceEndY - sourceY,
          -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = "#211e20";
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // The flash is the edit point: beneath it the hidden centre changes to
    // the completed heart altar, then the rubble dissolves away.
    const flashIn = R.clamp((t - 8) / .16, 0, 1);
    const flashOut = 1 - R.clamp((t - 10) / 1.5, 0, 1);
    const flash = flashIn * flashOut;
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = "#fff4df";
      ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    }
    ctx.restore();
  }

  function drawHeartFlashCut(ctx, state) {
    const gate = state.roomGate;
    if (!gate || gate.placed < 3) return;
    const t = gate.collapseT || 0;
    if (t < 2.5 || t >= 7.2) return;
    const flashIn = R.clamp((t - 2.5) / .12, 0, 1);
    const flashOut = 1 - R.clamp((t - 6.5) / .7, 0, 1);
    const flash = flashIn * flashOut;
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.fillStyle = "#fff4df";
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    ctx.restore();
  }

  function drawWorld(ctx, state) {
    ctx.save();
    if (state.shake > 0 && !reducedMotion.matches) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    floorAndWalls(ctx, state);
    drawSigns(ctx, state);
    drawExitDoor(ctx, state);
    drawResponsibilitySigns(ctx, state);
    drawComparisonSigns(ctx, state);
    drawWhisperFigures(ctx, state);
    drawEndThoughts(ctx, state);
    drawMemoryChest(ctx, state);

    for (const e of state.enemies) drawEnemy(ctx, state, e);
    drawParticles(ctx, state);
    drawBullets(ctx, state);
    drawM(ctx, state);
    drawRoomBeyondMistDarkness(ctx, state);
    drawRoomStarAndMist(ctx, state);
    drawPlayer(ctx, state);
    drawRoomFogOverlay(ctx, state);
    drawRain(ctx, state);
    drawDarkness(ctx, state);
    // Keep combat feedback above the darkness mask so the expanding hearts do
    // not vanish as soon as they leave her pool of light.
    drawHeartWaves(ctx, state);
    drawHeartFlashCut(ctx, state);

    // Temporary verification overlay for the rebuilt room collision model.
    // Red = physical blocker; yellow = interaction radius; cyan = player body.
    if (state.roomCollisionDebug && state.zone && state.zone.key === "room") {
      ctx.save();
      const walkable = state.roomColliders && state.roomColliders.floor && state.roomColliders.floor[0];
      if (walkable) {
        // Filled permission mask: tinted pixels are walkable; untinted pixels
        // are forbidden. This is deliberately much clearer than an outline.
        ctx.beginPath();
        walkable.points.forEach(function (point, index) {
          const x = sx(point.x);
          const y = sy(point.y, state.camY);
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(44, 220, 190, .18)";
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(80,235,255,.95)";
      ctx.beginPath();
      ctx.arc(sx(state.player.x), sy(state.player.y, state.camY), C.PLAYER_R,
        0, Math.PI * 2);
      ctx.stroke();

      for (const blocker of state.zone.cover) {
        ctx.strokeStyle = blocker.fogBarrier
          ? "rgba(190,112,255,.98)"
          : blocker.colliderType === "bounds"
            ? "rgba(255,75,75,.95)"
            : blocker.colliderType === "environment" || blocker.colliderType === "floorContour"
              ? "rgba(255,155,55,.95)"
              : "rgba(255,88,88,.88)";
        ctx.beginPath();
        if (blocker.walkablePolygon) {
          blocker.points.forEach(function (point, index) {
            const x = sx(point.x);
            const y = sy(point.y, state.camY);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.closePath();
        } else if (blocker.ellipse) {
          ctx.ellipse(sx(blocker.x), sy(blocker.y, state.camY),
            blocker.rx, blocker.ry, 0, 0, Math.PI * 2);
        } else {
          ctx.rect(sx(blocker.x), sy(blocker.y + blocker.h, state.camY),
            blocker.w, blocker.h);
        }
        ctx.stroke();
        const labelX = blocker.walkablePolygon ? sx(450) : blocker.ellipse ? sx(blocker.x) : sx(blocker.x + blocker.w / 2);
        const labelY = blocker.walkablePolygon ? sy(-700, state.camY) : blocker.ellipse
          ? sy(blocker.y, state.camY) - 12
          : sy(blocker.y + blocker.h, state.camY) + 12;
        ctx.setLineDash([]);
        ctx.font = "700 10px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = blocker.fogBarrier
          ? "#d9a7ff"
          : blocker.colliderType === "environment" || blocker.colliderType === "floorContour"
            ? "#ffc074" : "#ff9b9b";
        ctx.fillText(blocker.kind || "PHYSICS", labelX, labelY);
        ctx.setLineDash([5, 4]);
      }

      ctx.setLineDash([]);
      ctx.font = "700 12px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = "#8ff3ff";
      ctx.fillText("RED: SAFETY BOUNDS  ORANGE: WALKABLE-FLOOR CONTOUR  PINK: PEDESTALS", 18, 86);

      ctx.strokeStyle = "rgba(255,225,92,.95)";
      for (const pedestal of state.roomGate.pedestals) {
        ctx.beginPath();
        ctx.arc(sx(pedestal.x), sy(pedestal.y + pedestal.baseOffsetY, state.camY), pedestal.interactR,
          0, Math.PI * 2);
        ctx.stroke();
      }
      if (state.roomGate.heartReady) {
        ctx.beginPath();
        ctx.arc(sx(state.roomGate.heart.x),
          sy(state.roomGate.heart.y + state.roomGate.heart.baseOffsetY, state.camY),
          state.roomGate.heart.interactR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // --------------------------------------------------------------------- hud

  function drawHud(ctx, state) {
    if (!state.hud) return;

    ctx.textBaseline = "middle";

    // Soft glass header, echoing the framed UI in the visual concept.
    const header = ctx.createLinearGradient(0, 0, 0, 58);
    header.addColorStop(0, "rgba(8,7,17,.82)");
    header.addColorStop(1, "rgba(8,7,17,0)");
    ctx.fillStyle = header;
    ctx.fillRect(0, 0, C.CANVAS_W, 64);

    // Zone name, top centre, with a thin progress bar under it.
    ctx.textAlign = "center";
    ctx.font = "700 12px " + TEXT_FACE;
    ctx.fillStyle = "rgba(255,244,249,.82)";
    ctx.fillText(state.zoneLabel || "", C.CANVAS_W / 2, 26);

    if (state.progress !== null && state.progress !== undefined) {
      const barW = 310;
      const barX = (C.CANVAS_W - barW) / 2;
      ctx.fillStyle = "rgba(255,255,255,.16)";
      roundedRect(ctx, barX, 40, barW, 7, 4);
      ctx.fill();
      const pg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      pg.addColorStop(0, "#ff4f99");
      pg.addColorStop(1, "#ffe6b3");
      ctx.fillStyle = pg;
      roundedRect(ctx, barX, 40, barW * R.clamp(state.progress, 0, 1), 7, 4);
      ctx.fill();
    }

    // The control prompt, bottom centre. This label is the whole ending: it goes
    // from SHOOT to STAY WITH M and never goes back.
    ctx.textAlign = "center";
    const prompt = (state.prompt || "").replace("SHOOT", "CAST HEART");
    if (prompt) {
      const memoryGatePrompt = prompt === "มีคนลืมความทรงจำบางอย่าง เราหาไปให้เขาจำได้กันเถอะ";
      ctx.font = memoryGatePrompt
        ? '700 19px "iannnnn-DOG", ui-sans-serif, system-ui'
        : "800 13px " + TEXT_FACE;
      const tw = Math.min(C.CANVAS_W - 80, ctx.measureText(prompt).width + 34);
      ctx.fillStyle = "rgba(11,8,20,.68)";
      roundedRect(ctx, C.CANVAS_W / 2 - tw / 2, C.CANVAS_H - 48, tw, 31, 15);
      ctx.fill();
      ctx.strokeStyle = state.promptGlow ? "rgba(255,142,184,.75)" : "rgba(255,255,255,.18)";
      ctx.stroke();
      ctx.fillStyle = state.promptGlow ? "#ffc2d8" : "rgba(255,242,247,.82)";
      ctx.fillText(prompt, C.CANVAS_W / 2, C.CANVAS_H - 32, tw - 24);
    }

    // M's voice, faint, never centred — he is somewhere ahead, not on the HUD.
    if (state.voice && state.voice.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = R.clamp(state.voice.alpha, 0, 1);
      ctx.textAlign = state.zone.key === "room" ? "center" : "left";
      ctx.font = "500 italic 20px " + TEXT_FACE;
      ctx.fillStyle = "#dfe7f2";
      ctx.fillText(state.voice.text,
        state.zone.key === "room" ? C.CANVAS_W / 2 : C.CANVAS_W * 0.24,
        C.CANVAS_H * 0.3, C.CANVAS_W - 96);
      ctx.restore();
    }

    // Enemy pressure has its own channel on the opposite side. It can coexist
    // with M's pale voice in Zone 3 without replacing or covering it.
    if (state.pressureVoice && state.pressureVoice.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = R.clamp(state.pressureVoice.alpha, 0, 1);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = "700 25px " + TEXT_FACE;
      ctx.fillStyle = "#f05a6f";
      ctx.shadowColor = "#a90024";
      ctx.shadowBlur = 16;
      ctx.fillText(state.pressureVoice.text, C.CANVAS_W * .88, C.CANVAS_H * .70, C.CANVAS_W * .42);
      ctx.restore();
    }

    // On-screen stick, drawn under the actual thumb rather than in a fixed corner.
    const stick = root.Input.stick && root.Input.stick();
    if (stick) {
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stick.ox, stick.oy, root.Input.STICK_RANGE, 0, Math.PI * 2);
      ctx.stroke();
      const dx = stick.x - stick.ox;
      const dy = stick.y - stick.oy;
      const len = Math.hypot(dx, dy);
      const k = len > root.Input.STICK_RANGE ? root.Input.STICK_RANGE / len : 1;
      ctx.fillStyle = "rgba(255,255,255,.3)";
      ctx.beginPath();
      ctx.arc(stick.ox + dx * k, stick.oy + dy * k, 17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  root.Render = {
    resize: resize,
    sx: sx,
    sy: sy,
    drawWorld: drawWorld,
    drawHud: drawHud,
    drawFigure: drawFigure,
    faces: faces,
    PLAYER_SCREEN_Y: PLAYER_SCREEN_Y,
    OFFSET_X: OFFSET_X,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
