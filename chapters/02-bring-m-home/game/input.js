/*
 * Input is keyboard or touch. Desktop mouse gameplay is deliberately disabled.
 *
 * Everything is level-triggered here. Moving is held, aiming is held, and firing
 * is held with a cooldown in Rules — so unlike the runner, nothing in this game
 * needs edge detection. `hold` is the same signal as `shoot`, read under a
 * different name by the one scene where the gun is gone.
 *
 * The aim vector needs to know where she is on screen, which only the renderer
 * knows, so main.js hands it over each frame via setAnchor().
 */
(function (root) {
  "use strict";

  const C = root.Rules.C;

  const keys = Object.create(null);
  let spaceHeld = false;
  let spacePressed = false;

  /* Where she is drawn, in canvas-logical coordinates. */
  let anchorX = C.CANVAS_W / 2;
  let anchorY = C.CANVAS_H * 0.58;

  let castPressed = false;

  /*
   * Touch. The left half of the screen is a stick that appears wherever the
   * thumb lands; the right half aims and fires at once, because asking a thumb to
   * aim and a second thumb to also press fire is one thumb too many.
   */
  let stick = null;          // { id, ox, oy, x, y }
  let touchAim = null;       // { id, x, y }

  const STICK_RANGE = 46;

  let el = null;

  function canvasPoint(e) {
    const rect = el.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * C.CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * C.CANVAS_H,
    };
  }

  function setAnchor(x, y) {
    anchorX = x;
    anchorY = y;
  }

  function keyVector() {
    let mx = 0;
    let my = 0;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
    // worldY grows forward, which is up the screen — so W adds to it.
    if (keys.w || keys.arrowup) my += 1;
    if (keys.s || keys.arrowdown) my -= 1;
    return { mx: mx, my: my };
  }

  function read() {
    let mx;
    let my;
    if (stick) {
      const dx = stick.x - stick.ox;
      const dy = stick.y - stick.oy;
      const len = Math.hypot(dx, dy);
      const scale = len > STICK_RANGE ? STICK_RANGE / len : 1;
      mx = (dx * scale) / STICK_RANGE;
      // Screen-down is world-backward, hence the flip.
      my = (-dy * scale) / STICK_RANGE;
    } else {
      const v = keyVector();
      mx = v.mx;
      my = v.my;
    }

    let aimX;
    let aimY;
    let shoot;
    if (touchAim) {
      aimX = touchAim.x - anchorX;
      aimY = -(touchAim.y - anchorY);
      shoot = true;
    } else {
      /*
       * Keyboard only, and no mouse has ever moved: aim where she is walking, so
       * the game is completely playable without ever touching a pointer.
       */
      aimX = mx;
      aimY = my;
      shoot = spaceHeld;
    }

    const interact = spacePressed;
    const cast = spaceHeld || !!touchAim || castPressed;
    spacePressed = false;
    castPressed = false;
    return {
      mx: mx, my: my,
      aimX: aimX, aimY: aimY,
      shoot: shoot,
      // Spacebar or a tap on the right half casts. The left-half
      // touch remains movement-only, so steering never fires by accident.
      cast: cast,
      hold: shoot || !!touchAim || !!stick || spaceHeld,
      interact: interact,
    };
  }

  function attach(canvasEl) {
    el = canvasEl;

    document.addEventListener("keydown", function (e) {
      const k = e.key.toLowerCase();
      if (k === " " || k === "spacebar") {
        if (!spaceHeld) spacePressed = true;
        spaceHeld = true;
        e.preventDefault();
        return;
      }
      keys[k] = true;
      if (k.startsWith("arrow")) e.preventDefault();
    });

    document.addEventListener("keyup", function (e) {
      const k = e.key.toLowerCase();
      if (k === " " || k === "spacebar") { spaceHeld = false; return; }
      keys[k] = false;
    });

    /* Losing focus mid-hold would otherwise leave her walking into a wall forever. */
    window.addEventListener("blur", function () {
      for (const k of Object.keys(keys)) keys[k] = false;
      spaceHeld = false;
      spacePressed = false;
      castPressed = false;
      stick = null;
      touchAim = null;
    });

    canvasEl.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      const p = canvasPoint(e);
      if (e.pointerType === "touch") {
        if (p.x < C.CANVAS_W / 2) {
          if (!stick) stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
        } else if (!touchAim) {
          touchAim = { id: e.pointerId, x: p.x, y: p.y };
          castPressed = true;
        }
        return;
      }
    });

    canvasEl.addEventListener("pointermove", function (e) {
      const p = canvasPoint(e);
      if (e.pointerType === "touch") {
        if (stick && stick.id === e.pointerId) { stick.x = p.x; stick.y = p.y; }
        if (touchAim && touchAim.id === e.pointerId) { touchAim.x = p.x; touchAim.y = p.y; }
        return;
      }
    });

    /* Every way a finger or button can stop pressing, or she never stops. */
    for (const ev of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
      canvasEl.addEventListener(ev, function (e) {
        if (stick && stick.id === e.pointerId) stick = null;
        if (touchAim && touchAim.id === e.pointerId) touchAim = null;
      });
    }
  }

  root.Input = {
    attach: attach,
    setAnchor: setAnchor,
    read: read,
    /* For the renderer, so the on-screen stick sits under the actual thumb. */
    stick: function () { return stick; },
    aimTouch: function () { return touchAim; },
    STICK_RANGE: STICK_RANGE,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
