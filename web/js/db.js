/* macrocart storage: one IndexedDB database on this device.

   Stores
     items     shopping list lines      {id, name, supermarket, qty, checked, created_at}
     products  foods and recipes        {id (auto), code (unique), name, brand, nutrition, unit, img_url,
                                         photo_v, category, kind, rating, favorite, notes, hidden,
                                         created_at, updated_at}
     prices    price per shop           {id, product_id, supermarket, price, updated_at}
     photos    uploaded photos          Blob, keyed by product id
     settings  one record "settings"    {supermarkets, offCountry, offLang} */
const DB = (() => {
  const NAME = "macrocart", VERSION = 1;
  const STORES = ["items", "products", "prices", "photos", "settings"];
  let dbP = null;

  function open(){
    if(dbP) return dbP;
    dbP = new Promise((ok, ko) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
        if(!db.objectStoreNames.contains("products")){
          const s = db.createObjectStore("products", { keyPath: "id", autoIncrement: true });
          s.createIndex("code", "code", { unique: true });
        }
        if(!db.objectStoreNames.contains("prices")){
          const s = db.createObjectStore("prices", { keyPath: "id" });
          s.createIndex("product_id", "product_id");
        }
        if(!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
        if(!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbP = null; };
        ok(db);
      };
      req.onerror = () => { dbP = null; ko(req.error); };
      req.onblocked = () => ko(new Error("Close macrocart in other tabs and reload."));
    });
    // Ask the browser not to evict the data under storage pressure (best effort).
    try { if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
    return dbP;
  }

  const wrap = (req) => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });

  /* Run fn inside one transaction. fn(s) gets s(storeName) → the object store; await
     its requests with DB.req(). Do not await anything else (fetch, timers) inside fn:
     the transaction would close. Resolves with fn's result once the transaction commits. */
  async function run(stores, mode, fn){
    const db = await open();
    return new Promise((ok, ko) => {
      const t = db.transaction(stores, mode);
      let result;
      t.oncomplete = () => ok(result);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error || new Error("Aborted"));
      Promise.resolve().then(() => fn((n) => t.objectStore(n))).then(
        (r) => { result = r; },
        (e) => { try { t.abort(); } catch(_){} ko(e); });
    });
  }

  return { open, run, req: wrap, STORES };
})();
