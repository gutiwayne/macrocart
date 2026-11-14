# Third-party notices

macrocart's own code is licensed under the AGPL-3.0 (see [`LICENSE`](LICENSE)).
This repository bundles only the barcode reader below (no third-party fonts or
images).

## Barcode reader (bundled in `web/vendor/`)

Loaded by the browser only when it has no built-in `BarcodeDetector` that reads
EAN-13. Files copied unmodified from the npm packages.

| File | From | License |
|---|---|---|
| `barcode-detector.js` | [barcode-detector](https://github.com/Sec-ant/barcode-detector) 3.2.3, `dist/iife/ponyfill.js` | MIT — [`LICENSE-barcode-detector`](web/vendor/LICENSE-barcode-detector) |
| `zxing_reader.wasm` | [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6, `dist/reader/zxing_reader.wasm` | MIT — [`LICENSE-zxing-wasm`](web/vendor/LICENSE-zxing-wasm) |
| (compiled into `zxing_reader.wasm`) | [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) and zxing-wasm's `ZXingWasm.cpp` | Apache-2.0 — [`LICENSE-zxing-cpp`](web/vendor/LICENSE-zxing-cpp) |

## Open Food Facts

Product data fetched through the internet search comes from
[Open Food Facts](https://world.openfoodfacts.org):

- Database: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Individual contents: [Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/)
- Product images: [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.en)

Products you add are stored on your device (and in the files you export); if you
redistribute that data, the ODbL terms apply. Images are not copied: the browser loads them from Open Food
Facts.

## Icons

The inline SVG icons are simple shapes drawn for this project in the style of
[Lucide](https://lucide.dev) (ISC License). The app icon (`web/icons/`) was drawn
for this project.

## Android app

The APK bundles [AndroidX WebKit](https://developer.android.com/jetpack/androidx/releases/webkit)
(`androidx.webkit:webkit`, Apache-2.0). Built with the Android Gradle Plugin and the
Gradle wrapper (`android/gradle/wrapper/`, Apache-2.0).

## Test tooling (not bundled)

[Playwright](https://github.com/microsoft/playwright) (Apache-2.0) is installed in CI
to run `tests/e2e.mjs`.
