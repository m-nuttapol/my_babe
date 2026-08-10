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
  const cardSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card")) || 150;
  const radius = R.ringRadius(slots, cardSize);
  const zOffset = R.ringZOffset(radius, cardSize);

  let rotation = 0;
  let focused = -1;

  const cardEls = cards.map(function (chapter, i) {
    const el = document.createElement(chapter.status === "ready" ? "a" : "div");
    el.className = "card" + (chapter.status === "ready" ? "" : " card--ghost");
    el.dataset.slot = String(i);
    el.style.transform = "rotateY(" + R.slotAngle(i, slots) + "deg) translateZ(" + radius + "px)";

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
  setRotation(rotationForSlot(R.focusIndexFromSearch(window.location.search, cards)));

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
