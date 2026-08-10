/*
 * Audio. Two very different jobs:
 *
 *  - The run gets a chiptune synthesized with WebAudio oscillators. No file to
 *    load, and the tempo ramp for the final chase is a single multiplier.
 *  - The letter gets the real piano cover, starting the moment the pixel world
 *    becomes a real page. That contrast is the point.
 *
 * Named Audio2 because window.Audio is the built-in audio element constructor.
 */
(function (root) {
  "use strict";

  let actx = null;
  let master = null;
  let muted = false;
  let step = 0;
  let timer = null;
  let tempo = 1;

  // Semitones from A3. Cheerful but with a chase pulse.
  const MELODY = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 7, 3];
  const BASS = [-12, -12, -5, -5, -10, -10, -3, -3];
  const BASE_STEP_MS = 125;

  function hz(semi) {
    return 220 * Math.pow(2, semi / 12);
  }

  function ensure() {
    if (actx) return actx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    actx = new Ctor();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.16;
    master.connect(actx.destination);
    return actx;
  }

  function blip(freq, dur, type, gain) {
    if (!actx || muted) return;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.5, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(actx.currentTime + dur + 0.02);
  }

  function tick() {
    if (!actx) return;
    blip(hz(MELODY[step % MELODY.length]), 0.12, "square", 0.45);
    if (step % 2 === 0) blip(hz(BASS[(step / 2) % BASS.length]), 0.2, "triangle", 0.5);
    step++;
    timer = window.setTimeout(tick, BASE_STEP_MS / tempo);
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  function startChiptune() {
    if (!ensure() || timer) return;
    tick();
  }

  function stopChiptune() {
    window.clearTimeout(timer);
    timer = null;
  }

  function setTempoMultiplier(m) {
    tempo = m;
  }

  const piano = new window.Audio("assets/stay-with-me.mp3");
  piano.loop = true;
  piano.volume = 0.85;

  function playPiano() {
    stopChiptune();
    piano.muted = muted;
    const p = piano.play();
    // Autoplay may be blocked if no gesture happened yet. Harmless: the letter
    // is always reached by tapping "Tap to open", which counts as one.
    if (p && p.catch) p.catch(function () {});
  }

  function sfx(name) {
    if (name === "jump") blip(660, 0.09, "square", 0.4);
    else if (name === "slide") blip(300, 0.12, "sawtooth", 0.35);
    else if (name === "heart") { blip(880, 0.08, "square", 0.45); blip(1320, 0.1, "square", 0.3); }
    else if (name === "trip") blip(120, 0.26, "sawtooth", 0.6);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.16;
    piano.muted = muted;
    return muted;
  }

  root.Audio2 = {
    unlock: unlock,
    startChiptune: startChiptune,
    stopChiptune: stopChiptune,
    setTempoMultiplier: setTempoMultiplier,
    playPiano: playPiano,
    sfx: sfx,
    toggleMute: toggleMute,
    muted: function () { return muted; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
