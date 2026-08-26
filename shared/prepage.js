/*
 * The prepage in front of the ring hub: scatters the cats and waits for the
 * button. Revealed by script rather than sitting visible in the markup, so if
 * scripts fail the hub is reachable instead of covered by something nothing can
 * dismiss.
 */
(function (root) {
  "use strict";

  const el = document.getElementById("prepage");
  const btn = document.getElementById("prepageBtn");
  const catsEl = document.getElementById("prepageCats");
  if (!el || !btn) return;
  if (root.MyBabeReturning) return;

  const CATS = ["shared/cat1.png", "shared/cat2.png", "shared/cat3.png"];
  const enterSound = new root.Audio(
    "chapters/02-bring-m-home/assets/audio/twinkle_soft.mp3"
  );
  enterSound.preload = "auto";
  enterSound.volume = 1;
  
  const SPOTS = [
    { x: 4, y: 7, size: 92, tilt: -8 },
    { x: 20, y: 19, size: 54, tilt: -10 },
    { x: 31, y: 3, size: 62, tilt: -14 },
    { x: 52, y: 2, size: 52, tilt: 11 },
    { x: 68, y: 13, size: 58, tilt: 7 },
    { x: 84, y: 5, size: 86, tilt: 9 },
    { x: 8, y: 36, size: 64, tilt: 4 },
    { x: 90, y: 30, size: 70, tilt: -6 },
    { x: 1, y: 64, size: 80, tilt: 12 },
    { x: 92, y: 60, size: 62, tilt: 14 },
    { x: 1, y: 85, size: 68, tilt: -5 },
    { x: 93, y: 84, size: 76, tilt: -10 },
  ];

  if (catsEl) {
    SPOTS.forEach(function (spot, i) {
      const img = document.createElement("img");
      img.className = "prepage-cat";
      img.alt = "";
      img.decoding = "async";
      img.src = CATS[i % CATS.length];
      img.style.left = spot.x + "%";
      img.style.top = spot.y + "%";
      img.style.setProperty("--size", spot.size + "px");
      img.style.setProperty("--tilt", spot.tilt + "deg");
      // Varied per spot so no two bob in step.
      img.style.setProperty("--dur", (3.4 + (i % 5) * 0.55).toFixed(2) + "s");
      img.style.setProperty("--delay", ((i % 7) * 0.31).toFixed(2) + "s");
      img.style.setProperty("--rise", -(8 + (i % 4) * 5) + "px");
      img.style.setProperty("--spin", (spot.tilt > 0 ? -1 : 1) * (3 + (i % 3) * 2) + "deg");
      catsEl.appendChild(img);
    });
  }

  let open = true;

  /*
   * Capture phase, so this runs before hub.js's own document listener: otherwise
   * the arrow keys would turn the ring behind the cover, and Enter would open a
   * chapter the player has not seen yet.
   */
  document.addEventListener("keydown", function (e) {
    if (!open) return;
    if (e.key === "Enter" || e.key === " " || e.key.indexOf("Arrow") === 0) {
      e.stopPropagation();
      if (e.key !== " " && e.key !== "Enter") e.preventDefault();
    }
  }, true);

  el.hidden = false;

  function dismiss() {
    if (!open) return;
    open = false;
    enterSound.currentTime = 0;
    const play = enterSound.play();
    if (play && play.catch) play.catch(function () {});
    el.dataset.going = "true";
    root.setTimeout(function () { el.hidden = true; }, 640);
  }

  // music.js starts the audio on the first gesture anywhere, so this click is
  // already what unblocks it. Nothing to call.
  btn.addEventListener("click", dismiss);
})(typeof globalThis !== "undefined" ? globalThis : this);
