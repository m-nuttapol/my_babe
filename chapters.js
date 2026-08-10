/*
 * The chapter manifest. This is the only file you edit to add a chapter.
 *
 * Adding one:
 *   1. cp -r chapters/_template chapters/07-something
 *   2. put your media in chapters/07-something/assets/
 *   3. save a square cover as chapters/07-something/cover.jpg
 *   4. flip that entry below to status:"ready" and fill in title + subtitle
 *
 * Both the page URL (chapters/<id>/index.html) and the cover
 * (chapters/<id>/cover.jpg) are derived from `id`. Do not add path fields.
 *
 * status:"soon" renders an unclickable "coming soon" ghost card. Only `id`
 * matters for those — every other field is ignored, so nothing spoils.
 */
window.CHAPTERS = [
  {
    id: "01-valentine",
    title: "My Valentine",
    subtitle: "the one where she said no nineteen times",
    status: "ready",
  },
  { id: "02", status: "soon" },
  { id: "03", status: "soon" },
  { id: "04", status: "soon" },
  { id: "05", status: "soon" },
  { id: "06", status: "soon" },
];
