/* ═══════════ Language: English (source) / Spanish ═══════════
   The page is written in English; in Spanish the DOM is translated on the fly (text,
   placeholder, title, aria-label), including what is drawn later (MutationObserver).
   Product, brand and shop names are left alone. The choice is kept in localStorage;
   by default, the device language. */
(() => {
  const KEY = "macrocart.lang";
  let lang;
  try { lang = localStorage.getItem(KEY); } catch(e){}
  if(lang !== "es" && lang !== "en") lang = /^es\b/i.test(navigator.language || "") ? "es" : "en";

  const btn = document.getElementById("langBtn");
  btn.textContent = "🌐 " + lang.toUpperCase();
  btn.addEventListener("click", () => {
    try { localStorage.setItem(KEY, lang === "en" ? "es" : "en"); } catch(e){}
    location.reload();
  });
  if(lang === "en") return;

  const D = {
    "Shopping list": "Lista de la compra", "List": "Lista", "Foods": "Alimentos", "Recipes": "Recetas",
    "Copy": "Copiar", "Copy the list to the clipboard": "Copiar la lista al portapapeles",
    "Language / Idioma": "Idioma / Language", "Settings": "Ajustes", "Settings, export and import": "Ajustes, exportar e importar",
    "Add a product…": "Añade un producto…", "Add": "Añadir", "Product": "Producto", "Shop": "Súper", "Shop…": "Súper…",
    "Supermarket": "Supermercado", "All": "Todos", "All shops": "Todos los súper", "＋ Other…": "＋ Otro…", "Shop name": "Nombre del súper",
    "Your list is empty.": "Tu lista está vacía.", "Add products above or from the Foods tab.": "Añade productos arriba o desde la pestaña Alimentos.",
    "Clear bought": "Vaciar comprados", "Less": "Menos", "More": "Más", "Undo": "Deshacer",
    "Search product or brand…": "Buscar producto o marca…", "Search recipes…": "Buscar receta…", "Sort": "Ordenar",
    "Top rated": "Mejor puntuados", "Fewest kcal": "Menos kcal", "Cheapest": "Más baratos", "Most protein": "Más proteína",
    "♥ Favourites": "♥ Favoritos", "♥ Favourite": "♥ Favorito", "Favourite": "Favorito", "♡ Unfavourite": "♡ Quitar favorito",
    "🌐 Search the internet": "🌐 Buscar en internet", "Search the internet": "Buscar en internet", "📷 Scan": "📷 Escanear",
    "＋ New food": "＋ Nuevo alimento", "New food": "Nuevo alimento", "＋ New recipe": "＋ Nueva receta", "New recipe": "Nueva receta",
    "Edit food": "Editar alimento", "Edit recipe": "Editar receta",
    "Tap cards to pick them, then add them to the list or copy them to Recipes; pick one to edit it.": "Toca las tarjetas para elegirlas y añádelas a la lista o cópialas a Recetas; elige una para editarla.",
    "opens the card: rating, notes and prices.": "abre la ficha: puntuación, notas y precios.",
    "Delete": "Borrar", "Edit": "Editar", "View": "Ver", "Remove": "Quitar", "Close": "Cerrar", "Cancel": "Cancelar",
    "Save": "Guardar", "Save changes": "Guardar cambios", "Save recipe": "Guardar receta", "Save settings": "Guardar ajustes",
    "Search": "Buscar", "Look up": "Buscar", "Add to list": "Añadir a la lista", "Add as recipe": "Añadir como receta",
    "Delete this food?": "¿Borrar el alimento?", "Remove this recipe?": "¿Quitar la receta?",
    "Protein": "Proteína", "Carbs": "Carbos", "Fat": "Grasa", "protein": "proteína", "carbs": "carbos", "fat": "grasa",
    "Column": "Columna", "Type": "Tipo", "Rating": "Puntuación", "Notes": "Notas", "Name": "Nombre", "Nutrition": "Valores nutricionales",
    "Automatic (from the macros)": "Automática (según los macros)", "Food (you buy it)": "Producto (se compra)", "Recipe / dish": "Receta / plato",
    "Taste, how you have it, alternatives…": "Sabor, cómo lo tomas, alternativas…",
    "Taste, where to buy it, how to use it…": "Sabor, dónde comprarlo, cómo usarlo…",
    "Ingredients, steps, where to eat it…": "Ingredientes, pasos, dónde comerla…",
    "Prices per shop": "Precios por súper", "Price": "Precio", "Remove price": "Quitar precio", "No prices yet.": "Sin precios todavía.",
    "cheapest": "más barato", "On list": "En lista", "Per 100 g": "Por 100 g", "Per serving (whole dish)": "Por ración (plato entero)",
    "serving": "ración", "Calories from protein · carbs · fat": "Reparto de kcal: proteína · carbos · grasa",
    "Nothing here": "Nada aquí", "✓ Added": "✓ Añadido", "More results": "Más resultados",
    "Barcode": "Código de barras", "Barcode (optional)": "Código de barras (opcional)", "Photo (optional)": "Foto (opcional)",
    "Source (home-made, restaurant…)": "Origen (casera, restaurante…)", "A home-made or restaurant dish.": "Plato casero o de restaurante.",
    "For products that are not on Open Food Facts. Macros per 100 g (or ml).": "Para productos que no están en Open Food Facts. Macros por 100 g (o ml).",
    "Home-made or restaurant dishes. Tap one to view, edit or remove it.": "Platos caseros o de restaurante. Toca uno para verlo, editarlo o quitarlo.",
    "Open Food Facts results only. Tap one and pick its column.": "Solo resultados de Open Food Facts. Toca uno y elige su columna.",
    "e.g. protein yogurt, tuna, rice…": "p. ej. yogur proteínas, atún, arroz…", "Not there? Add it by hand": "¿No está? Añádelo a mano",
    "Scan a barcode": "Escanear un código", "Point the camera at the barcode or QR code on the package.": "Apunta la cámara al código de barras o QR del envase.",
    "…or type the barcode number": "…o teclea el número del código", "Starting the camera…": "Abriendo la cámara…",
    "Searching Open Food Facts…": "Buscando en Open Food Facts…", "Looking for a barcode…": "Buscando un código…",
    "Type at least 2 letters.": "Escribe al menos 2 letras.", "Type at least 2 letters": "Escribe al menos 2 letras",
    "That code is not a product barcode.": "Ese código no es de un producto.", "The camera is not available.": "La cámara no está disponible.",
    "The camera only works over HTTPS. Type the barcode instead.": "La cámara solo funciona por HTTPS. Teclea el código.",
    "No camera found.": "No hay cámara.", "No permission to use the camera.": "Sin permiso para usar la cámara.",
    "Could not load the scanner.": "No se pudo cargar el escáner.", "No results on Open Food Facts.": "Sin resultados en Open Food Facts.",
    "Type the digits under the barcode.": "Teclea los números que hay bajo el código de barras.",
    "Not on Open Food Facts: add it by hand": "No está en Open Food Facts: añádelo a mano", "Not on Open Food Facts": "No está en Open Food Facts",
    "The list is empty": "La lista está vacía", "List copied": "Lista copiada", "Nothing to copy": "Nada que copiar",
    "Nothing to add": "Nada que añadir", "Nothing selected": "No hay nada elegido", "No recipe matches.": "Ninguna receta coincide.",
    "No product matches the filter.": "Ningún producto coincide con el filtro.",
    "No products yet. Use “Search the internet”, “Scan” or “New food”.": "Aún no hay productos. Usa «Buscar en internet», «Escanear» o «Nuevo alimento».",
    "No recipes yet. Use “New recipe”, or pick foods and “Add as recipe”.": "Aún no hay recetas. Usa «Nueva receta» o elige alimentos y «Añadir como receta».",
    "Could not load the foods": "No se pudieron cargar los alimentos", "Could not add": "No se pudo añadir",
    "Could not load the list": "No se pudo cargar la lista", "Could not copy, select the text by hand": "No se pudo copiar, selecciona el texto a mano",
    "Could not undo": "No se pudo deshacer", "Could not delete": "No se pudo borrar", "Could not save": "No se pudo guardar",
    "Could not read the photo": "No se pudo leer la foto", "Could not clear": "No se pudo vaciar",
    "Settings saved": "Ajustes guardados", "Shops (comma-separated)": "Súper (separados por comas)", "e.g. Corner shop, Market": "p. ej. Tienda de la esquina, Mercado",
    "Search the internet in one country": "Buscar en internet en un país", "Worldwide (empty) or e.g. en:spain": "Todo el mundo (vacío) o p. ej. en:spain",
    "Language of product names (two letters)": "Idioma de los nombres de producto (dos letras)",
    "Move or back up your data": "Mover o guardar tus datos", "Export data": "Exportar datos", "Import data": "Importar datos", "Import data…": "Importar datos…",
    "Export saves everything (with photos) to one file. Import it on another device, or here to restore it.": "Exportar guarda todo (con fotos) en un fichero. Impórtalo en otro dispositivo, o aquí para restaurarlo.",
    "Your list, foods, recipes and photos live only on this device.": "Tu lista, alimentos, recetas y fotos solo están en este dispositivo.",
    "Merge with this device": "Combinar con este dispositivo", "Replace everything here": "Sustituir todo lo de aquí",
    "That file is not a macrocart export": "Ese fichero no es una exportación de macrocart", "This is not a macrocart export": "No es una exportación de macrocart",
    "This export comes from a newer macrocart: update the app first": "Esta exportación es de un macrocart más nuevo: actualiza antes la app",
    "Pick replace or merge": "Elige sustituir o combinar", "Exported": "Exportado",
    "Not enough free space on this device to import that file": "No hay espacio libre suficiente en este dispositivo para importar ese fichero",
    // Errors from js/api.js
    "A product with that barcode is already on the board": "Ya hay un producto con ese código", "Bad request": "Petición no válida",
    "Could not reach Open Food Facts": "No se pudo conectar con Open Food Facts", "Country not understood: searching worldwide": "País no reconocido: se busca en todo el mundo",
    "Invalid barcode": "Código no válido", "Invalid ids": "ids no válidos", "Invalid or too large photo": "Foto no válida o demasiado grande",
    "Invalid price": "Precio no válido", "Name required": "Falta el nombre", "name required": "falta el nombre", "Not found": "No encontrado",
    "Open Food Facts is busy: try again in a minute": "Open Food Facts está saturado: prueba en un minuto",
    "Open Food Facts sent an unreadable answer": "Open Food Facts dio una respuesta ilegible", "Pick protein, carbs or fat": "Elige proteína, carbos o grasa",
    "Product not found on Open Food Facts": "Producto no encontrado en Open Food Facts", "Supermarket required": "Falta el súper",
    "The product has no name on Open Food Facts": "El producto no tiene nombre en Open Food Facts", "You are offline": "Sin conexión",
  };
  const t = (s) => D[s] || s;
  // Texts with names or numbers inside.
  const P = [
    [/^(\d+) of (\d+) done$/, (m, a, b) => a + " de " + b + " completados"],
    [/^(\d+) bought$/, (m, a) => a + (a === "1" ? " comprado" : " comprados")],
    [/^(\d+) selected$/, (m, a) => a + (a === "1" ? " seleccionado" : " seleccionados")],
    [/^(\d+) internet results\.$/, (m, a) => a + " resultados de internet."],
    [/^(\d+) added$/, (m, a) => a + (a === "1" ? " añadido" : " añadidos")],
    [/^(\d+) already there \(\+1\)$/, (m, a) => a + " ya estaba" + (a === "1" ? "" : "n") + " (+1)"],
    [/^(\d+) copied to Recipes$/, (m, a) => a + (a === "1" ? " copiado" : " copiados") + " a Recetas"],
    [/^(\d+) already in Recipes$/, (m, a) => a + " ya estaba" + (a === "1" ? "" : "n") + " en Recetas"],
    [/^(\d+) marked as favourite$/, (m, a) => a + " marcado(s) como favorito"],
    [/^(\d+) removed from favourites$/, (m, a) => a + " quitado(s) de favoritos"],
    [/^(\d+) deleted$/, (m, a) => a + " borrados"],
    [/^(\d+) stars?$/, (m, a) => a + " estrellas"],
    [/^Delete (\d+) foods\?$/, (m, a) => "¿Borrar " + a + " alimentos?"],
    [/^“(.+)” deleted$/, (m, a) => "«" + a + "» borrado"],
    [/^“(.+)” saved$/, (m, a) => "«" + a + "» guardado"],
    [/^“(.+)” is already on the board$/, (m, a) => "«" + a + "» ya está en el tablero"],
    [/^Recipe “(.+)” added to (.+)$/, (m, a, b) => "Receta «" + a + "» guardada en " + t(b)],
    [/^“(.+)” added to (.+)$/, (m, a, b) => "«" + a + "» añadido a " + t(b)],
    [/^(.+) will be deleted with its rating, notes and prices\. This cannot be undone\.$/, (m, a) => a.replace(/[“”]/g, (q) => q === "“" ? "«" : "»") + " se borrará con su puntuación, notas y precios. No se puede deshacer."],
    [/^“(.+)” will be deleted\. This cannot be undone\.$/, (m, a) => "«" + a + "» se borrará. No se puede deshacer."],
    [/^Looking up (.+) on Open Food Facts…$/, (m, a) => "Buscando " + a + " en Open Food Facts…"],
    [/^Barcode (.+): pick its column\.$/, (m, a) => "Código " + a + ": elige su columna."],
    [/^((?:.+ · )?)per (.+)$/, (m, a, b) => a + "valores por " + t(b)],
    [/^Automatic \((.+)\)$/, (m, a) => "Automática (" + t(a) + ")"],
    [/^Delete (.+)$/, (m, a) => "Borrar " + a],
    [/^Mark bought: (.+)$/, (m, a) => "Marcar comprado " + a],
    [/^Unmark (.+)$/, (m, a) => "Desmarcar " + a],
    [/^Details of (.+)$/, (m, a) => "Ficha de " + a],
    [/^Exported: (.+)$/, (m, a) => "Exportado: " + a],
    [/^That file is too big to import \(over (\d+) MB\)$/, (m, a) => "Ese fichero es demasiado grande para importarlo (más de " + a + " MB)"],
    [/^This file has too many (list lines|foods and recipes|prices|photos) to import \((\d+); the limit is (\d+)\)$/,
      (m, k, n, max) => "Este fichero tiene " + ({ "list lines": "demasiadas líneas de la lista", "foods and recipes": "demasiados alimentos y recetas",
        prices: "demasiados precios", photos: "demasiadas fotos" })[k] + " para importarlo (" + n + "; el límite es " + max + ")"],
    [/^Could not export: (.+)$/, (m, a) => "No se pudo exportar: " + t(a)],
    [/^Imported (\d+) foods and recipes$/, (m, a) => "Importados " + a + " alimentos y recetas"],
    [/^Merged: (\d+) new, (\d+) updated$/, (m, a, b) => "Combinado: " + a + " nuevos, " + b + " actualizados"],
    [/^(.+): (\d+) foods and recipes, (\d+) list lines\. Merge keeps what is here and adds or updates from the file\. Replace deletes everything on this device first\.$/,
      (m, a, b, c) => a + ": " + b + " alimentos y recetas, " + c + " líneas de la lista. Combinar conserva lo de aquí y añade o actualiza desde el fichero. Sustituir borra antes todo lo de este dispositivo."],
  ];
  function tr(s){
    if(D[s]) return D[s];
    for(const [re, f] of P) if(re.test(s)) return s.replace(re, f);
    if(s.includes(", ")) return s.split(", ").map(tr).join(", ");
    return s;
  }
  // Product, brand and shop names are not translated.
  const SKIP = ".tile-name, .tile-brand, .lst-name, .lst-super, #cmName, #cmBrand, #recSelName, .cm-price .s, script, style, textarea, :is(#lstSuper, #cmSup, #manBrand, #catSuper) option:not([value='']):not([value='__other'])";
  function text(node){
    const raw = node.nodeValue, s = raw.trim();
    if(!s || !/[A-Za-z]/.test(s)) return;
    const p = node.parentElement; if(p && p.closest(SKIP) && !(p.id === "cmBrand" && /^(?:.+ · )?per /.test(s))) return;
    const out = tr(s); if(out !== s) node.nodeValue = raw.replace(s, out);
  }
  const ATTRS = ["placeholder", "title", "aria-label"];
  function attrs(el){
    for(const a of ATTRS){ const v = el.getAttribute(a); if(v){ const o = tr(v); if(o !== v) el.setAttribute(a, o); } }
  }
  function walk(root){
    if(root.nodeType === 3){ text(root); return; }
    if(root.nodeType !== 1 || root.matches("script, style")) return;
    attrs(root);
    root.querySelectorAll("[placeholder], [title], [aria-label]").forEach(attrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for(let n; (n = w.nextNode());) text(n);
  }
  document.documentElement.lang = "es";
  document.title = t(document.title);
  walk(document.body);
  new MutationObserver((muts) => {
    for(const m of muts){
      if(m.type === "characterData") text(m.target);
      else if(m.type === "attributes") attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // Browser dialogs (e.g. "＋ Other…" asks for the shop name).
  const _prompt = window.prompt.bind(window);
  window.prompt = (msg, def) => _prompt(tr(String(msg)), def);
})();
