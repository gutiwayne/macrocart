# Design notes

Decisions that are not obvious from the code.

## NutriTrace is read-only

The NutriTrace database is mounted `:ro` and opened with `mode=ro`. Everything
macrocart adds (column override, rating, favourite, notes, hidden flag, prices,
internet products) lives in its own `macrocart.db`, keyed by product id. Removing
macrocart leaves NutriTrace untouched.

NutriTrace is optional: `NUTRITRACE_ENABLED=false` never opens it, and when
enabled any `sqlite3.Error` (missing table, corrupt file, lock) is logged and the
board falls back to internet products instead of failing.

NutriTrace stores nutrition **per portion** (`foods.portion`, `foods.unit`);
macrocart normalises it to 100 g/ml.

## Product ids

- NutriTrace foods keep their `foods.id`.
- Open Food Facts and hand-typed products get `1_000_000_000 + catalog_extra.id` (`EXTRA_BASE`), so
  the two never clash in `catalog_meta` and `catalog_prices`.
- Products are de-duplicated by name+brand; NutriTrace wins over an internet copy.

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

- Served with an explicit MIME type: slim Python images do not know `webp`/`avif`,
  and a reverse proxy sending `X-Content-Type-Options: nosniff` makes browsers
  refuse an image served as `application/octet-stream`.
- Some NutriTrace photos are external `https://` URLs (Open Food Facts): the image
  route answers with a 302 to them.
- List lines get the photo of the product with the same name (case-insensitive),
  whether they came from the board or were typed by hand; the name field
  autocompletes product names for that reason.

## Front end

One static `static/index.html` with no build step; the only other front-end
files are the vendored barcode reader. The two tabs keep separate
state in separate `<script>` blocks; the board tells the list to reload with a
`macrocart:refresh` event.

## Runtime

gunicorn with one worker and four threads; one SQLite connection per thread
(`threading.local`), WAL mode. `HOME=/tmp` because gunicorn writes a control
socket under `~/.gunicorn` and the root filesystem is read-only.
