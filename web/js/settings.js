/* ═══════════ Settings, export and import ═══════════ */
(() => {
  let pending = null;   // parsed export waiting for "merge" or "replace"

  async function openSettings(){
    const s = await macrocart.getSettings();
    $("#setSups").value = s.supermarkets.join(", ");
    $("#setCountry").value = s.offCountry;
    $("#setLang").value = s.offLang;
    $("#setBack").hidden = false;
  }
  const close = () => { $("#setBack").hidden = true; };
  $("#setOpen").addEventListener("click", openSettings);
  $("#setClose").addEventListener("click", close);
  $("#setBack").addEventListener("click", (e) => { if(e.target.id === "setBack") close(); });
  $("#setForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const country = $("#setCountry").value.trim().toLowerCase();
    try {
      const s = await api("/api/settings", { method: "PUT", body: JSON.stringify({
        supermarkets: $("#setSups").value, offCountry: country, offLang: $("#setLang").value }) });
      if(country && !s.offCountry) toast("Country not understood: searching worldwide");
      else toast("Settings saved");
      close();
      window.dispatchEvent(new Event("macrocart:refresh"));
    } catch(err){ toast(err.message); }
  });

  $("#expBtn").addEventListener("click", async () => {
    const btn = $("#expBtn"); btn.disabled = true;
    try {
      const data = await macrocart.exportAll();
      const name = "macrocart-" + new Date().toISOString().slice(0, 10) + ".json";
      // Android app: the system "save as" dialog (a WebView cannot download blobs).
      if(window.MacrocartAndroid){ window.MacrocartAndroid.saveFile(name, JSON.stringify(data)); return; }
      const file = new File([JSON.stringify(data)], name, { type: "application/json" });
      if(navigator.canShare && navigator.canShare({ files: [file] })){
        try { await navigator.share({ files: [file], title: name }); toast("Exported"); return; }
        catch(err){ if(err.name === "AbortError") return; }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      toast("Exported: " + name);
    } catch(err){ toast("Could not export: " + err.message); }
    finally { btn.disabled = false; }
  });

  $("#impBtn").addEventListener("click", () => { $("#impFile").value = ""; $("#impFile").click(); });
  $("#impFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    pending = null;
    const room = await macrocart.importRoom(f.size);
    if(!room.ok){
      toast(room.reason === "too big"
        ? "That file is too big to import (over " + Math.round(macrocart.IMPORT_MAX_BYTES / 1048576) + " MB)"
        : "Not enough free space on this device to import that file");
      return;
    }
    // FileReader, not Blob.text(): that needs Chrome/WebView 76+.
    const read = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsText(file); });
    try { pending = JSON.parse(await read(f)); }
    catch(err){ toast("That file is not a macrocart export"); return; }
    if(!pending || pending.format !== "macrocart"){ pending = null; toast("That file is not a macrocart export"); return; }
    const n = (k) => Array.isArray(pending[k]) ? pending[k].length : 0;
    $("#impText").textContent = "“" + f.name + "”" + (pending.exported_at ? " (" + String(pending.exported_at).slice(0, 10) + ")" : "") +
      ": " + n("products") + " foods and recipes, " + n("items") + " list lines. " +
      "Merge keeps what is here and adds or updates from the file. Replace deletes everything on this device first.";
    $("#impBack").hidden = false;
  });
  async function doImport(mode){
    if(!pending) return;
    $("#impMerge").disabled = $("#impReplace").disabled = true;
    try {
      const r = await macrocart.importAll(pending, mode);
      try { sessionStorage.setItem("macrocart.toast", mode === "replace"
        ? "Imported " + r.products + " foods and recipes"
        : "Merged: " + r.added + " new, " + r.updated + " updated"); } catch(e){}
      location.reload();
    } catch(err){ toast(err.message); }
    finally { $("#impMerge").disabled = $("#impReplace").disabled = false; pending = null; $("#impBack").hidden = true; }
  }
  $("#impMerge").addEventListener("click", () => doImport("merge"));
  $("#impReplace").addEventListener("click", () => doImport("replace"));
  $("#impNo").addEventListener("click", () => { pending = null; $("#impBack").hidden = true; });

  try { const t = sessionStorage.getItem("macrocart.toast"); if(t){ sessionStorage.removeItem("macrocart.toast"); toast(t); } } catch(e){}

  // Offline use and "Install app".
  if("serviceWorker" in navigator && !window.MacrocartAndroid) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
