// Browser test: serves web/ on localhost and drives it with Playwright (Chromium).
// Run: npm install --no-save playwright && npx playwright install chromium && node tests/e2e.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if(p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, path.normalize(p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f)){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const errors = [];
async function newPage(ctx){
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  // Anything the Content-Security-Policy blocks shows up as a console error.
  page.on("console", m => { if(/Content Security Policy/i.test(m.text())) errors.push("CSP: " + m.text()); });
  await page.goto(URL_);
  return page;
}
const step = (s) => console.log("•", s);
const api = (page, p, opts) => page.evaluate(([p, o]) => window.api(p, o), [p, opts || {}]);
const tab = (page, name) => page.click(`.tab-btn[data-tab="${name}"]`);
// page.waitForFunction re-evaluates its predicate as a string, which the page's CSP
// (no 'unsafe-eval') refuses; poll with page.evaluate instead.
async function until(page, fn, timeout = 10000){
  const end = Date.now() + timeout;
  while(!(await page.evaluate(fn))){
    if(Date.now() > end) throw new Error("timed out waiting for " + fn);
    await new Promise(r => setTimeout(r, 100));
  }
}

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await newPage(ctx);

  step("list: add a line");
  await page.fill("#name", "Milk");
  await page.click("#composer button[type=submit]");
  await page.waitForSelector(".lst-card .lst-name:text('Milk')");

  step("foods: new food by hand lands in Protein");
  await tab(page, "foods");
  await page.click("#manOpen");
  await page.fill("#manName", "Chicken breast");
  // Shop is a dropdown; "＋ Other…" asks for a new one and keeps it in Settings.
  page.once("dialog", d => d.accept("Butcher"));
  await page.selectOption("#manBrand", "__other");
  assert.equal(await page.inputValue("#manBrand"), "Butcher");
  await page.fill("#manCode", "1234567890123");
  await page.fill("#manKcal", "110"); await page.fill("#manP", "23,5"); await page.fill("#manC", "0"); await page.fill("#manF", "1.5");
  await page.click("#manSave");
  await page.waitForSelector("#catBoard .col:nth-child(1) .tile-name:text('Chicken breast')");

  step("duplicate barcode is refused");
  await assert.rejects(api(page, "/api/products/custom", { method: "POST",
    body: JSON.stringify({ name: "Dup", code: "1234567890123" }) }), /already on the board/);

  step("price and send to the list");
  await page.click("#catBoard .tile-info");
  page.once("dialog", d => d.accept("Market"));
  await page.selectOption("#cmSup", "__other");
  assert.equal(await page.inputValue("#cmSup"), "Market");
  await page.fill("#cmPrice", "4.2");
  await page.click("#cmAddPrice");
  await page.waitForSelector("#cmPrices .cm-price");
  await page.click("#cmClose");
  await page.click("#catBoard .tile");
  await page.click("#selAdd");
  await page.waitForSelector("#catBoard .tile-badge");
  await until(page, () => document.querySelector("#selBar").hidden);
  assert.ok((await api(page, "/api/settings")).supermarkets.includes("Butcher"));

  step("list: the shop dropdown filters (All = everything, a shop = only its lines)");
  await tab(page, "list");
  await page.waitForSelector("#lstSuper option[value='Market']", { state: "attached" });
  assert.equal(await page.inputValue("#lstSuper"), "");
  assert.equal(await page.locator(".lst-card").count(), 2);
  await page.selectOption("#lstSuper", "Market");
  assert.deepEqual(await page.locator(".lst-card .lst-name").allTextContents(), ["Chicken breast"]);
  await page.selectOption("#lstSuper", "Butcher");
  assert.equal(await page.locator(".lst-card").count(), 0);
  await page.selectOption("#lstSuper", "");
  assert.equal(await page.locator(".lst-card").count(), 2);
  await tab(page, "foods");

  step("edit a food: macros, photo, rating, favourite, notes");
  await page.click("#catBoard .tile");
  assert.equal(await page.locator("#selClear").count(), 0);
  await page.click("#selEdit");
  assert.equal(await page.inputValue("#manName"), "Chicken breast");
  assert.equal(await page.textContent("#manSave"), "Save changes");
  await page.fill("#manKcal", "120");
  await page.setInputFiles("#manPhoto", path.join(ROOT, "icons", "icon-192.png"));
  await page.waitForSelector("#manPrev:not([hidden])");
  await page.click("#manStars [data-star='4']");
  await page.check("#manFav");
  await page.fill("#manNotes", "Lean, buy on Mondays");
  await page.click("#manSave");
  await page.waitForSelector("#catBoard img.tile-img[src^='blob:']");
  const ed = (await api(page, "/api/products")).items.find(i => i.name === "Chicken breast");
  assert.equal(ed.per100.kcal, 120); assert.equal(ed.rating, 4); assert.equal(ed.favorite, true);
  assert.equal(ed.notes, "Lean, buy on Mondays"); assert.equal(ed.img, true); assert.equal(ed.prices.length, 1);

  step("favourite from the selection bar toggles");
  await api(page, "/api/products/" + ed.id, { method: "PATCH", body: JSON.stringify({ favorite: false }) });
  await page.reload(); await tab(page, "foods");
  await page.click("#catBoard .tile");
  assert.equal(await page.textContent("#selFav"), "♥ Favourite");
  await page.click("#selFav");
  await until(page, () => document.querySelector("#selBar").hidden);
  assert.equal((await api(page, "/api/products")).items.find(i => i.id === ed.id).favorite, true);

  step("recipe with a photo");
  await tab(page, "recipes");
  await page.click("#rnOpen");
  await page.fill("#rnName", "Lentil stew");
  await page.setInputFiles("#rnPhoto", path.join(ROOT, "icons", "icon-192.png"));
  await page.waitForSelector("#rnPrev:not([hidden])");
  await page.fill("#rnKcal", "650"); await page.fill("#rnP", "38");
  await page.click("#rnSave");
  await page.waitForSelector("#recBoard img.tile-img[src^='blob:']");

  step("copy a food as recipe (once)");
  const ids = (await api(page, "/api/products")).items.filter(i => i.kind === "product").map(i => i.id);
  assert.deepEqual(await api(page, "/api/products/as-recipe", { method: "POST", body: JSON.stringify({ ids }) }), { added: 1, skipped: 0 });
  assert.deepEqual(await api(page, "/api/products/as-recipe", { method: "POST", body: JSON.stringify({ ids }) }), { added: 0, skipped: 1 });

  step("settings");
  await page.click("#setOpen");
  await page.fill("#setSups", "Market, Corner shop");
  await page.click("#setSave");
  const st = await api(page, "/api/settings");
  assert.deepEqual(st.supermarkets, ["Market", "Corner shop"]);

  step("data survives a reload");
  await page.reload();
  const before = await api(page, "/api/products");
  assert.equal(before.items.length, 3);
  assert.equal((await api(page, "/api/items")).length, 2);

  step("export");
  await page.click("#setOpen");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#expBtn")]);
  const file = await dl.path();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(data.format, "macrocart");
  assert.equal(data.products.length, 3);
  assert.equal(Object.keys(data.photos).length, 2);
  assert.match(Object.values(data.photos)[0], /^data:image\/jpeg;base64,/);

  step("import 'replace' on a fresh device");
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await newPage(ctx2);
  await p2.click("#setOpen");
  await p2.setInputFiles("#impFile", file);
  await p2.waitForSelector("#impBack:not([hidden])");
  await Promise.all([p2.waitForEvent("load"), p2.click("#impReplace")]);
  const after = await api(p2, "/api/products");
  assert.equal(after.items.length, 3);
  assert.equal(after.items.find(i => i.name === "Lentil stew").img, true);
  assert.equal(after.items.find(i => i.name === "Chicken breast").prices[0].price, 4.2);
  assert.equal(after.items.find(i => i.name === "Chicken breast").img, true);
  assert.equal((await api(p2, "/api/items")).length, 2);

  step("import 'merge' of the same file adds nothing");
  await api(p2, "/api/products/custom", { method: "POST", body: JSON.stringify({ name: "Rice", c: "78" }) });
  const merged = await p2.evaluate((d) => window.macrocart.importAll(d, "merge"), data);
  assert.equal(merged.added, 0);
  assert.equal((await api(p2, "/api/products")).items.length, 4);

  step("import: a file that is not JSON is refused before anything changes");
  await p2.click("#setOpen");
  await p2.setInputFiles("#impFile", { name: "notes.json", mimeType: "application/json", buffer: Buffer.from("not json {") });
  await p2.waitForSelector("#toast:text('That file is not a macrocart export')");
  assert.equal(await p2.isHidden("#impBack"), true);
  await p2.click("#setClose");

  step("import: too many records is refused, nothing is written");
  const countBefore = (await api(p2, "/api/products")).items.length;
  const tooMany = { ...data, items: Array.from({ length: 5001 }, (_, i) => ({ name: "x" + i })) };
  await assert.rejects(p2.evaluate((d) => window.macrocart.importAll(d, "replace"), tooMany), /too many list lines/);
  assert.equal((await api(p2, "/api/products")).items.length, countBefore);
  assert.equal((await api(p2, "/api/items")).length, 2);

  step("import: a file over the size cap is refused");
  assert.deepEqual(await p2.evaluate(() => window.macrocart.importRoom(window.macrocart.IMPORT_MAX_BYTES + 1)), { ok: false, reason: "too big" });
  assert.deepEqual(await p2.evaluate(() => window.macrocart.importRoom(1024)), { ok: true });

  step("import: markup in names is shown as text, never run");
  const hostile = { ...data, items: [], prices: [], photos: {}, products: [{ id: 1, code: "9999999999999",
    name: '<img src=x onerror="window.__xss=1">Evil', nutrition: { proteins: 10 } }] };
  await p2.evaluate((d) => window.macrocart.importAll(d, "merge"), hostile);
  await p2.reload();
  await tab(p2, "foods");
  await p2.waitForSelector("#catBoard .tile-name:text('Evil')");
  assert.equal(await p2.evaluate(() => window.__xss), undefined);
  assert.equal(await p2.locator("#catBoard img[src='x']").count(), 0);
  const evil = (await api(p2, "/api/products")).items.find(i => i.name.includes("Evil"));
  await api(p2, "/api/products/" + evil.id, { method: "DELETE" });

  step("CSP: an injected inline script does not run");
  const seen = errors.length;
  await p2.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__inline = 1"; document.body.appendChild(s); });
  assert.equal(await p2.evaluate(() => window.__inline), undefined);
  await p2.waitForTimeout(200);
  errors.splice(seen);   // the violation just provoked is expected

  step("merge into the first device picks up Rice");
  const back = await p2.evaluate(() => window.macrocart.exportAll());
  const m1 = await page.evaluate((d) => window.macrocart.importAll(d, "merge"), back);
  assert.equal(m1.added, 1);

  step("works offline once loaded");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await until(page, () => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await tab(page, "list");
  await page.waitForSelector(".lst-card .lst-name:text('Milk')");
  await ctx.setOffline(false);

  step("language: Spanish and back; product names stay as they are");
  await page.click("#langBtn");
  await until(page, () => document.documentElement.lang === "es");
  assert.equal(await page.textContent("#langBtn"), "🌐 ES");
  assert.match(await page.textContent('.tab-btn[data-tab="foods"]'), /Alimentos/);
  assert.equal(await page.getAttribute("#name", "placeholder"), "Añade un producto…");
  await page.waitForSelector(".lst-card .lst-name:text('Milk')");
  await tab(page, "foods");
  await page.waitForSelector("#catBoard .tile-name:text('Chicken breast')");
  page.once("dialog", d => { assert.equal(d.message(), "Nombre del súper"); d.dismiss(); });
  await page.click("#catBoard .tile-info");
  await page.selectOption("#cmSup", "__other");
  await page.click("#cmClose");
  await page.click("#langBtn");
  await until(page, () => document.documentElement.lang === "en");
  assert.match(await page.textContent('.tab-btn[data-tab="foods"]'), /Foods/);

  step("Open Food Facts search (network; a failure is only a warning)");
  try {
    const r = await api(page, "/api/off/search?q=tuna&page=1");
    console.log("  OFF results:", r.items.length);
  } catch(e){ console.warn("  ::warning::OFF search failed:", e.message); }

  assert.deepEqual(errors, [], "page errors");
  console.log("All good");
} finally {
  await browser.close();
  server.close();
}
