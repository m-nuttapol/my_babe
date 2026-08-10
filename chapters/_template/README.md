# Adding a chapter

Four steps. No build, no server — everything opens by double-click.

1. **Copy this folder**, naming it `NN-name` (two-digit number, then a short slug):

       cp -r chapters/_template chapters/02-birthday

2. **Drop your media** into `chapters/02-birthday/assets/`.

3. **Save a square cover** as `chapters/02-birthday/cover.jpg`. It is shown on the
   ring card, so roughly 600x600 is plenty. This filename is not configurable —
   the hub derives it from the folder name.

4. **Edit `chapters.js`** at the repo root. Change the matching `{ id: "02",
   status: "soon" }` entry to:

       { id: "02-birthday", title: "Happy Birthday", subtitle: "one line of flavour", status: "ready" },

   The `id` must equal the folder name exactly — the page URL and the cover path
   are both derived from it.

Then in your new `index.html`, replace `CHAPTER_ID` in the back link with the
folder name (`02-birthday`), so the back arrow returns to the hub with your card
already at the front.

## Notes

- Adding a chapter beyond the sixth is fine — the ring grows, its radius widens,
  and it scales down to stay inside the viewport.
- Deleting a chapter: remove the folder and its `chapters.js` entry. If that drops
  the total below six, ghosts fill the gap again automatically.
- Chapters share nothing but the back link. Each one can look completely different.
  If two chapters end up needing the same code, that is the moment to move it into
  `shared/` — not before.

## Checking your work

Run the hub's unit tests after touching `chapters.js` or anything in `shared/`:

    node --test

They cover the ring arithmetic and manifest handling. They do **not** cover how
anything looks — for that, open `index.html` and click through it.
