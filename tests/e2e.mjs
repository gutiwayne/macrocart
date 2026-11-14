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
  await page.goto(URL_);
  return page;
}
const step = (s) => console.log("•", s);
const api = (page, p, opts) => page.evaluate(([p, o]) => window.api(p, o), [p, opts || {}]);
const tab = (page, name) => page.click(`.tab-btn[data-tab="${name}"]`);

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
  await page.fill("#manBrand", "Butcher");
  await page.fill("#manCode", "1234567890123");
  await page.fill("#manKcal", "110"); await page.fill("#manP", "23,5"); await page.fill("#manC", "0"); await page.fill("#manF", "1.5");
  await page.click("#manSave");
  await page.waitForSelector("#catBoard .col:nth-child(1) .tile-name:text('Chicken breast')");

  step("duplicate barcode is refused");
  await assert.rejects(api(page, "/api/products/custom", { method: "POST",
    body: JSON.stringify({ name: "Dup", code: "1234567890123" }) }), /already on the board/);

  step("price and send to the list");
  await page.click("#catBoard .tile-info");
  await page.fill("#cmSup", "Market"); await page.fill("#cmPrice", "4.2");
  await page.click("#cmAddPrice");
  await page.waitForSelector("#cmPrices .cm-price");
  await page.click("#cmClose");
  await page.click("#catBoard .tile");
  await page.click("#selAdd");
  await page.waitForSelector("#catBoard .tile-badge");

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
  assert.equal(Object.keys(data.photos).length, 1);
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
  assert.equal((await api(p2, "/api/items")).length, 2);

  step("import 'merge' of the same file adds nothing");
  await api(p2, "/api/products/custom", { method: "POST", body: JSON.stringify({ name: "Rice", c: "78" }) });
  const merged = await p2.evaluate((d) => window.macrocart.importAll(d, "merge"), data);
  assert.equal(merged.added, 0);
  assert.equal((await api(p2, "/api/products")).items.length, 4);

  step("merge into the first device picks up Rice");
  const back = await p2.evaluate(() => window.macrocart.exportAll());
  const m1 = await page.evaluate((d) => window.macrocart.importAll(d, "merge"), back);
  assert.equal(m1.added, 1);

  step("works offline once loaded");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await tab(page, "list");
  await page.waitForSelector(".lst-card .lst-name:text('Milk')");
  await ctx.setOffline(false);

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
