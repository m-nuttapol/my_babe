/*
 * Input: keyboard, on-screen buttons, and vertical swipes, all reduced to two
 * one-shot intents.
 *
 * One-shot matters. If `jump` stayed true while the key was held, holding Up
 * would re-trigger on every frame; the physics blocks double jumps but the QTE
 * would eat several prompts from one press.
 */
(function (root) {
  "use strict";

  const pending = { jump: false, slide: false };

  function press(action) {
    if (action === "jump") pending.jump = true;
    if (action === "slide") pending.slide = true;
  }

  function consume() {
    const out = { jump: pending.jump, slide: pending.slide };
    pending.jump = false;
    pending.slide = false;
    return out;
  }

  function attach(canvasEl) {
    document.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") { press("jump"); e.preventDefault(); }
      else if (k === "ArrowDown" || k === "s" || k === "S") { press("slide"); e.preventDefault(); }
    });

    const jumpBtn = document.getElementById("btnJump");
    const slideBtn = document.getElementById("btnSlide");
    if (jumpBtn) jumpBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); press("jump"); });
    if (slideBtn) slideBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); press("slide"); });

    // Swipe anywhere on the canvas, for players who ignore the buttons.
    let startY = null;
    canvasEl.addEventListener("pointerdown", function (e) { startY = e.clientY; });
    canvasEl.addEventListener("pointerup", function (e) {
      if (startY === null) return;
      const dy = e.clientY - startY;
      if (dy < -28) press("jump");
      else if (dy > 28) press("slide");
      startY = null;
    });
  }

  root.Input = { press: press, consume: consume, attach: attach, pending: pending };
})(typeof globalThis !== "undefined" ? globalThis : this);
