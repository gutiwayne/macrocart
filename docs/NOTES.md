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
- Open Food Facts products get `1_000_000_000 + catalog_extra.id` (`EXTRA_BASE`), so
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

One static `static/index.html` with no build step. The two tabs keep separate
state in separate `<script>` blocks; the board tells the list to reload with a
`macrocart:refresh` event.

## Runtime

gunicorn with one worker and four threads; one SQLite connection per thread
(`threading.local`), WAL mode. `HOME=/tmp` because gunicorn writes a control
socket under `~/.gunicorn` and the root filesystem is read-only.
