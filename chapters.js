/*
 * The chapter manifest. This is the only file you edit to add a chapter.
 *
 * Adding one:
 *   1. cp -r chapters/_template chapters/07-something
 *   2. put your media in chapters/07-something/assets/
 *   3. save a square cover as chapters/07-something/cover.jpg
 *   4. drop the hub backdrop at shared/background/07-something.jpg (or .png)
 *   5. flip that entry below to status:"ready" and fill in title + subtitle
 *
 * The page URL (chapters/<id>/index.html), the cover (chapters/<id>/cover.jpg)
 * and the hub backdrop (shared/background/<id>.jpg|png) are all derived from
 * `id`. Do not add path fields.
 *
 * status:"soon" renders an unclickable "coming soon" ghost card, and hovering one
 * leaves the hub on its default backdrop. Only `id` matters for those — every
 * other field is ignored, so nothing spoils.
 *
 * `exit` is the one piece of a chapter the hub cannot derive: the colour its page
 * opens on, which the hub fades to so entering it is a cross-fade and not a
 * flash. Match it to that page's own background. Optional — defaults to #0b1020.
 */
window.CHAPTERS = [
  {
    id: "01-valentine",
    title: "My Valentine",
    subtitle: "the one where she said no nineteen times",
    status: "ready",
    exit: "#f7d7e0",
  },
  {
    id: "02-bring-m-home",
    title: "Bring M Home",
    subtitle: "the one where the world took him and she went and got him back",
    status: "ready",
    exit: "#04040a",
  },
  { id: "03", status: "soon" },
];
