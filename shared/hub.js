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
  const backdropEls = Array.prototype.slice.call(document.querySelectorAll(".hub-backdrop"));
  const numEl = document.getElementById("focusNum");
  const nameEl = document.getElementById("focusName");
  const subEl = document.getElementById("focusSub");
  const enterEl = document.getElementById("focusEnter");
  const splashEl = document.getElementById("chapterSplash");
  const enterSound = new window.Audio(
    "chapters/02-bring-m-home/assets/audio/twinkle_soft.mp3"
  );
  enterSound.preload = "auto";
  enterSound.volume = 1;

  const chapters = R.normalizeChapters(window.CHAPTERS);
  const slots = R.ringSlots(chapters.length);
  const cards = R.padToSlots(chapters, slots);
  // Must match the perspective in base.css — the fit calculation depends on it.
  const PERSPECTIVE = 1200;
  // Max blur applied to the focus panel at zero focusIntensity.
  const FOCUS_MAX_BLUR = 7;

  let radius = 0;
  let zOffset = 0;
  let rotation = 0;
  let focused = -1;
  // Timestamp the ring last finished settling at full focus intensity — idle
  // auto-advance waits IDLE_HOLD_MS past this before stepping to the next
  // card, so each chapter gets to sit fully sharp before it moves on.
  let settledAt = 0;
  let activeBackdrop = 0;
  let backdropRequest = 0;

  let storedReturn = null;
  try {
    storedReturn = window.sessionStorage.getItem("mybabe:returnFrom");
    window.sessionStorage.removeItem("mybabe:returnFrom");
  } catch (e) { /* storage unavailable */ }
  const queryReturn = new URLSearchParams(window.location.search).get("from");
  const returnFrom = queryReturn || storedReturn;
  window.MyBabeReturning = Boolean(returnFrom);

  // Chapter 2's ending cuts here still mid-flash (see index.html's <head>
  // script and .return-flash in base.css) — this is what actually decays
  // it back down once the hub is ready, continuing that flash into a long,
  // held reveal (not a quick wipe) instead of leaving it sitting at full
  // white or snapping into the hub.
  let cameFromFlash = false;
  try {
    cameFromFlash = window.sessionStorage.getItem("mybabe:fromFlash") === "1";
    window.sessionStorage.removeItem("mybabe:fromFlash");
  } catch (e) { /* storage unavailable */ }
  if (cameFromFlash) {
    const returnFlashEl = document.getElementById("returnFlash");
    if (returnFlashEl) {
      window.requestAnimationFrame(function () {
        window.setTimeout(function () { returnFlashEl.classList.add("out"); }, 500);
      });
    }
  }

  function backdropFor(chapter, done) {
    if (!chapter || chapter.status !== "ready") return done(null);
    const candidates = chapter.backdrop || [];
    let i = 0;
    (function tryNext() {
      if (i >= candidates.length) return done(null);
      const url = candidates[i++];
      const image = new Image();
      image.onload = function () { done(url); };
      image.onerror = tryNext;
      image.src = url;
    })();
  }

  function refreshBackdrop() {
    const chapter = cards[focused];
    const request = ++backdropRequest;
    backdropFor(chapter, function (url) {
      if (request !== backdropRequest) return;
      if (!url) {
        backdropEls.forEach(function (el) { el.dataset.on = "false"; });
        return;
      }
      const next = activeBackdrop === 0 ? 1 : 0;
      backdropEls[next].style.backgroundImage = 'url("' + url + '")';
      backdropEls[next].dataset.on = "true";
      backdropEls[activeBackdrop].dataset.on = "false";
      activeBackdrop = next;
    });
  }

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
      img.src = chapter.cover + "?v=full-restore";
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
      transitionFocus(cards[index]);
    }
    // Fade/sharpen the focus panel by how centred the front card actually is,
    // recomputed every time rotation changes — drag, wheel, keyboard, click,
    // or idle auto-rotate all flow through here, so the text always tracks
    // the ring's real position instead of a timer decoupled from it.
    const intensity = R.focusIntensity(deg, index, slots);
    splashEl.style.opacity = String(intensity);
    splashEl.style.filter = "blur(" + (FOCUS_MAX_BLUR * (1 - intensity)).toFixed(2) + "px)";
  }

  function renderFocus(chapter) {
    if (chapter.status === "ready") {
      numEl.textContent = "CHAPTER " + chapter.id.split("-")[0];
      nameEl.textContent = chapter.title;
      subEl.textContent = chapter.subtitle;
      enterEl.hidden = false;
      enterEl.href = chapter.href;
      document.documentElement.style.setProperty("--exit", chapter.exit || "#0b1020");
    } else {
      numEl.textContent = "CHAPTER " + chapter.id;
      nameEl.textContent = "coming soon";
      subEl.textContent = "";
      enterEl.hidden = true;
      enterEl.removeAttribute("href");
    }
    refreshBackdrop();
  }

  function transitionFocus(chapter) {
    renderFocus(chapter);
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
    enterSound.currentTime = 0;
    fadeEl.dataset.on = "true";
    let navigated = false;
    function navigate() {
      if (navigated) return;
      navigated = true;
      window.location.href = href;
    }
    const play = enterSound.play();
    if (play && play.catch) play.catch(navigate);
    window.setTimeout(navigate, 450);
  }

  enterEl.addEventListener("click", function (event) {
    event.preventDefault();
    const chapter = cards[focused];
    if (chapter.status === "ready") enter(chapter.href);
  });

  // Start on the chapter we came back from, or the first one.
  const returnSearch = returnFrom ? "?from=" + encodeURIComponent(returnFrom) : window.location.search;
  rotation = rotationForSlot(R.focusIndexFromSearch(returnSearch, cards));
  layout();
  settledAt = performance.now();
  window.addEventListener("resize", layout);

  // ---- interaction ----------------------------------------------------------

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DRAG_DEG_PER_PX = 0.35;
  const IDLE_DELAY_MS = 2500;
  const IDLE_DEG_PER_SEC = 3.5;
  // How long a card holds at full focus intensity before idle drift resumes
  // toward the next one.
  const IDLE_HOLD_MS = 2000;

  let dragging = false;
  let dragStartX = 0;
  let dragStartRotation = 0;
  let dragMoved = 0;
  let lastInputAt = 0;
  let lastFrameAt = 0;
  // The next aligned angle idle drift is travelling toward. Null means "not
  // established" — recomputed from the current (always-aligned) rotation the
  // next time idle drift is eligible to move.
  let idleTargetDeg = null;
  let wheelTimer = 0;
  // Set when a drag ends far enough to have been a drag, so the click that
  // follows pointerup does not count as choosing a card. Cleared on the next
  // task, which keeps it from swallowing a later keyboard Enter.
  let suppressClick = false;

  function markInput() {
    lastInputAt = performance.now();
  }

  // Matches the snap easing the ring used to get from CSS's
  // cubic-bezier(.22,.61,.36,1) — reproduced here (Newton-Raphson solve for
  // t at a given x, standard cubic-bezier technique) so a snap's every
  // intermediate frame runs through setRotation, and the focus panel's fade
  // (which reads rotation each frame) stays in lockstep with what's on screen
  // instead of only seeing the two endpoints.
  const snapEase = (function () {
    const x1 = 0.22, y1 = 0.61, x2 = 0.36, y2 = 1;
    const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
    const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
    function calcX(t) { return ((ax * t + bx) * t + cx) * t; }
    function slopeX(t) { return 3 * ax * t * t + 2 * bx * t + cx; }
    function calcY(t) { return ((ay * t + by) * t + cy) * t; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const d = slopeX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= (calcX(t) - x) / d;
      }
      return calcY(t);
    };
  })();

  let snapTween = null; // requestAnimationFrame id of an in-flight snap

  function stopSnapTween() {
    if (snapTween !== null) {
      window.cancelAnimationFrame(snapTween);
      snapTween = null;
    }
  }

  function animateTo(deg) {
    stopSnapTween();
    if (reducedMotion.matches) {
      setRotation(deg);
      settledAt = performance.now();
      return;
    }
    const from = rotation;
    const delta = deg - from;
    const start = performance.now();
    const DURATION = 400;
    (function frame(now) {
      const t = Math.min(1, (now - start) / DURATION);
      setRotation(from + delta * snapEase(t));
      if (t < 1) {
        snapTween = window.requestAnimationFrame(frame);
      } else {
        snapTween = null;
        settledAt = now;
      }
    })(start);
  }

  function snap() {
    animateTo(R.snapRotation(rotation, slots));
  }

  stage.addEventListener("pointerdown", function (event) {
    stopSnapTween();
    dragging = true;
    dragMoved = 0;
    dragStartX = event.clientX;
    dragStartRotation = rotation;
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
    stopSnapTween();
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
    const dt = lastFrameAt ? (now - lastFrameAt) / 1000 : 0;
    lastFrameAt = now;
    window.requestAnimationFrame(tick);

    const idle = !reducedMotion.matches && !dragging && snapTween === null && now - lastInputAt > IDLE_DELAY_MS;
    if (!idle) {
      idleTargetDeg = null; // re-establish fresh once idle resumes
      return;
    }
    // Ghost "coming soon" cards have nothing worth lingering on — only a
    // ready chapter earns the hold.
    const holdMs = cards[focused] && cards[focused].status === "ready" ? IDLE_HOLD_MS : 0;
    if (now - settledAt <= holdMs) return; // holding the current card fully sharp
    if (idleTargetDeg === null) idleTargetDeg = rotation - 360 / slots;
    if (!(dt > 0 && dt < 0.5)) return;
    const next = Math.max(idleTargetDeg, rotation - IDLE_DEG_PER_SEC * dt);
    setRotation(next);
    if (next <= idleTargetDeg + 1e-6) {
      settledAt = now; // reached the next card dead-centre — hold it too
      idleTargetDeg = null;
    }
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
