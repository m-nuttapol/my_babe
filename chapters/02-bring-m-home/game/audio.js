/*
 * Audio. Everything in the dark city is synthesised — a drone per zone, rain,
 * notification blips, paper bursts — so there is nothing to load and the mix can
 * follow the game moment to moment.
 *
 * The one real recording is the piano, and it starts at the letter, the way it
 * did in the last chapter. That contrast is the point: the synthetic world stops
 * and something recorded and human takes over.
 *
 * Named Audio2 because window.Audio is the built-in element constructor.
 */
(function (root) {
  "use strict";

  let actx = null;
  let master = null;
  let muted = false;

  /* The zone bed: two detuned oscillators under a lowpass, plus filtered noise
     for rain. Built once, then re-tuned per zone instead of torn down. */
  let bed = null;
  let noiseBuf = null;
  let zoneMusicBuffer = null;
  let zoneMusicSource = null;
  let zoneMusicGain = null;
  let zoneMusicLoading = null;
  let zoneMusicWanted = false;
  const ZONE_MUSIC_URL = "../../shared/StarGuide.mp3";

  function ensure() {
    if (actx) return actx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    actx = new Ctor();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(actx.destination);
    return actx;
  }

  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(actx.sampleRate * 2);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
    loadZoneMusic();
  }

  function loadZoneMusic() {
    if (zoneMusicBuffer) return Promise.resolve(zoneMusicBuffer);
    if (zoneMusicLoading) return zoneMusicLoading;
    const c = ensure();
    if (!c) return Promise.resolve(null);
    zoneMusicLoading = fetch(ZONE_MUSIC_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("StarGuide could not be loaded");
        return response.arrayBuffer();
      })
      .then(function (data) { return c.decodeAudioData(data); })
      .then(function (buffer) {
        zoneMusicBuffer = buffer;
        return buffer;
      })
      .catch(function () { return null; });
    return zoneMusicLoading;
  }

  function startZoneMusic(delaySeconds) {
    zoneMusicWanted = true;
    if (zoneMusicSource && zoneMusicGain) {
      ramp(zoneMusicGain.gain, 0.42, 1.4);
      return;
    }
    loadZoneMusic().then(function (buffer) {
      if (!buffer || zoneMusicSource || !zoneMusicWanted) return;
      zoneMusicGain = actx.createGain();
      zoneMusicGain.gain.value = 0;
      zoneMusicGain.connect(master);
      zoneMusicSource = actx.createBufferSource();
      zoneMusicSource.buffer = buffer;
      // AudioBufferSource looping avoids the small pause HTMLAudio can add at
      // the MP3 boundary. A short fade-in hides the first decoded frame too.
      zoneMusicSource.loop = true;
      zoneMusicSource.loopStart = 0;
      zoneMusicSource.loopEnd = buffer.duration;
      zoneMusicSource.connect(zoneMusicGain);
      const delay = Math.max(0, delaySeconds || 0);
      const startAt = actx.currentTime + delay;
      zoneMusicSource.start(startAt);
      zoneMusicGain.gain.cancelScheduledValues(actx.currentTime);
      zoneMusicGain.gain.setValueAtTime(0, actx.currentTime);
      zoneMusicGain.gain.setValueAtTime(0, startAt);
      zoneMusicGain.gain.linearRampToValueAtTime(0.42, startAt + 2.2);
    });
  }

  function stopZoneMusic() {
    zoneMusicWanted = false;
    if (zoneMusicGain && actx) {
      const now = actx.currentTime;
      zoneMusicGain.gain.cancelScheduledValues(now);
      zoneMusicGain.gain.setValueAtTime(0, now);
    }
    if (zoneMusicSource) {
      try { zoneMusicSource.stop(); } catch (e) {}
      zoneMusicSource.disconnect();
    }
    zoneMusicSource = null;
    zoneMusicGain = null;
  }

  function buildBed() {
    if (bed || !ensure()) return;

    const gain = actx.createGain();
    gain.gain.value = 0;
    const filter = actx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    gain.connect(filter);
    filter.connect(master);

    const oscs = [];
    for (const detune of [0, 7]) {
      const o = actx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 55;
      o.detune.value = detune;
      o.connect(gain);
      o.start();
      oscs.push(o);
    }

    // Rain lives on its own gain so only zone 3 gets weather.
    const rainGain = actx.createGain();
    rainGain.gain.value = 0;
    const rainFilter = actx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 2600;
    rainFilter.Q.value = 0.35;
    const rainSrc = actx.createBufferSource();
    rainSrc.buffer = noise();
    rainSrc.loop = true;
    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();

    bed = { gain: gain, filter: filter, oscs: oscs, rainGain: rainGain };
  }

  function ramp(param, value, seconds) {
    if (!actx) return;
    const now = actx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + (seconds || 1.2));
  }

  /*
   * Zone 0 is a flat industrial hum; by zone 2 the drone has dropped and opened
   * up and the rain is in. Called once per zone rather than per frame.
   */
  const ZONE_BED = [
    { hz: 55, cutoff: 420, level: 0.16, rain: 0 },
    { hz: 48, cutoff: 320, level: 0.2, rain: 0 },
    { hz: 38, cutoff: 240, level: 0.26, rain: 0.16 },
  ];

  function setZone(index, delaySeconds) {
    startZoneMusic(delaySeconds);
    // StarGuide is now the complete sound bed for every playable zone. Do not
    // build or retune the old oscillator/rain ambience underneath it.
    if (bed && actx) {
      const now = actx.currentTime;
      for (const gain of [bed.gain.gain, bed.rainGain.gain]) {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(0, now);
      }
    }
  }

  /* The heal and the walk home: the drone lifts and the rain fades out. */
  function warmUp() {
    if (!bed) return;
    for (const o of bed.oscs) ramp(o.frequency, 73.4, 4);   // up to a D
    ramp(bed.filter.frequency, 900, 4);
    ramp(bed.gain.gain, 0.12, 4);
    ramp(bed.rainGain.gain, 0, 3);
  }

  function fadeBed(seconds) {
    if (bed) {
      ramp(bed.gain.gain, 0, seconds || 1.5);
      ramp(bed.rainGain.gain, 0, seconds || 1.5);
    }
    if (zoneMusicGain) ramp(zoneMusicGain.gain, 0, seconds || 1.5);
  }

  function blip(freq, dur, type, gain, when) {
    if (!actx || muted) return;
    const t = actx.currentTime + (when || 0);
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function sfx(name) {
    if (!actx || muted) return;
    switch (name) {
      case "shot":
        playOneShot("magicCast");
        break;
      case "paper":
        playOneShot("enemyDisappear");
        break;
      case "shadow":
        playOneShot("enemyDisappear");
        break;
      case "hit":
        playOneShot("enemyDisappear");
        break;
      case "memory":
        playClip("memoryPick");
        break;
      case "memoryClose":
        playClip("memoryKept");
        break;
      case "notify":
        blip(1046, 0.07, "square", 0.18);
        blip(1568, 0.09, "square", 0.14, 0.07);
        break;
      case "ting":
        // One notification arriving. Bright and bell-like rather than the
        // square-wave chirp above, because six of these land in a row.
        blip(1568, 0.16, "triangle", 0.2);
        blip(2093, 0.22, "sine", 0.13, 0.02);
        blip(3136, 0.1, "sine", 0.05, 0.02);
        break;
      case "door":
        playOneShot("door");
        break;
      case "heartFlash":
        playOneShot("heartFlash");
        break;
      case "cameraShutter":
        playOneShot("cameraShutter");
        break;
      case "camSlide":
        playOneShot("camSlide");
        break;
      case "camSparkle":
        playOneShot("camSparkle");
        break;
      case "countdownTick":
        playOneShot("countdownTick");
        break;
      case "envType":
        playOneShot("envType");
        break;
      case "beat":
        // M's pulse under the heal. Two thumps, the second softer.
        blip(58, 0.16, "sine", 0.5);
        blip(52, 0.13, "sine", 0.3, 0.17);
        break;
      case "step":
        blip(1200, 0.05, "triangle", 0.12);
        break;
      default:
        break;
    }
  }

  /*
   * Recorded clips for the opening.
   *
   * Each file is trimmed so its sound begins immediately. They were exported with
   * long silent lead-ins — notification.mp3 was a 0.55s ding sitting 2.85s into a
   * 5s file — and seeking past that in JS does not work: currentTime assigned
   * before the media is seekable is dropped on the floor, silently, so every cue
   * landed seconds late. Cutting the files is the fix; nothing here seeks.
   */
  const CLIPS = {
    magicCast:  { src: "assets/audio/twinkle_soft.mp3", vol: 0.24 },
    enemyDisappear:{ src: "assets/audio/_sound-originals/disapper.mp3", vol: 0.24 },
    door:       { src: "assets/audio/_sound-originals/sound_door.mp3", vol: 0.6 },
    heartFlash: { src: "assets/audio/flash.mp3", vol: 0.7 },
    cameraShutter: { src: "assets/audio/camera_sound.mp3", vol: 0.7 },
    // The eject/slide sound for every card, timed to start exactly when
    // camEject itself starts (see scenes.js) — vol kept low on purpose,
    // per direct instruction, so the piano stays the thing you're
    // actually listening to and this reads as a texture under it, not a
    // second lead sound competing with it.
    camSlide:   { src: "assets/audio/slide_polaroid.mp3", vol: 0.32 },
    // Same file as magicCast (twinkle_soft.mp3) — a separate CLIPS entry
    // rather than reusing that one so this context's volume can be tuned
    // independently of the gameplay heart-shot sfx it's already tuned for.
    camSparkle: { src: "assets/audio/twinkle_soft.mp3", vol: 0.5 },
    // A single ~0.6s tick cut from _sound-originals/sound_countdown.mp3
    // (that file is 10 near-identical repeats of this same beep on a ~1s
    // loop) — one clean beep, triggered once per number by runCountdown()
    // in scenes.js, syncs exactly with 3/2/1 instead of hoping a long
    // fixed track's own internal pacing happens to line up.
    countdownTick: { src: "assets/audio/countdown_tick.mp3", vol: 0.8 },
    // A single ~2.6s burst of several keystrokes already strung together
    // (not one clean click) — played once, in full, under the envelope's
    // typewriter reveal rather than retriggered per character.
    envType:    { src: "assets/audio/keyboard_type.mp3", vol: 0.55 },
    memoryPick: { src: "assets/audio/_sound-originals/starpick.mp3", vol: 0.26 },
    memoryKept: { src: "assets/audio/_sound-originals/starkept.mp3", vol: 0.26 },
    introPiano: { src: "assets/audio/piano_intro.mp3",       vol: 0.85 },
    girlLaugh:  { src: "assets/audio/girl_laught.mp3",      vol: 0.95 },
    manLaugh:   { src: "assets/audio/man_laught.mp3",       vol: 0.95 },
    phone:      { src: "assets/audio/phone_virbration.mp3", vol: 0.80, loop: true },
    notify:     { src: "assets/audio/notification.mp3",     vol: 0.90 },
    powerDown:  { src: "assets/audio/power_down.mp3",       vol: 0.95 },
    neverLetGo: { src: "assets/audio/never-let-you-go.mp3", vol: 0.85 },
    airGone:    { src: "assets/audio/_sound-originals/air_gone.mp3", vol: 0.45 },
    scaryLaugh: { src: "assets/audio/scary_laught.mp3",     vol: 0.70 },
  };

  const clipEls = {};
  const clipFades = {};
  const clipDelays = {};
  const activeOneShots = new Set();

  // Combat sounds may happen several times in the same frame. Each trigger gets
  // its own element, so a later enemy never rewinds or cuts off an earlier one.
  function playOneShot(name) {
    const spec = CLIPS[name];
    if (!spec || muted) return;
    const el = new window.Audio(spec.src);
    el.preload = "auto";
    el.volume = spec.vol;
    el.muted = muted;
    activeOneShots.add(el);
    const release = function () { activeOneShots.delete(el); };
    el.addEventListener("ended", release, { once: true });
    el.addEventListener("error", release, { once: true });
    const p = el.play();
    if (p && p.catch) p.catch(release);
  }

  function clipEl(name) {
    if (clipEls[name]) return clipEls[name];
    const spec = CLIPS[name];
    if (!spec) return null;
    const el = new window.Audio(spec.src);
    el.preload = "auto";
    el.loop = !!spec.loop;
    el.muted = muted;
    clipEls[name] = el;
    return el;
  }

  function preloadClips() {
    for (const name of Object.keys(CLIPS)) {
      const el = clipEl(name);
      if (el) el.load();
    }
  }

  function clearFade(name) {
    if (clipFades[name]) {
      window.clearInterval(clipFades[name]);
      delete clipFades[name];
    }
  }

  function playClip(name, delay) {
    const spec = CLIPS[name];
    const el = clipEl(name);
    if (!el || !spec) return;
    const go = function () {
      delete clipDelays[name];
      clearFade(name);
      el.muted = muted;
      el.volume = spec.vol;
      // Rewind so a re-triggered cue (the six notifications) fires every time.
      try { el.currentTime = 0; } catch (e) { /* not seekable yet; it is at 0 anyway */ }
      const p = el.play();
      if (p && p.catch) p.catch(function () {});
    };
    if (clipDelays[name]) window.clearTimeout(clipDelays[name]);
    if (delay) clipDelays[name] = window.setTimeout(go, delay);
    else go();
  }

  function stopClip(name, fadeMs) {
    if (clipDelays[name]) {
      window.clearTimeout(clipDelays[name]);
      delete clipDelays[name];
    }
    const el = clipEls[name];
    const spec = CLIPS[name];
    if (!el || !spec) return;
    clearFade(name);
    if (!fadeMs) {
      el.pause();
      try { el.currentTime = 0; } catch (e) {}
      return;
    }
    const step = 50;
    const from = el.volume;
    let t = 0;
    clipFades[name] = window.setInterval(function () {
      t += step;
      const k = Math.max(0, 1 - t / fadeMs);
      el.volume = from * k;
      if (k <= 0) {
        clearFade(name);
        el.pause();
        try { el.currentTime = 0; } catch (e) {}
      }
    }, step);
  }

  function stopAllClips(fadeMs) {
    for (const name of Object.keys(clipEls)) stopClip(name, fadeMs);
  }

  const piano = new window.Audio("assets/audio/stay-with-me.mp3");
  piano.loop = true;
  piano.volume = 0.85;

  // Used when the final room opens. Keep the master available so the healing
  // heartbeat can begin later, but remove every continuous/recorded sound that
  // could leak in from the previous zone.
  function silenceAll() {
    stopAllClips(0);
    for (const el of activeOneShots) {
      el.pause();
      try { el.currentTime = 0; } catch (e) {}
    }
    activeOneShots.clear();
    stopZoneMusic();
    piano.pause();
    try { piano.currentTime = 0; } catch (e) {}
    if (bed && actx) {
      const now = actx.currentTime;
      for (const gain of [bed.gain.gain, bed.rainGain.gain]) {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(0, now);
      }
    }
  }

  function playPiano() {
    fadeBed(2.5);
    stopAllClips(1500);
    piano.muted = muted;
    const p = piano.play();
    // Autoplay may be blocked if no gesture has happened. Harmless here: the
    // letter is only ever reached after a lot of clicking.
    if (p && p.catch) p.catch(function () {});
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.9;
    piano.muted = muted;
    // The recorded clips are their own elements and are not routed through the
    // WebAudio master gain, so muting has to reach them separately.
    for (const name of Object.keys(clipEls)) clipEls[name].muted = muted;
    for (const el of activeOneShots) el.muted = muted;
    return muted;
  }

  root.Audio2 = {
    unlock: unlock,
    setZone: setZone,
    warmUp: warmUp,
    fadeBed: fadeBed,
    sfx: sfx,
    playPiano: playPiano,
    preloadClips: preloadClips,
    playClip: playClip,
    stopClip: stopClip,
    stopAllClips: stopAllClips,
    silenceAll: silenceAll,
    CLIPS: CLIPS,
    toggleMute: toggleMute,
    muted: function () { return muted; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
