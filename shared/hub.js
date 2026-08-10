/*
 * Hub DOM wiring. All arithmetic lives in shared/ring.js — this file only
 * builds elements, applies transforms, and routes events.
 */
(function () {
  "use strict";

  const R = window.Ring;
  const stage = document.getElementById("stage");
  const ringEl = document.getElementById("ring");
  const fadeEl = document.getElementById("fade");
  const numEl = document.getElementById("focusNum");
  const nameEl = document.getElementById("focusName");
  const subEl = document.getElementById("focusSub");
  const enterEl = document.getElementById("focusEnter");

  const chapters = R.normalizeChapters(window.CHAPTERS);
  const slots = R.ringSlots(chapters.length);
  const cards = R.padToSlots(chapters, slots);
  // Must match the perspective in base.css — the fit calculation depends on it.
  const PERSPECTIVE = 1200;

  let radius = 0;
  let zOffset = 0;
  let rotation = 0;
  let focused = -1;

  function readCardSize() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card")) || 150;
  }

  const cardEls = cards.map(function (chapter, i) {
    const el = document.createElement(chapter.status === "ready" ? "a" : "div");
    el.className = "card" + (chapter.status === "ready" ? "" : " card--ghost");
    el.dataset.slot = String(i);

    if (chapter.status === "ready") {
      el.href = chapter.href;
      el.setAttribute("aria-label", chapter.title);
      const img = document.createElement("img");
      img.src = chapter.cover;
      img.alt = chapter.title;
      el.appendChild(img);
    } else {
      el.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.innerHTML = "Chapter " + chapter.id + "<br>coming soon";
      el.appendChild(span);
    }

    ringEl.appendChild(el);
    return el;
  });

  /*
   * Recompute everything that depends on viewport size. The mobile breakpoint
   * changes --card, which changes the radius, which changes the fit scale — so
   * this has to run as a unit on every resize, not just once at startup.
   */
  function layout() {
    const cardSize = readCardSize();
    radius = R.ringRadius(slots, cardSize);
    zOffset = R.ringZOffset(radius, cardSize);

    cardEls.forEach(function (el, i) {
      el.style.transform = "rotateY(" + R.slotAngle(i, slots) + "deg) translateZ(" + radius + "px)";
    });

    const width = R.projectedRingWidth(slots, cardSize, PERSPECTIVE);
    stage.style.transform = "scale(" + R.fitScale(width, window.innerWidth) + ")";

    setRotation(rotation);
  }

  function setRotation(deg) {
    rotation = deg;
    // translateZ first so the whole ring sits back; without it the front card
    // grows as the ring does.
    ringEl.style.transform =
      "translateZ(" + -zOffset + "px) rotateY(" + deg + "deg) rotateX(-8deg)";
    const index = R.nearestSlotIndex(deg, slots);
    cardEls.forEach(function (el, i) {
      el.dataset.back = String(i !== index);
    });
    if (index !== focused) {
      focused = index;
      renderFocus(cards[index]);
    }
  }

  function renderFocus(chapter) {
    if (chapter.status === "ready") {
      numEl.textContent = "CHAPTER " + chapter.id.split("-")[0];
      nameEl.textContent = chapter.title;
      subEl.textContent = chapter.subtitle;
      enterEl.hidden = false;
      enterEl.href = chapter.href;
    } else {
      numEl.textContent = "CHAPTER " + chapter.id;
      nameEl.textContent = "coming soon";
      subEl.textContent = "";
      enterEl.hidden = true;
      enterEl.removeAttribute("href");
    }
  }

  function rotationForSlot(index) {
    // Choose the equivalent angle closest to the current rotation so the ring
    // takes the short way round instead of unwinding.
    const step = 360 / slots;
    const base = -index * step;
    const turns = Math.round((rotation - base) / 360);
    return base + turns * 360;
  }

  function enter(href) {
    fadeEl.dataset.on = "true";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(function () {
      window.location.href = href;
    }, reduced ? 0 : 450);
  }

  enterEl.addEventListener("click", function (event) {
    event.preventDefault();
    const chapter = cards[focused];
    if (chapter.status === "ready") enter(chapter.href);
  });

  // Start on the chapter we came back from, or the first one.
  rotation = rotationForSlot(R.focusIndexFromSearch(window.location.search, cards));
  layout();
  window.addEventListener("resize", layout);

  // ---- interaction ----------------------------------------------------------

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DRAG_DEG_PER_PX = 0.35;
  const IDLE_DELAY_MS = 2500;
  const IDLE_DEG_PER_SEC = 3.5;

  let dragging = false;
  let dragStartX = 0;
  let dragStartRotation = 0;
  let dragMoved = 0;
  let lastInputAt = 0;
  let lastFrameAt = 0;
  let wheelTimer = 0;
  // Set when a drag ends far enough to have been a drag, so the click that
  // follows pointerup does not count as choosing a card. Cleared on the next
  // task, which keeps it from swallowing a later keyboard Enter.
  let suppressClick = false;

  function markInput() {
    lastInputAt = performance.now();
  }

  function animateTo(deg) {
    ringEl.style.transition = reducedMotion.matches ? "none" : "transform 0.4s cubic-bezier(.22,.61,.36,1)";
    setRotation(deg);
    window.setTimeout(function () {
      ringEl.style.transition = "none";
    }, 420);
  }

  function snap() {
    animateTo(R.snapRotation(rotation, slots));
  }

  stage.addEventListener("pointerdown", function (event) {
    dragging = true;
    dragMoved = 0;
    dragStartX = event.clientX;
    dragStartRotation = rotation;
    ringEl.style.transition = "none";
    stage.setPointerCapture(event.pointerId);
    markInput();
  });

  stage.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    const dx = event.clientX - dragStartX;
    dragMoved = Math.max(dragMoved, Math.abs(dx));
    setRotation(dragStartRotation + dx * DRAG_DEG_PER_PX);
    markInput();
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    suppressClick = dragMoved > 6;
    window.setTimeout(function () {
      suppressClick = false;
    }, 0);
    snap();
    markInput();
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("wheel", function (event) {
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    setRotation(rotation + delta * 0.25);
    markInput();
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(snap, 140);
  }, { passive: false });

  document.addEventListener("keydown", function (event) {
    const step = 360 / slots;
    if (event.key === "ArrowLeft") {
      animateTo(R.snapRotation(rotation, slots) + step);
    } else if (event.key === "ArrowRight") {
      animateTo(R.snapRotation(rotation, slots) - step);
    } else if (event.key === "Enter") {
      const chapter = cards[focused];
      if (chapter.status === "ready" && document.activeElement === document.body) {
        event.preventDefault();
        enter(chapter.href);
      }
      return;
    } else {
      return;
    }
    event.preventDefault();
    markInput();
  });

  // A click on a card that is NOT at the front only brings it forward. Without
  // this you enter the wrong chapter by mis-clicking a card you can barely see.
  cardEls.forEach(function (el, i) {
    el.addEventListener("click", function (event) {
      if (suppressClick) {          // that was a drag, not a click
        event.preventDefault();
        return;
      }
      const chapter = cards[i];
      if (chapter.status !== "ready") {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (i !== focused) {
        animateTo(rotationForSlot(i));
        markInput();
        return;
      }
      enter(chapter.href);
    });
  });

  function tick(now) {
    if (!reducedMotion.matches && !dragging && now - lastInputAt > IDLE_DELAY_MS) {
      const dt = lastFrameAt ? (now - lastFrameAt) / 1000 : 0;
      if (dt > 0 && dt < 0.5) setRotation(rotation - IDLE_DEG_PER_SEC * dt);
    }
    lastFrameAt = now;
    window.requestAnimationFrame(tick);
  }
  markInput();
  window.requestAnimationFrame(tick);

  window.Hub = {
    setRotation: setRotation,
    getRotation: function () { return rotation; },
    rotationForSlot: rotationForSlot,
    enter: enter,
    slots: slots,
    cards: cards,
    cardEls: cardEls,
    focusedIndex: function () { return focused; },
  };
})();
