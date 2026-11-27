/* ═══════════ List tab: photo cards ═══════════
   The photo is that of the product with the same name (img_src from /api/items).
   Reloads on the "macrocart:refresh" event, sent by the Foods tab. */
(() => {
  let items = [];
  let filterSuper = "";
  let knownShops = [];

  async function reload(){
    try { items = await api("/api/items"); } catch(e){ toast("Could not load the list"); return; }
    render();
  }

  function card(i){
    const img = i.img_src
      ? '<img class="lst-img" loading="lazy" src="' + esc(i.img_src) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="lst-img ph" aria-hidden="true">🛒</span>';
    return '<div class="lst-card' + (i.checked ? " done" : "") + '" data-id="' + esc(i.id) + '">' +
      '<button class="lst-hit" type="button" data-act="check" aria-pressed="' + i.checked +
        '" aria-label="' + (i.checked ? "Unmark " : "Mark bought: ") + esc(i.name) + '">' + img +
        '<span class="lst-check" aria-hidden="true">✓</span></button>' +
      '<button class="lst-del" type="button" data-act="del" aria-label="Delete ' + esc(i.name) + '">×</button>' +
      '<div class="lst-body">' +
        '<span class="lst-name">' + esc(i.name) + "</span>" +
        (i.supermarket ? '<span class="lst-super">' + esc(i.supermarket) + "</span>" : "") +
        '<div class="lst-qty">' +
          '<button type="button" data-act="minus" aria-label="Less">−</button>' +
          "<b>" + i.qty + "</b>" +
          '<button type="button" data-act="plus" aria-label="More">+</button>' +
        "</div>" +
      "</div></div>";
  }

  function render(){
    const supers = [...new Set(items.map(i => i.supermarket).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    shopOptions($("#lstSuper"), knownShops.concat(supers), "All");
    const fbox = $("#lstFilters");
    fbox.hidden = !supers.length;
    fbox.innerHTML = !supers.length ? "" :
      ['<button type="button" class="chip' + (filterSuper ? "" : " is-active") + '" data-super="">All</button>']
      .concat(supers.map(s => '<button type="button" class="chip' + (filterSuper === s ? " is-active" : "") +
        '" data-super="' + esc(s) + '">' + esc(s) + "</button>")).join("");

    const shown = items.filter(i => !filterSuper || i.supermarket === filterSuper)
      .sort((a, b) => (a.checked - b.checked) || (a.created_at - b.created_at));
    $("#lstGrid").innerHTML = shown.map(card).join("");
    $("#lstEmpty").hidden = items.length > 0;

    const done = items.filter(i => i.checked).length;
    $("#counter").textContent = done + " of " + items.length + " done";
    $("#lstFoot").hidden = done === 0;
    $("#lstFootStats").textContent = done ? done + " bought" : "";
  }

  async function update(item, body){
    try {
      const upd = await api("/api/items/" + encodeURIComponent(item.id), { method: "PATCH", body: JSON.stringify(body) });
      Object.assign(item, upd);
      render();
    } catch(e){ toast("Could not save"); }
  }

  async function remove(item){
    try { await api("/api/items/" + encodeURIComponent(item.id), { method: "DELETE" }); }
    catch(e){ toast("Could not delete"); return; }
    items = items.filter(i => i.id !== item.id);
    render();
    toast("“" + item.name + "” deleted", { label: "Undo", onClick: async () => {
      try {
        await api("/api/items", { method: "POST", body: JSON.stringify({
          name: item.name, supermarket: item.supermarket, qty: item.qty, checked: item.checked }) });
      } catch(e){ toast("Could not undo"); }
      reload();
    }});
  }

  $("#lstGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]"); if(!btn) return;
    const item = items.find(i => i.id === btn.closest(".lst-card").dataset.id); if(!item) return;
    const act = btn.dataset.act;
    if(act === "check") update(item, { checked: !item.checked });
    else if(act === "del") remove(item);
    else if(act === "plus") update(item, { qty: Math.min(999, item.qty + 1) });
    else if(act === "minus" && item.qty > 1) update(item, { qty: item.qty - 1 });
  });
  // A photo that does not load → icon, not a broken image.
  $("#lstGrid").addEventListener("error", (e) => {
    const img = e.target; if(img.tagName !== "IMG") return;
    const ph = document.createElement("span");
    ph.className = "lst-img ph"; ph.setAttribute("aria-hidden", "true"); ph.textContent = "🛒";
    img.replaceWith(ph);
  }, true);

  $("#lstFilters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-super]"); if(!b) return;
    filterSuper = b.dataset.super; $("#lstSuper").value = filterSuper; render();
  });

  shopBind($("#lstSuper"));
  $("#lstSuper").addEventListener("change", (e) => {
    if(e.target.value === SHOP_OTHER) return;
    filterSuper = e.target.value; render();
  });

  $("#composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameEl = $("#name"), name = nameEl.value.trim();
    if(!name) return;
    const supermarket = $("#lstSuper").value === SHOP_OTHER ? "" : $("#lstSuper").value;
    // Already pending at the same shop → +1 instead of a duplicate line.
    const same = items.find(i => !i.checked && i.name.toLowerCase() === name.toLowerCase() && i.supermarket === supermarket);
    try {
      if(same) await api("/api/items/" + encodeURIComponent(same.id), { method: "PATCH", body: JSON.stringify({ qty: Math.min(999, same.qty + 1) }) });
      else await api("/api/items", { method: "POST", body: JSON.stringify({ name, supermarket, qty: 1 }) });
    } catch(err){ toast("Could not add"); return; }
    nameEl.value = "";
    nameEl.focus();
    reload();
  });

  $("#clearBtn").addEventListener("click", async () => {
    try { await api("/api/items/clear-checked", { method: "POST" }); } catch(e){ toast("Could not clear"); return; }
    reload();
  });

  /* Copy */
  function buildListText(){
    const sorted = [...items].sort((a, b) => (a.checked - b.checked) || (a.created_at - b.created_at));
    const lines = sorted.map(i => (i.checked ? "✓" : "☐") + " " + i.name +
      (i.qty > 1 ? " ×" + i.qty : "") + (i.supermarket ? " @" + i.supermarket : ""));
    return "Shopping list\n" + "─".repeat(26) + "\n" + lines.join("\n");
  }
  function fallbackCopy(text){
    // iOS Safari and older Android: must run synchronously inside the user gesture.
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:2em;height:2em;opacity:0;";
    document.body.appendChild(ta);
    const range = document.createRange(); range.selectNodeContents(ta);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    ta.setSelectionRange(0, 999999);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch(e){}
    sel.removeAllRanges(); document.body.removeChild(ta);
    return ok;
  }
  $("#copyBtn").addEventListener("click", () => {
    if(!items.length){ toast("The list is empty"); return; }
    const text = buildListText();
    const done = (ok) => toast(ok ? "List copied" : "Could not copy, select the text by hand");
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(fallbackCopy(text)));
    } else done(fallbackCopy(text));
  });

  /* Autocomplete with product names, so the photo matches by name. */
  async function loadSuggest(){
    try {
      const d = await api("/api/products");
      $("#lstSuggest").innerHTML = d.items.filter(i => !i.hidden)
        .map(i => '<option value="' + esc(i.name.trim()) + '">').join("");
      knownShops = d.supermarkets; render();
    } catch(e){}
  }

  window.addEventListener("macrocart:refresh", () => { reload(); loadSuggest(); });
  reload();
  loadSuggest();
})();
