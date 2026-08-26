const test = require("node:test");
const assert = require("node:assert/strict");
const Ring = require("../shared/ring.js");

test("normalizeChapters derives href and cover from id for ready chapters", () => {
  const out = Ring.normalizeChapters([
    { id: "01-valentine", title: "My Valentine", subtitle: "hi", status: "ready" },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    id: "01-valentine",
    status: "ready",
    title: "My Valentine",
    subtitle: "hi",
    cover: "chapters/01-valentine/cover.jpg",
    href: "chapters/01-valentine/index.html",
    backdrop: [
      "shared/background/01-valentine.jpg",
      "shared/background/01-valentine.png",
    ],
    exit: "#0b1020",
  });
});

test("a ready chapter keeps its own exit colour when it declares one", () => {
  const out = Ring.normalizeChapters([
    { id: "02-bring-m-home", status: "ready", exit: "  #04040a  " },
  ]);
  assert.equal(out[0].exit, "#04040a", "and it is trimmed");
});

test("normalizeChapters strips content from soon chapters", () => {
  const out = Ring.normalizeChapters([
    { id: "02", title: "Birthday", subtitle: "leaked", cover: "x.jpg", status: "soon" },
  ]);
  assert.deepEqual(out[0], {
    id: "02",
    status: "soon",
    title: null,
    subtitle: "",
    cover: null,
    href: null,
    backdrop: [],
    exit: null,
  });
});

test("a soon chapter offers no backdrop, so hovering one cannot leak art", () => {
  const out = Ring.normalizeChapters([
    { id: "03", status: "soon", exit: "#ffffff", backdrop: ["leak.jpg"] },
  ]);
  assert.deepEqual(out[0].backdrop, []);
  assert.equal(out[0].exit, null);
});

test("normalizeChapters defaults missing status to soon", () => {
  const out = Ring.normalizeChapters([{ id: "03" }]);
  assert.equal(out[0].status, "soon");
});

test("normalizeChapters falls back to id when a ready chapter has no title", () => {
  const out = Ring.normalizeChapters([{ id: "04-x", status: "ready" }]);
  assert.equal(out[0].title, "04-x");
  assert.equal(out[0].subtitle, "");
});

test("normalizeChapters skips entries without a usable id", () => {
  const out = Ring.normalizeChapters([{ id: "" }, { title: "no id" }, null, { id: "05" }]);
  assert.deepEqual(out.map((c) => c.id), ["05"]);
});

test("normalizeChapters returns empty array for non-array input", () => {
  assert.deepEqual(Ring.normalizeChapters(undefined), []);
  assert.deepEqual(Ring.normalizeChapters({ id: "01" }), []);
});

test("ringSlots keeps a floor of three so one chapter still reads as a ring", () => {
  assert.equal(Ring.ringSlots(0), 3);
  assert.equal(Ring.ringSlots(1), 3);
  assert.equal(Ring.ringSlots(3), 3);
  assert.equal(Ring.ringSlots(4), 4);
  assert.equal(Ring.ringSlots(7), 7);
  assert.equal(Ring.ringSlots(20), 20);
});

test("ringSlots survives junk instead of a count", () => {
  assert.equal(Ring.ringSlots(NaN), 3);
  assert.equal(Ring.ringSlots(undefined), 3);
  assert.equal(Ring.ringSlots(-5), 3);
  assert.equal(Ring.ringSlots(4.8), 4);
});

test("ringRadius grows with slot count so cards never overlap", () => {
  const six = Ring.ringRadius(6, 150);
  const twelve = Ring.ringRadius(12, 150);
  assert.ok(twelve > six, `expected ${twelve} > ${six}`);
  // chord between adjacent card centres must be at least the card size
  for (const slots of [6, 8, 12, 20]) {
    const r = Ring.ringRadius(slots, 150);
    const chord = 2 * r * Math.sin(Math.PI / slots);
    assert.ok(chord >= 150, `slots=${slots} chord=${chord} must be >= 150`);
  }
});

test("ringZOffset keeps the front card the same size at every ring size", () => {
  const PERSPECTIVE = 1200;
  const frontScale = (slots, cardSize) => {
    const r = Ring.ringRadius(slots, cardSize);
    const z = r - Ring.ringZOffset(r, cardSize); // front card's final depth
    return PERSPECTIVE / (PERSPECTIVE - z);
  };
  const reference = frontScale(6, 150);
  for (const slots of [6, 8, 12, 20, 30]) {
    assert.ok(
      Math.abs(frontScale(slots, 150) - reference) < 1e-9,
      `slots=${slots} front scale ${frontScale(slots, 150)} != ${reference}`
    );
  }
  // and the front card must never reach the camera plane
  for (const slots of [6, 12, 30]) {
    const r = Ring.ringRadius(slots, 150);
    assert.ok(r - Ring.ringZOffset(r, 150) < PERSPECTIVE, `slots=${slots} front card at/behind camera`);
  }
});

test("ringZOffset is zero for the smallest ring", () => {
  // The reference ring is the MIN_SLOTS one, so that is where the offset
  // vanishes and the front card sits at its natural scale.
  const r = Ring.ringRadius(3, 150);
  assert.equal(Ring.ringZOffset(r, 150), 0);
  const rMobile = Ring.ringRadius(3, 108);
  assert.equal(Ring.ringZOffset(rMobile, 108), 0);
});

test("ringZOffset is positive for any ring bigger than the smallest", () => {
  for (const slots of [4, 6, 12, 30]) {
    const r = Ring.ringRadius(slots, 150);
    assert.ok(Ring.ringZOffset(r, 150) > 0, `slots=${slots} must push the ring back`);
  }
});

test("padToSlots fills the remainder with numbered ghosts", () => {
  const chapters = Ring.normalizeChapters([{ id: "01-valentine", status: "ready" }]);
  const padded = Ring.padToSlots(chapters, 6);
  assert.equal(padded.length, 6);
  assert.equal(padded[0].id, "01-valentine");
  assert.deepEqual(padded.slice(1).map((c) => c.status), ["soon", "soon", "soon", "soon", "soon"]);
  assert.deepEqual(padded.slice(1).map((c) => c.id), ["02", "03", "04", "05", "06"]);
});

test("padToSlots does not truncate when there are more chapters than slots", () => {
  const chapters = Ring.normalizeChapters([{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.equal(Ring.padToSlots(chapters, 2).length, 3);
});

test("slotAngle spreads slots evenly around the circle", () => {
  assert.equal(Ring.slotAngle(0, 6), 0);
  assert.equal(Ring.slotAngle(1, 6), 60);
  assert.equal(Ring.slotAngle(5, 6), 300);
});

test("nearestSlotIndex reports which card is at the front", () => {
  assert.equal(Ring.nearestSlotIndex(0, 6), 0);
  assert.equal(Ring.nearestSlotIndex(-60, 6), 1);
  assert.equal(Ring.nearestSlotIndex(-70, 6), 1);
  assert.equal(Ring.nearestSlotIndex(-300, 6), 5);
  assert.equal(Ring.nearestSlotIndex(60, 6), 5);
});

test("nearestSlotIndex stays in range after many turns in either direction", () => {
  for (const rotation of [-3600, -725, -361, 361, 1440]) {
    const i = Ring.nearestSlotIndex(rotation, 6);
    assert.ok(i >= 0 && i < 6, `rotation=${rotation} gave ${i}`);
  }
});

test("snapRotation lands on a slot without unwinding the ring", () => {
  assert.equal(Ring.snapRotation(-70, 6), -60);
  assert.equal(Ring.snapRotation(-50, 6), -60);
  // near a full turn, snap to the nearby multiple rather than back to zero
  assert.equal(Ring.snapRotation(-355, 6), -360);
  assert.equal(Ring.snapRotation(-725, 6), -720);
});

test("snapRotation is a fixed point on an exact slot", () => {
  assert.equal(Ring.snapRotation(-120, 6), -120);
});

test("focusIndexFromSearch finds the chapter named in the query string", () => {
  const chapters = Ring.normalizeChapters([{ id: "01-a" }, { id: "02-b" }, { id: "03-c" }]);
  assert.equal(Ring.focusIndexFromSearch("?from=02-b", chapters), 1);
  assert.equal(Ring.focusIndexFromSearch("?from=03-c&x=1", chapters), 2);
});

test("focusIndexFromSearch falls back to the first chapter", () => {
  const chapters = Ring.normalizeChapters([{ id: "01-a" }, { id: "02-b" }]);
  assert.equal(Ring.focusIndexFromSearch("", chapters), 0);
  assert.equal(Ring.focusIndexFromSearch("?from=nope", chapters), 0);
  assert.equal(Ring.focusIndexFromSearch("?other=1", chapters), 0);
});

test("ring grows past the six-slot floor as chapters are added", () => {
  const many = Array.from({ length: 14 }, (_, i) => ({
    id: String(i + 1).padStart(2, "0") + "-c",
    status: "ready",
  }));
  const chapters = Ring.normalizeChapters(many);
  const slots = Ring.ringSlots(chapters.length);
  assert.equal(slots, 14);
  assert.equal(Ring.padToSlots(chapters, slots).length, 14);
  const angles = Array.from({ length: slots }, (_, i) => Ring.slotAngle(i, slots));
  assert.equal(new Set(angles).size, slots, "every slot must sit at a distinct angle");
});

const PERSPECTIVE = 1200;

test("projectedRingWidth grows with the ring", () => {
  const six = Ring.projectedRingWidth(6, 150, PERSPECTIVE);
  const twenty = Ring.projectedRingWidth(20, 150, PERSPECTIVE);
  assert.ok(six > 0);
  assert.ok(twenty > six, `expected ${twenty} > ${six}`);
});

test("fitScale keeps the ring inside the viewport at every size and both card sizes", () => {
  const viewports = [
    { w: 1440, card: 150 },
    { w: 1280, card: 150 },
    { w: 1024, card: 150 },
    { w: 390, card: 108 },   // phone, mobile breakpoint card size
    { w: 320, card: 108 },   // smallest phone worth supporting
  ];
  for (const v of viewports) {
    for (const slots of [6, 8, 12, 20, 30]) {
      const width = Ring.projectedRingWidth(slots, v.card, PERSPECTIVE);
      const scaled = width * Ring.fitScale(width, v.w);
      assert.ok(
        scaled <= v.w,
        `viewport=${v.w} slots=${slots} still ${scaled.toFixed(0)}px after scaling`
      );
    }
  }
});

test("fitScale never magnifies a ring that already fits", () => {
  assert.equal(Ring.fitScale(400, 1440), 1);
  assert.equal(Ring.fitScale(0, 1440), 1);
});

test("fitScale does shrink the default ring on a phone", () => {
  const width = Ring.projectedRingWidth(6, 108, PERSPECTIVE);
  assert.ok(Ring.fitScale(width, 390) < 1, "a 6-slot ring overflows a 390px phone and must scale down");
});

test("every slot is reachable as a focus target at any ring size", () => {
  for (const slots of [6, 7, 14, 20]) {
    const step = 360 / slots;
    for (let i = 0; i < slots; i++) {
      assert.equal(Ring.nearestSlotIndex(-i * step, slots), i, `slots=${slots} i=${i}`);
    }
  }
});

test("focusIntensity is 1 when the focused card sits dead centre", () => {
  assert.equal(Ring.focusIntensity(0, 0, 6), 1);
  assert.equal(Ring.focusIntensity(-120, 2, 6), 1);
});

test("focusIntensity is 0 at the hand-off point halfway to a neighbour", () => {
  const slots = 6;
  const half = 360 / slots / 2;
  assert.equal(Ring.focusIntensity(half, 0, slots), 0);
  assert.equal(Ring.focusIntensity(-half, 0, slots), 0);
});

test("focusIntensity falls off smoothly and symmetrically between the two", () => {
  const slots = 6;
  const half = 360 / slots / 2;
  const near = Ring.focusIntensity(half * 0.25, 0, slots);
  const far = Ring.focusIntensity(half * 0.75, 0, slots);
  assert.ok(near > far, `expected closer-to-centre offset to read higher: ${near} vs ${far}`);
  assert.ok(near > 0 && near < 1, `${near} should be a mid-range fade`);
  // symmetric: same magnitude offset in either direction reads the same
  assert.equal(Ring.focusIntensity(half * 0.4, 0, slots), Ring.focusIntensity(-half * 0.4, 0, slots));
});

test("focusIntensity keeps reading the same card's centring across full turns", () => {
  const slots = 6;
  assert.equal(Ring.focusIntensity(360, 0, slots), 1);
  assert.equal(Ring.focusIntensity(-720, 0, slots), 1);
});
