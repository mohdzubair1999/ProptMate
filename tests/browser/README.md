# Browser tests

These run real screens in a real browser (Playwright) with their server actions replaced by small fakes. They are NOT run by `npm test` (which runs only
the `tests/*.test.mts` files); run them by hand after changing the floor plan editor or the QR report screens.

Setup once: `npm i --no-save esbuild`, `pip install playwright ezdxf`, `playwright install chromium`.

1. Build the pages (from the project folder):
   - `node tests/browser/build.mjs` builds `tests/browser/editor.js` (the floor plan editor)
   - `node tests/browser/build-qr.mjs` builds `tests/browser/qr.js` (the tenant QR form and the staff list of reports)
   - `node tests/browser/build-analyse.mjs` builds `tests/browser/analyse.js` (the Analyse with AI button)
   - `node tests/browser/build-picker.mjs` builds `tests/browser/picker.js` and `tests/browser/app.css` (the searchable property picker and the forms that use it, with the app's real Tailwind stylesheet so sizes are tested as they really are)
2. Serve this folder: `cd tests/browser && python3 -m http.server 8767`
3. In another terminal, from `tests/browser`, run any of these with `PORT=8767 python3 <file>`:
   - `test_tint.py`: the Condition colours (and the key naming skipped rooms) show on screen but never in an exported sheet or a saved plan
   - `test_measure.py`: a measurement left showing never reaches an export or a saved plan
   - `test_transient.py`: the same plan exported in many editing states (selected, placing, half-drawn wall, grid, measuring) is always identical to a clean export
   - `test_dxf_all.py`: the DXF exports (one floor, all floors, doorways cut into the walls); needs `ezdxf`
   - `test_analyse.py`: analysing a big set of photos in batches against a fake server that allows 40 requests then says slow down (pacing, the explanation, keeping what is done, sending only the missing photos next time, nothing typed into the notes)
   - `test_picker.py`: the searchable property picker on its own (typing, ranking, keyboard, phone taps, required blocking, 2,000 properties) and inside the new inspection, invite client and compliance forms (including keeping your choices after a failed submit)
   - `test_qr.py`: the tenant QR form (emergency notice and warning) and the staff list (order, labels, banner, make-a-job button)

The generated `editor.js`, `qr.js`, `analyse.js`, `picker.js` and `app.css` are not kept in the project (see `.gitignore`).
