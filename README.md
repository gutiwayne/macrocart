# macrocart

A self-hosted **shopping list with a visual food board and your recipes**. Your
foods are laid out as photo cards in three columns, **protein · carbs · fat**: tap
the ones you need and send them to the list in one go.

Foods are products you pick from [Open Food Facts](https://world.openfoodfacts.org)
(searched or scanned by barcode) or type in yourself; recipes are dishes you add by
hand, with an optional photo, or copy from a food. Everything (list, foods,
recipes, ratings, notes, prices, photos) lives in one SQLite file and a photos
folder.

Written in Python with Flask; a single page with no build step and no external
assets (the barcode reader is bundled in `static/vendor/`).

## Features

- 🛒 **List** — photo cards, quantity −/+, tap to mark as bought, delete with undo,
  filter by shop, "clear bought" and **copy the list** as plain text.
- 🥩🍚🥑 **Food board** — three columns (protein / carbs / fat), each product placed
  automatically from its macros and movable by hand. Multi-select and
  "Add to list"; an "In list" badge on what is already pending.
- 🌐 **Search the internet** — Open Food Facts results only, optionally limited to
  one country. Tap a result, pick its column, done.
- 📷 **Scan** — read the barcode (EAN/UPC, or a GS1 QR code) with the camera, or
  type its number, and look it up on Open Food Facts. Needs HTTPS (or localhost)
  for the camera.
- ➕ **New food** — for products that are not on Open Food Facts: name, brand,
  optional barcode and macros per 100 g. A scanned barcode that Open Food Facts
  does not know opens this form with the barcode filled in.
- ✏️ **Edit and delete** — pick one food and "Edit" its name, brand, macros and
  column; "Delete" (with a confirmation) removes the picked foods with their
  ratings, notes and prices.
- 🍲 **Recipes** — a third tab with the same three columns. "＋ New recipe": name,
  source (home-made, a restaurant…), photo, nutrition per serving or per 100 g,
  column, rating, favourite and notes (ingredients, steps…). Tap a recipe for
  **View**, **Edit** or **Remove** (with a confirmation). On the food board,
  **Add as recipe** copies the picked foods to Recipes and leaves them on the board.
- ⭐ **Product card** — macros, type (food or recipe), column, 1-5 rating,
  favourite, notes, and for foods a price per shop with the cheapest one marked.
- 🔎 Search, filter by shop or favourites, sort by rating, name, protein, kcal or
  price.
- 🔒 No account, no telemetry.

## Quick start (Docker)

```bash
git clone https://github.com/gutiwayne/macrocart.git
cd macrocart
cp env.example .env        # optional: edit it
docker compose up -d --build
```

Open <http://127.0.0.1:5000>.

The board starts empty: fill it with **🌐 Search the internet**, **📷 Scan** or
**＋ New food**, and the Recipes tab with **＋ New recipe**.

### Upgrading from a version that read NutriTrace

NutriTrace support has been removed. Remove the `nutritrace` mounts and the
`NUTRITRACE_*` variables from your setup. Products you added from Open Food Facts
or typed by hand, with their ratings, notes and prices, are kept; the database is
upgraded on start-up. Foods that only came from NutriTrace no longer show; add them
again from the internet search or by hand.

## Configuration

All settings are environment variables (see [`env.example`](env.example)).

| Variable | Default | Meaning |
|---|---|---|
| `MACROCART_PORT` | `5000` | Host port, bound to `127.0.0.1` in `compose.yaml` |
| `OFF_COUNTRY` | *(empty: worldwide)* | Open Food Facts country tag, e.g. `en:spain` |
| `OFF_LANG` | `en` | Two-letter language for product names |
| `OFF_USER_AGENT` | `macrocart/1.0 (self-hosted)` | User-Agent sent to Open Food Facts; add a contact |
| `SUPERMARKETS` | *(empty)* | Comma-separated shops offered in the pickers |

Inside the container: `MACROCART_DATA_DIR` (`/app/data`), which holds
`macrocart.db` and the `photos/` folder of recipe photos.

## Security

macrocart has **no authentication**. `compose.yaml` publishes it on `127.0.0.1`
only; to reach it from other devices, put it behind a reverse proxy that adds
authentication (and TLS). The container runs as an unprivileged user on a
read-only root filesystem with all capabilities dropped.

The only outbound traffic is to Open Food Facts (`search.openfoodfacts.org`,
`world.openfoodfacts.org`), and only when you use the internet search or look up
a barcode. Product photos from Open Food Facts are loaded by the browser from
`images.openfoodfacts.org`.

The scanner reads the camera in the browser; no image leaves the device. A recipe
photo is shrunk in the browser (1200 px, JPEG) and stored in the data volume. The page
sends `Permissions-Policy: camera=(self)` so the camera works; a reverse proxy
that overwrites that header with `camera=()` blocks the scanner (typing the
barcode still works).

## How a product lands in a column

Protein if at least 30 % of its calories from macros come from protein (so eggs
and legumes count as protein); otherwise whichever weighs more of carbs and fat.
A product with no macros goes to carbs. The card lets you override it.

## API

```
GET    /api/items                       list (each line carries img_id when a product matches its name)
POST   /api/items                       {name, supermarket, qty}
PATCH  /api/items/<id>                  name, supermarket, qty, checked
DELETE /api/items/<id>
POST   /api/items/clear-checked

GET    /api/products                    foods and recipes (kind 'product' | 'recipe')
POST   /api/products/custom             {name, brand, code?, kcal, p, c, f, category?} (per 100 g);
                                        recipes: + kind:'recipe', unit ('serving' | 'g'), rating, favorite, notes, photo (data: URL)
PATCH  /api/products/<id>               category ('' = automatic), kind, rating 0-5, favorite, notes, hidden (API only),
                                        name, brand, kcal, p, c, f, photo; unit for recipes. The barcode cannot change.
DELETE /api/products/<id>               with its rating, notes, prices and uploaded photo
POST   /api/products/as-recipe          {ids: [...]} → {added, skipped}: copy foods to Recipes
POST   /api/products/<id>/prices        {supermarket, price} (add or update)
DELETE /api/prices/<price_id>
GET    /api/products/<id>/img
POST   /api/products/to-list            {ids: [...]} → {added, updated}

GET    /api/off/search?q=&page=         Open Food Facts results only
POST   /api/off/add                     {code, category}
GET    /api/off/product/<barcode>       look up a barcode (on the board first, then OFF; 404 if unknown)
GET    /api/off/img/<barcode>           photo fallback (302)
```

## Development

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
MACROCART_DATA_DIR=./data python app.py   # http://127.0.0.1:5000
```

Design notes: [`docs/NOTES.md`](docs/NOTES.md).

## License

Copyright © 2026 gutiwayne. Licensed under the
[GNU Affero General Public License v3.0](LICENSE). Third-party notices:
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

macrocart is not affiliated with Open Food Facts.
