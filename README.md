# macrocart

A **shopping list with a visual food board and your recipes**, that runs entirely
on your phone. Your foods are laid out as photo cards in three columns,
**protein · carbs · fat**: tap the ones you need and send them to the list in one go.

Foods are products you pick from [Open Food Facts](https://world.openfoodfacts.org)
(searched or scanned by barcode) or type in yourself; recipes are dishes you add by
hand, with an optional photo, or copy from a food. Everything (list, foods,
recipes, ratings, notes, prices, photos) is stored **on your device**: there is no
server and no account. Export it to one file to move it to another device or keep
a backup.

**Open it:** <https://gutiwayne.github.io/macrocart/> — then "Install app" / "Add to
Home screen" in your browser's menu. It works offline once installed (the internet
search and product photos need a connection).

A single static page with no build step and no external assets (the barcode
reader is bundled in `web/vendor/`).

## Features

- 🛒 **List** — photo cards, quantity −/+, tap to mark as bought, delete with undo,
  filter by shop, "clear bought" and **copy the list** as plain text.
- 🥩🍚🥑 **Food board** — three columns (protein / carbs / fat), each product placed
  automatically from its macros and movable by hand. Multi-select and
  "Add to list"; an "In list" badge on what is already pending.
- 🌐 **Search the internet** — Open Food Facts results only, optionally limited to
  one country. Tap a result, pick its column, done.
- 📷 **Scan** — read the barcode (EAN/UPC, or a GS1 QR code) with the camera, or
  type its number, and look it up on Open Food Facts.
- ➕ **New food** — for products that are not on Open Food Facts: name, brand,
  optional barcode and macros per 100 g. A scanned barcode that Open Food Facts
  does not know opens this form with the barcode filled in.
- ✏️ **Edit and delete** — pick one food and "Edit" its name, brand, macros and
  column; "Delete" (with a confirmation) removes the picked foods with their
  ratings, notes and prices.
- 🍲 **Recipes** — a third tab with the same three columns. "＋ New recipe": name,
  source (home-made, a restaurant…), photo, nutrition per serving or per 100 g,
  column, rating, favourite and notes. Tap a recipe for **View**, **Edit** or
  **Remove**. On the food board, **Add as recipe** copies the picked foods to Recipes.
- ⭐ **Product card** — macros, type (food or recipe), column, 1-5 rating,
  favourite, notes, and for foods a price per shop with the cheapest one marked.
- 🔎 Search, filter by shop or favourites, sort by rating, name, protein, kcal or price.
- ⚙ **Settings** — your shops, the country and language for the internet search,
  and **Export / Import**.
- 🔒 No account, no server, no telemetry.

## Moving your data between devices

⚙ → **Export data** saves everything, photos included, to one
`macrocart-YYYY-MM-DD.json` file (shared through the phone's share menu, or
downloaded). On the other device, ⚙ → **Import data…**, pick the file and choose:

- **Merge with this device** — keeps what is there. Foods and recipes are matched
  by barcode (or their internal code) and the most recently changed copy wins;
  prices per shop likewise; missing list lines and shops are added. Nothing is
  deleted.
- **Replace everything here** — the device ends up exactly like the file.

Export now and then as a backup: clearing the browser's site data, or uninstalling
the app, deletes everything. The app asks the browser for persistent storage, so
it is not evicted when space runs low.

## Privacy and network

Your data never leaves the device unless you export it. The only network traffic
is to Open Food Facts, from your browser, when you search, look up a barcode or add
a product (`world.openfoodfacts.org`), and product photos loaded from
`images.openfoodfacts.org`. The scanner reads the camera in the page; no image is
sent anywhere. Recipe photos are shrunk in the browser (1200 px, JPEG) and stored
on the device.

The internet search uses Open Food Facts' public search, which allows about
10 searches per minute; past that it answers "busy" for a moment.

## How a product lands in a column

Protein if at least 30 % of its calories from macros come from protein (so eggs
and legumes count as protein); otherwise whichever weighs more of carbs and fat.
A product with no macros goes to carbs. The card lets you override it.

## Self-hosting

Serve the `web/` folder from any static host over HTTPS (the camera and offline
mode need HTTPS, or `localhost`). For example, locally:

```bash
python3 -m http.server -d web 8000   # http://localhost:8000
```

This repository publishes `web/` to GitHub Pages on every push to `main`
(`.github/workflows/pages.yml`).

### Upgrading from the server version

Up to version 1, macrocart was a Flask server with a SQLite database. That version
is gone; its data is not imported. Add your foods again on the phone.

## Development

No build step: edit `web/index.html` and `web/js/`. `web/js/api.js` answers the
same `/api/...` calls the page used to send to the server, from IndexedDB
(`web/js/db.js`). Bump `VERSION` in `web/sw.js` with every release.

Browser test (what CI runs):

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/e2e.mjs
```

Design notes: [`docs/NOTES.md`](docs/NOTES.md).

## License

Copyright © 2026 gutiwayne. Licensed under the
[GNU Affero General Public License v3.0](LICENSE). Third-party notices:
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

macrocart is not affiliated with Open Food Facts.
