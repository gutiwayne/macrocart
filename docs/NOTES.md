# Design notes

Decisions that are not obvious from the code.

## One database

Everything lives in `macrocart.db`: foods and recipes in `catalog_extra`, your data
about them (column override, kind, rating, favourite, notes, hidden flag) in
`catalog_meta`, prices in `catalog_prices`. Recipe photos are files in
`MACROCART_DATA_DIR/photos/`.

Earlier versions also read a NutriTrace database. That support was removed;
`catalog_meta` rows of NutriTrace foods (ids below `EXTRA_BASE`) are simply never
matched any more.

## Product ids

Every product is `1_000_000_000 + catalog_extra.id` (`EXTRA_BASE`). The offset is
kept from the NutriTrace days so that existing ratings and prices stay attached.

## Schema upgrades

`CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so columns added later
(`catalog_meta.kind`, `catalog_extra.unit`) are also listed in `ADDED_COLUMNS` and
added with `ALTER TABLE` on start-up. A new column goes in both places.

## Recipes

- A recipe is a `catalog_extra` row with `catalog_meta.kind = 'recipe'`; the card's
  "Type" moves any product between the two tabs. Recipes are not sent to the list.
- `unit` is `g` (nutrition per 100 g) or `serving` (whole dish, recipes only). Per
  serving the macro caps are five times higher.
- "Add as recipe" (`POST /api/products/as-recipe`) **copies**: a new row with
  `code = 'recipe-<source id>-<hex>'`, the same nutrition, Open Food Facts photo and
  card data. A food already copied once is skipped, and a copy is never copied again.
- Deleting removes the row, its card data, prices and its uploaded photo. Open Food
  Facts photo URLs are never deleted, so a copy keeps working when the source goes.

## Internet search

- `GET /api/off/search` queries `search.openfoodfacts.org` server-side, so the
  page itself never talks to the OFF API and `OFF_COUNTRY`/`OFF_LANG` stay in one
  place.
- `POST /api/off/add` fetches the product **again** by barcode from
  `world.openfoodfacts.org` instead of trusting what the browser sends.
- The OFF search index sometimes returns photo URLs that 404, or none although the
  product page has one. The page then tries `GET /api/off/img/<barcode>` (302 to
  the product page photo, cached in memory up to 500 entries) and finally shows an
  icon. Results whose barcode has no product page cannot be added.

## Barcode scanner

- `GET /api/off/product/<barcode>` checks `catalog_extra` first (a product added
  before, from OFF or by hand), then OFF. Adding still goes through
  `POST /api/off/add`, which fetches the product again.
- The page uses the browser's `BarcodeDetector` when it reads EAN-13 (Chrome on
  Android, macOS, ChromeOS); otherwise it loads the bundled ZXing ponyfill from
  `static/vendor/` on first use, with `locateFile` pointing the `.wasm` there
  instead of the library's CDN default. The ponyfill checks the wasm's SHA-256.
- A QR code is accepted when it is a GS1 Digital Link (`…/01/<GTIN>…`); a GTIN-14
  with a leading zero becomes the EAN-13 that OFF uses.
- `/` sends `Permissions-Policy: camera=(self)`: without it, a proxy policy of
  `camera=()` would block `getUserMedia`.

## Foods typed by hand

Stored in `catalog_extra` like OFF products (same id range, prices, rating,
notes), with no photo. The `code` column is the barcode if one was given,
otherwise `manual-<random>`, which never matches the barcode pattern, so OFF
lookups and image fallbacks ignore it. A barcode already on the board is refused
(409). If OFF later learns a hand-typed barcode, adding it from the search
replaces the hand-typed data with OFF's.

## Photos

- Open Food Facts photos are external `https://` URLs: the image route answers with
  a 302 to them. Uploaded recipe photos (`photos/<hex>.<ext>`) are served from the
  data folder; the page sends a `data:` URL already shrunk to 1200 px JPEG and the
  server caps it at 3 MB.
- `/img` is cached for a day, so the board asks for `/img?v=<img_v>` (a hash of the
  stored photo): a new photo gets a new URL and shows at once.
- Served with an explicit MIME type: slim Python images do not know `webp`/`avif`,
  and a reverse proxy sending `X-Content-Type-Options: nosniff` makes browsers
  refuse an image served as `application/octet-stream`.
- List lines get the photo of the product with the same name (case-insensitive),
  whether they came from the board or were typed by hand; the name field
  autocompletes product names for that reason.

## Front end

One static `static/index.html` with no build step; the only other front-end
files are the vendored barcode reader. The List tab and the Foods/Recipes
tabs keep separate state in separate `<script>` blocks; the board tells the list to
reload with a `macrocart:refresh` event. Deletions go through an in-page
confirmation dialog, not `window.confirm()`, which some WebViews do not show.

## Runtime

gunicorn with one worker and four threads; one SQLite connection per thread
(`threading.local`), WAL mode. `HOME=/tmp` because gunicorn writes a control
socket under `~/.gunicorn` and the root filesystem is read-only.
