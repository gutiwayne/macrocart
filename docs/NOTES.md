# Design notes

Decisions that are not obvious from the code.

## No server

Since version 2 the app is a static page (`web/`) that keeps everything in the
browser's IndexedDB. The page code still calls `api("/api/...")` as it did against
the old Flask server: `web/js/api.js` answers those routes locally, with the same
validation rules (lengths, macro caps, decimal comma, price limits). That kept the
UI code almost unchanged and keeps the rules in one place.

## Storage (`web/js/db.js`)

One database, `macrocart`, version 1:

| Store | Key | Holds |
|---|---|---|
| `items` | `id` | list lines |
| `products` | `id` (auto-increment), unique index `code` | foods and recipes, with your card data (column override, kind, rating, favourite, notes, hidden) |
| `prices` | `id`, index `product_id` | price per product and shop |
| `photos` | product id | uploaded photo as a Blob |
| `settings` | `"settings"` | shops, OFF country and language |

A schema change bumps the version and adds an upgrade step in `onupgradeneeded`.
Every write runs in one transaction (`DB.run`); nothing but IndexedDB requests is
awaited inside it, or the transaction would close.

`navigator.storage.persist()` is requested on start so the browser does not evict
the data under storage pressure; it is a request, not a guarantee, hence the
export.

## Product codes

`code` is the barcode, `manual-<random>` for a food typed without one, or
`recipe-<source id>-<random>` for a food copied as a recipe. A food already copied
once is skipped. Codes are what import/merge matches on, since ids differ between
devices.

## Photos

- Open Food Facts photos are stored as their `https://` URL and loaded by the
  browser (`referrerpolicy="no-referrer"`).
- Uploaded recipe photos are shrunk in the page (1200 px, JPEG), stored as a Blob in
  `photos` and shown through an object URL; `img_url` is then the marker `photo` and
  `photo_v` changes with each new photo so cached object URLs are replaced.
- List lines get the photo of the product with the same name (case-insensitive).

## Export format

```json
{"format": "macrocart", "version": 1, "exported_at": "…", "settings": {…},
 "items": […], "products": […], "prices": […], "photos": {"<product id>": "data:image/jpeg;base64,…"}}
```

Records are the store records as they are. Import cleans every field with the same
rules as the API and drops what does not fit (prices or photos of unknown products,
duplicate codes). `version` changes only for incompatible changes; an older app
refuses a newer file.

- **Replace** clears every store and writes the file's records with their ids.
- **Merge** matches products by `code`; the record with the larger `updated_at`
  wins (with its photo). New products get new ids; prices and recipe-copy codes are
  remapped to them. Prices match on product + shop (newer wins); list lines on id
  (missing ones are added). Shops are united. Nothing is deleted.

## Open Food Facts from the browser

- Product lookups use `world.openfoodfacts.org/api/v2/product/<code>.json`, which
  allows cross-origin requests.
- The newer search service (`search.openfoodfacts.org`) does not send CORS
  headers, so the search uses the classic `world.openfoodfacts.org/cgi/search.pl`
  (`json=1`), limited by OFF to about 10 requests per minute; a 429/503 is shown as
  "busy". The country filter is a `countries` tag (`tagtype_0`…).
- Adding a search result fetches the product again by barcode instead of trusting
  the search copy. An OFF product replaces a hand-typed one with the same barcode.
- A browser cannot set `User-Agent`; requests carry the browser's own.
- The search index sometimes returns photo URLs that 404, or none: the page then
  asks the product endpoint for its photo (`macrocart.offImg`, cached in memory up
  to 500 entries) and finally shows an icon.

## Barcode scanner

The page uses the browser's `BarcodeDetector` when it reads EAN-13 (Chrome on
Android, macOS, ChromeOS); otherwise it loads the bundled ZXing ponyfill from
`web/vendor/` on first use, with `locateFile` pointing the `.wasm` there instead of
the library's CDN default. The ponyfill checks the wasm's SHA-256. A QR code is
accepted when it is a GS1 Digital Link (`…/01/<GTIN>…`).

## Offline and updates in a browser (`web/sw.js`)

The service worker precaches the shell (page, scripts, icons, scanner) and serves
same-origin files network-first, falling back to the cache offline. Open Food
Facts requests are not intercepted. Bump `VERSION` on each release so old caches
are dropped. All paths are relative, so the app works under a sub-path such as
`/macrocart/`.

## Android app (`android/`)

- A plain `Activity` with a WebView; `androidx.webkit`'s `WebViewAssetLoader`
  serves the APK's `assets/web/` at `https://appassets.androidplatform.net/assets/web/`,
  a secure origin, so IndexedDB, `getUserMedia` and cross-origin `fetch` to Open
  Food Facts behave as in a browser. No `file://` access.
- Gradle copies `../web` into the assets at build time (task `copyWeb`), without
  `sw.js`; the page does not register the service worker inside the app.
- Camera: `onPermissionRequest` asks for the Android `CAMERA` permission, then
  grants video capture to the page.
- Export: a WebView cannot download `blob:` URLs, so the page calls
  `window.MacrocartAndroid.saveFile(name, text)`, which opens the system
  "save as" dialog (`ACTION_CREATE_DOCUMENT`). Import uses the normal file input.
- Version from the tag (`MACROCART_VERSION`): `versionCode = major*10000 + minor*100 + patch`.
- Signing: PKCS12 key, alias `macrocart`, from the repository secrets
  `SIGNING_KEYSTORE_BASE64` / `SIGNING_PASSWORD`. Keep the key: an APK signed with
  another key cannot update the installed app.

## Front end

One static `web/index.html`; the List tab and the Foods/Recipes tabs keep separate
state in separate `<script>` blocks; the board tells the list to reload with a
`macrocart:refresh` event. Deletions and import go through in-page dialogs, not
`window.confirm()`, which some WebViews do not show.
