/* macrocart local API: the same routes the page used to call on a server, answered
   in the browser from IndexedDB (db.js). Only Open Food Facts is reached over the
   network. api(path, {method, body}) resolves with the JSON-like answer or throws an
   Error with .status, like a failed HTTP call. */
(() => {
  const NAME_MAX = 120, SUPERMARKET_MAX = 40, NOTES_MAX = 500, BRAND_MAX = 80;
  const QTY_MAX = 999, PRICE_MAX = 9999.99, TO_LIST_MAX = 200;
  const PHOTO_MAX = 3 * 1024 * 1024;
  const CATEGORIES = ["protein", "carbs", "fat"], KINDS = ["product", "recipe"];
  const RECIPE_COPY = "recipe-";
  const CODE_RE = /^\d{4,20}$/;
  const IMG_EXT_RE = /^https:\/\/[A-Za-z0-9.-]+\/[^\s"'<>]*$/;
  const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;
  const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
  const OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/";
  const PAGE_SIZE = 24;
  const DEFAULT_SETTINGS = { supermarkets: [], offCountry: "", offLang: "en" };

  const { run, req } = DB;

  class HttpError extends Error {
    constructor(status, msg){ super(msg); this.status = status; }
  }
  const fail = (status, msg) => { throw new HttpError(status, msg); };

  /* ─────────── Cleaning (same rules as the old server) ─────────── */
  const txt = (raw, limit) => String(raw == null ? "" : raw).trim().slice(0, limit);
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2))),
    b => b.toString(16).padStart(2, "0")).join("").slice(0, n);
  const now = () => Date.now() / 1000;
  function clampQty(raw){
    const q = parseInt(raw, 10);
    return Number.isFinite(q) ? Math.min(Math.max(q, 1), QTY_MAX) : 1;
  }
  function numOf(v){
    if(typeof v === "string") v = v.trim().replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  // Accepts a decimal comma ("1,20"), as phone keyboards offer it.
  const clampPrice = (raw) => Math.round(Math.min(numOf(raw), PRICE_MAX) * 100) / 100;
  const r1 = (n) => Math.round(n * 10) / 10;
  function per(nut){
    const n = nut || {};
    return { kcal: r1(numOf(n.calories)), p: r1(numOf(n.proteins)), c: r1(numOf(n.carbohydrates)), f: r1(numOf(n.fat)) };
  }
  const cleanNutrition = (nut) => { const m = per(nut); return { calories: m.kcal, proteins: m.p, carbohydrates: m.c, fat: m.f }; };
  /* Protein if ≥30 % of the macro kcal come from protein (eggs, legumes); otherwise
     whichever weighs more of carbs and fat. No macros → carbs. */
  function autoCategory(m){
    const kp = m.p * 4, kc = m.c * 4, kf = m.f * 9, tot = kp + kc + kf;
    if(tot > 0 && kp / tot >= 0.30) return "protein";
    return kf > kc ? "fat" : "carbs";
  }
  /* kcal/p/c/f from a form. A serving can hold more than 100 g, so the caps are five
     times higher per serving. */
  function macros(data, unit){
    const big = unit === "serving" ? 5 : 1;
    const one = (k, top) => r1(Math.min(numOf(data[k]), top * big));
    return { calories: one("kcal", 900), proteins: one("p", 100), carbohydrates: one("c", 100), fat: one("f", 100) };
  }
  const rating = (v) => { const r = parseInt(v, 10); return Number.isFinite(r) ? Math.max(0, Math.min(5, r)) : 0; };

  function photoBlob(raw){
    const m = PHOTO_RE.exec(String(raw || ""));
    if(!m) return null;
    let bin;
    try { bin = atob(m[2].replace(/\s+/g, "")); } catch(e){ return null; }
    if(!bin.length || bin.length > PHOTO_MAX) return null;
    const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/" + m[1] });
  }

  /* A full, clean product record (also used for imports). */
  function cleanProduct(p){
    const kind = KINDS.includes(p.kind) ? p.kind : "product";
    return {
      code: txt(p.code, 64), name: txt(p.name, NAME_MAX), brand: txt(p.brand, BRAND_MAX),
      nutrition: cleanNutrition(p.nutrition), unit: kind === "recipe" && p.unit === "serving" ? "serving" : "g",
      img_url: IMG_EXT_RE.test(p.img_url || "") ? p.img_url : p.img_url === "photo" ? "photo" : "",
      photo_v: txt(p.photo_v, 16),
      category: CATEGORIES.includes(p.category) ? p.category : "", kind,
      rating: rating(p.rating), favorite: !!p.favorite, notes: txt(p.notes, NOTES_MAX), hidden: !!p.hidden,
      created_at: Number(p.created_at) || now(), updated_at: Number(p.updated_at) || 0,
    };
  }

  /* ─────────── Photos: Blob → object URL, cached per photo version ─────────── */
  const photoUrls = new Map();   // product id → {v, url}
  function photoUrl(id, v, blob){
    const have = photoUrls.get(id);
    if(have && have.v === v) return have.url;
    if(have) URL.revokeObjectURL(have.url);
    if(!blob){ photoUrls.delete(id); return ""; }
    const url = URL.createObjectURL(blob);
    photoUrls.set(id, { v, url });
    return url;
  }
  async function imgSrcs(products){
    const want = products.filter(p => p.img_url === "photo" && !(photoUrls.get(p.id) && photoUrls.get(p.id).v === p.photo_v));
    const blobs = want.length ? await run(["photos"], "readonly", (s) =>
      Promise.all(want.map(p => req(s("photos").get(p.id))))) : [];
    want.forEach((p, i) => photoUrl(p.id, p.photo_v, blobs[i]));
    const out = new Map();
    for(const p of products){
      if(IMG_EXT_RE.test(p.img_url)) out.set(p.id, p.img_url);
      else if(p.img_url === "photo"){ const u = photoUrls.get(p.id); if(u) out.set(p.id, u.url); }
    }
    return out;
  }

  /* ─────────── Settings ─────────── */
  async function getSettings(){
    const s = await run(["settings"], "readonly", (s) => req(s("settings").get("settings")));
    return cleanSettings(s || {});
  }
  function cleanSettings(s){
    const lang = String(s.offLang || "").trim().toLowerCase();
    const sups = (Array.isArray(s.supermarkets) ? s.supermarkets : String(s.supermarkets || "").split(","))
      .map(x => txt(x, SUPERMARKET_MAX)).filter(Boolean);
    return {
      supermarkets: [...new Map(sups.map(x => [x.toLowerCase(), x])).values()],
      offCountry: /^[a-z]{2}:[a-z0-9-]{2,40}$/.test(String(s.offCountry || "").trim()) ? String(s.offCountry).trim() : "",
      offLang: /^[a-z]{2}$/.test(lang) ? lang : DEFAULT_SETTINGS.offLang,
    };
  }
  async function putSettings(data){
    const s = cleanSettings({ ...(await getSettings()), ...data });
    await run(["settings"], "readwrite", (st) => req(st("settings").put(s, "settings")));
    return s;
  }

  /* ─────────── Shopping list ─────────── */
  const itemOut = (r) => ({ id: r.id, name: r.name, supermarket: r.supermarket, qty: r.qty,
    checked: !!r.checked, created_at: r.created_at });

  async function listItems(){
    const [rows, prods] = await run(["items", "products"], "readonly", (s) =>
      Promise.all([req(s("items").getAll()), req(s("products").getAll())]));
    const srcs = await imgSrcs(prods);
    // Photo: the product with the same name (case-insensitive), whether the line came
    // from the Foods tab or was typed by hand.
    const idx = new Map();
    for(const p of prods){ const k = txt(p.name, NAME_MAX).toLowerCase(); if(srcs.has(p.id) && !idx.has(k)) idx.set(k, srcs.get(p.id)); }
    return rows.sort((a, b) => a.created_at - b.created_at).map(r => {
      const it = itemOut(r);
      it.img_src = idx.get(it.name.trim().toLowerCase()) || "";
      return it;
    });
  }

  async function addItem(data){
    const name = txt(data.name, NAME_MAX);
    if(!name) fail(400, "name required");
    const item = { id: hex(12), name, supermarket: txt(data.supermarket, SUPERMARKET_MAX),
      qty: clampQty(data.qty == null ? 1 : data.qty), checked: !!data.checked, created_at: now() };
    await run(["items"], "readwrite", (s) => req(s("items").add(item)));
    return item;
  }

  function updateItem(id, data){
    return run(["items"], "readwrite", async (s) => {
      const r = await req(s("items").get(id));
      if(!r) fail(404, "Not found");
      const item = itemOut(r);
      if(txt(data.name, NAME_MAX)) item.name = txt(data.name, NAME_MAX);
      if("supermarket" in data) item.supermarket = txt(data.supermarket, SUPERMARKET_MAX);
      if("qty" in data) item.qty = clampQty(data.qty);
      if("checked" in data) item.checked = !!data.checked;
      await req(s("items").put(item));
      return item;
    });
  }

  function deleteItem(id){
    return run(["items"], "readwrite", async (s) => {
      if(!(await req(s("items").get(id)))) fail(404, "Not found");
      await req(s("items").delete(id));
      return null;
    });
  }

  function clearChecked(){
    return run(["items"], "readwrite", async (s) => {
      const rows = await req(s("items").getAll());
      const done = rows.filter(r => r.checked);
      await Promise.all(done.map(r => req(s("items").delete(r.id))));
      return { removed: done.length };
    });
  }

  /* ─────────── Food board ─────────── */
  async function listProducts(){
    const [prods, prices, items] = await run(["products", "prices", "items"], "readonly", (s) =>
      Promise.all([req(s("products").getAll()), req(s("prices").getAll()), req(s("items").getAll())]));
    const settings = await getSettings();
    const srcs = await imgSrcs(prods);
    const byProd = new Map();
    prices.sort((a, b) => a.price - b.price).forEach(p => {
      if(!byProd.has(p.product_id)) byProd.set(p.product_id, []);
      byProd.get(p.product_id).push({ id: p.id, supermarket: p.supermarket, price: clampPrice(p.price), updated_at: p.updated_at });
    });
    const sups = new Map(settings.supermarkets.map(s => [s.toLowerCase(), s]));
    prices.forEach(p => { if(!sups.has(p.supermarket.toLowerCase())) sups.set(p.supermarket.toLowerCase(), p.supermarket); });
    const pending = new Set(items.filter(i => !i.checked).map(i => i.name.toLowerCase()));
    const out = prods.sort((a, b) => a.id - b.id).map(r => {
      const m = per(r.nutrition), auto = autoCategory(m), manual = CATEGORIES.includes(r.category) ? r.category : "";
      return {
        id: r.id, name: r.name, brand: r.brand || "", unit: r.unit === "serving" ? "serving" : "g", per100: m,
        kind: KINDS.includes(r.kind) ? r.kind : "product",
        auto_category: auto, manual_category: manual, category: manual || auto,
        img: srcs.has(r.id), img_src: srcs.get(r.id) || "",
        rating: r.rating || 0, favorite: !!r.favorite, notes: r.notes || "", hidden: !!r.hidden,
        prices: byProd.get(r.id) || [],
        in_list: pending.has(txt(r.name, NAME_MAX).toLowerCase()),
      };
    });
    return { items: out, supermarkets: [...sups.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) };
  }

  function updateProduct(id, data){
    return run(["products", "photos"], "readwrite", async (s) => {
      const r = await req(s("products").get(id));
      if(!r) fail(404, "Not found");
      if("kind" in data) r.kind = KINDS.includes(data.kind) ? data.kind : "product";
      if("name" in data){
        r.name = txt(data.name, NAME_MAX);
        if(!r.name) fail(400, "Name required");
      }
      if("brand" in data) r.brand = txt(data.brand, BRAND_MAX);
      if("unit" in data && r.kind === "recipe") r.unit = data.unit === "serving" ? "serving" : "g";
      if(r.kind !== "recipe") r.unit = r.unit === "serving" ? "serving" : "g";
      if(["kcal", "p", "c", "f"].some(k => k in data)){
        const nut = { ...(r.nutrition || {}) }, fresh = macros(data, r.unit);
        [["kcal", "calories"], ["p", "proteins"], ["c", "carbohydrates"], ["f", "fat"]].forEach(([k, f]) => {
          if(k in data) nut[f] = fresh[f];
        });
        r.nutrition = nut;
      }
      if(data.photo){
        const blob = photoBlob(data.photo);
        if(!blob) fail(400, "Invalid or too large photo");
        await req(s("photos").put(blob, id));
        r.img_url = "photo"; r.photo_v = hex(8);
      }
      if("category" in data) r.category = CATEGORIES.includes(data.category) ? data.category : "";
      if("rating" in data) r.rating = rating(data.rating);
      if("favorite" in data) r.favorite = !!data.favorite;
      if("hidden" in data) r.hidden = !!data.hidden;
      if("notes" in data) r.notes = txt(data.notes, NOTES_MAX);
      r.updated_at = now();
      await req(s("products").put(r));
      return { ok: true };
    });
  }

  /* Delete a food or recipe with its card data, prices and uploaded photo. */
  function deleteProduct(id){
    return run(["products", "prices", "photos"], "readwrite", async (s) => {
      if(!(await req(s("products").get(id)))) fail(404, "Not found");
      const keys = await req(s("prices").index("product_id").getAllKeys(id));
      await Promise.all(keys.map(k => req(s("prices").delete(k))));
      await req(s("photos").delete(id));
      await req(s("products").delete(id));
      photoUrl(id, null, null);
      return null;
    });
  }

  /* Copy foods to Recipes (name, brand, nutrition per 100 g, OFF photo, column, rating,
     favourite, notes). A food already copied once is skipped; a copy is never copied. */
  function asRecipe(data){
    const ids = [...new Set((data.ids || []).slice(0, TO_LIST_MAX).map(Number))];
    if(ids.some(i => !Number.isInteger(i))) fail(400, "Invalid ids");
    return run(["products"], "readwrite", async (s) => {
      const all = await req(s("products").getAll());
      let added = 0, skipped = 0;
      for(const id of ids){
        const r = all.find(p => p.id === id);
        if(!r || r.code.startsWith(RECIPE_COPY)) continue;
        if(all.some(p => p.code.startsWith(RECIPE_COPY + id + "-"))){ skipped++; continue; }
        const copy = cleanProduct({ ...r, code: RECIPE_COPY + id + "-" + hex(8), kind: "recipe", unit: "g",
          img_url: IMG_EXT_RE.test(r.img_url || "") ? r.img_url : "", photo_v: "", hidden: false,
          created_at: now(), updated_at: now() });
        all.push({ ...copy, id: await req(s("products").add(copy)) });
        added++;
      }
      return { added, skipped };
    });
  }

  /* Add or update (per shop) the price of a product. */
  function setPrice(id, data){
    const sup = txt(data.supermarket, SUPERMARKET_MAX), price = clampPrice(data.price);
    if(!sup) fail(400, "Supermarket required");
    if(price <= 0) fail(400, "Invalid price");
    return run(["products", "prices"], "readwrite", async (s) => {
      if(!(await req(s("products").get(id)))) fail(404, "Not found");
      const have = (await req(s("prices").index("product_id").getAll(id))).find(p => p.supermarket === sup);
      await req(s("prices").put({ id: have ? have.id : hex(12), product_id: id, supermarket: sup, price, updated_at: now() }));
      return { ok: true };
    });
  }

  function deletePrice(id){
    return run(["prices"], "readwrite", async (s) => {
      if(!(await req(s("prices").get(id)))) fail(404, "Not found");
      await req(s("prices").delete(id));
      return null;
    });
  }

  /* Send products to the list, at the cheapest shop if a price is known. A pending
     line with the same name + shop gets +1. */
  function toList(data){
    const ids = new Set((data.ids || []).slice(0, TO_LIST_MAX).map(Number));
    if(!ids.size) fail(400, "Nothing selected");
    return run(["products", "prices", "items"], "readwrite", async (s) => {
      const prods = (await req(s("products").getAll())).filter(p => ids.has(p.id));
      const items = await req(s("items").getAll());
      let added = 0, updated = 0;
      for(const r of prods){
        const name = txt(r.name, NAME_MAX);
        if(!name) continue;
        const prices = (await req(s("prices").index("product_id").getAll(r.id))).sort((a, b) => a.price - b.price);
        const sup = prices.length ? prices[0].supermarket : "";
        const same = items.find(i => !i.checked && i.name.toLowerCase() === name.toLowerCase() && i.supermarket === sup);
        if(same){ same.qty = clampQty(same.qty + 1); await req(s("items").put(same)); updated++; }
        else {
          const it = { id: hex(12), name, supermarket: sup, qty: 1, checked: false, created_at: now() };
          await req(s("items").add(it)); items.push(it); added++;
        }
      }
      return { added, updated };
    });
  }

  /* A food that is not on Open Food Facts, or a recipe (kind 'recipe'). Without a
     barcode it gets a 'manual-' code. */
  async function addCustom(data){
    const name = txt(data.name, NAME_MAX), code = txt(data.code, 20), cat = String(data.category || "");
    const kind = data.kind === "recipe" ? "recipe" : "product";
    const unit = kind === "recipe" && data.unit === "serving" ? "serving" : "g";
    if(!name) fail(400, "Name required");
    if(code && !CODE_RE.test(code)) fail(400, "Invalid barcode");
    if(cat && !CATEGORIES.includes(cat)) fail(400, "Pick protein, carbs or fat");
    let blob = null;
    if(data.photo){ blob = photoBlob(data.photo); if(!blob) fail(400, "Invalid or too large photo"); }
    const nutrition = macros(data, unit);
    const rec = cleanProduct({ code: code || "manual-" + hex(12), name, brand: data.brand, nutrition, unit,
      img_url: blob ? "photo" : "", photo_v: blob ? hex(8) : "", category: cat, kind,
      rating: data.rating, favorite: data.favorite, notes: data.notes, created_at: now(), updated_at: now() });
    const id = await run(["products", "photos"], "readwrite", async (s) => {
      if(code && await req(s("products").index("code").get(code))) fail(409, "A product with that barcode is already on the board");
      const id = await req(s("products").add(rec));
      if(blob) await req(s("photos").put(blob, id));
      return id;
    });
    return { id, name, kind, category: cat || autoCategory(per(nutrition)) };
  }

  /* ─────────── Open Food Facts (straight from the browser) ─────────── */
  async function offGet(url){
    let res;
    try { res = await fetch(url, { headers: { Accept: "application/json" } }); }
    catch(e){ fail(502, navigator.onLine === false ? "You are offline" : "Could not reach Open Food Facts"); }
    if(res.status === 404) return null;
    if(res.status === 429 || res.status === 503) fail(503, "Open Food Facts is busy: try again in a minute");
    if(!res.ok) fail(502, "Could not reach Open Food Facts");
    try { return await res.json(); } catch(e){ fail(502, "Open Food Facts sent an unreadable answer"); }
  }
  const offFields = (lang) => ["code", "product_name", "product_name_" + lang, "brands", "quantity", "nutriments",
    "image_front_url", "image_front_small_url", "image_url", "image_small_url"].join(",");
  const firstImg = (h, ...keys) => (keys.map(k => h[k]).find(u => IMG_EXT_RE.test(u || "")) || "");
  function offNorm(h, lang){
    const n = h.nutriments || {};
    let brands = h.brands || "";
    if(Array.isArray(brands)) brands = brands.join(", ");
    return {
      code: String(h.code || ""), name: txt(h["product_name_" + lang] || h.product_name, NAME_MAX),
      brand: txt(String(brands).split(",")[0], BRAND_MAX), quantity: txt(h.quantity, 40),
      img: firstImg(h, "image_front_url", "image_url", "image_front_small_url"),
      img_small: firstImg(h, "image_front_small_url", "image_small_url"),
      nutrition: { calories: numOf(n["energy-kcal_100g"]), proteins: numOf(n.proteins_100g),
        carbohydrates: numOf(n.carbohydrates_100g), fat: numOf(n.fat_100g) },
    };
  }
  async function codes(){
    return new Set(await run(["products"], "readonly", (s) => req(s("products").index("code").getAllKeys())));
  }

  async function offSearch(q, page){
    q = txt(q, 100);
    if(q.length < 2) fail(400, "Type at least 2 letters");
    page = Math.max(1, Math.min(20, parseInt(page, 10) || 1));
    const st = await getSettings();
    const p = new URLSearchParams({ search_terms: q, search_simple: "1", action: "process", json: "1",
      page_size: String(PAGE_SIZE), page: String(page), fields: offFields(st.offLang), lc: st.offLang });
    if(st.offCountry){ p.set("tagtype_0", "countries"); p.set("tag_contains_0", "contains"); p.set("tag_0", st.offCountry); }
    const data = await offGet(OFF_SEARCH + "?" + p) || {};
    const have = await codes();
    const out = [];
    for(const h of data.products || []){
      const it = offNorm(h, st.offLang);
      if(!it.name || !CODE_RE.test(it.code)) continue;
      it.per100 = per(it.nutrition); delete it.nutrition;
      it.auto_category = autoCategory(it.per100);
      it.added = have.has(it.code);
      out.push(it);
    }
    return { items: out, page, page_count: Math.max(1, Math.ceil((Number(data.count) || 0) / PAGE_SIZE)) };
  }

  async function offProduct(code, lang){
    const d = await offGet(OFF_PRODUCT + encodeURIComponent(code) + ".json?fields=" + offFields(lang));
    return d && d.product ? d.product : null;
  }

  /* Save an OFF product in the chosen column. It is fetched again by barcode: the
     page's copy of a search result is not trusted. */
  async function offAdd(data){
    const code = String(data.code || ""), cat = String(data.category || "");
    if(!CODE_RE.test(code)) fail(400, "Invalid barcode");
    if(!CATEGORIES.includes(cat)) fail(400, "Pick protein, carbs or fat");
    const st = await getSettings();
    const prod = await offProduct(code, st.offLang);
    if(!prod) fail(404, "Product not found on Open Food Facts");
    const it = offNorm({ ...prod, code }, st.offLang);
    if(!it.name) fail(422, "The product has no name on Open Food Facts");
    const id = await run(["products", "photos"], "readwrite", async (s) => {
      const have = await req(s("products").index("code").get(code));
      // An OFF product replaces a hand-typed one with the same barcode.
      const rec = have ? { ...have } : cleanProduct({ code, created_at: now() });
      Object.assign(rec, { name: it.name, brand: it.brand, nutrition: it.nutrition, img_url: it.img, photo_v: "",
        category: cat, hidden: false, updated_at: now() });
      if(have){ await req(s("photos").delete(have.id)); await req(s("products").put(rec)); return have.id; }
      return req(s("products").add(rec));
    });
    return { id, name: it.name, category: cat };
  }

  /* Look up a scanned barcode: the board first, then OFF. */
  async function offLookup(code){
    if(!CODE_RE.test(code)) fail(400, "Invalid barcode");
    const row = await run(["products"], "readonly", (s) => req(s("products").index("code").get(code)));
    if(row) return { found: true, local: true, id: row.id, name: row.name };
    const st = await getSettings();
    const prod = await offProduct(code, st.offLang);
    const it = prod ? offNorm({ ...prod, code }, st.offLang) : null;
    if(!it || !it.name) fail(404, "Not on Open Food Facts");
    it.per100 = per(it.nutrition); delete it.nutrition;
    it.auto_category = autoCategory(it.per100);
    it.added = false;
    return { found: true, local: false, item: it };
  }

  /* The OFF search index sometimes returns photo URLs that 404, or none although the
     product page has one: the page asks here for the product page photo. */
  const offImgCache = new Map();
  async function offImg(code){
    if(!CODE_RE.test(code)) return "";
    if(!offImgCache.has(code)){
      let prod;
      try {
        const d = await offGet(OFF_PRODUCT + code + ".json?fields=image_front_small_url,image_small_url,image_front_url,image_url");
        prod = (d && d.product) || {};
      } catch(e){ return ""; }   // not cached: tried again next time
      if(offImgCache.size > 500) offImgCache.clear();
      offImgCache.set(code, firstImg(prod, "image_front_small_url", "image_small_url", "image_front_url", "image_url"));
    }
    return offImgCache.get(code);
  }

  /* ─────────── Export / import ─────────── */
  const FORMAT = "macrocart", FORMAT_VERSION = 1;
  const blobToDataUrl = (b) => new Promise((ok, ko) => {
    const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ko(fr.error); fr.readAsDataURL(b);
  });

  /* Everything on this device as one JSON-ready object; photos as data: URLs. */
  async function exportAll(){
    const [items, products, prices, photoKeys, photos, settings] = await run(DB.STORES, "readonly", (s) => Promise.all([
      req(s("items").getAll()), req(s("products").getAll()), req(s("prices").getAll()),
      req(s("photos").getAllKeys()), req(s("photos").getAll()), req(s("settings").get("settings"))]));
    const pics = {};
    for(let i = 0; i < photoKeys.length; i++) pics[photoKeys[i]] = await blobToDataUrl(photos[i]);
    return { format: FORMAT, version: FORMAT_VERSION, exported_at: new Date().toISOString(),
      settings: cleanSettings(settings || {}), items, products, prices, photos: pics };
  }

  /* Check and clean an export file. Returns the parts ready to store. */
  function parseExport(d){
    if(!d || d.format !== FORMAT) fail(400, "This is not a macrocart export");
    if(d.version !== FORMAT_VERSION) fail(400, "This export comes from a newer macrocart: update the app first");
    const items = (Array.isArray(d.items) ? d.items : []).map(i => ({
      id: txt(i.id, 32) || hex(12), name: txt(i.name, NAME_MAX), supermarket: txt(i.supermarket, SUPERMARKET_MAX),
      qty: clampQty(i.qty), checked: !!i.checked, created_at: Number(i.created_at) || now() })).filter(i => i.name);
    const seen = new Set(), products = [];
    for(const p of Array.isArray(d.products) ? d.products : []){
      const id = Number(p.id), rec = cleanProduct(p);
      if(!Number.isInteger(id) || id < 1 || !rec.name || !rec.code || seen.has(rec.code)) continue;
      seen.add(rec.code); products.push({ ...rec, id });
    }
    const ids = new Set(products.map(p => p.id));
    const prices = (Array.isArray(d.prices) ? d.prices : []).map(p => ({
      id: txt(p.id, 32) || hex(12), product_id: Number(p.product_id), supermarket: txt(p.supermarket, SUPERMARKET_MAX),
      price: clampPrice(p.price), updated_at: Number(p.updated_at) || 0 }))
      .filter(p => ids.has(p.product_id) && p.supermarket && p.price > 0);
    const photos = new Map();
    for(const [k, v] of Object.entries(d.photos || {})){
      const id = Number(k), blob = photoBlob(v);
      if(ids.has(id) && blob) photos.set(id, blob);
    }
    products.forEach(p => { if(p.img_url === "photo" && !photos.has(p.id)){ p.img_url = ""; p.photo_v = ""; } });
    return { settings: cleanSettings(d.settings || {}), items, products, prices, photos };
  }

  /* mode 'replace': this device ends up exactly like the file.
     mode 'merge': foods and recipes are matched by barcode/code and the most recently
     changed copy wins; prices by product + shop, the newer one wins; list lines and
     shops that are missing are added. Nothing on this device is deleted. */
  async function importAll(d, mode){
    const x = parseExport(d);
    photoUrls.forEach(u => URL.revokeObjectURL(u.url)); photoUrls.clear();
    if(mode === "replace"){
      await run(DB.STORES, "readwrite", async (s) => {
        await Promise.all(DB.STORES.map(n => req(s(n).clear())));
        await req(s("settings").put(x.settings, "settings"));
        await Promise.all([
          ...x.items.map(i => req(s("items").put(i))),
          ...x.products.map(p => req(s("products").put(p))),
          ...x.prices.map(p => req(s("prices").put(p))),
          ...[...x.photos].map(([id, b]) => req(s("photos").put(b, id))),
        ]);
      });
      return { products: x.products.length, items: x.items.length, prices: x.prices.length };
    }
    if(mode !== "merge") fail(400, "Pick replace or merge");
    return run(DB.STORES, "readwrite", async (s) => {
      const st = cleanSettings((await req(s("settings").get("settings"))) || {});
      st.supermarkets = cleanSettings({ supermarkets: st.supermarkets.concat(x.settings.supermarkets) }).supermarkets;
      await req(s("settings").put(st, "settings"));
      const map = new Map();   // id in the file → id here
      let added = 0, updated = 0;
      const fresh = [];
      for(const p of x.products){
        const have = await req(s("products").index("code").get(p.code));
        const { id: fileId, ...rec } = p;
        if(have){
          map.set(fileId, have.id);
          if(rec.updated_at > (have.updated_at || 0)){
            await req(s("products").put({ ...rec, id: have.id }));
            await req(s("photos").delete(have.id));
            if(x.photos.has(fileId)) await req(s("photos").put(x.photos.get(fileId), have.id));
            updated++;
          }
        } else {
          const id = await req(s("products").add(rec));
          map.set(fileId, id); fresh.push(id);
          if(x.photos.has(fileId)) await req(s("photos").put(x.photos.get(fileId), id));
          added++;
        }
      }
      // A recipe copy's code names its source food's id: point it at the new id.
      for(const id of fresh){
        const r = await req(s("products").get(id));
        const m = /^recipe-(\d+)-(.+)$/.exec(r.code);
        if(m && map.has(Number(m[1])) && map.get(Number(m[1])) !== Number(m[1])){
          const code = RECIPE_COPY + map.get(Number(m[1])) + "-" + m[2];
          if(!(await req(s("products").index("code").get(code)))){ r.code = code; await req(s("products").put(r)); }
        }
      }
      let prices = 0;
      for(const p of x.prices){
        const pid = map.get(p.product_id);
        const have = (await req(s("prices").index("product_id").getAll(pid))).find(q => q.supermarket === p.supermarket);
        if(have && have.updated_at >= p.updated_at) continue;
        await req(s("prices").put({ ...p, id: have ? have.id : p.id, product_id: pid })); prices++;
      }
      let items = 0;
      for(const i of x.items){
        if(await req(s("items").get(i.id))) continue;
        await req(s("items").add(i)); items++;
      }
      return { added, updated, prices, items };
    });
  }

  /* ─────────── Router ─────────── */
  const routes = [
    ["GET", /^\/api\/items$/, () => listItems()],
    ["POST", /^\/api\/items$/, (m, b) => addItem(b)],
    ["POST", /^\/api\/items\/clear-checked$/, () => clearChecked()],
    ["PATCH", /^\/api\/items\/([^/]+)$/, (m, b) => updateItem(decodeURIComponent(m[1]), b)],
    ["DELETE", /^\/api\/items\/([^/]+)$/, (m) => deleteItem(decodeURIComponent(m[1]))],
    ["GET", /^\/api\/products$/, () => listProducts()],
    ["POST", /^\/api\/products\/custom$/, (m, b) => addCustom(b)],
    ["POST", /^\/api\/products\/as-recipe$/, (m, b) => asRecipe(b)],
    ["POST", /^\/api\/products\/to-list$/, (m, b) => toList(b)],
    ["PATCH", /^\/api\/products\/(\d+)$/, (m, b) => updateProduct(Number(m[1]), b)],
    ["DELETE", /^\/api\/products\/(\d+)$/, (m) => deleteProduct(Number(m[1]))],
    ["POST", /^\/api\/products\/(\d+)\/prices$/, (m, b) => setPrice(Number(m[1]), b)],
    ["DELETE", /^\/api\/prices\/([^/]+)$/, (m) => deletePrice(decodeURIComponent(m[1]))],
    ["GET", /^\/api\/off\/search$/, (m, b, q) => offSearch(q.get("q"), q.get("page"))],
    ["POST", /^\/api\/off\/add$/, (m, b) => offAdd(b)],
    ["GET", /^\/api\/off\/product\/([^/]+)$/, (m) => offLookup(decodeURIComponent(m[1]))],
    ["GET", /^\/api\/settings$/, () => getSettings()],
    ["PUT", /^\/api\/settings$/, (m, b) => putSettings(b)],
  ];

  async function api(path, opts = {}){
    const method = (opts.method || "GET").toUpperCase();
    const [p, qs] = String(path).split("?");
    let body = {};
    if(opts.body){ try { body = JSON.parse(opts.body) || {}; } catch(e){ fail(400, "Bad request"); } }
    for(const [m, re, fn] of routes){
      const hit = method === m && re.exec(p);
      if(hit) return fn(hit, body, new URLSearchParams(qs || ""));
    }
    fail(404, "Not found");
  }

  window.api = api;
  window.macrocart = { offImg, exportAll, importAll, getSettings, putSettings };
})();
