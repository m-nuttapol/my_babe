/*
 * Everything that is story rather than gameplay: the opening cutscene, the zone
 * cards, the question at the door, the lines during the heal, and the letter.
 *
 * DOM and not canvas because it is text and photographs, and because real text
 * is selectable, scalable and accessible for free.
 */
(function (root) {
  "use strict";

  /*
   * The letter she actually reads at the end. Still null: the real words have to
   * come from him, and inventing them would be worse than leaving an obvious gap.
   * Set this string and the placeholder disappears.
   */
  const LETTER_TEXT = null;

  const overlay = document.getElementById("overlay");
  const inner = document.getElementById("overlayInner");
  const sayEl = document.getElementById("say");
  const camSnapEl = document.getElementById("camSnap");
  const camSnapRawEl = document.getElementById("camSnapRaw");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Every pending timer, so a skip can cancel the whole queue at once. */
  let timers = [];

  function after(ms, fn) {
    timers.push(window.setTimeout(fn, ms));
  }

  function clearTimers() {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
  }

  function show(html, className) {
    inner.innerHTML = html;
    overlay.className = "overlay" + (className ? " " + className : "");
    overlay.hidden = false;
  }

  function hide() {
    overlay.hidden = true;
    inner.innerHTML = "";
  }

  function showMemory(src, text, memoryIndex, onDone) {
    show(
      '<div class="memory-reveal">' +
        '<div class="memory-kicker">ความทรงจำที่ ' + memoryIndex + ' / 3</div>' +
        '<img src="' + src + '" alt="ความทรงจำที่คาเฟ่">' +
        '<p>' + text + '</p>' +
        '<button class="tap" type="button">เก็บความทรงจำ</button>' +
      '</div>',
      "memory-overlay"
    );
    const finish = function (e) {
      if (e) e.stopPropagation();
      overlay.removeEventListener("pointerdown", finish);
      root.Audio2.sfx("memoryClose");
      hide();
      if (onDone) onDone();
    };
    overlay.addEventListener("pointerdown", finish);
  }

  function showMemoryBag(items, onDone) {
    const slots = items.map(function (item, i) {
      if (!item.collected) {
        return '<div class="memory-slot locked" aria-label="ความทรงจำที่ยังไม่พบ">?</div>';
      }
      return '<article class="memory-slot">' +
        '<img src="' + item.src + '" alt="ความทรงจำที่ ' + (i + 1) + '">' +
        '<h3>ความทรงจำที่ ' + (i + 1) + '</h3>' +
        '<p>' + item.text + '</p>' +
      '</article>';
    }).join("");
    show(
      '<div class="memory-inventory">' +
        '<h2>กระเป๋าความทรงจำ</h2>' +
        '<div class="memory-slots">' + slots + '</div>' +
        '<button class="tap" id="closeMemoryBag" type="button">ปิดกระเป๋า</button>' +
      '</div>',
      "memory-overlay"
    );
    document.getElementById("closeMemoryBag").addEventListener("click", function (e) {
      e.stopPropagation();
      hide();
      if (onDone) onDone();
    });
  }

  /* Plays a list of {html, ms} beats in order; a tap skips to the next one. */
  function playBeats(beats, onDone) {
    let i = 0;

    function next() {
      clearTimers();
      if (i >= beats.length) {
        overlay.removeEventListener("pointerdown", next);
        onDone();
        return;
      }
      const beat = beats[i++];
      show(beat.html, beat.cls);
      if (beat.sfx) root.Audio2.sfx(beat.sfx);
      after(beat.ms, next);
    }

    overlay.addEventListener("pointerdown", next);
    next();
  }

  // ------------------------------------------------------------- the cutscene

  /*
   * The opening begins on the quiet room in the source PNG, accompanied by its
   * piano phrase, before the authored story frames start. Each frame has a named
   * transition to the next. The frames
   * carry the story — the notifications, the shadows, and the closing title are
   * all painted into them — so this file only has to time them and get between
   * them the right way.
   *
   * Most later frames use WebP for speed. Edited story frames stay as source
   * PNGs so their lettering and cat details remain exact.
   */
  const SHOTS = [
    { src: "assets/cutscene/1.png", hold: 6200,
      start: ["introPiano"] },

    /*
     * `start` / `stop` are the sound cues, fired when the frame's transition
     * begins. Holds on the first two shots are long because the laughter and the
     * buzzing need room to be heard, not because the pictures need the time.
     */
    { src: "assets/cutscene/pre1.png", via: "dissolve", dur: 1200, hold: 4200,
      start: ["girlLaugh", { name: "manLaugh", delay: 500 }],
      stop: [{ name: "introPiano", fade: 1200 }] },

    { src: "assets/cutscene/pre2.png", via: "dissolve", dur: 1400, hold: 3200,
      start: ["phone"],
      stop: [{ name: "girlLaugh", fade: 1400 }, { name: "manLaugh", fade: 1400 }] },

    // Cut from the ringing phone to his reaction; the notification pressure then
    // builds over this shot instead of returning to the opening image.
    { src: "assets/cutscene/pre3.png", via: "pullaway", dur: 900, hold: 1200,
      cardsAfter: true,
      stop: [{ name: "phone", fade: 900 }] },

    // The lights go out, and something in the dark starts enjoying itself.
    { src: "assets/cutscene/3.png", via: "darken", dur: 1500, hold: 2600,
      start: ["powerDown", { name: "neverLetGo", delay: 1500 },
              { name: "scaryLaugh", delay: 13400 }] },

    { src: "assets/cutscene/4.webp", via: "wipe",     dur: 900,  hold: 1800, sfx: "shadow" },
    { src: "assets/cutscene/5.webp", via: "push",     dur: 450,  hold: 1600 },
    { src: "assets/cutscene/6.webp", via: "pullaway", dur: 900,  hold: 1700 },
    { src: "assets/cutscene/7.webp", via: "motion",   dur: 700,  hold: 1600 },
    { src: "assets/cutscene/8.webp", via: "cut",      dur: 0,    hold: 1500, sfx: "door" },
    { src: "assets/cutscene/9.webp", via: "blackout", dur: 1900, hold: 3600 },
  ];

  /* Turn a `start`/`stop` entry into a call. Entries are either a bare clip name
     or an object carrying a delay (start) or a fade length (stop). */
  function runCues(shot) {
    for (const cue of shot.stop || []) {
      if (typeof cue === "string") root.Audio2.stopClip(cue, 600);
      else root.Audio2.stopClip(cue.name, cue.fade);
    }
    for (const cue of shot.start || []) {
      if (typeof cue === "string") root.Audio2.playClip(cue);
      else root.Audio2.playClip(cue.name, cue.delay);
    }
  }

  /* The last frame is the title card, so a skip must never jump past it. */
  const TITLE_SHOT = SHOTS.length - 1;

  const cine = document.getElementById("cine");
  const layers = [document.getElementById("cineA"), document.getElementById("cineB")];
  const veil = document.getElementById("cineVeil");
  const wipe = document.getElementById("cineWipe");
  const flash = document.getElementById("cineFlash");

  let front = 0;   // which of `layers` is currently the visible one

  /* Module scope, not local to showCutscene: the card reveal is its own loop and
     has to be able to see a skip land while it is mid-way through. */
  let stage = "idle";
  function skipping() { return stage === "skipping"; }

  // --------------------------------------------------- the notifications

  /* Real DOM cards keep the requested phrases exact and readable. Positions are
     fractions of the cutscene box; alternating sides lets the pressure close in
     without hiding M's face. */
  const CARDS = [
    { x: .035, y: .05, w: .31, h: .09, text: "EXPECTATIONS" },
    { x: .655, y: .06, w: .32, h: .09, text: "WHAT IF I’M NOT ENOUGH?" },
    { x: .025, y: .16, w: .33, h: .09, text: "DON’T DISAPPOINT THEM" },
    { x: .645, y: .17, w: .34, h: .09, text: "AM I DOING ENOUGH?" },
    { x: .025, y: .27, w: .34, h: .09, text: "WHAT IF I CHOSE WRONG?" },
    { x: .635, y: .28, w: .35, h: .09, text: "EVERYONE IS MOVING FORWARD" },
    { x: .025, y: .38, w: .35, h: .09, text: "I SHOULD BE BETTER BY NOW" },
    { x: .665, y: .39, w: .30, h: .09, text: "WHAT COMES NEXT?" },
    { x: .035, y: .49, w: .32, h: .09, text: "DON’T LET THEM DOWN" },
    { x: .645, y: .50, w: .33, h: .09, text: "YOU HAVE TO BE STRONG" },
  ];

  const CARD_ORDER = CARDS.map(function (_, i) { return i; });
  const CARD_GAP = 1500;

  const cardLayers = [];

  function buildCards() {
    for (let i = 0; i < CARDS.length; i++) {
      const card = document.createElement("div");
      card.className = "cine-card";
      card.textContent = CARDS[i].text;
      card.setAttribute("aria-hidden", "true");
      cine.appendChild(card);
      cardLayers.push(card);
    }
    layoutCards();
    window.addEventListener("resize", layoutCards);
  }

  function layoutCards() {
    if (!cardLayers.length) return;
    const box = cine.getBoundingClientRect();

    for (let i = 0; i < CARDS.length; i++) {
      const c = CARDS[i];
      cardLayers[i].style.left = (c.x * box.width) + "px";
      cardLayers[i].style.top = (c.y * box.height) + "px";
      cardLayers[i].style.width = (c.w * box.width) + "px";
      cardLayers[i].style.minHeight = (c.h * box.height) + "px";
    }
  }

  async function revealCards() {
    layoutCards();
    hideCards();
    for (const idx of CARD_ORDER) {
      const el = cardLayers[idx];
      el.style.transition = "none";
      el.style.filter = "brightness(1.75)";
      el.style.opacity = "0";
      reflow(el);
      el.style.transition = "opacity 260ms ease-out, filter 460ms ease-out";
      el.style.opacity = "1";
      el.style.filter = "brightness(1)";
      root.Audio2.playClip("notify");
      await wait(CARD_GAP);
      if (skipping()) break;
    }
  }

  /* Clear the pressure cards before the next authored frame. */
  function hideCards() {
    for (const el of cardLayers) {
      el.style.transition = "none";
      el.style.opacity = "0";
    }
  }

  function wait(ms) {
    return new Promise(function (res) {
      const t = window.setTimeout(function () { pending = null; res(); }, ms);
      pending = function () { window.clearTimeout(t); pending = null; res(); };
    });
  }

  let pending = null;
  function flush() {
    if (pending) pending();
  }

  /* Reading offsetWidth commits the "from" styles; without it the browser
     coalesces from and to into one frame and the transition never runs. */
  function reflow(el) {
    void el.offsetWidth;
  }

  function place(el, src) {
    el.src = src;
    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.transform = "none";
    el.style.filter = "none";
    reflow(el);
  }

  function showInstant(el) {
    el.style.transition = "none";
    el.style.opacity = "1";
    el.style.transform = "none";
    el.style.filter = "none";
  }

  function shake(ms) {
    cine.classList.remove("shake");
    reflow(cine);
    cine.classList.add("shake");
    window.setTimeout(function () { cine.classList.remove("shake"); }, ms);
  }

  /*
   * Each transition is authored as inline style on the incoming layer (and, where
   * it needs to move, the outgoing one) rather than as a CSS class per mode. Nine
   * frames means eight transitions, and a class matrix for that was harder to
   * read than the one place the mapping actually lives.
   */
  async function transition(via, dur, incoming, outgoing) {
    /*
     * The incoming frame must be the upper layer, every time. The two layers swap
     * roles on each shot, so without this half the transitions faded the new
     * frame in UNDERNEATH the old one — the push and the whip played invisibly and
     * then snapped when the outgoing layer was finally cleared.
     */
    incoming.style.zIndex = "2";
    outgoing.style.zIndex = "1";

    if (via === "cut") {
      // Hard cut: no tween at all, then the hit. The outgoing layer has to be
      // cleared explicitly — nothing here fades it, so it would otherwise stay at
      // full opacity and reappear over the next frame that lands beneath it.
      showInstant(incoming);
      outgoing.style.opacity = "0";
      flash.style.transition = "none";
      flash.style.opacity = "0.85";
      reflow(flash);
      flash.style.transition = "opacity 260ms ease-out";
      flash.style.opacity = "0";
      shake(420);
      return;
    }

    if (via === "darken" || via === "blackout") {
      // Hide the swap behind black. `blackout` holds on the black longer, which
      // is what makes the last frame arrive out of nothing.
      const half = via === "blackout" ? 600 : Math.round(dur / 2);
      const hold = via === "blackout" ? 700 : 0;
      veil.style.transition = "opacity " + half + "ms ease";
      veil.style.opacity = "1";
      await wait(half + hold);
      showInstant(incoming);
      outgoing.style.opacity = "0";
      veil.style.transition = "opacity " + (dur - half - hold) + "ms ease";
      veil.style.opacity = "0";
      await wait(Math.max(0, dur - half - hold));
      return;
    }

    if (via === "wipe") {
      // A shadow sweeps across and the frame changes underneath it.
      wipe.style.transition = "none";
      wipe.style.transform = "translateX(100%)";
      reflow(wipe);
      wipe.style.transition = "transform " + dur + "ms cubic-bezier(.45,0,.55,1)";
      wipe.style.transform = "translateX(-100%)";
      await wait(Math.round(dur * 0.5));
      showInstant(incoming);
      outgoing.style.opacity = "0";
      await wait(Math.round(dur * 0.5));
      wipe.style.transition = "none";
      wipe.style.transform = "translateX(100%)";
      return;
    }

    if (via === "push") {
      // Rapid camera push: the new frame rushes at the lens.
      incoming.style.transform = "scale(1.32)";
      reflow(incoming);
      incoming.style.transition =
        "opacity 180ms ease, transform " + dur + "ms cubic-bezier(.16,.84,.24,1)";
      incoming.style.opacity = "1";
      incoming.style.transform = "none";
      shake(260);
      await wait(dur);
      outgoing.style.opacity = "0";
      return;
    }

    if (via === "pullaway") {
      // The opposite move: the old frame swells past the lens as the wider one
      // settles, so the camera reads as retreating rather than cutting.
      incoming.style.transform = "scale(1.16)";
      reflow(incoming);
      incoming.style.transition =
        "opacity " + Math.round(dur * 0.6) + "ms ease, transform " + dur + "ms cubic-bezier(.3,.7,.2,1)";
      incoming.style.opacity = "1";
      incoming.style.transform = "none";
      outgoing.style.transition = "opacity " + dur + "ms ease, transform " + dur + "ms ease-in";
      outgoing.style.transform = "scale(1.22)";
      outgoing.style.opacity = "0";
      await wait(dur);
      outgoing.style.transform = "none";
      return;
    }

    if (via === "motion") {
      // Whip: both frames slide the same way and the blur clears as she lands.
      incoming.style.transform = "translateX(13%)";
      incoming.style.filter = "blur(7px)";
      reflow(incoming);
      incoming.style.transition =
        "opacity " + Math.round(dur * 0.5) + "ms ease, transform " + dur +
        "ms cubic-bezier(.2,.8,.2,1), filter " + dur + "ms ease-out";
      incoming.style.opacity = "1";
      incoming.style.transform = "none";
      incoming.style.filter = "none";
      outgoing.style.transition = "transform " + dur + "ms ease-in, filter " + dur + "ms ease-in";
      outgoing.style.transform = "translateX(-11%)";
      outgoing.style.filter = "blur(7px)";
      await wait(dur);
      outgoing.style.opacity = "0";
      outgoing.style.transform = "none";
      outgoing.style.filter = "none";
      return;
    }

    // dissolve, and the fallback for anything unnamed
    incoming.style.transition = "opacity " + dur + "ms ease";
    incoming.style.opacity = "1";
    await wait(dur);
    outgoing.style.opacity = "0";
  }

  /* Decode every frame up front: a transition that has to fetch its own image
     stutters exactly where it is meant to be smoothest. */
  function preload() {
    return Promise.all(SHOTS.map(function (shot) {
      return new Promise(function (res) {
        const img = new window.Image();
        img.onload = img.onerror = function () { res(); };
        img.src = shot.src;
      });
    }));
  }

  function showCutscene(onDone) {
    stage = "loading";
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      cine.removeEventListener("pointerdown", onTap);
      cine.hidden = true;
      root.Audio2.stopAllClips(900);
      onDone();
    }

    /*
     * First tap jumps to the title frame rather than out of the cutscene: that
     * last card is the instruction for the whole chapter, and skipping straight
     * past it leaves the player in a dark corridor with no idea why.
     */
    function onTap() {
      if (stage === "title") { finish(); return; }
      if (stage === "loading") return;
      stage = "skipping";
      flush();
    }

    cine.hidden = false;
    cine.addEventListener("pointerdown", onTap);
    if (!cardLayers.length) buildCards();
    veil.style.transition = "none";
    veil.style.opacity = "0";

    preload().then(async function () {
      root.Audio2.preloadClips();

      stage = "playing";
      place(layers[0], SHOTS[0].src);
      showInstant(layers[0]);
      front = 0;
      root.Audio2.unlock();
      runCues(SHOTS[0]);
      if (SHOTS[0].hold) await wait(SHOTS[0].hold);

      for (let i = 1; i < SHOTS.length; i++) {
        if (stage === "skipping") break;
        const shot = SHOTS[i];
        const incoming = layers[1 - front];
        const outgoing = layers[front];
        place(incoming, shot.src);
        if (shot.sfx) root.Audio2.sfx(shot.sfx);
        runCues(shot);
        // Some shots reveal the cards before their transition. `cardsAfter` is
        // used by pre3 so his reaction remains underneath the entire reveal.
        if (shot.cards) {
          await revealCards();
          if (stage === "skipping") { hideCards(); break; }
        }
        await transition(shot.via, shot.dur, incoming, outgoing);
        if (shot.cards) hideCards();
        front = 1 - front;
        if (stage === "skipping") break;
        if (shot.cardsAfter) {
          await revealCards();
          if (stage === "skipping") { hideCards(); break; }
        }
        if (i === TITLE_SHOT) stage = "title";
        await wait(shot.hold);
        if (shot.cardsAfter) hideCards();
      }

      if (done) return;

      if (stage !== "title") {
        // Skipped: land on the title frame and let it be read. Everything from the
        // warm half of the cutscene goes with it; the laugh is what belongs here.
        hideCards();
        root.Audio2.stopClip("girlLaugh", 300);
        root.Audio2.stopClip("manLaugh", 300);
        root.Audio2.stopClip("phone", 300);
        root.Audio2.stopClip("neverLetGo", 300);
        root.Audio2.playClip("scaryLaugh");
        const incoming = layers[1 - front];
        place(incoming, SHOTS[TITLE_SHOT].src);
        showInstant(incoming);
        layers[front].style.opacity = "0";
        front = 1 - front;
        veil.style.transition = "none";
        veil.style.opacity = "0";
        wipe.style.transform = "translateX(100%)";
        stage = "title";
        await wait(SHOTS[TITLE_SHOT].hold);
      }

      finish();
    });
  }

  /*
   * Shown once, before zone 1. A twin-stick is not something anyone can guess,
   * and this does NOT use playBeats: it waits for the button, so a leftover tap
   * from the cutscene cannot skip straight past the only explanation.
   */
  function showControls(onDone) {
    show(
      '<p class="line">ตามหาเอ็ม</p>' +
      '<div class="controls">' +
        '<div class="ctrl"><div class="key">WASD&nbsp;&nbsp;↑ ↓ ← →</div>' +
          '<div class="what"><b>เดิน</b>ใช้ WASD หรือปุ่มลูกศรเพื่อเดิน</div></div>' +
        '<div class="ctrl"><div class="key">SPACE</div>' +
          '<div class="what"><b>กด Space bar เพื่อปล่อยพลัง</b>ปล่อยคลื่นหัวใจรอบตัว ไม่ต้องเล็ง</div></div>' +
        '<div class="ctrl"><div class="key">✨</div>' +
          '<div class="what"><b>เปิดกล่อง</b>กำจัดมอนให้หมด แล้วใช้คลื่นยิงกล่องให้แตก</div></div>' +
        '<div class="ctrl"><div class="key">SPACE</div>' +
          '<div class="what"><b>เก็บความทรงจำ</b>เดินเข้าไปหาแสง แล้วกด Space</div></div>' +
      "</div>" +
      '<button class="tap" id="gotIt">ออกตามหา</button>',
      "solid"
    );
    document.getElementById("gotIt").addEventListener("click", function () {
      hide();
      onDone();
    });
  }

  function showZoneCard(zone, onDone) {
    playBeats([
      {
        html: '<p class="line zone">' + zone.title + "</p>" +
              '<p class="line small">' + zone.subtitle + "</p>",
        ms: 2600,
        cls: "solid",
      },
    ], onDone);
  }

  /*
   * The door. Deliberately the only choice in the game, and deliberately not a
   * real one — there is no NO. The question is there to be answered, not to
   * branch.
   */
  function showDoor(onYes) {
    show(
      '<p class="line big">DO YOU REALLY WANT TO GO IN?</p>' +
      '<button class="tap yes" id="yesBtn">YES</button>',
      "solid"
    );
    document.getElementById("yesBtn").addEventListener("click", function () {
      show('<p class="line small">the door opens</p>', "solid");
      // Build the room and play its door sfx now, while this dark card still
      // covers the screen, instead of after — cutting to the room first and
      // playing the creak underneath it made the sound trail in behind an
      // already-visible level. Held for the same 1100ms as the sfx's audible
      // length, so the reveal lands right as the sound finishes.
      onYes();
      after(1100, function () { hide(); });
    });
  }

  /* The heal lines. Non-blocking, because she is holding the button while they
     appear and an overlay would eat the hold. */
  function say(text) {
    if (sayEl.textContent === text) return;
    sayEl.textContent = text;
    sayEl.classList.remove("in");
    // Reading offsetWidth restarts the CSS animation; without it a second line
    // with the same class never re-animates.
    void sayEl.offsetWidth;
    sayEl.classList.add("in");
  }

  function clearSay() {
    sayEl.textContent = "";
    sayEl.classList.remove("in");
  }

  /*
   * The heart-placed moment freezing into a polaroid: the exact captured
   * canvas frame (see main.js's goHome) freezes, shrinks and rotates
   * slightly, entirely via transform/opacity. Nothing else shows once it's
   * done — no lingering card, no flash — the shutter sound in goHome is the
   * cut straight into RESCUE COMPLETE. Total timing matches camSnapShrink's
   * own delay + duration exactly, so onDone lands right as it finishes.
   */
  function showEndingSnap(liveUrl, onDone) {
    if (reducedMotion.matches) {
      onDone();
      return;
    }
    camSnapRawEl.src = liveUrl;
    camSnapEl.hidden = false;
    after(1150, function () {
      camSnapEl.hidden = true;
      onDone();
    });
  }

  // Both messages are paragraphs revealed one at a time (see
  // showNoteMessage) rather than as one block — each fades/rises in and
  // stays up while the next one joins it, so the message builds
  // progressively instead of landing all at once. BIRTHDAY_NOTE goes with
  // the pac/ burst; ANNIVERSARY_NOTE follows it, with the couple/ burst.
  // \n marks real paragraph-internal pauses, not every few words — the
  // .note-line CSS (index.html) has overflow-wrap/word-break to actually
  // handle lines wider than the column, so this doesn't need to hand-break
  // every line short: doing that once made each paragraph so many lines
  // tall the whole note ran down past the photos instead of overflowing
  // sideways.
  const BIRTHDAY_NOTE = [
    "HBD 🤍\nสุขสันต์วันเกิดนะคะ วันนี้เป็นวันคล้ายวันที่เธอได้เกิด⁠มา",
    "เธอเป็นคนเก่งและใจดีมาก ๆ\nถึงบางครั้งอาจจะมีวันที่เหนื่อย หรือรู้สึกว่าตัวเองยังทำได้ไม่ดี⁠พอ\nแต่อยากให้รู้ไว้นะว่า เธอเก่งมาก⁠แล้ว",
    "ขอบคุณนะที่เติบโตมาอย่าง⁠ดี\nและยังคงเป็นตัวเองในแบบที่น่า⁠รัก⁠เสมอ",
    "ขอให้ปีนี้เป็นปีที่มีแต่ความ⁠สุข\nได้ทำในสิ่งที่ชอบ ได้เจอแต่เรื่องดี ๆ\nสมหวังกับทุกสิ่งที่ตั้ง⁠ใจ\nและมีรอยยิ้มเยอะ ๆ ในทุกวันนะ⁠ครับ\n🤍",
  ];
  const ANNIVERSARY_NOTE = [
    "และวันนี้…\nก็ยังเป็นอีกหนึ่งวันสำคัญของ⁠เรา\nครบ 3 ปีแล้ว⁠นะ\nตั้งแต่วันที่เค้าบอกว่าจะดูแล⁠เธอ\n🤍",
    "ถึงระหว่างทางจะมีงอนกัน ตีกัน⁠บ้าง\nแล้วบางทีก็มีหลายอย่างที่เราต่างกันมาก ๆ\nโดยเฉพาะเค้าที่ชอบเอาแต่ทำงาน 555",
    "แต่ขอบคุณ⁠นะ\nที่ยังให้เค้าได้อยู่ข้าง ๆ และได้ดูแลเธอมาจนถึงวัน⁠นี้\nขอบคุณที่คอยเข้าใจกัน ปรับตัวเข้าหา⁠กัน\nแล้วก็ยังเลือกกันในทุก ๆ วัน",
    "3 ปีที่ผ่าน⁠มา\nอาจไม่ได้มีแต่วันที่สมบูรณ์⁠แบบ\nแต่เค้าดีใจนะที่ทุกช่วงเวลานั้นเป็น⁠เธอ\nและก็หวังว่าจะได้ดูแลเธอไปอีก​นานๆ⁠เลย\n🤍",
  ];

  function buildNoteHTML(paragraphs) {
    let html = "";
    for (let i = 0; i < paragraphs.length; i++) {
      html += '<p class="note-line" id="__ID__-p' + i + '">' + paragraphs[i] + "</p>";
    }
    return html;
  }

  // Fades each paragraph of `paragraphs` in, left and right sides
  // together, one after another (staggerMs apart) rather than showing the
  // whole message at once — "ค่อย ๆ ขึ้นมาเรื่อย ๆ จนภาพขึ้นครบ": paced by
  // the caller to spread across the WHOLE burst it goes with, not just its
  // own first few seconds, so the last paragraph lands close to when the
  // last card does instead of the note finishing long before the photos
  // do. Replaces whatever was in camNoteL/R before it (hideNoteMessage is
  // what clears a PREVIOUS message out first, since the two never overlap
  // in this scene).
  function showNoteMessage(paragraphs, staggerMs) {
    const l = document.getElementById("camNoteL");
    const r = document.getElementById("camNoteR");
    l.innerHTML = buildNoteHTML(paragraphs).split("__ID__").join("camNoteL");
    r.innerHTML = buildNoteHTML(paragraphs).split("__ID__").join("camNoteR");
    for (let i = 0; i < paragraphs.length; i++) {
      const reveal = function (idx) {
        return function () {
          const idL = document.getElementById("camNoteL-p" + idx);
          const idR = document.getElementById("camNoteR-p" + idx);
          if (idL) idL.classList.add("show");
          if (idR) idR.classList.add("show");
        };
      }(i);
      const delay = i * staggerMs;
      if (delay <= 0) {
        // The first paragraph's own opacity:0/translateY starting state
        // (just set via innerHTML above) hasn't been painted yet — a plain
        // setTimeout(fn, 0) can fire before the browser ever draws that
        // frame, so it coalesces straight to the .show state and the
        // paragraph just appears instead of rising in like the rest do.
        // Two rAFs guarantee a real paint of the starting state first.
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(reveal);
        });
      } else {
        window.setTimeout(reveal, delay);
      }
    }
  }

  // Fades out whatever paragraphs are currently showing (does not touch
  // their markup — showNoteMessage() replaces that wholesale next time
  // it's called), so a new message doesn't just pop in on top of the old
  // one's leftover text.
  function hideNoteMessage() {
    const nodes = document.querySelectorAll(".cam-note .note-line.show");
    for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove("show");
  }

  // A fixed set (not re-rolled per play) so the fall looks natural without
  // needing an actual RNG each time this beat mounts — spread across the
  // width, staggered sizes/speeds/delays. Negative delays are what let a
  // flake already be mid-fall the instant .dim turns .cam-snow on, instead
  // of every flake visibly starting at the top together.
  function buildSnowHTML() {
    const flakes = [
      [3,10,14,-2],[9,6,11,-9],[15,14,16,-4],[21,8,13,-11],[27,12,15,-1],
      [33,7,12,-7],[39,15,17,-13],[45,9,14,-3],[51,13,16,-8],[57,6,11,-12],
      [63,11,15,-5],[69,8,13,-10],[75,14,16,-2],[81,7,12,-6],[87,12,15,-9],
      [93,10,14,-4],[6,9,13,-14],[18,13,16,-6],[30,7,11,-1],[42,14,17,-8],
      [54,8,12,-3],[66,15,16,-11],[78,6,13,-5],[90,11,14,-9],[12,10,15,-7],
    ];
    let html = "";
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      const left = f[0], size = f[1], dur = f[2], delay = f[3];
      html += '<div class="snowflake" style="left:' + left + '%;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'animation-duration:' + dur + 's;animation-delay:' + delay + 's;"></div>';
    }
    return html;
  }

  function showRescue(onDone, photoSrc) {
    const photo = photoSrc || "assets/photos/couple-photo.png";
    playBeats([
      { html: '<p class="line big">RESCUE COMPLETE</p>', ms: 2600, cls: "solid warm" },
      {
        html: '<p class="line small quiet">The world didn’t get easier.</p>' +
              '<p class="line small quiet">I just didn’t have to face it alone.</p>',
        ms: 4200,
        cls: "solid warm",
      },
      {
        // The photo she's carrying out with her, printed like it just came out
        // of the camera — the real captured frame (see showEndingSnap) when
        // there is one, the same picture the letter page shows otherwise.
        // The camera itself is a real, uncropped photo (assets/ui/instax-camera.png)
        // and never moves except for camWiggle's own little shake. The card
        // isn't hidden behind it and slid into view — cam-slot-mask clips it
        // exactly at the drawn slot's own position, so it genuinely looks
        // like it's printing out rather than emerging from behind the camera
        // body.
        //
        // Two cards print on their own timers — .p1 the moment this beat
        // appears, .p2 (now the birthday card) once the player taps "Click
        // to snap a photo" — then p3–p6, the real party photos from
        // assets/photos/pac/, fire off in a rapid burst right after .p2 lands, no
        // further tap needed. camBeatInner.snapped (added on the p2 click)
        // and .goN (added one at a time by the setTimeout burst below, see
        // startBurst) are what switch each card's own wiggle/flash/eject/
        // drift on. cam-dim is the dark, camera-lit backdrop for the whole
        // beat — see its own CSS for why it's a separate layer instead of
        // just changing .overlay's background. Cards come after .cam-dim
        // and in p1→p6 order in the markup so each later one paints on top
        // of everything before it.
        html: '<div class="cam-beat-inner" id="camBeatInner">' +
                '<div class="cam-dim"></div>' +
                '<div class="cam-snow" id="camSnow">' + buildSnowHTML() + '</div>' +
                '<div class="screen-flash sf1"></div>' +
                '<div class="screen-flash sf2"></div>' +
                '<div class="screen-flash sf3"></div>' +
                '<div class="screen-flash sf4"></div>' +
                '<div class="screen-flash sf5"></div>' +
                '<div class="screen-flash sf6"></div>' +
                '<div class="screen-flash sf7"></div>' +
                '<div class="screen-flash sf8"></div>' +
                '<div class="screen-flash sf9"></div>' +
                '<div class="screen-flash sf10"></div>' +
                '<div class="cam-scene">' +
                  '<img class="cam" src="assets/ui/instax-camera.png?v=20260826-uncropped" alt="" />' +
                  '<div class="cam-cue left" id="camCueL"></div>' +
                  '<div class="cam-cue right" id="camCueR"></div>' +
                  '<div class="cam-note left" id="camNoteL"></div>' +
                  '<div class="cam-note right" id="camNoteR"></div>' +
                  '<div class="cam-flash f1"></div>' +
                  '<div class="cam-flash f2"></div>' +
                  '<div class="cam-flash f3"></div>' +
                  '<div class="cam-flash f4"></div>' +
                  '<div class="cam-flash f5"></div>' +
                  '<div class="cam-flash f6"></div>' +
                  '<div class="cam-flash f7"></div>' +
                  '<div class="cam-flash f8"></div>' +
                  '<div class="cam-flash f9"></div>' +
                  '<div class="cam-flash f10"></div>' +
                  '<div class="cam-slot-mask">' +
                    '<div class="cam-photo p1"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="' + photo + '" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p2"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/hbd_cat_presnet.png" alt="happy birthday" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p3"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/pac/1.jpg" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p4"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/pac/2.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p5"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/pac/3.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p6"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/pac/4.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p7"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/couple/1.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p8"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/couple/2.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p9"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/couple/3.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                    '<div class="cam-photo p10"><div class="polaroid">' +
                      '<div class="polaroid-shot">' +
                        '<img src="assets/photos/couple/4.JPG" alt="us" />' +
                        '<div class="polaroid-blank"></div>' +
                      '</div>' +
                    '</div></div>' +
                  '</div>' +
                '</div>' +
                '<div class="cam-cta">' +
                  '<button class="tap cam-snap-btn" id="camSnapBtn">Click to snap a photo</button>' +
                '</div>' +
              '</div>',
        ms: 100000,
        // No beat-level sfx here any more — .p1's own camSlide (below) has
        // to start exactly at its eject delay (.35s), not at t=0 when this
        // beat mounts, so it's scheduled the same way piano/dim are.
        // cam-beat: this beat's card hangs well below the camera once fully
        // ejected — pin the whole block near the top instead of the usual
        // vertical centring, so there's room for it and it never runs off
        // the bottom of the viewport.
        cls: "solid warm cam-beat",
      },
    ], function () {});

    // .p1's own eject delay (.35s) — camSlide has to start exactly when
    // the card actually starts moving, not when showRescue() itself was
    // called (this beat doesn't mount until RESCUE COMPLETE + the quiet
    // lines have both played out, several seconds later), so this polls
    // for the beat's own markup the same way the other triggers below do.
    const waitForP1Slide = window.setInterval(function () {
      if (!document.getElementById("camBeatInner")) return;
      window.clearInterval(waitForP1Slide);
      window.setTimeout(function () {
        root.Audio2.sfx("camSlide");
      }, 350);
    }, 60);

    // "ยิ้มมมม", then 3, 2, 1 — each one fades in, holds, fades out (the
    // .show class below), on BOTH sides of the camera at once, showing the
    // exact same text at the exact same time. "ยิ้มมมม" is solid mint;
    // each number gets its own solid colour class (c3/c2/c1 below) —
    // yellow, orange, red — so the countdown itself visibly escalates in
    // urgency toward "1", landing on red right before the shutter. Runs
    // once, right after the tap, before any of the actual snap (wiggle/
    // flash/eject) starts.
    function runCountdown(inner, onComplete) {
      const l = document.getElementById("camCueL");
      const r = document.getElementById("camCueR");
      const steps = [
        { text: "ยิ้มมมม", hold: 500, cls: "" },
        { text: "3", hold: 600, cls: "c3" },
        { text: "2", hold: 600, cls: "c2" },
        { text: "1", hold: 600, cls: "c1" },
      ];
      const fadeMs = 300;
      let i = 0;
      function next() {
        if (i >= steps.length) {
          window.setTimeout(onComplete, 200);
          return;
        }
        const step = steps[i++];
        l.textContent = r.textContent = step.text;
        l.className = "cam-cue left" + (step.cls ? " " + step.cls : "");
        r.className = "cam-cue right" + (step.cls ? " " + step.cls : "");
        // One tick per number, not just on "3" — countdownTick is a single
        // ~0.6s beep, so it's replayed fresh for each of 3/2/1 rather than
        // relying on one long track's own internal pacing to line up.
        if (step.cls) root.Audio2.sfx("countdownTick");
        l.classList.add("show");
        r.classList.add("show");
        window.setTimeout(function () {
          l.classList.remove("show");
          r.classList.remove("show");
          window.setTimeout(next, fadeMs);
        }, step.hold);
      }
      next();
    }

    // The snap button only appears once .p1 has finished settling (its own
    // fade-in delay, timed off page-load same as .p1, lives in the CSS).
    // Tapping it hides the button and runs the smile/countdown, and only
    // once THAT finishes does .p2's own wiggle/flash/eject/drift actually
    // start; .p2 landing is in turn what kicks off the rapid clicks, then
    // the slow p3–p6 prints, below.
    const waitForSnap = window.setInterval(function () {
      const btn = document.getElementById("camSnapBtn");
      const inner = document.getElementById("camBeatInner");
      if (!btn || !inner) return;
      window.clearInterval(waitForSnap);
      btn.addEventListener("click", function () {
        // camSparkle (twinkle_soft.mp3) right on the tap itself — before
        // the countdown even starts, not part of the snap/eject sequence.
        root.Audio2.sfx("camSparkle");
        inner.classList.add("counting");
        runCountdown(inner, function () {
          inner.classList.add("snapped");
          // cameraShutter (camera_sound.mp3) is the same flash/shutter cue
          // goHome() plays for the first, in-game capture — reused here so
          // .f2's flash has a sound to go with it. camSlide is separate and
          // scheduled for .p2's own eject delay (2.5s) below, not fired
          // here at t=0 — it has to start when the card actually begins
          // sliding, not at the shutter/flash moment that precedes it.
          root.Audio2.sfx("cameraShutter");
          window.setTimeout(function () {
            root.Audio2.sfx("camSlide");
          }, 2500);

          // The scene goes dark, and the piano starts, WHILE the HBD card
          // is sliding down — not before, and not only once it's already
          // landed. camDrift2 (see the CSS) runs from 7.4s to 9.3s after
          // .snapped, so .dim's own fade is timed to that same 1.9s window
          // — the card settling and the lights going down finish together.
          window.setTimeout(function () {
            inner.classList.add("dim");
            root.Audio2.playPiano();
          }, 7400);

          startBurst(inner);
        });
      }, { once: true });
    }, 60);

    // Two phases, not one: a quick burst of shutter clicks first (camera
    // "capturing" four shots in rapid succession — .cam-flash.f3–f6 only,
    // no cards move yet), THEN the prints themselves emerge slowly, one at
    // a time, each fully landing before the next starts — a real instant
    // camera can only eject one print at a time regardless of how fast you
    // clicked the shutter, and it reads as calmer/more deliberate than the
    // clicks that led into it.
    // One burst = a quick round of shutter clicks (flash only, no cards
    // move yet), THEN that many prints emerging slowly, one at a time,
    // each fully landing before the next starts — a real instant camera
    // can only eject one print at a time regardless of how fast you
    // clicked the shutter. Used twice: pac/ photos + BIRTHDAY_NOTE first,
    // then couple/ photos + ANNIVERSARY_NOTE, chained through onBurstDone
    // rather than duplicated, so the two rounds can't quietly drift out of
    // sync with each other the way hand-copied timing blocks tend to.
    //
    // opts: { clickNames, printNames, notes, startDelayMs, onBurstDone }
    // startDelayMs is measured from the moment runBurst() itself is
    // called, not from any earlier fixed point — each call computes its
    // own.
    function runBurst(inner, opts) {
      const clickStartMs = opts.startDelayMs;
      const clickGapMs = 400;
      opts.clickNames.forEach(function (name, i) {
        window.setTimeout(function () {
          root.Audio2.sfx("cameraShutter");
          inner.classList.add("click" + name.slice(1));
        }, clickStartMs + i * clickGapMs);
      });
      const lastClickMs = clickStartMs + (opts.clickNames.length - 1) * clickGapMs;
      const flashTailMs = 500; // camFlash's own duration, so it's fully faded first
      const printStartMs = lastClickMs + flashTailMs + 300;

      // .3s eject delay + 2.9s eject (matched to camSlide's own length,
      // same as every other card) + .8s hold + 2.2s drift — the hold/drift
      // stay unhurried on top of that.
      const perPrintMs = 300 + 2900 + 800 + 2200;
      const printGapMs = perPrintMs + 300;

      // The note starts building (paragraph by paragraph) right as the
      // cards start sliding down (not after, not before), and its OWN
      // pace is stretched to span the whole burst — the last paragraph
      // lands right as the final card starts printing — rather than all
      // paragraphs finishing in the note's own first few seconds while
      // the photos are still only half done.
      const noteSpanMs = (opts.printNames.length - 1) * printGapMs;
      const noteStaggerMs = noteSpanMs / (opts.notes.length - 1);
      window.setTimeout(function () {
        showNoteMessage(opts.notes, noteStaggerMs);
      }, printStartMs);

      opts.printNames.forEach(function (name, i) {
        window.setTimeout(function () {
          inner.classList.add("go" + name.slice(1));
          window.setTimeout(function () {
            root.Audio2.sfx("camSlide");
          }, 300); // this card's own eject delay
        }, printStartMs + i * printGapMs);
      });
      const lastPrintTriggerMs = printStartMs + (opts.printNames.length - 1) * printGapMs;
      const settleMs = lastPrintTriggerMs + perPrintMs;
      window.setTimeout(opts.onBurstDone, settleMs + 2500);
    }

    function startBurst(inner) {
      const p2SettleMs = 2500 + 2900 + 2000 + 1900; // 9300 — .p2's own full cycle
      runBurst(inner, {
        clickNames: ["f3", "f4", "f5", "f6"],
        printNames: ["p3", "p4", "p5", "p6"],
        notes: BIRTHDAY_NOTE,
        startDelayMs: p2SettleMs + 300,
        onBurstDone: function () {
          // The birthday note fades out, a pause, then the anniversary
          // note + the couple/ burst pick up right where it left off —
          // "หลังจากนั้นก็ถ่ายรัวๆอีก". 1.4s = .note-line's own
          // opacity/transform transition length, so runBurst isn't called
          // again until the fade-out has actually finished.
          hideNoteMessage();
          window.setTimeout(function () {
            runBurst(inner, {
              clickNames: ["f7", "f8", "f9", "f10"],
              printNames: ["p7", "p8", "p9", "p10"],
              notes: ANNIVERSARY_NOTE,
              startDelayMs: 0,
              onBurstDone: function () {
                // No "→" button any more — once the very last card has
                // landed, this beat just moves on by itself after a
                // moment to actually look at the finished stack (and
                // finish reading the note), rather than waiting on a tap.
                hideNoteMessage();
                window.setTimeout(function () {
                  hide();
                  onDone();
                }, 1600);
              },
            });
          }, 1400 + 500);
        },
      });
    }
  }

  // The beat right after the burst: an envelope that fades in, wobbles like
  // it wants opening, then types out one line. Tapping it goes straight to
  // a REAL camera request — the whole point is that this last photo is her,
  // live, not another asset from disk — captures one frame, shows it as a
  // polaroid, then leaves for the chapters hub. Replaces showLetter() in
  // the ending chain; that function is left in place, just unused from here.
  const ENVELOPE_LINE = "เปิดดูสิคะ";
  const GOODBYE_LINE = "สนุกมั้ย ไว้เจอกันใหม่นะ";

  function showEnvelope() {
    show(
      '<div class="env-beat-inner" id="envBeatInner">' +
        '<img class="env-icon" src="assets/ui/envelope.png" alt="" />' +
        '<div class="env-bubble"><span id="envBubbleText"></span><span class="env-caret">|</span></div>' +
        '<div class="env-cam">' +
          '<video id="envVideo" autoplay playsinline muted></video>' +
          '<button class="tap env-shutter" id="envShutter" type="button" aria-label="ถ่ายรูป"></button>' +
          '<p class="env-hint">แตะปุ่มเพื่อถ่ายรูป</p>' +
        '</div>' +
        '<div class="env-error">' +
          '<p>ขอเข้าถึงกล้องไม่ได้ ลองใหม่อีกครั้งนะ</p>' +
          '<button class="tap" id="envRetry" type="button">ลองอีกครั้ง</button>' +
          '<button class="tap env-skip" id="envSkip" type="button">ข้ามไปก่อน</button>' +
        '</div>' +
        '<div class="env-result">' +
          '<p class="env-caption"><span id="envCaptionText"></span><span class="env-caret">|</span></p>' +
          '<div class="polaroid env-polaroid">' +
            '<div class="polaroid-shot"><img id="envCapturedImg" alt="us" /></div>' +
          '</div>' +
        '</div>' +
        '<div class="env-final-flash"></div>' +
      '</div>',
      "solid env-beat"
    );

    const beatInner = document.getElementById("envBeatInner");
    const bubbleText = document.getElementById("envBubbleText");

    function goHub() {
      window.sessionStorage.setItem("mybabe:returnFrom", "02-bring-m-home");
      window.location.href = "../../";
    }

    // Types ENVELOPE_LINE in once the icon has settled (envIconIn's own
    // 1.5s + a beat), then marks the beat "ready" so the envelope itself
    // becomes the tap target — no separate button needed for a one-line
    // chat bubble. The typing sound is one pre-recorded burst of several
    // clicks already strung together (see audio.js), so it's played once,
    // not retriggered per character.
    after(1700, function () {
      root.Audio2.sfx("envType");
      let i = 0;
      const step = window.setInterval(function () {
        i++;
        bubbleText.textContent = ENVELOPE_LINE.slice(0, i);
        if (i >= ENVELOPE_LINE.length) {
          window.clearInterval(step);
          beatInner.classList.add("ready");
        }
      }, 230);
    });

    beatInner.addEventListener("click", function onOpen() {
      if (!beatInner.classList.contains("ready")) return;
      beatInner.removeEventListener("click", onOpen);
      beatInner.classList.add("opening");
      requestCamera();
    });

    function requestCamera() {
      beatInner.classList.remove("camerror");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        beatInner.classList.add("camerror");
        return;
      }
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "user" }, audio: false })
        .then(function (stream) {
          const video = document.getElementById("envVideo");
          video.srcObject = stream;
          beatInner.classList.add("camready");
          document.getElementById("envShutter").addEventListener(
            "click",
            function () { capture(stream, video); },
            { once: true }
          );
        })
        .catch(function () {
          beatInner.classList.add("camerror");
        });
    }

    // Canvas draw is mirrored the same way the <video> preview is (see
    // env-cam video's scaleX(-1)) so the saved frame matches what she was
    // actually looking at while framing the shot, not a backwards version
    // of it.
    function capture(stream, video) {
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 960;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      stream.getTracks().forEach(function (t) { t.stop(); });
      root.Audio2.sfx("cameraShutter");
      document.getElementById("envCapturedImg").src = canvas.toDataURL("image/jpeg", 0.92);
      beatInner.classList.remove("camready");
      beatInner.classList.add("captured");

      // Once the photo's own envPhotoIn settle (1.1s) is done, the goodbye
      // line types out above it with the same keyboard-click burst as the
      // envelope's own line; holds ~5s once fully typed, then one last
      // shutter click and a flash to white, cutting straight to the
      // chapters hub instead of fading back down to the dark scene first.
      after(1500, function () {
        const captionText = document.getElementById("envCaptionText");
        root.Audio2.sfx("envType");
        let j = 0;
        const step = window.setInterval(function () {
          j++;
          captionText.textContent = GOODBYE_LINE.slice(0, j);
          if (j >= GOODBYE_LINE.length) {
            window.clearInterval(step);
            after(5000, function () {
              root.Audio2.sfx("cameraShutter");
              beatInner.classList.add("flash");
              // .7s to rise to full white (envFinalFlash) + a real hold at
              // full brightness before the hard page-cut — the first pass
              // navigated only ~50ms after the flash finished rising, so
              // the cut landed before there was ever a held white moment,
              // and read as abrupt instead of a proper transition. The
              // fromFlash flag (read by the hub's own <head> script — see
              // its comment there) is what lets the hub continue this same
              // flash back down into a reveal instead of cutting hard into
              // its dark background — only set here, on the beat that
              // actually holds at full white first, not on envSkip's plain
              // click-through.
              after(1600, function () {
                // Not hide(): that would drop the opaque flash overlay and
                // expose the bare game canvas behind it for the moment
                // before window.location.href actually finishes navigating
                // away — the flash has to stay up until the page is gone.
                window.sessionStorage.setItem("mybabe:fromFlash", "1");
                goHub();
              });
            });
          }
        }, 230);
      });
    }

    document.getElementById("envRetry").addEventListener("click", requestCamera);
    document.getElementById("envSkip").addEventListener("click", goHub);
  }

  function showLetter() {
    root.Audio2.playPiano();

    const body = LETTER_TEXT
      ? '<p class="body">' + LETTER_TEXT + "</p>"
      : '<div class="placeholder">PLACEHOLDER — the real letter goes here.\n' +
        "Set LETTER_TEXT at the top of game/scenes.js.</div>";

    document.getElementById("letterInner").innerHTML =
      '<img class="couple" src="assets/photos/couple.jpg" alt="us" />' +
      "<h1>You came and got me</h1>" +
      body +
      '<a class="home" href="../../" onclick="sessionStorage.setItem(\'mybabe:returnFrom\',\'02-bring-m-home\')">← back to chapters</a>';

    document.getElementById("letter").hidden = false;
  }

  root.Scenes = {
    show: show,
    hide: hide,
    playBeats: playBeats,
    showCutscene: showCutscene,
    showMemory: showMemory,
    showMemoryBag: showMemoryBag,
    showControls: showControls,
    showZoneCard: showZoneCard,
    showDoor: showDoor,
    say: say,
    clearSay: clearSay,
    showEndingSnap: showEndingSnap,
    showRescue: showRescue,
    showEnvelope: showEnvelope,
    showLetter: showLetter,
    SHOTS: SHOTS,
    hasLetterText: function () { return LETTER_TEXT !== null; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
