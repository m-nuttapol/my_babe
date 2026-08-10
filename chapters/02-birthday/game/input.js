/*
 * Input: two different kinds of signal, deliberately.
 *
 *  - JUMP is edge-triggered. One press, one jump; holding the key does nothing
 *    extra. If it were level-triggered, holding Up would re-fire every frame.
 *  - SLIDE is level-triggered. She stays down while the button is held, so the
 *    press moment stops being a timing test.
 *
 * Consumers therefore read `jump` once and `slideHeld` every frame.
 */
(function (root) {
  "use strict";

  let jumpEdge = false;      // set on press, cleared by consume()
  let slideHeld = false;     // mirrors the physical button
  let slideTapEdge = false;  // lets a scripted press() act like a brief hold

  function press(action) {
    if (action === "jump") jumpEdge = true;
    if (action === "slide") slideTapEdge = true;
  }

  function setSlideHeld(v) {
    slideHeld = !!v;
  }

  function consume() {
    const out = { jump: jumpEdge, slideHeld: slideHeld || slideTapEdge };
    jumpEdge = false;
    slideTapEdge = false;
    return out;
  }

  function attach(canvasEl) {
    document.addEventListener("keydown", function (e) {
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") {
        if (!e.repeat) jumpEdge = true;
        e.preventDefault();
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        slideHeld = true;
        e.preventDefault();
      }
    });

    document.addEventListener("keyup", function (e) {
      const k = e.key;
      if (k === "ArrowDown" || k === "s" || k === "S") slideHeld = false;
    });

    // Losing focus mid-hold would otherwise leave her sliding forever.
    window.addEventListener("blur", function () { slideHeld = false; });

    const jumpBtn = document.getElementById("btnJump");
    if (jumpBtn) {
      jumpBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); jumpEdge = true; });
    }

    const slideBtn = document.getElementById("btnSlide");
    if (slideBtn) {
      slideBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); slideHeld = true; });
      // Every way a finger can stop pressing, or she slides forever.
      for (const ev of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
        slideBtn.addEventListener(ev, function () { slideHeld = false; });
      }
    }

    /*
     * Swipe-up still jumps, because a jump is a single press. There is no
     * swipe-down: you cannot hold a swipe, and sliding is now a hold. On a phone,
     * sliding means holding the SLIDE button.
     */
    let startY = null;
    canvasEl.addEventListener("pointerdown", function (e) { startY = e.clientY; });
    canvasEl.addEventListener("pointerup", function (e) {
      if (startY === null) return;
      if (e.clientY - startY < -28) jumpEdge = true;
      startY = null;
    });
  }

  root.Input = {
    press: press,
    setSlideHeld: setSlideHeld,
    consume: consume,
    attach: attach,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
