/* Shared helpers. Each tab below keeps its own state. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const num = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const money = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let toastTimer = null;
function toast(msg, action){
  const el = $("#toast");
  el.innerHTML = "";
  el.appendChild(document.createTextNode(msg));
  let duration = 2200;
  if(action){
    duration = 4000;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "toast-action"; btn.textContent = action.label;
    btn.addEventListener("click", () => { clearTimeout(toastTimer); el.classList.remove("show"); action.onClick(); });
    el.appendChild(btn);
  }
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

/* Shop dropdown (List, food card, food form): the shops in Settings plus the ones in use,
   and "＋ Other…", which asks for a name and saves it to Settings. */
const SHOP_OTHER = "__other";
function shopOptions(sel, names, empty){
  const keep = sel.value, seen = new Map();
  (names || []).forEach(s => { const k = String(s || "").trim(); if(k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); });
  if(keep && keep !== SHOP_OTHER && !seen.has(keep.toLowerCase())) seen.set(keep.toLowerCase(), keep);
  sel.textContent = "";   // not replaceChildren(): Chrome/WebView 86+ only
  [new Option(empty, ""), ...[...seen.values()].map(s => new Option(s, s)), new Option("＋ Other…", SHOP_OTHER)].forEach(o => sel.add(o));
  sel.value = keep && keep !== SHOP_OTHER ? (seen.get(keep.toLowerCase()) || "") : "";
  sel.dataset.prev = sel.value;
}
function shopBind(sel){
  sel.addEventListener("change", async () => {
    if(sel.value !== SHOP_OTHER){ sel.dataset.prev = sel.value; return; }
    const n = (prompt("Shop name") || "").trim().slice(0, 40);
    if(!n){ sel.value = sel.dataset.prev || ""; sel.dispatchEvent(new Event("change")); return; }
    let o = [...sel.options].find(o => o.value.toLowerCase() === n.toLowerCase());
    if(!o){ o = new Option(n, n); sel.insertBefore(o, sel.lastElementChild); }
    sel.value = o.value; sel.dataset.prev = o.value;
    sel.dispatchEvent(new Event("change"));
    try {
      const st = await api("/api/settings");
      if(!st.supermarkets.some(s => s.toLowerCase() === n.toLowerCase()))
        await api("/api/settings", { method: "PUT", body: JSON.stringify({ supermarkets: st.supermarkets.concat(o.value) }) });
    } catch(e){}
  });
}

