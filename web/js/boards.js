/* ═══════════ Foods and Recipes tabs: three-column boards ═══════════
   Also owns tab switching. After adding to the list it fires "macrocart:refresh". */
(() => {
  const CATS = [["protein", "Protein"], ["carbs", "Carbs"], ["fat", "Fat"]];
  const CAT_LABEL = Object.fromEntries(CATS);

  let items = [], supers = [], current = null;
  const selected = new Set();   // Foods: several cards
  let recSel = null;            // Recipes: one card → View / Edit / Remove

  /* Tabs */
  const TABS = ["list", "foods", "recipes"];
  function switchTab(name){
    if(!TABS.includes(name)) name = "list";
    $$(".tab-btn").forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
    $$(".tab-panel").forEach(p => p.classList.toggle("is-active", p.id === "panel-" + name));
    try { localStorage.setItem("macrocart.tab", name); } catch(e){}
    if(name === "foods" || name === "recipes") load();
  }
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab-btn"); if(b) switchTab(b.dataset.tab);
  });

  /* Board */
  const cheapest = (it) => it.prices.length ? it.prices[0] : null;   // the server sorts by price
  const starsHtml = (r) => r ? '<span class="stars" aria-label="' + r + ' of 5">' +
    "★".repeat(r) + '<span class="off">' + "★".repeat(5 - r) + "</span></span>" : "";

  function macroBar(m){
    const kp = m.p * 4, kc = m.c * 4, kf = m.f * 9, t = kp + kc + kf;
    if(!t) return '<div class="macro-bar"></div>';
    const seg = (v, c) => '<span style="width:' + (v / t * 100).toFixed(1) + '%;background:var(' + c + ')"></span>';
    return '<div class="macro-bar" title="Calories from protein · carbs · fat">' +
      seg(kp, "--cat-protein") + seg(kc, "--cat-carbs") + seg(kf, "--cat-fat") + "</div>";
  }

  function visible(){
    const q = $("#catSearch").value.trim().toLowerCase();
    const sup = $("#catSuper").value.toLowerCase();
    const fav = $("#catFavOnly").checked;
    return items.filter(it =>
      !it.hidden && it.kind === "product" &&
      (!q || (it.name + " " + it.brand).toLowerCase().includes(q)) &&
      (!fav || it.favorite) &&
      (!sup || it.brand.toLowerCase() === sup || it.prices.some(p => p.supermarket.toLowerCase() === sup)));
  }

  function sorted(list, sortSel){
    const name = (a, b) => a.name.localeCompare(b.name);
    const cmp = {
      name,
      rating:  (a, b) => (b.favorite - a.favorite) || (b.rating - a.rating) || name(a, b),
      protein: (a, b) => (b.per100.p - a.per100.p) || name(a, b),
      kcal:    (a, b) => (a.per100.kcal - b.per100.kcal) || name(a, b),
      price:   (a, b) => {
        const pa = cheapest(a), pb = cheapest(b);
        return (pa ? pa.price : Infinity) - (pb ? pb.price : Infinity) || name(a, b);
      },
    }[$(sortSel || "#catSort").value] || name;
    return list.slice().sort(cmp);
  }

  function tile(it, recipe){
    const m = it.per100, best = cheapest(it), on = recipe ? recSel === it.id : selected.has(it.id);
    const key = it.category === "protein" ? ["P", m.p] : it.category === "fat" ? ["F", m.f] : ["C", m.c];
    const img = it.img
      ? '<img class="tile-img" loading="lazy" src="' + esc(it.img_src) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="tile-img ph" aria-hidden="true">🥫</span>';
    return '<div class="tile' + (on ? " sel" : "") + '" role="button" tabindex="0" aria-pressed="' + on +
      '" data-id="' + it.id + '" title="' + esc(it.name) + '">' + img +
      '<span class="tile-check" aria-hidden="true">✓</span>' +
      '<button class="tile-info" type="button" data-info="' + it.id + '" aria-label="Details of ' + esc(it.name) + '">ⓘ</button>' +
      (it.in_list ? '<span class="tile-badge">In list</span>' : "") +
      (it.favorite ? '<span class="tile-fav" aria-label="Favourite">♥</span>' : "") +
      '<div class="tile-body">' +
        '<span class="tile-name">' + esc(it.name) + "</span>" +
        (it.brand ? '<span class="tile-brand">' + esc(it.brand) + "</span>" : "") +
        macroBar(m) +
        '<span class="tile-macro"><b>' + key[0] + " " + num(key[1]) + " g</b> · " + num(m.kcal) + " kcal" +
          (it.unit === "serving" ? " / serving" : "") + "</span>" +
        ((it.rating || best) ? '<span class="tile-foot">' + starsHtml(it.rating) +
          (best ? '<span class="price-badge">' + money(best.price) + " " + esc(best.supermarket) + "</span>" : "") + "</span>" : "") +
      "</div></div>";
  }

  function boardHtml(list, recipe, sortSel){
    return CATS.map(([k, l]) => {
      const g = sorted(list.filter(i => i.category === k), sortSel);
      return '<section class="col" style="--c:var(--cat-' + k + ')"><div class="col-head">' + l +
        " <small>" + g.length + '</small></div><div class="col-list">' +
        (g.length ? g.map(i => tile(i, recipe)).join("") : '<div class="col-empty">Nothing here</div>') + "</div></section>";
    }).join("");
  }

  function render(){
    const list = visible();
    $("#catBoard").innerHTML = boardHtml(list, false, "#catSort");
    const hint = $("#catHint");
    hint.hidden = list.length > 0;
    if(!list.length) hint.textContent = items.some(i => i.kind === "product") ? "No product matches the filter." :
      "No products yet. Use “Search the internet”, “Scan” or “New food”.";
    renderSel();
    renderRecipes();
  }

  function renderRecipes(){
    const q = $("#recSearch").value.trim().toLowerCase();
    const recs = items.filter(i => i.kind === "recipe" && !i.hidden &&
      (!q || (i.name + " " + i.brand).toLowerCase().includes(q)));
    if(recSel !== null && !recs.some(i => i.id === recSel)) recSel = null;
    $("#recBoard").innerHTML = recs.length ? boardHtml(recs, true, "#recSort") : "";
    const hint = $("#recHint");
    hint.hidden = recs.length > 0;
    if(!recs.length) hint.textContent = q ? "No recipe matches." :
      "No recipes yet. Use “New recipe”, or pick foods and “Add as recipe”.";
    renderRecBar();
  }

  function renderSel(){
    const n = selected.size;
    $("#selBar").hidden = !n;
    $("#selCount").textContent = n + " selected";
    $("#selEdit").hidden = n !== 1;
    const allFav = n > 0 && items.filter(i => selected.has(i.id)).every(i => i.favorite);
    $("#selFav").textContent = allFav ? "♡ Unfavourite" : "♥ Favourite";
  }
  function renderRecBar(){
    const it = recSel === null ? null : items.find(i => i.id === recSel);
    $("#recBar").hidden = !it;
    if(it) $("#recSelName").textContent = it.name;
  }
  function recToggle(id){
    recSel = recSel === id ? null : id;
    $$("#recBoard .tile").forEach(el => {
      const on = Number(el.dataset.id) === recSel;
      el.classList.toggle("sel", on); el.setAttribute("aria-pressed", on);
    });
    renderRecBar();
  }

  async function load(){
    let data;
    try { data = await api("/api/products"); }
    catch(e){ toast("Could not load the foods"); return; }
    items = data.items; supers = data.supermarkets;
    const ids = new Set(items.map(i => i.id));
    [...selected].forEach(id => { if(!ids.has(id)) selected.delete(id); });
    const sel = $("#catSuper"), keep = sel.value;
    sel.innerHTML = '<option value="">All shops</option>' +
      supers.map(s => '<option value="' + esc(s) + '">' + esc(s) + "</option>").join("");
    sel.value = supers.includes(keep) ? keep : "";
    shopOptions($("#cmSup"), supers, "Shop…");
    render();
    if(current){ const it = items.find(i => i.id === current.id); if(it){ current = it; renderModal(); } }
  }

  function toggle(id){
    selected.has(id) ? selected.delete(id) : selected.add(id);
    const el = document.querySelector('.tile[data-id="' + id + '"]');
    if(el){ const on = selected.has(id); el.classList.toggle("sel", on); el.setAttribute("aria-pressed", on); }
    renderSel();
  }

  async function addSelected(){
    if(!selected.size) return;
    const btn = $("#selAdd"); btn.disabled = true;
    try {
      const r = await api("/api/products/to-list", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      const parts = [];
      if(r.added) parts.push(r.added + " added");
      if(r.updated) parts.push(r.updated + " already there (+1)");
      toast(parts.join(", ") || "Nothing to add");
      selected.clear();
      window.dispatchEvent(new Event("macrocart:refresh"));
      await load();
    } catch(e){ toast(e.message); }
    finally { btn.disabled = false; }
  }

  /* Product card (dialog) */
  function renderModal(){
    const it = current, m = it.per100, u = it.unit === "serving" ? "serving" : "100 g";
    const img = $("#cmImg");
    img.hidden = !it.img;
    if(it.img) img.src = it.img_src;
    $("#cmKind").value = it.kind;
    $("#cmPriceBox").hidden = it.kind === "recipe";
    $("#cmName").textContent = it.name;
    $("#cmBrand").textContent = (it.brand ? it.brand + " · " : "") + "per " + u;
    $("#cmMacros").innerHTML =
      "<div><b>" + num(m.kcal) + "</b>kcal</div><div><b>" + num(m.p) + "</b>protein</div>" +
      "<div><b>" + num(m.c) + "</b>carbs</div><div><b>" + num(m.f) + "</b>fat</div>";
    $("#cmCat").innerHTML = '<option value="">Automatic (' + CAT_LABEL[it.auto_category] + ")</option>" +
      CATS.map(([k, l]) => '<option value="' + k + '">' + l + "</option>").join("");
    $("#cmCat").value = it.manual_category;
    $("#cmStars").innerHTML = [1,2,3,4,5].map(n =>
      '<button type="button" data-star="' + n + '" class="' + (n <= it.rating ? "on" : "") +
      '" aria-label="' + n + ' stars">★</button>').join("");
    $("#cmFav").checked = it.favorite;
    if(document.activeElement !== $("#cmNotes")) $("#cmNotes").value = it.notes;
    $("#cmPrices").innerHTML = it.prices.length ? it.prices.map((p, i) =>
      '<div class="cm-price"><span class="s">' + esc(p.supermarket) +
      (i === 0 && it.prices.length > 1 ? ' <span class="best">cheapest</span>' : "") +
      "</span><b>" + money(p.price) + '</b><button type="button" data-delprice="' + esc(p.id) +
      '" title="Remove price" aria-label="Remove price">×</button></div>').join("")
      : '<p class="hint">No prices yet.</p>';
  }
  function openModal(id){
    current = items.find(i => i.id === id);
    if(!current) return;
    // If the brand is a known shop, suggest it.
    const bs = supers.find(s => s.toLowerCase() === current.brand.toLowerCase());
    $("#cmSup").value = bs && !current.prices.length ? bs : "";
    $("#cmPrice").value = "";
    renderModal();
    $("#catBack").hidden = false;
  }
  function closeModal(){ $("#catBack").hidden = true; current = null; }

  async function patch(body){
    if(!current) return;
    try { await api("/api/products/" + current.id, { method: "PATCH", body: JSON.stringify(body) }); }
    catch(e){ toast(e.message); }
    await load();
  }

  /* Events */
  ["#catSearch", "#catSuper", "#catSort", "#catFavOnly"].forEach(s =>
    $(s).addEventListener(s === "#catSearch" ? "input" : "change", render));
  $("#catBoard").addEventListener("click", (e) => {
    const info = e.target.closest("[data-info]");
    if(info){ openModal(Number(info.dataset.info)); return; }
    const t = e.target.closest(".tile"); if(t) toggle(Number(t.dataset.id));
  });
  $("#catBoard").addEventListener("keydown", (e) => {
    if(e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest(".tile");
    if(t && e.target === t){ e.preventDefault(); toggle(Number(t.dataset.id)); }
  });
  $("#selAdd").addEventListener("click", addSelected);
  // ♥: marks the picked foods as favourites; if they all already are, unmarks them.
  $("#selFav").addEventListener("click", async () => {
    const pick = items.filter(i => selected.has(i.id)); if(!pick.length) return;
    const fav = !pick.every(i => i.favorite), btn = $("#selFav"); btn.disabled = true;
    try {
      for(const it of pick)
        await api("/api/products/" + it.id, { method: "PATCH", body: JSON.stringify({ favorite: fav }) });
      toast(pick.length + (fav ? " marked as favourite" : " removed from favourites"));
      selected.clear(); await load();
    } catch(e){ toast(e.message); }
    finally { btn.disabled = false; }
  });
  $("#selEdit").addEventListener("click", () => {
    const it = items.find(i => i.id === [...selected][0]); if(it) openManual({}, it);
  });
  // Copies the picked foods to Recipes; the foods stay on the board.
  $("#selRec").addEventListener("click", async () => {
    if(!selected.size) return;
    const btn = $("#selRec"); btn.disabled = true;
    try {
      const r = await api("/api/products/as-recipe", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      const parts = [];
      if(r.added) parts.push(r.added + " copied to Recipes");
      if(r.skipped) parts.push(r.skipped + " already in Recipes");
      toast(parts.join(", ") || "Nothing to copy");
      selected.clear();
      await load();
    } catch(e){ toast(e.message); }
    finally { btn.disabled = false; }
  });
  $("#selDel").addEventListener("click", () => {
    const pick = items.filter(i => selected.has(i.id)); if(!pick.length) return;
    confirmDelete(pick.length === 1 ? "Delete this food?" : "Delete " + pick.length + " foods?",
      (pick.length === 1 ? "“" + pick[0].name + "”" : pick.map(i => "“" + i.name + "”").join(", ")) +
      " will be deleted with its rating, notes and prices. This cannot be undone.", pick, () => selected.clear());
  });

  /* Recipes board */
  $("#recSearch").addEventListener("input", renderRecipes);
  $("#recSort").addEventListener("change", renderRecipes);
  $("#recBoard").addEventListener("click", (e) => {
    const info = e.target.closest("[data-info]");
    if(info){ openModal(Number(info.dataset.info)); return; }
    const t = e.target.closest(".tile"); if(t) recToggle(Number(t.dataset.id));
  });
  $("#recBoard").addEventListener("keydown", (e) => {
    if(e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest(".tile");
    if(t && e.target === t){ e.preventDefault(); recToggle(Number(t.dataset.id)); }
  });
  $("#recSelView").addEventListener("click", () => { if(recSel !== null) openModal(recSel); });
  $("#recSelEdit").addEventListener("click", () => { const it = items.find(i => i.id === recSel); if(it) openRecipe(it); });
  $("#recSelDel").addEventListener("click", () => {
    const it = items.find(i => i.id === recSel); if(!it) return;
    confirmDelete("Remove this recipe?", "“" + it.name + "” will be deleted. This cannot be undone.", [it],
      () => { recSel = null; });
  });

  /* Delete confirmation */
  let delPending = null;
  function confirmDelete(title, text, list, after){
    delPending = { list, after };
    $("#delTitle").textContent = title;
    $("#delText").textContent = text;
    $("#delBack").hidden = false;
    $("#delNo").focus();
  }
  function delClose(){ $("#delBack").hidden = true; delPending = null; }
  $("#delNo").addEventListener("click", delClose);
  $("#delBack").addEventListener("click", (e) => { if(e.target.id === "delBack") delClose(); });
  $("#delYes").addEventListener("click", async () => {
    if(!delPending) return;
    const { list, after } = delPending, btn = $("#delYes");
    btn.disabled = true;
    try {
      for(const it of list) await api("/api/products/" + it.id, { method: "DELETE" });
      toast(list.length === 1 ? "“" + list[0].name + "” deleted" : list.length + " deleted");
      if(after) after();
      delClose();
    } catch(e){ toast(e.message); }
    finally { btn.disabled = false; await load(); }
  });
  $("#cmClose").addEventListener("click", closeModal);
  $("#catBack").addEventListener("click", (e) => { if(e.target.id === "catBack") closeModal(); });
  $("#cmCat").addEventListener("change", (e) => patch({ category: e.target.value }));
  $("#cmKind").addEventListener("change", (e) => { if(current) selected.delete(current.id); patch({ kind: e.target.value }); });
  $("#cmFav").addEventListener("change", (e) => patch({ favorite: e.target.checked }));
  $("#cmStars").addEventListener("click", (e) => {
    const b = e.target.closest("[data-star]"); if(!b || !current) return;
    const n = Number(b.dataset.star);
    patch({ rating: n === current.rating ? 0 : n });   // tapping the same star clears it
  });
  $("#cmNotes").addEventListener("change", (e) => patch({ notes: e.target.value }));
  shopBind($("#cmSup"));
  $("#cmAddPrice").addEventListener("click", async () => {
    if(!current) return;
    const body = { supermarket: $("#cmSup").value.trim(), price: $("#cmPrice").value };
    try { await api("/api/products/" + current.id + "/prices", { method: "POST", body: JSON.stringify(body) }); }
    catch(e){ toast(e.message); return; }
    $("#cmPrice").value = "";
    await load();
  });
  $("#cmPrices").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-delprice]"); if(!b) return;
    try { await api("/api/prices/" + encodeURIComponent(b.dataset.delprice), { method: "DELETE" }); }
    catch(err){ toast(err.message); return; }
    await load();
  });

  /* A photo that does not load: in the search, try the product page photo; otherwise an icon. */
  const placeholder = (img, cls) => {
    const ph = document.createElement("span");
    ph.className = cls; ph.setAttribute("aria-hidden", "true"); ph.textContent = "🥫";
    img.replaceWith(ph);
  };
  $("#catBoard").addEventListener("error", (e) => {
    if(e.target.tagName === "IMG") placeholder(e.target, "tile-img ph");
  }, true);
  $("#cmImg").addEventListener("error", () => { $("#cmImg").hidden = true; });

  /* Internet search (Open Food Facts) */
  let offItems = [], offOpenCode = null, offPage = 1, offPages = 1, offQuery = "";
  function offCard(it){
    const m = it.per100, open = offOpenCode === it.code;
    const src = it.img_small || it.img;
    return '<div class="off-item' + (open ? " open" : "") + '" data-code="' + esc(it.code) + '">' +
      (src ? '<img loading="lazy" src="' + esc(src) + '" alt="" referrerpolicy="no-referrer">'
        : '<img loading="lazy" alt="" referrerpolicy="no-referrer" data-fb="1" data-need="1">') +
      '<div class="tile-body">' +
        '<span class="tile-name">' + esc(it.name) + "</span>" +
        ((it.brand || it.quantity) ? '<span class="tile-brand">' + esc([it.brand, it.quantity].filter(Boolean).join(" · ")) + "</span>" : "") +
        macroBar(m) +
        '<span class="tile-macro">' + num(m.kcal) + " kcal · P " + num(m.p) + " · C " + num(m.c) + " · F " + num(m.f) + "</span>" +
      "</div>" +
      (it.added ? '<div class="off-added">✓ Added</div>' : open ? '<div class="off-pick">' + CATS.map(([k, l]) =>
        '<button type="button" data-addcat="' + k + '" style="--c:var(--cat-' + k + ')" class="' +
        (k === it.auto_category ? "sug" : "") + '">' + l + "</button>").join("") + "</div>" : "") +
      "</div>";
  }
  function offFallback(img){
    const code = img.closest(".off-item").dataset.code;
    macrocart.offImg(code).then(u => { if(u && u !== img.src) img.src = u; else placeholder(img, "ph"); });
  }
  function offRender(){
    $("#offList").innerHTML = offItems.map(offCard).join("");
    $$("#offList img[data-need]").forEach(offFallback);
  }
  async function offSearch(more){
    if(!more){ offQuery = $("#offQ").value.trim(); offPage = 1; offItems = []; offOpenCode = null; } else offPage++;
    if(offQuery.length < 2){ $("#offHint").textContent = "Type at least 2 letters."; return; }
    $("#offHint").textContent = "Searching Open Food Facts…";
    $("#offGo").disabled = true; $("#offMore").hidden = true;
    try {
      const d = await api("/api/off/search?q=" + encodeURIComponent(offQuery) + "&page=" + offPage);
      offItems = offItems.concat(d.items); offPages = d.page_count || 1;
      $("#offHint").textContent = offItems.length ? offItems.length + " internet results." : "No results on Open Food Facts.";
      $("#offMore").hidden = !d.items.length || offPage >= offPages;
    } catch(e){ $("#offHint").textContent = e.message; if(more) offPage--; }
    finally { $("#offGo").disabled = false; }
    offRender();
  }
  $("#offList").addEventListener("error", (e) => {
    const img = e.target; if(img.tagName !== "IMG") return;
    if(!img.dataset.fb){ img.dataset.fb = "1"; offFallback(img); }
    else if(img.isConnected) placeholder(img, "ph");
  }, true);
  $("#offOpen").addEventListener("click", () => { $("#offBack").hidden = false; $("#offQ").focus(); });
  $("#offClose").addEventListener("click", () => { $("#offBack").hidden = true; });
  $("#offBack").addEventListener("click", (e) => { if(e.target.id === "offBack") $("#offBack").hidden = true; });
  $("#offForm").addEventListener("submit", (e) => { e.preventDefault(); offSearch(false); });
  $("#offMore").addEventListener("click", () => offSearch(true));
  $("#offList").addEventListener("click", async (e) => {
    const card = e.target.closest(".off-item"); if(!card) return;
    const it = offItems.find(i => i.code === card.dataset.code); if(!it || it.added) return;
    const b = e.target.closest("[data-addcat]");
    if(!b){ offOpenCode = offOpenCode === it.code ? null : it.code; offRender(); return; }
    b.disabled = true;
    try {
      const r = await api("/api/off/add", { method: "POST", body: JSON.stringify({ code: it.code, category: b.dataset.addcat }) });
      it.added = true; offOpenCode = null;
      toast("“" + r.name + "” added to " + CAT_LABEL[r.category]);
      offRender();
      load();
    } catch(err){ toast(err.message); b.disabled = false; }
  });
  $("#offManual").addEventListener("click", () => {
    $("#offBack").hidden = true;
    openManual({ name: $("#offQ").value.trim() });
  });

  /* Barcode scanner: the browser's own BarcodeDetector when it reads EAN-13,
     otherwise the bundled ZXing WebAssembly ponyfill (vendor/), loaded on first use.
     The Android app uses its native ZXing scanner instead (nativeScan below). */
  const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];
  let detectorP = null, scanStream = null, scanTimer = null;
  function loadScript(src){
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => ko(new Error("Could not load the scanner."));
      document.head.appendChild(s);
    });
  }
  async function makeDetector(){
    if("BarcodeDetector" in window){
      try {
        const have = await window.BarcodeDetector.getSupportedFormats();
        if(have.includes("ean_13")) return new window.BarcodeDetector({ formats: SCAN_FORMATS.filter(f => have.includes(f)) });
      } catch(e){}
    }
    if(!window.BarcodeDetectionAPI) await loadScript("vendor/barcode-detector.js");
    const lib = window.BarcodeDetectionAPI;
    await lib.prepareZXingModule({
      overrides: { locateFile: (path, prefix) => path.endsWith(".wasm") ? new URL("vendor/" + path, location.href).href : prefix + path },
      fireImmediately: true,
    });
    return new lib.BarcodeDetector({ formats: SCAN_FORMATS });
  }
  /* A plain barcode, or the GTIN inside a GS1 Digital Link QR (…/01/<gtin>…). */
  function toBarcode(raw){
    raw = String(raw || "").trim();
    if(/^\d{4,20}$/.test(raw)) return raw;
    const m = raw.match(/\/01\/(\d{8,14})(?:[/?#]|$)/);
    return m ? m[1].replace(/^0+(?=\d{13}$)/, "") : "";
  }
  function scanStop(){
    clearTimeout(scanTimer); scanTimer = null;
    if(scanStream){ scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
    $("#scanVideo").srcObject = null;
  }
  function scanClose(){ scanStop(); $("#scanBack").hidden = true; }
  /* In the Android app the scan runs in a native ZXing screen; it answers through macrocartScanned. */
  const nativeScan = !!(window.MacrocartAndroid && window.MacrocartAndroid.scanBarcode);
  window.macrocartScanned = (raw) => {
    if($("#scanBack").hidden) return;
    if(raw == null){ $("#scanHint").textContent = "Scan cancelled. Type the barcode instead."; return; }
    const code = toBarcode(raw);
    if(code) lookup(code);
    else $("#scanHint").textContent = "That code is not a product barcode.";
  };
  async function scanOpen(){
    const v = $("#scanVideo"), hint = $("#scanHint");
    $("#scanCode").value = "";
    $("#scanBack").hidden = false;
    if(nativeScan){
      v.hidden = true; hint.textContent = "Opening the scanner…";
      window.MacrocartAndroid.scanBarcode();
      return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      v.hidden = true; hint.textContent = "The camera only works over HTTPS. Type the barcode instead."; return;
    }
    v.hidden = false; hint.textContent = "Starting the camera…";
    let det, stream;
    try {
      detectorP = detectorP || makeDetector().catch(e => { detectorP = null; throw e; });
      [det, stream] = await Promise.all([detectorP,
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })]);
    } catch(e){
      v.hidden = true;
      hint.textContent = (e.name === "NotAllowedError" ? "No permission to use the camera." :
        e.name === "NotFoundError" ? "No camera found." : e.message || "The camera is not available.") + " Type the barcode instead.";
      return;
    }
    if($("#scanBack").hidden){ stream.getTracks().forEach(t => t.stop()); return; }   // closed meanwhile
    scanStream = stream; v.srcObject = stream;
    try { await v.play(); } catch(e){}
    hint.textContent = "Looking for a barcode…";
    const tick = async () => {
      if(!scanStream) return;
      try {
        if(v.readyState >= 2){
          const found = await det.detect(v);
          const code = found.map(c => toBarcode(c.rawValue)).find(Boolean);
          if(code){ scanStop(); lookup(code); return; }
          if(found.length) hint.textContent = "That code is not a product barcode.";
        }
      } catch(e){}
      if(scanStream) scanTimer = setTimeout(tick, 200);
    };
    tick();
  }
  async function lookup(code){
    const hint = $("#scanHint");
    hint.textContent = "Looking up " + code + " on Open Food Facts…";
    let d;
    try { d = await api("/api/off/product/" + encodeURIComponent(code)); }
    catch(e){
      if(e.status === 404){ scanClose(); openManual({ code }); toast("Not on Open Food Facts: add it by hand"); }
      else hint.textContent = e.message;
      return;
    }
    scanClose();
    if(d.local){ await load(); openModal(d.id); toast("“" + d.name + "” is already on the board"); return; }
    offItems = [d.item]; offOpenCode = d.item.code; offPage = offPages = 1;
    $("#offQ").value = ""; $("#offMore").hidden = true;
    $("#offHint").textContent = "Barcode " + code + ": pick its column.";
    offRender();
    $("#offBack").hidden = false;
  }
  $("#scanOpen").addEventListener("click", scanOpen);
  $("#scanClose").addEventListener("click", scanClose);
  $("#scanBack").addEventListener("click", (e) => { if(e.target.id === "scanBack") scanClose(); });
  $("#scanForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = toBarcode($("#scanCode").value);
    if(!code){ $("#scanHint").textContent = "Type the digits under the barcode."; return; }
    scanStop(); lookup(code);
  });

  /* Food typed by hand (not on Open Food Facts) */
  let manEdit = null, manRating = 0, manPhoto = "";   // manEdit: food being edited, or null = new
  function manStars(){
    $("#manStars").innerHTML = [1,2,3,4,5].map(n =>
      '<button type="button" data-star="' + n + '" class="' + (n <= manRating ? "on" : "") +
      '" aria-label="' + n + ' stars">★</button>').join("");
  }
  shopBind($("#manBrand"));
  function openManual(pre = {}, it = null){
    $("#manForm").reset();
    manEdit = it; manRating = it ? it.rating : 0; manPhoto = ""; manStars();
    $("#manTitle").textContent = it ? "Edit food" : "New food";
    $("#manSave").textContent = it ? "Save changes" : "Save";
    $("#manPrev").hidden = true; $("#manPrev").removeAttribute("src");
    $("#manCode").disabled = !!it;   // the barcode cannot be changed
    $("#manName").value = it ? it.name : pre.name || "";
    $("#manCode").value = pre.code || "";
    shopOptions($("#manBrand"), it && it.brand ? supers.concat(it.brand) : supers, "—");
    $("#manBrand").value = it ? it.brand : "";
    if(it){
      $("#manKcal").value = it.per100.kcal; $("#manP").value = it.per100.p;
      $("#manC").value = it.per100.c; $("#manF").value = it.per100.f;
      $("#manCat").value = it.manual_category;
      $("#manFav").checked = it.favorite; $("#manNotes").value = it.notes;
      if(it.img){ $("#manPrev").src = it.img_src; $("#manPrev").hidden = false; }
    }
    $("#manBack").hidden = false;
    $("#manName").focus();
  }
  function closeManual(){ $("#manBack").hidden = true; }
  $("#manPhoto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    manPhoto = "";
    if(!f) return;
    try { manPhoto = await shrink(f); $("#manPrev").src = manPhoto; $("#manPrev").hidden = false; }
    catch(err){ e.target.value = ""; toast(err.message); }
  });
  $("#manStars").addEventListener("click", (e) => {
    const b = e.target.closest("[data-star]"); if(!b) return;
    const n = Number(b.dataset.star);
    manRating = manRating === n ? 0 : n; manStars();
  });
  $("#manOpen").addEventListener("click", () => openManual());
  $("#manClose").addEventListener("click", closeManual);
  $("#manBack").addEventListener("click", (e) => { if(e.target.id === "manBack") closeManual(); });
  $("#manForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = (s) => $(s).value.trim();
    const body = { name: val("#manName"), brand: val("#manBrand"), code: val("#manCode"),
      kcal: val("#manKcal"), p: val("#manP"), c: val("#manC"), f: val("#manF"), category: $("#manCat").value,
      rating: manRating, favorite: $("#manFav").checked, notes: $("#manNotes").value.trim() };
    if(manPhoto) body.photo = manPhoto;
    $("#manSave").disabled = true;
    try {
      if(manEdit){
        delete body.code;
        await api("/api/products/" + manEdit.id, { method: "PATCH", body: JSON.stringify(body) });
        closeManual(); toast("“" + body.name + "” saved");
        selected.clear(); load();
        return;
      }
      const r = await api("/api/products/custom", { method: "POST", body: JSON.stringify(body) });
      closeManual();
      toast("“" + r.name + "” added to " + CAT_LABEL[r.category]);
      load();
    } catch(err){ toast(err.message); }
    finally { $("#manSave").disabled = false; }
  });

  /* Recipe typed by hand (new or edit) */
  let rnEdit = null, rnRating = 0, rnPhoto = "";
  function rnStars(){
    $("#rnStars").innerHTML = [1,2,3,4,5].map(n =>
      '<button type="button" data-star="' + n + '" class="' + (n <= rnRating ? "on" : "") +
      '" aria-label="' + n + ' stars">★</button>').join("");
  }
  function openRecipe(it = null){
    $("#rnForm").reset();
    rnEdit = it; rnRating = it ? it.rating : 0; rnPhoto = ""; rnStars();
    $("#rnTitle").textContent = it ? "Edit recipe" : "New recipe";
    $("#rnSave").textContent = it ? "Save changes" : "Save recipe";
    $("#rnPrev").hidden = true; $("#rnPrev").removeAttribute("src");
    if(it){
      const m = it.per100;
      $("#rnName").value = it.name; $("#rnBrand").value = it.brand;
      $("#rnUnit").value = it.unit === "serving" ? "serving" : "g";
      $("#rnKcal").value = m.kcal; $("#rnP").value = m.p; $("#rnC").value = m.c; $("#rnF").value = m.f;
      $("#rnCat").value = it.manual_category; $("#rnFav").checked = it.favorite; $("#rnNotes").value = it.notes;
      if(it.img){ $("#rnPrev").src = it.img_src; $("#rnPrev").hidden = false; }
    }
    $("#rnBack").hidden = false;
    $("#rnName").focus();
  }
  function closeRecipe(){ $("#rnBack").hidden = true; }
  // Phone photos weigh several MB: shrink to 1200 px on the long side, JPEG, before sending.
  function shrink(file){
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement("canvas");
        cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        ok(cv.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Could not read the photo")); };
      im.src = url;
    });
  }
  $("#rnPhoto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    rnPhoto = "";
    if(!f) return;
    try { rnPhoto = await shrink(f); $("#rnPrev").src = rnPhoto; $("#rnPrev").hidden = false; }
    catch(err){ e.target.value = ""; toast(err.message); }
  });
  $("#rnStars").addEventListener("click", (e) => {
    const b = e.target.closest("[data-star]"); if(!b) return;
    const n = Number(b.dataset.star);
    rnRating = rnRating === n ? 0 : n; rnStars();
  });
  $("#rnOpen").addEventListener("click", () => openRecipe());
  $("#rnClose").addEventListener("click", closeRecipe);
  $("#rnBack").addEventListener("click", (e) => { if(e.target.id === "rnBack") closeRecipe(); });
  $("#rnForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = (s) => $(s).value.trim();
    const body = { name: val("#rnName"), brand: val("#rnBrand"), unit: $("#rnUnit").value,
      kcal: val("#rnKcal"), p: val("#rnP"), c: val("#rnC"), f: val("#rnF"), category: $("#rnCat").value,
      rating: rnRating, favorite: $("#rnFav").checked, notes: $("#rnNotes").value.trim() };
    if(rnPhoto) body.photo = rnPhoto;
    $("#rnSave").disabled = true;
    try {
      if(rnEdit){
        await api("/api/products/" + rnEdit.id, { method: "PATCH", body: JSON.stringify(body) });
        toast("“" + body.name + "” saved");
      } else {
        const r = await api("/api/products/custom", { method: "POST", body: JSON.stringify({ ...body, kind: "recipe" }) });
        toast("Recipe “" + r.name + "” added to " + CAT_LABEL[r.category]);
      }
      closeRecipe();
      load();
    } catch(err){ toast(err.message); }
    finally { $("#rnSave").disabled = false; }
  });
  $("#recBoard").addEventListener("error", (e) => {
    if(e.target.tagName === "IMG") placeholder(e.target, "tile-img ph");
  }, true);

  document.addEventListener("keydown", (e) => {
    if(e.key !== "Escape") return;
    if(!$("#delBack").hidden) delClose();
    else if(!$("#impBack").hidden) $("#impBack").hidden = true;
    else if(!$("#setBack").hidden) $("#setBack").hidden = true;
    else if(!$("#rnBack").hidden) closeRecipe();
    else if(!$("#scanBack").hidden) scanClose();
    else if(!$("#manBack").hidden) closeManual();
    else if(!$("#offBack").hidden) $("#offBack").hidden = true;
    else if(!$("#catBack").hidden) closeModal();
  });

  let saved = "list";
  try { saved = localStorage.getItem("macrocart.tab") || "list"; } catch(e){}
  if(saved !== "list") switchTab(saved);
})();
