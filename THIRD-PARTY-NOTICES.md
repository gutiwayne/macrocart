# Third-party notices

macrocart's own code is licensed under the AGPL-3.0 (see [`LICENSE`](LICENSE)).
This repository bundles only the barcode reader below (no third-party fonts or
images). The other items are used at build time or at runtime.

## Barcode reader (bundled in `static/vendor/`)

Loaded by the browser only when it has no built-in `BarcodeDetector` that reads
EAN-13. Files copied unmodified from the npm packages.

| File | From | License |
|---|---|---|
| `barcode-detector.js` | [barcode-detector](https://github.com/Sec-ant/barcode-detector) 3.2.3, `dist/iife/ponyfill.js` | MIT — [`LICENSE-barcode-detector`](static/vendor/LICENSE-barcode-detector) |
| `zxing_reader.wasm` | [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6, `dist/reader/zxing_reader.wasm` | MIT — [`LICENSE-zxing-wasm`](static/vendor/LICENSE-zxing-wasm) |
| (compiled into `zxing_reader.wasm`) | [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) and zxing-wasm's `ZXingWasm.cpp` | Apache-2.0 — [`LICENSE-zxing-cpp`](static/vendor/LICENSE-zxing-cpp) |

## Python dependencies (installed into the Docker image, not bundled here)

| Package | License |
|---|---|
| [Flask](https://github.com/pallets/flask) and its dependencies (Werkzeug, Jinja2, MarkupSafe, ItsDangerous, Click, Blinker) | BSD-3-Clause |
| [gunicorn](https://github.com/benoitc/gunicorn) | MIT |

## Base image

[`python:3.11-slim`](https://hub.docker.com/_/python) — Python Software Foundation
License, on Debian (various free licenses).

## Open Food Facts

Product data fetched through the internet search comes from
[Open Food Facts](https://world.openfoodfacts.org):

- Database: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Individual contents: [Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/)
- Product images: [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.en)

Products you add are stored in your local database; if you redistribute that data,
the ODbL terms apply. Images are not copied: the browser loads them from Open Food
Facts.

## NutriTrace

macrocart reads the database of [NutriTrace](https://github.com/traceapps/nutritrace)
read-only. No NutriTrace code is included.

## Icons

The inline SVG icons are simple shapes drawn for this project in the style of
[Lucide](https://lucide.dev) (ISC License).
