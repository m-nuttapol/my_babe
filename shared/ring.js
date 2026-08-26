/*
 * Pure ring + manifest logic. No DOM access, so it can be unit-tested under Node.
 * Loaded as a classic script in the browser (assigns window.Ring) and required
 * from tests in Node — one file, no build step.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Ring = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /*
   * The fewest slots the ring will ever have, and so the number of ghost cards a
   * short manifest gets padded out to.
   *
   * 3, not 6: with three chapters written a floor of 6 padded the ring with three
   * "coming soon" cards for chapters that were not planned, which promised more
   * than exists. Raise this only to reserve real, intended slots.
   *
   * This is also the reference ring for ringZOffset — the size at which the front
   * card sits at its natural scale — so changing it changes how large the front
   * card renders at every ring size, not just small ones.
   */
  const MIN_SLOTS = 3;
  // Centre-to-centre spacing as a multiple of card width. 5/3 keeps a gap of two
  // thirds of a card between neighbours at any ring size.
  const CARD_GAP_FACTOR = 5 / 3;

  /*
   * A chapter's backdrop art, as candidates rather than one path.
   *
   * The extension is not knowable from the id: the art is hand-made per chapter
   * and arrives as whatever the source exported — 01 is a .jpg, 02 a .png. Rather
   * than force a convention on the files (or add a path field to chapters.js,
   * which is meant to stay id-derived), both are offered and hub.js keeps the one
   * that actually loads. Order is the preference: .jpg first, since a background
   * this size should be one.
   */
  const BACKDROP_EXTS = ["jpg", "png"];

  function backdropCandidates(id) {
    return BACKDROP_EXTS.map(function (ext) {
      return "shared/background/" + id + "." + ext;
    });
  }

  function normalizeChapters(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!id) continue;
      if (entry.status === "ready") {
        out.push({
          id: id,
          status: "ready",
          title: typeof entry.title === "string" && entry.title.trim() ? entry.title : id,
          subtitle: typeof entry.subtitle === "string" ? entry.subtitle : "",
          cover: "chapters/" + id + "/cover.jpg",
          href: "chapters/" + id + "/index.html",
          backdrop: backdropCandidates(id),
          /*
           * What the hub fades to on the way into this chapter. Each chapter page
           * sets its own background, and they disagree — valentine is pink, the
           * birthday game is near-black — so a single exit colour would flash
           * against one of them. Defaults to the game's dark, which is also the
           * safer of the two to land on.
           */
          exit: typeof entry.exit === "string" && entry.exit.trim() ? entry.exit.trim() : "#0b1020",
        });
      } else {
        // Unbuilt: ignore every other field so nothing leaks onto a ghost card.
        // No backdrop either — hovering an unbuilt chapter must not reveal art
        // for something that does not exist yet.
        out.push({
          id: id,
          status: "soon",
          title: null,
          subtitle: "",
          cover: null,
          href: null,
          backdrop: [],
          exit: null,
        });
      }
    }
    return out;
  }

  function ringSlots(count) {
    const n = Number.isFinite(count) ? Math.floor(count) : 0;
    return Math.max(MIN_SLOTS, n);
  }

  function ringRadius(slots, cardSize) {
    const n = Math.max(3, slots);
    // Invert chord = 2R sin(pi/n) so the gap between neighbours is honoured.
    return (cardSize * CARD_GAP_FACTOR) / (2 * Math.sin(Math.PI / n));
  }

  /*
   * How far to push the whole ring away from the viewer.
   *
   * Cards sit at translateZ(+radius), so without this the front card gets closer
   * to the camera every time the ring grows — at 20 slots the radius is ~800 and
   * a perspective of 1200 magnifies it about 3x. Offsetting by the difference
   * from the reference (smallest) ring keeps the front card the same size at
   * every ring size, matching the approved 6-slot framing.
   */
  function ringZOffset(radius, cardSize) {
    return radius - ringRadius(MIN_SLOTS, cardSize);
  }

  /*
   * How wide the ring renders, mirroring what CSS perspective does: the side
   * cards sit at x = +/-radius at depth -zOffset, and perspective scales them by
   * P / (P - z).
   */
  function projectedRingWidth(slots, cardSize, perspective) {
    const r = ringRadius(slots, cardSize);
    const z = -ringZOffset(r, cardSize);
    const scale = perspective / (perspective - z);
    return 2 * (r + cardSize / 2) * scale;
  }

  /*
   * Shrink factor needed to keep the ring inside the viewport. A 6-slot ring of
   * 150px cards is already ~930px wide, so on a phone it must scale down; never
   * scale up, or a small ring would balloon on a big screen.
   */
  function fitScale(projectedWidth, viewportWidth, margin) {
    const usable = viewportWidth * (typeof margin === "number" ? margin : 0.92);
    if (!(projectedWidth > 0)) return 1;
    return Math.min(1, usable / projectedWidth);
  }

  function padToSlots(chapters, slots) {
    const out = chapters.slice();
    for (let i = out.length; i < slots; i++) {
      out.push({
        id: String(i + 1).padStart(2, "0"),
        status: "soon",
        title: null,
        subtitle: "",
        cover: null,
        href: null,
        backdrop: [],
        exit: null,
      });
    }
    return out;
  }

  function slotAngle(index, slots) {
    return (index * 360) / slots;
  }

  function nearestSlotIndex(rotation, slots) {
    const step = 360 / slots;
    const raw = Math.round(-rotation / step);
    return ((raw % slots) + slots) % slots;
  }

  function snapRotation(rotation, slots) {
    const step = 360 / slots;
    return Math.round(rotation / step) * step;
  }

  /*
   * How centred the focused card is on the front of the ring, from 0 (right
   * at the hand-off point to a neighbour) to 1 (dead centre). Drives the
   * focus text's fade so it tracks the ring's actual position instead of a
   * fixed timer decoupled from it.
   */
  function focusIntensity(rotation, index, slots) {
    const step = 360 / slots;
    const angle = (((rotation + index * step) % 360) + 540) % 360 - 180;
    const half = step / 2;
    return Math.max(0, 1 - Math.abs(angle) / half);
  }

  function focusIndexFromSearch(search, chapters) {
    const match = /[?&]from=([^&]*)/.exec(search || "");
    if (!match) return 0;
    const id = decodeURIComponent(match[1]);
    const index = chapters.findIndex(function (c) {
      return c.id === id;
    });
    return index < 0 ? 0 : index;
  }

  return {
    normalizeChapters: normalizeChapters,
    padToSlots: padToSlots,
    ringSlots: ringSlots,
    ringRadius: ringRadius,
    ringZOffset: ringZOffset,
    projectedRingWidth: projectedRingWidth,
    fitScale: fitScale,
    slotAngle: slotAngle,
    nearestSlotIndex: nearestSlotIndex,
    snapRotation: snapRotation,
    focusIntensity: focusIntensity,
    focusIndexFromSearch: focusIndexFromSearch,
  };
});
