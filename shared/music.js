/*
 * Background music for the hub.
 *
 * The awkward truth this file exists to handle: a page cannot start playing audio
 * on load. Every current browser blocks it until the user has interacted with the
 * document, and there is no way to ask nicely. So there are three paths, in order:
 *
 *   1. Try on load. Coming back from a chapter (`?from=`), browsers that remember
 *      you have played audio on this origin allow it, so this usually works on the
 *      return trip even though it rarely does on a cold arrival.
 *   2. If refused, the first gesture anywhere starts it — a click, a key, a tap.
 *      Not pointermove: moving a mouse is not user activation. The hub is a ring
 *      you have to drag or click to use, so this fires almost immediately in
 *      practice; the very gesture that spins the carousel starts the song.
 *   3. The button is always there, so nothing depends on guessing right.
 *
 * There is deliberately no opening card here, unlike my_owe's hub: that page is a
 * static list with nothing to touch, so it needed a cover to harvest a gesture.
 * This one cannot be used without one.
 *
 * Position is remembered in sessionStorage, so opening a chapter and coming back
 * resumes the track where it left off instead of restarting it. That is the whole
 * reason for the bookkeeping: on a multi-page static site, navigation is a full
 * page load and the audio element dies with the page.
 */
(function () {
  "use strict";

  const SRC = "shared/Kaekoon.mp3";
  const KEY = "mybabe:music";
  const VOLUME = 0.7;

  const btn = document.getElementById("musicBtn");
  if (!btn) return;

  const audio = new window.Audio();
  audio.loop = true;
  audio.volume = VOLUME;
  audio.preload = "auto";
  audio.src = SRC;

  let saved = {};
  try {
    saved = JSON.parse(window.sessionStorage.getItem(KEY) || "{}") || {};
  } catch (e) {
    saved = {};                       // private mode, or someone else's JSON
  }

  // Default is on: the music is part of the thing, not an extra.
  let wanted = saved.off !== true;

  function remember() {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({
        off: !wanted,
        at: audio.currentTime || 0,
      }));
    } catch (e) { /* storage unavailable — the music still works */ }
  }

  // currentTime cannot be set before the browser knows how long the file is.
  audio.addEventListener("loadedmetadata", function () {
    const at = Number(saved.at);
    if (isFinite(at) && at > 0 && at < audio.duration - 1) audio.currentTime = at;
  });

  function render() {
    const on = wanted && !audio.paused;
    btn.textContent = on ? "\u{1F50A}" : "\u{1F507}";
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "ปิดเพลง" : "เปิดเพลง");
    btn.dataset.on = String(on);
  }

  function play() {
    const p = audio.play();
    if (p && p.catch) {
      return p.then(render).catch(function () {
        // Refused. The first-gesture handler below will pick it up.
        render();
      });
    }
    render();
    return null;
  }

  btn.addEventListener("click", function () {
    wanted = !wanted;
    if (wanted) play();
    else { audio.pause(); render(); }
    remember();
  });

  /*
   * One-shot: the first gesture anywhere starts the music if it was blocked.
   * Registered on the capture phase so it still fires for gestures the ring's own
   * handlers consume, and removed as soon as it has done its job.
   */
  function onFirstGesture() {
    if (wanted && audio.paused) play();
    document.removeEventListener("pointerdown", onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
  }
  document.addEventListener("pointerdown", onFirstGesture, true);
  document.addEventListener("keydown", onFirstGesture, true);

  // Cheap enough at once every couple of seconds, and pagehide alone is not
  // reliable on iOS.
  audio.addEventListener("timeupdate", function () {
    if (Math.floor(audio.currentTime) % 2 === 0) remember();
  });
  window.addEventListener("pagehide", remember);

  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);

  render();
  if (wanted) play();

  window.Music = {
    audio: audio,
    isOn: function () { return wanted && !audio.paused; },
    toggle: function () { btn.click(); },
  };
})();
