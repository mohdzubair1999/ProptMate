# Browser tests

These run real screens in a real browser (Playwright) with their server actions replaced by small fakes. They are NOT run by `npm test` (which runs only
the `tests/*.test.mts` files); run them by hand after changing the floor plan editor or the QR report screens.

Setup once: `npm i --no-save esbuild`, `pip install playwright ezdxf`, `playwright install chromium`.

1. Build the pages (from the project folder):
   - `node tests/browser/build.mjs` builds `tests/browser/editor.js` (the floor plan editor)
   - `node tests/browser/build-qr.mjs` builds `tests/browser/qr.js` (the tenant QR form and the staff list of reports)
   - `node tests/browser/build-analyse.mjs` builds `tests/browser/analyse.js` (the Analyse with AI button)
   - `node tests/browser/build-contacts.mjs` builds `tests/browser/contacts.js` and `tests/browser/app.css` (the email suggestions in the send form, the saved client picker on a property and on the summary section, and the Client details page)
   - `node tests/browser/build-picker.mjs` builds `tests/browser/picker.js` and `tests/browser/app.css` (the searchable property picker and the forms that use it, with the app's real Tailwind stylesheet so sizes are tested as they really are)
2. Serve this folder: `cd tests/browser && python3 -m http.server 8767`
3. In another terminal, from `tests/browser`, run any of these with `PORT=8767 python3 <file>`:
   - `test_tint.py`: the Condition colours (and the key naming skipped rooms) show on screen but never in an exported sheet or a saved plan
   - `test_measure.py`: a measurement left showing never reaches an export or a saved plan
   - `test_transient.py`: the same plan exported in many editing states (selected, placing, half-drawn wall, grid, measuring) is always identical to a clean export
   - `test_dxf_all.py`: the DXF exports (one floor, all floors, doorways cut into the walls); needs `ezdxf`
   - `test_analyse.py`: analysing a big set of photos in batches against a fake server that allows 40 requests then says slow down (pacing, the explanation, keeping what is done, sending only the missing photos next time, nothing typed into the notes)
   - `test_contacts.py`: the email suggestions (mouse click, Enter, Tab, a whole typed address, arrows, Escape, a phone, signature rows), the property client fields, the summary picker and the Client details page
   - `test_wall_cad.py`: precise wall drawing in the real editor: snap markers (endpoint, midpoint, intersection, no phantom corner on an L-shaped room), ortho / polar / free with F8, F3, Shift, typed exact lengths read back from the saved plan
   - `test_dimensions.py`: dimension lines in the real editor: the three-click tool with snaps, the saved plan, editing (offset field, Flip side, handles), the Dimensions layer, the printed sheet, and a DXF read back by an independent library (ezdxf)
   - `test_edit_tools.py`: mirror, copies in a row, a room's dimensions in one click, and snapping when wall and dimension handles are dragged, in the real editor
   - `test_cad_more.py`: snapping when placing furniture, perpendicular and parallel snaps, trim, extend and corner, in the real editor
   - `test_dxf_import.py`: importing a DXF drawing (files made by ezdxf, uploaded through the real file picker)
   - `test_sheet_choice.py`: choosing the paper, direction and scale of the plan sheet
   - `test_custom_layers.py`: layers of your own: put things on a named layer, hide, rename, delete, and the DXF export (read back by ezdxf)
   - `test_drag_snap.py`: dragging existing furniture and walls snaps their key points onto corners, with Alt for free movement
   - `test_layer_style.py`: colour and lock for layers of your own: drawn in colour, the sheet's key, black and white, the DXF colour, locked items, saved and loaded back
   - `test_picker.py`: the searchable property picker on its own (typing, ranking, keyboard, phone taps, required blocking, 2,000 properties) and inside the new inspection, invite client and compliance forms (including keeping your choices after a failed submit)
   - `test_qr.py`: the tenant QR form (emergency notice and warning) and the staff list (order, labels, banner, make-a-job button)

The generated `editor.js`, `qr.js`, `analyse.js`, `picker.js`, `contacts.js` and `app.css` are not kept in the project (see `.gitignore`).
