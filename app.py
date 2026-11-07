"""macrocart: a self-hosted shopping list with a visual food board.

Foods come from a NutriTrace database mounted read-only, plus products you pick
from Open Food Facts. Your own data (list, ratings, notes, prices, internet
products) lives in a separate SQLite file. The NutriTrace database is never
written to.
"""
import json
import os
import re
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
import uuid

from flask import Flask, abort, jsonify, redirect, request, send_from_directory

app = Flask(__name__)

# ─────────────────────────── Configuration ───────────────────────────

DATA_DIR = os.environ.get("MACROCART_DATA_DIR", "/app/data")
DB_FILE = os.path.join(DATA_DIR, "macrocart.db")
NT_DB = os.environ.get("NUTRITRACE_DB", "/nutritrace/db/nutritrace.db")
NT_UPLOADS = os.environ.get("NUTRITRACE_UPLOADS", "/nutritrace/uploads")
OFF_COUNTRY = os.environ.get("OFF_COUNTRY", "").strip()      # e.g. "en:spain"; empty = worldwide
OFF_LANG = os.environ.get("OFF_LANG", "en").strip().lower()
if not re.fullmatch(r"[a-z]{2}", OFF_LANG):
    OFF_LANG = "en"
OFF_UA = os.environ.get("OFF_USER_AGENT", "macrocart/1.0 (self-hosted)")   # OFF asks for an identifiable UA
SUPERMARKETS = tuple(s.strip() for s in os.environ.get("SUPERMARKETS", "").split(",") if s.strip())
os.makedirs(DATA_DIR, exist_ok=True)

NAME_MAX = 120
SUPERMARKET_MAX = 40
NOTES_MAX = 500
QTY_MAX = 999
PRICE_MAX = 9999.99
TO_LIST_MAX = 200

CATEGORIES = ("protein", "carbs", "fat")
EXTRA_BASE = 1_000_000_000   # ids of Open Food Facts products, so they never clash with NutriTrace ids
OFF_SEARCH = "https://search.openfoodfacts.org/search"
OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{}.json"
OFF_FIELDS = ",".join((
    "code", "product_name", f"product_name_{OFF_LANG}", "brands", "quantity", "nutriments",
    "image_front_url", "image_front_small_url", "image_url", "image_small_url",
))

_IMG_RE = re.compile(r"^[A-Za-z0-9_.-]+\.(jpe?g|png|webp|gif|avif)$", re.I)
# Explicit MIME types: slim Python images do not know webp/avif, and with
# "nosniff" a browser will not draw an image served as application/octet-stream.
_IMG_MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
             "webp": "image/webp", "gif": "image/gif", "avif": "image/avif"}
# Some NutriTrace photos are not files but external URLs (Open Food Facts).
_IMG_EXT_RE = re.compile(r"^https://[A-Za-z0-9.-]+/[^\s\"'<>]*$")
_CODE_RE = re.compile(r"^\d{4,20}$")

_lock = threading.Lock()
_local = threading.local()


# ─────────────────────────── Database ───────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    supermarket TEXT NOT NULL DEFAULT '',
    qty         INTEGER NOT NULL DEFAULT 1,
    checked     INTEGER NOT NULL DEFAULT 0,
    created_at  REAL NOT NULL
);

-- Your own data about each product, keyed by product id.
CREATE TABLE IF NOT EXISTS catalog_meta (
    product_id INTEGER PRIMARY KEY,
    category   TEXT NOT NULL DEFAULT '',     -- '' = automatic from macros
    rating     INTEGER NOT NULL DEFAULT 0,   -- 0 = unrated, 1-5
    favorite   INTEGER NOT NULL DEFAULT 0,
    notes      TEXT NOT NULL DEFAULT '',
    hidden     INTEGER NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog_prices (
    id          TEXT PRIMARY KEY,
    product_id  INTEGER NOT NULL,
    supermarket TEXT NOT NULL,
    price       REAL NOT NULL DEFAULT 0,
    updated_at  REAL NOT NULL,
    UNIQUE (product_id, supermarket)
);

-- Products added from Open Food Facts. Exposed as EXTRA_BASE + id.
CREATE TABLE IF NOT EXISTS catalog_extra (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE,         -- barcode
    name       TEXT NOT NULL,
    brand      TEXT NOT NULL DEFAULT '',
    nutrition  TEXT NOT NULL DEFAULT '{}',   -- same shape as NutriTrace, per 100 g
    img_url    TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL
);
"""


def _db():
    """One SQLite connection per thread: gunicorn runs with --threads and a
    sqlite3 connection cannot be shared between threads."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        _local.conn = conn
    return conn


def init_db():
    conn = _db()
    conn.executescript(SCHEMA)
    conn.commit()


def _txt(raw, limit):
    return str(raw or "").strip()[:limit]


def _clamp_qty(raw):
    try:
        qty = int(raw)
    except (TypeError, ValueError):
        return 1
    return min(max(qty, 1), QTY_MAX)


def _clamp_price(raw):
    """Euros or any currency. Accepts a decimal comma ('1,20'), as phone keyboards offer it."""
    if isinstance(raw, str):
        raw = raw.strip().replace(",", ".")
    try:
        price = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if price != price or price in (float("inf"), float("-inf")):
        return 0.0
    return round(min(max(price, 0.0), PRICE_MAX), 2)


def _num(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    return n if n == n and n not in (float("inf"), float("-inf")) and n > 0 else 0.0


# ─────────────────────────── Products (NutriTrace + Open Food Facts) ───────────────────────────

def _nt_conn():
    """Read-only connection to NutriTrace, or None if it is not mounted."""
    if not os.path.exists(NT_DB):
        return None
    conn = sqlite3.connect(f"file:{NT_DB}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def _per100(nutrition, portion):
    """NutriTrace stores nutrition per portion; normalise to 100 g/ml."""
    try:
        n = json.loads(nutrition or "{}")
    except ValueError:
        n = {}
    f = 100.0 / portion if portion and portion > 0 else 1.0
    return {
        "kcal": round(_num(n.get("calories")) * f, 1),
        "p": round(_num(n.get("proteins")) * f, 1),
        "c": round(_num(n.get("carbohydrates")) * f, 1),
        "f": round(_num(n.get("fat")) * f, 1),
    }


def _auto_category(m):
    """Protein if ≥30 % of the macro kcal come from protein (eggs, legumes);
    otherwise whichever weighs more of carbs and fat. No macros → carbs."""
    kp, kc, kf = m["p"] * 4, m["c"] * 4, m["f"] * 9
    tot = kp + kc + kf
    if tot > 0 and kp / tot >= 0.30:
        return "protein"
    return "fat" if kf > kc else "carbs"


def _img_ok(url):
    url = url or ""
    return bool(_IMG_EXT_RE.match(url) or _IMG_RE.match(os.path.basename(url)))


def _products():
    """NutriTrace foods followed by Open Food Facts products, de-duplicated by
    name+brand (a food can be copied to several NutriTrace users; on a clash the
    NutriTrace one wins)."""
    rows = []
    conn = _nt_conn()
    if conn is not None:
        try:
            rows = conn.execute(
                "SELECT id, name, brand, nutrition, portion, unit, img_url FROM foods"
                " WHERE deleted_at IS NULL ORDER BY id").fetchall()
        finally:
            conn.close()
    rows = list(rows) + _db().execute(
        "SELECT id + ? AS id, name, brand, nutrition, 100.0 AS portion, 'g' AS unit, img_url"
        " FROM catalog_extra ORDER BY id", (EXTRA_BASE,)).fetchall()
    seen, out = set(), []
    for r in rows:
        key = (r["name"] or "").strip().lower() + "|" + (r["brand"] or "").strip().lower()
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _product_img_url(pid):
    """Stored photo of a product, or None if the product does not exist."""
    if pid >= EXTRA_BASE:
        row = _db().execute("SELECT img_url FROM catalog_extra WHERE id=?",
                            (pid - EXTRA_BASE,)).fetchone()
        return None if row is None else (row["img_url"] or "")
    conn = _nt_conn()
    if conn is None:
        return None
    try:
        row = conn.execute("SELECT img_url FROM foods WHERE id=? AND deleted_at IS NULL",
                           (pid,)).fetchone()
    finally:
        conn.close()
    return None if row is None else (row["img_url"] or "")


def _img_index():
    """lower-case name → product id, only products with a photo (for the List tab)."""
    idx = {}
    for r in _products():
        if _img_ok(r["img_url"]):
            idx.setdefault(_txt(r["name"], NAME_MAX).lower(), r["id"])
    return idx


# ─────────────────────────── API: shopping list ───────────────────────────

def _item_row(r):
    return {"id": r["id"], "name": r["name"], "supermarket": r["supermarket"],
            "qty": r["qty"], "checked": bool(r["checked"]), "created_at": r["created_at"]}


@app.get("/api/items")
def list_items():
    rows = _db().execute("SELECT * FROM items ORDER BY created_at").fetchall()
    # Photo: the product with the same name (case-insensitive), whether the line
    # came from the Foods tab or was typed by hand.
    try:
        photos = _img_index()
    except sqlite3.Error:
        photos = {}
    out = []
    for r in rows:
        it = _item_row(r)
        it["img_id"] = photos.get(it["name"].strip().lower())
        out.append(it)
    return jsonify(out)


@app.post("/api/items")
def add_item():
    data = request.get_json(silent=True) or {}
    name = _txt(data.get("name"), NAME_MAX)
    if not name:
        return jsonify({"error": "name required"}), 400
    item = {"id": uuid.uuid4().hex[:12], "name": name,
            "supermarket": _txt(data.get("supermarket"), SUPERMARKET_MAX),
            "qty": _clamp_qty(data.get("qty", 1)), "checked": bool(data.get("checked")),
            "created_at": time.time()}
    with _lock:
        conn = _db()
        conn.execute("INSERT INTO items (id,name,supermarket,qty,checked,created_at) VALUES (?,?,?,?,?,?)",
                     (item["id"], item["name"], item["supermarket"], item["qty"],
                      int(item["checked"]), item["created_at"]))
        conn.commit()
    return jsonify(item), 201


@app.patch("/api/items/<item_id>")
def update_item(item_id):
    data = request.get_json(silent=True) or {}
    with _lock:
        conn = _db()
        row = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        if row is None:
            abort(404)
        item = _item_row(row)
        if _txt(data.get("name"), NAME_MAX):
            item["name"] = _txt(data["name"], NAME_MAX)
        if "supermarket" in data:
            item["supermarket"] = _txt(data["supermarket"], SUPERMARKET_MAX)
        if "qty" in data:
            item["qty"] = _clamp_qty(data["qty"])
        if "checked" in data:
            item["checked"] = bool(data["checked"])
        conn.execute("UPDATE items SET name=?, supermarket=?, qty=?, checked=? WHERE id=?",
                     (item["name"], item["supermarket"], item["qty"], int(item["checked"]), item_id))
        conn.commit()
    return jsonify(item)


@app.delete("/api/items/<item_id>")
def delete_item(item_id):
    with _lock:
        conn = _db()
        cur = conn.execute("DELETE FROM items WHERE id=?", (item_id,))
        conn.commit()
    if not cur.rowcount:
        abort(404)
    return ("", 204)


@app.post("/api/items/clear-checked")
def clear_checked():
    with _lock:
        conn = _db()
        cur = conn.execute("DELETE FROM items WHERE checked=1")
        conn.commit()
    return jsonify({"removed": cur.rowcount})


# ─────────────────────────── API: food board ───────────────────────────

@app.get("/api/products")
def list_products():
    rows = _products()
    conn = _db()
    meta = {r["product_id"]: r for r in conn.execute("SELECT * FROM catalog_meta")}
    prices = {}
    for p in conn.execute("SELECT * FROM catalog_prices ORDER BY price"):
        prices.setdefault(p["product_id"], []).append({
            "id": p["id"], "supermarket": p["supermarket"],
            "price": _clamp_price(p["price"]), "updated_at": p["updated_at"]})
    sups = {s.lower(): s for s in SUPERMARKETS}
    for r in conn.execute("SELECT DISTINCT supermarket FROM catalog_prices"):
        sups.setdefault(r["supermarket"].lower(), r["supermarket"])
    pending = {r["n"] for r in conn.execute("SELECT lower(name) AS n FROM items WHERE checked=0")}
    items = []
    for r in rows:
        m = meta.get(r["id"])
        per = _per100(r["nutrition"], r["portion"])
        auto = _auto_category(per)
        manual = m["category"] if m and m["category"] in CATEGORIES else ""
        items.append({
            "id": r["id"], "name": r["name"], "brand": r["brand"] or "",
            "unit": r["unit"] or "g", "per100": per,
            "auto_category": auto, "manual_category": manual, "category": manual or auto,
            "img": _img_ok(r["img_url"]),
            "rating": m["rating"] if m else 0,
            "favorite": bool(m["favorite"]) if m else False,
            "notes": m["notes"] if m else "",
            "hidden": bool(m["hidden"]) if m else False,
            "prices": prices.get(r["id"], []),
            "in_list": _txt(r["name"], NAME_MAX).lower() in pending,
        })
    return jsonify({"nutritrace": os.path.exists(NT_DB), "items": items,
                    "supermarkets": sorted(sups.values(), key=str.lower)})


@app.get("/api/products/<int:pid>/img")
def product_img(pid):
    url = _product_img_url(pid) or ""
    if _IMG_EXT_RE.match(url):
        return redirect(url, code=302)
    name = os.path.basename(url)
    m = _IMG_RE.match(name)
    if not m:
        abort(404)
    return send_from_directory(NT_UPLOADS, name, max_age=86400, mimetype=_IMG_MIME[m.group(1).lower()])


@app.patch("/api/products/<int:pid>")
def update_product(pid):
    if _product_img_url(pid) is None:
        abort(404)
    data = request.get_json(silent=True) or {}
    with _lock:
        conn = _db()
        conn.execute("INSERT OR IGNORE INTO catalog_meta (product_id) VALUES (?)", (pid,))
        if "category" in data:
            cat = str(data["category"] or "")
            conn.execute("UPDATE catalog_meta SET category=? WHERE product_id=?",
                         (cat if cat in CATEGORIES else "", pid))
        if "rating" in data:
            try:
                rating = max(0, min(5, int(data["rating"])))
            except (TypeError, ValueError):
                rating = 0
            conn.execute("UPDATE catalog_meta SET rating=? WHERE product_id=?", (rating, pid))
        for field in ("favorite", "hidden"):
            if field in data:
                conn.execute(f"UPDATE catalog_meta SET {field}=? WHERE product_id=?",
                             (1 if data[field] else 0, pid))
        if "notes" in data:
            conn.execute("UPDATE catalog_meta SET notes=? WHERE product_id=?",
                         (_txt(data["notes"], NOTES_MAX), pid))
        conn.execute("UPDATE catalog_meta SET updated_at=? WHERE product_id=?", (time.time(), pid))
        conn.commit()
    return jsonify({"ok": True})


@app.post("/api/products/<int:pid>/prices")
def set_price(pid):
    """Add or update (per supermarket) the price of a product."""
    if _product_img_url(pid) is None:
        abort(404)
    data = request.get_json(silent=True) or {}
    sup = _txt(data.get("supermarket"), SUPERMARKET_MAX)
    price = _clamp_price(data.get("price"))
    if not sup:
        return jsonify({"error": "Supermarket required"}), 400
    if price <= 0:
        return jsonify({"error": "Invalid price"}), 400
    with _lock:
        conn = _db()
        conn.execute(
            "INSERT INTO catalog_prices (id, product_id, supermarket, price, updated_at) VALUES (?,?,?,?,?)"
            " ON CONFLICT(product_id, supermarket) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at",
            (uuid.uuid4().hex[:12], pid, sup, price, time.time()))
        conn.commit()
    return jsonify({"ok": True})


@app.delete("/api/prices/<price_id>")
def delete_price(price_id):
    with _lock:
        conn = _db()
        cur = conn.execute("DELETE FROM catalog_prices WHERE id=?", (price_id,))
        conn.commit()
    if not cur.rowcount:
        abort(404)
    return ("", 204)


@app.post("/api/products/to-list")
def products_to_list():
    """Send the selected products to the list, at the cheapest supermarket if a
    price is known. A pending line with the same name+supermarket gets +1."""
    data = request.get_json(silent=True) or {}
    try:
        ids = {int(i) for i in (data.get("ids") or [])[:TO_LIST_MAX]}
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid ids"}), 400
    if not ids:
        return jsonify({"error": "Nothing selected"}), 400
    rows = [r for r in _products() if r["id"] in ids]
    added = updated = 0
    with _lock:
        conn = _db()
        for r in rows:
            name = _txt(r["name"], NAME_MAX)
            if not name:
                continue
            best = conn.execute("SELECT supermarket FROM catalog_prices WHERE product_id=?"
                                " ORDER BY price LIMIT 1", (r["id"],)).fetchone()
            sup = best["supermarket"] if best else ""
            existing = conn.execute("SELECT id, qty FROM items WHERE lower(name)=? AND supermarket=? AND checked=0",
                                    (name.lower(), sup)).fetchone()
            if existing:
                conn.execute("UPDATE items SET qty=? WHERE id=?", (_clamp_qty(existing["qty"] + 1), existing["id"]))
                updated += 1
            else:
                conn.execute("INSERT INTO items (id,name,supermarket,qty,checked,created_at) VALUES (?,?,?,?,?,?)",
                             (uuid.uuid4().hex[:12], name, sup, 1, 0, time.time()))
                added += 1
        conn.commit()
    return jsonify({"added": added, "updated": updated})


# ─────────────────────────── API: internet search (Open Food Facts) ───────────────────────────

def _off_get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": OFF_UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read(5 * 1024 * 1024).decode("utf-8"))


def _first_img(h, *keys):
    return next((h.get(k) for k in keys if _IMG_EXT_RE.match(h.get(k) or "")), "")


def _off_norm(h):
    """Open Food Facts product → name, brand, nutrition per 100 g (NutriTrace shape) and photo."""
    n = h.get("nutriments") or {}
    brands = h.get("brands") or ""
    if isinstance(brands, list):
        brands = ", ".join(str(b) for b in brands)
    return {
        "code": str(h.get("code") or ""),
        "name": _txt(h.get(f"product_name_{OFF_LANG}") or h.get("product_name"), NAME_MAX),
        "brand": _txt(brands.split(",")[0], 80),
        "quantity": _txt(h.get("quantity"), 40),
        "img": _first_img(h, "image_front_url", "image_url", "image_front_small_url"),
        "img_small": _first_img(h, "image_front_small_url", "image_small_url"),
        "nutrition": {
            "calories": _num(n.get("energy-kcal_100g")),
            "proteins": _num(n.get("proteins_100g")),
            "carbohydrates": _num(n.get("carbohydrates_100g")),
            "fat": _num(n.get("fat_100g")),
        },
    }


@app.get("/api/off/search")
def off_search():
    """Internet results only (Open Food Facts), optionally limited to OFF_COUNTRY."""
    q = _txt(request.args.get("q"), 100)
    if len(q) < 2:
        return jsonify({"error": "Type at least 2 letters"}), 400
    try:
        page = max(1, min(20, int(request.args.get("page", 1))))
    except ValueError:
        page = 1
    query = q.replace('"', " ")
    if OFF_COUNTRY:
        query += f' +countries_tags:"{OFF_COUNTRY}"'
    params = urllib.parse.urlencode({"q": query, "page_size": 24, "page": page,
                                     "langs": OFF_LANG, "fields": OFF_FIELDS})
    try:
        data = _off_get(OFF_SEARCH + "?" + params)
    except Exception as e:   # network, timeout, bad JSON: the client only needs to know it failed
        app.logger.warning("Open Food Facts search failed: %s", e)
        return jsonify({"error": "Could not reach Open Food Facts"}), 502
    have = {r["code"] for r in _db().execute("SELECT code FROM catalog_extra")}
    out = []
    for h in data.get("hits") or []:
        it = _off_norm(h)
        if not it["name"] or not _CODE_RE.match(it["code"]):
            continue
        it["per100"] = _per100(json.dumps(it.pop("nutrition")), None)
        it["auto_category"] = _auto_category(it["per100"])
        it["added"] = it["code"] in have
        out.append(it)
    return jsonify({"items": out, "page": page, "page_count": data.get("page_count") or 1})


@app.post("/api/off/add")
def off_add():
    """Save an Open Food Facts product in the chosen column. The product is fetched
    again from OFF by its barcode: the browser's copy is not trusted."""
    data = request.get_json(silent=True) or {}
    code = str(data.get("code") or "")
    cat = str(data.get("category") or "")
    if not _CODE_RE.match(code):
        return jsonify({"error": "Invalid barcode"}), 400
    if cat not in CATEGORIES:
        return jsonify({"error": "Pick protein, carbs or fat"}), 400
    try:
        prod = _off_get(OFF_PRODUCT.format(code) + "?fields=" + OFF_FIELDS).get("product")
    except Exception as e:
        app.logger.warning("Open Food Facts product %s failed: %s", code, e)
        return jsonify({"error": "Could not reach Open Food Facts"}), 502
    if not prod:
        return jsonify({"error": "Product not found on Open Food Facts"}), 404
    prod.setdefault("code", code)
    it = _off_norm(prod)
    if not it["name"]:
        return jsonify({"error": "The product has no name on Open Food Facts"}), 422
    with _lock:
        conn = _db()
        conn.execute(
            "INSERT INTO catalog_extra (code, name, brand, nutrition, img_url, created_at) VALUES (?,?,?,?,?,?)"
            " ON CONFLICT(code) DO UPDATE SET name=excluded.name, brand=excluded.brand,"
            " nutrition=excluded.nutrition, img_url=excluded.img_url",
            (code, it["name"], it["brand"], json.dumps(it["nutrition"]), it["img"], time.time()))
        pid = conn.execute("SELECT id FROM catalog_extra WHERE code=?", (code,)).fetchone()["id"] + EXTRA_BASE
        conn.execute("INSERT OR IGNORE INTO catalog_meta (product_id) VALUES (?)", (pid,))
        conn.execute("UPDATE catalog_meta SET category=?, hidden=0, updated_at=? WHERE product_id=?",
                     (cat, time.time(), pid))
        conn.commit()
    return jsonify({"id": pid, "name": it["name"], "category": cat})


_off_img_cache = {}   # barcode → photo URL ('' if none); cleared past 500 entries


@app.get("/api/off/img/<code>")
def off_img(code):
    """Photo from the product's OFF page. The OFF search index sometimes returns
    URLs that do not exist, or none although the product has a photo: the client
    falls back here when a search photo fails."""
    if not _CODE_RE.match(code):
        abort(404)
    if code not in _off_img_cache:
        try:
            prod = _off_get(OFF_PRODUCT.format(code) + "?fields=image_front_small_url,image_small_url,"
                            "image_front_url,image_url", timeout=10).get("product") or {}
        except Exception:
            abort(404)   # not cached: retried next time
        if len(_off_img_cache) > 500:
            _off_img_cache.clear()
        _off_img_cache[code] = _first_img(prod, "image_front_small_url", "image_small_url",
                                          "image_front_url", "image_url")
    url = _off_img_cache[code]
    if not url:
        abort(404)
    resp = redirect(url, code=302)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


init_db()


@app.get("/")
def index():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "index.html"),
              encoding="utf-8") as f:
        return app.response_class(f.read(), mimetype="text/html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
