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

  const MIN_SLOTS = 6;
  // Centre-to-centre spacing as a multiple of card width. 5/3 makes a 6-slot ring
  // of 150px cards land at radius 250 — the spacing in the approved mockup.
  const CARD_GAP_FACTOR = 5 / 3;

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
        });
      } else {
        // Unbuilt: ignore every other field so nothing leaks onto a ghost card.
        out.push({ id: id, status: "soon", title: null, subtitle: "", cover: null, href: null });
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
    slotAngle: slotAngle,
    nearestSlotIndex: nearestSlotIndex,
    snapRotation: snapRotation,
    focusIndexFromSearch: focusIndexFromSearch,
  };
});
