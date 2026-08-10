/*
 * Canvas drawing. Takes state, draws pixels, decides nothing. Every gameplay
 * number comes from Rules.
 */
(function (root) {
  "use strict";

  const C = root.Rules.C;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const faces = { you: new Image(), her: new Image() };
  faces.you.src = "assets/face-you.png";
  faces.her.src = "assets/face-her.png";

  const JUMP_EMOJI = ["\u{1F4E6}", "\u{1F431}", "☕", "\u{1F9F8}"];   // box, cat, coffee, toy
  const SLIDE_EMOJI = ["\u{1F388}", "\u{1F3F7}️", "\u{1F33F}"];      // balloon, banner, branch

  function resize(canvasEl) {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(window.innerWidth / C.CANVAS_W, window.innerHeight / C.CANVAS_H);
    canvasEl.style.width = C.CANVAS_W * fit + "px";
    canvasEl.style.height = C.CANVAS_H * fit + "px";
    canvasEl.width = Math.round(C.CANVAS_W * fit * dpr);
    canvasEl.height = Math.round(C.CANVAS_H * fit * dpr);
    const ctx = canvasEl.getContext("2d");
    ctx.setTransform(fit * dpr, 0, 0, fit * dpr, 0, 0);
    return ctx;
  }

  function background(ctx, worldX) {
    const g = ctx.createLinearGradient(0, 0, 0, C.CANVAS_H);
    g.addColorStop(0, "#101736");
    g.addColorStop(1, "#1d2a54");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // Decorative parallax only. Someone who asked for less motion still needs
    // the world to scroll, but not the extra layers behind it.
    if (reducedMotion.matches) return;

    ctx.fillStyle = "rgba(255,255,255,.05)";
    for (let i = 0; i < 14; i++) {
      const span = C.CANVAS_W + 300;
      const hx = (((i * 260 - worldX * 0.15) % span) + span) % span - 150;
      ctx.beginPath();
      ctx.moveTo(hx - 150, C.GROUND_Y);
      ctx.lineTo(hx, C.GROUND_Y - 120 - (i % 3) * 34);
      ctx.lineTo(hx + 150, C.GROUND_Y);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,.09)";
    for (let i = 0; i < 20; i++) {
      const span = C.CANVAS_W + 200;
      const bx = (((i * 170 - worldX * 0.4) % span) + span) % span - 100;
      ctx.fillRect(bx, C.GROUND_Y - 60 - (i % 4) * 20, 46, 60 + (i % 4) * 20);
    }
  }

  function ground(ctx, worldX) {
    ctx.fillStyle = "#0a0f22";
    ctx.fillRect(0, C.GROUND_Y, C.CANVAS_W, C.CANVAS_H - C.GROUND_Y);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, C.GROUND_Y);
    ctx.lineTo(C.CANVAS_W, C.GROUND_Y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const span = C.CANVAS_W + 80;
      const tx = (((i * 80 - worldX) % span) + span) % span - 40;
      ctx.beginPath();
      ctx.moveTo(tx, C.GROUND_Y + 14);
      ctx.lineTo(tx + 40, C.GROUND_Y + 14);
      ctx.stroke();
    }
  }

  function emojiFor(entity) {
    // Stable per-entity choice: the same obstacle always looks the same.
    const i = Math.abs(Math.round(entity.x)) % 997;
    if (entity.kind === "jump") return JUMP_EMOJI[i % JUMP_EMOJI.length];
    if (entity.kind === "slide") return SLIDE_EMOJI[i % SLIDE_EMOJI.length];
    return entity.kind === "gift" ? "\u{1F381}" : "❤️";
  }

  function drawEntities(ctx, state) {
    const from = state.worldX - C.PLAYER_X - 80;
    const to = state.worldX + C.CANVAS_W;
    const visible = root.Level.entitiesInWindow(state.entities, from, to);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const e of visible) {
      const sx = e.x - state.worldX + C.PLAYER_X;
      const id = e.x;

      if (e.kind === "jump" || e.kind === "gift") {
        if (e.kind === "gift" && state.collectedIds.has(id)) continue;
        const box = root.Rules.jumpObstacleBox(sx);
        ctx.font = "44px system-ui";
        ctx.fillText(emojiFor(e), sx, box.y + box.h / 2);
      } else if (e.kind === "slide") {
        const box = root.Rules.slideObstacleBox(sx);
        // A line to the ceiling makes it read as hanging, not floating.
        ctx.strokeStyle = "rgba(255,255,255,.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, box.y + 10);
        ctx.stroke();
        ctx.font = "52px system-ui";
        ctx.fillText(emojiFor(e), sx, box.y + box.h / 2);
      } else {
        if (state.collectedIds.has(id)) continue;
        ctx.font = "30px system-ui";
        ctx.fillText(emojiFor(e), sx, e.y);
      }
    }
  }

  /*
   * A runner: circle-cropped photo head on a code-drawn body. Bodies are drawn
   * rather than spritesheeted so the poses actually change shape — which is the
   * whole reason for not using emoji runners.
   *
   * `phase` is a continuously increasing number; the legs are driven off its
   * sine so the cycle is smooth and needs no frame counter.
   */
  function drawRunner(ctx, faceImg, cx, phase, pose) {
    const headR = 20;
    const sliding = pose === "slide";

    // Where the head and hips sit for each pose. Slide is authored explicitly
    // rather than as a rotation, so the geometry cannot go strange.
    const headX = sliding ? cx + 10 : cx;
    const headY = sliding ? C.GROUND_Y - 21 : C.GROUND_Y - C.STAND_H + headR - 2;
    const hipX = sliding ? cx - 22 : cx;
    const hipY = sliding ? C.GROUND_Y - 14 : C.GROUND_Y - 26;

    ctx.strokeStyle = "#f7f7fb";
    ctx.lineCap = "round";

    // torso
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(headX, headY + (sliding ? 0 : headR - 2));
    ctx.lineTo(hipX, hipY);
    ctx.stroke();

    // legs
    ctx.lineWidth = 8;
    const legLen = 26;
    if (sliding) {
      // Trailing behind, low to the ground.
      for (const spread of [0.15, -0.2]) {
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(hipX - legLen, hipY + 8 + spread * legLen);
        ctx.stroke();
      }
    } else if (pose === "jump") {
      // Tucked: both legs forward and up, so a jump never looks like a run.
      for (const a of [Math.PI / 2 - 0.75, Math.PI / 2 - 0.2]) {
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(hipX + Math.cos(a) * legLen, hipY + Math.sin(a) * legLen);
        ctx.stroke();
      }
    } else {
      const swing = Math.sin(phase) * 0.9;
      for (const dir of [1, -1]) {
        const a = Math.PI / 2 + swing * dir;
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(hipX + Math.cos(a) * legLen, hipY + Math.sin(a) * legLen);
        ctx.stroke();
      }
    }

    // one arm, counter-swinging
    ctx.lineWidth = 7;
    const shoulderX = sliding ? headX - headR : headX;
    const shoulderY = sliding ? headY + 2 : headY + headR + 8;
    const armA = sliding
      ? -0.35
      : Math.PI / 2 - (pose === "jump" ? 1.6 : Math.sin(phase + Math.PI) * 1.1);
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(shoulderX + Math.cos(armA) * 20, shoulderY + Math.sin(armA) * 20);
    ctx.stroke();

    // head: circular clip so a rectangular photo reads as a character
    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#2a3352";
    ctx.fill();
    ctx.clip();
    if (faceImg && faceImg.complete && faceImg.naturalWidth) {
      ctx.drawImage(faceImg, headX - headR, headY - headR, headR * 2, headR * 2);
    }
    ctx.restore();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawThief(ctx, state) {
    drawRunner(ctx, faces.you, state.thiefScreenX, state.phase * 1.05, "run");
    // The present he is running away with.
    ctx.font = "26px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u{1F381}", state.thiefScreenX + 30, C.GROUND_Y - 54);
  }

  function drawWorld(ctx, state) {
    ctx.save();
    if (state.shake > 0 && !reducedMotion.matches) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    background(ctx, state.worldX);
    ground(ctx, state.worldX);
    drawEntities(ctx, state);
    drawThief(ctx, state);

    const pose = state.player.sliding ? "slide" : (state.player.onGround ? "run" : "jump");
    // Her feet leave the ground on a jump, so the whole body shifts up with y.
    ctx.save();
    ctx.translate(0, state.player.y - C.GROUND_Y);
    drawRunner(ctx, faces.her, C.PLAYER_X, state.phase, pose);
    ctx.restore();

    ctx.restore();
  }

  function drawHud(ctx, state) {
    // Hearts, top left. Flashes red briefly after a trip so a lost heart is
    // legible rather than mysterious.
    ctx.font = "700 20px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = state.heartFlash > 0 ? "#ff5470" : "#fff";
    ctx.fillText("❤️ " + state.hearts + "/" + C.HEARTS_REQUIRED, 108, 34);

    // Thin progress bar, top centre. Tells her the run is finite.
    const barW = 240;
    const barX = (C.CANVAS_W - barW) / 2;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(barX, 24, barW, 6);
    ctx.fillStyle = "#ffd0e0";
    const p = Math.max(0, Math.min(1, state.worldX / C.LEVEL_LENGTH));
    ctx.fillRect(barX, 24, barW * p, 6);

    if (state.taunt) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "800 34px ui-sans-serif, system-ui";
      ctx.fillText(state.taunt, C.CANVAS_W / 2, 120);
    }

    if (state.qtePrompt) {
      const label = state.qtePrompt === "jump" ? "JUMP ⬆" : "SLIDE ⬇";
      ctx.textAlign = "center";
      ctx.font = "900 52px ui-sans-serif, system-ui";
      ctx.fillStyle = state.qteFlash > 0 ? "#ff5470" : "#fff";
      ctx.fillText(label, C.CANVAS_W / 2, 235);
      ctx.font = "600 15px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText("FINAL CHASE", C.CANVAS_W / 2, 272);
    }
  }

  root.Render = {
    resize: resize,
    drawWorld: drawWorld,
    drawEntities: drawEntities,
    drawThief: drawThief,
    drawRunner: drawRunner,
    drawHud: drawHud,
    faces: faces,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
