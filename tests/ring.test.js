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
  });
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
  });
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

test("ringSlots keeps a floor of six so one chapter still reads as a ring", () => {
  assert.equal(Ring.ringSlots(0), 6);
  assert.equal(Ring.ringSlots(1), 6);
  assert.equal(Ring.ringSlots(6), 6);
  assert.equal(Ring.ringSlots(7), 7);
  assert.equal(Ring.ringSlots(20), 20);
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
