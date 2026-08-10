/*
 * DOM overlays for everything that is story rather than gameplay: the opening
 * cutscene, the countdown, the catch, and the letter.
 *
 * These are DOM and not canvas because they are text and photographs, and
 * because real text is selectable, scalable and accessible for free.
 */
(function (root) {
  "use strict";

  const overlay = document.getElementById("overlay");
  const inner = document.getElementById("overlayInner");

  /*
   * The letter she actually reads. Still null: the real text has to come from
   * him, and inventing it would be worse than leaving an obvious gap.
   */
  const LETTER_TEXT = null;
  const SECRET_CAPTION = null;

  function show(html) {
    inner.innerHTML = html;
    overlay.hidden = false;
  }

  function hide() {
    overlay.hidden = true;
    inner.innerHTML = "";
  }

  /*
   * Plays a list of {html, ms} beats in order. Tapping skips to the next beat —
   * a cutscene you cannot hurry is a cutscene people resent.
   */
  function playBeats(beats, onDone) {
    let i = 0;
    let timer = 0;

    function next() {
      window.clearTimeout(timer);
      if (i >= beats.length) {
        overlay.removeEventListener("pointerdown", next);
        onDone();
        return;
      }
      const beat = beats[i++];
      show(beat.html);
      timer = window.setTimeout(next, beat.ms);
    }

    overlay.addEventListener("pointerdown", next);
    next();
  }

  function showCutscene(onDone) {
    playBeats([
      { html: '<p class="line">\u{1F381} A present!</p><p class="line small">tap to continue</p>', ms: 2200 },
      { html: '<p class="line">Oh, you want this? \u{1F60F}</p>', ms: 2000 },
      { html: '<p class="line">HEY! THAT’S MY PRESENT!</p>', ms: 1900 },
      { html: '<p class="line">CATCH ME IF YOU CAN!</p>', ms: 1700 },
    ], onDone);
  }

  function showCountdown(onDone) {
    playBeats([
      { html: '<p class="count">3</p>', ms: 700 },
      { html: '<p class="count">2</p>', ms: 700 },
      { html: '<p class="count">1</p>', ms: 700 },
      { html: '<p class="count">GO!</p>', ms: 500 },
    ], onDone);
  }

  /*
   * Shown once, between the cutscene and the countdown. Hold-to-slide is not a
   * convention anyone can guess, so it gets said in words before it is needed.
   *
   * Note this does NOT use playBeats: it waits for an explicit button rather than
   * a tap anywhere, so a leftover tap from the cutscene cannot skip past it.
   */
  function showControls(onDone) {
    show(
      '<p class="line">How to catch him</p>' +
      '<div class="controls">' +
        '<div class="ctrl"><div class="key">⬆<br>TAP</div>' +
          '<div class="what"><b>JUMP</b>over things on the ground</div></div>' +
        '<div class="ctrl"><div class="key">⬇<br>HOLD</div>' +
          '<div class="what"><b>SLIDE</b>hold it down to stay low, release to stand up</div></div>' +
      "</div>" +
      '<button class="tap" id="gotIt">Got it</button>'
    );
    document.getElementById("gotIt").addEventListener("click", function () {
      hide();
      onDone();
    });
  }

  function showCatch(onOpen) {
    playBeats([
      { html: '<p class="line">Okay okay! You win \u{1F602}</p>', ms: 2000 },
      { html: '<p class="line">\u{1F381}</p><p class="line small">here, it’s yours</p>', ms: 1600 },
    ], function () {
      show('<p class="count">\u{1F381}</p><button class="tap" id="tapOpen">Tap to open</button>');
      document.getElementById("tapOpen").addEventListener("click", function () {
        show('<p class="count">✨</p>');
        window.setTimeout(function () { hide(); onOpen(); }, 900);
      });
    });
  }

  function showLetter(hearts) {
    root.Audio2.playPiano();

    const unlocked = root.Rules.secretUnlocked(hearts);
    const body = LETTER_TEXT
      ? '<p class="body">' + LETTER_TEXT + "</p>"
      : '<div class="placeholder">PLACEHOLDER — the real letter goes here.\n' +
        "Set LETTER_TEXT at the top of game/scenes.js.</div>";

    const secret = unlocked
      ? '<div class="secret"><button id="secretBtn">\u{1F513} Secret unlocked</button>' +
        '<div id="secretBody"></div></div>'
      : '<p class="locked">There was something else hidden in there — you got ' +
        hearts + "/" + root.Rules.C.HEARTS_REQUIRED +
        " hearts. Maybe next time \u{1F49E}</p>";

    document.getElementById("letterInner").innerHTML =
      '<img class="couple" src="assets/couple.jpg" alt="us" />' +
      "<h1>Happy Birthday ❤️</h1>" +
      body + secret;

    document.getElementById("letter").hidden = false;

    const btn = document.getElementById("secretBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("secretBody").innerHTML =
          '<img src="assets/secret.jpg" alt="secret" />' +
          (SECRET_CAPTION
            ? '<p class="body">' + SECRET_CAPTION + "</p>"
            : '<div class="placeholder">PLACEHOLDER — assets/secret.jpg is still a copy of\n' +
              "the couple photo. Replace it with the unseen photo and set\n" +
              "SECRET_CAPTION in game/scenes.js.</div>");
        btn.disabled = true;
      });
    }
  }

  root.Scenes = {
    show: show,
    hide: hide,
    playBeats: playBeats,
    showCutscene: showCutscene,
    showControls: showControls,
    showCountdown: showCountdown,
    showCatch: showCatch,
    showLetter: showLetter,
    hasLetterText: function () { return LETTER_TEXT !== null; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
