# Choosing the paper, direction and scale of the plan sheet in the real editor. PORT = where this folder is served.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8767"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:600])
def room(name, x, y, w="5", l="4", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200])); page.on("dialog", lambda d: d.accept())
    def mount(rooms, layout=None):
        page.goto(f"http://localhost:{PORT}/index.html"); props = {"propertyAddress": "12 Example Road", "companyName": "ZKM", "initialShareToken": "T" * 32, "initialShareExpiresAt": None}  # snapshots are kept for shared plans
        if layout: props["initialSheetLayout"] = layout
        page.evaluate("([l, o]) => window.mountEditor(l, 'p', o)", [[{"name": "Ground floor", "rooms": rooms}], props]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def open_menu():
        if not page.locator("[data-testid=export-menu]").count(): page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    def export_svg(path):
        open_menu()
        with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
        dl.value.save_as(path); return open(path, encoding="utf-8").read()
    def size(svg): m = re.search(r'<svg[^>]*\swidth="([\d.]+)mm"[^>]*\sheight="([\d.]+)mm"', svg); return (float(m.group(1)), float(m.group(2))) if m else None
    note = lambda: page.locator("[data-testid=tool-note]").inner_text() if page.locator("[data-testid=tool-note]").count() else ""
    mount([room("Lounge", 0, 0)]); open_menu()
    ok("the export menu has Paper, Direction and Scale choices, all starting on Automatic", page.locator("[data-testid=sheet-paper]").input_value() == "auto" and page.locator("[data-testid=sheet-orientation]").input_value() == "auto" and page.locator("[data-testid=sheet-scale]").input_value() == "auto")
    svg = export_svg("/tmp/sheet-auto.svg"); sz = size(svg)
    ok("automatic: a small plan is A4 portrait (210 x 297 mm) at 1:50", sz == (210.0, 297.0) and "1:50" in svg, sz)
    open_menu(); page.locator("[data-testid=sheet-paper]").select_option("A3"); page.locator("[data-testid=sheet-orientation]").select_option("landscape"); page.locator("[data-testid=sheet-scale]").select_option("100")
    svg = export_svg("/tmp/sheet-a3.svg"); sz = size(svg)
    ok("A3, landscape, 1:100 chosen: the exported sheet is really 420 x 297 mm and says 1:100", sz == (420.0, 297.0) and "1:100" in svg and "1:50" not in svg.replace("1:500", ""), sz)
    ok("choosing does not leave a warning (the plan fits)", "does not fit" not in note(), note())
    open_menu(); page.locator("[data-testid=sheet-scale]").select_option("auto"); page.locator("[data-testid=sheet-paper]").select_option("auto"); page.locator("[data-testid=sheet-orientation]").select_option("auto")
    ok("back to Automatic gives the automatic sheet again", size(export_svg("/tmp/sheet-back.svg")) == (210.0, 297.0))
    # saved with the floor
    open_menu(); page.locator("[data-testid=sheet-paper]").select_option("A3"); page.locator("[data-testid=sheet-scale]").select_option("200"); page.keyboard.press("Escape")
    page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(1000); saves = page.evaluate("window.__saves || []"); sd = None
    for a in saves[-1] if saves else []:
        if isinstance(a, list):
            for lvl in a:
                if isinstance(lvl, dict) and lvl.get("sheetData"): sd = lvl["sheetData"]; sd = json.loads(sd) if isinstance(sd, str) else sd
    ok("saving a SHARED plan stores the choice with the floor's snapshot (paper A3, scale 200), so the PDF and the share link match", bool(sd) and sd.get("paper") == "A3" and sd.get("scale") == 200 and "orientation" not in sd, {k: v for k, v in (sd or {}).items() if k in ("paper", "scale", "orientation")})
    mount([room("Lounge", 0, 0)], {"paper": "A3", "orientation": "landscape", "scale": 100}); open_menu()
    ok("opening the editor again shows what was saved: A3, landscape, 1:100", page.locator("[data-testid=sheet-paper]").input_value() == "A3" and page.locator("[data-testid=sheet-orientation]").input_value() == "landscape" and page.locator("[data-testid=sheet-scale]").input_value() == "100")
    ok("...and the sheet it makes follows it from the first export", size(export_svg("/tmp/sheet-reopen.svg")) == (420.0, 297.0))
    # a plan too big for the chosen scale
    mount([room("A", 0, 0, "12", "9"), room("B", 13, 0, "12", "9"), room("C", 0, 10, "12", "9"), room("D", 13, 10, "12", "9")]); open_menu(); page.locator("[data-testid=sheet-scale]").select_option("50"); svg = export_svg("/tmp/sheet-big.svg"); n = note()
    ok("a plan about 25 m by 19 m cannot be 1:50 on A4 or A3: the sheet is made at the automatic scale instead and the person is told, in words, what happened", re.search(r"does not fit at 1:50 on the paper you chose, so the sheet was made at 1:\d+ instead", n) is not None and "1:50" not in svg.replace("1:500", ""), n)
    ok("no page errors", not errs, errs)
    print(f"\nChoosing the paper and scale of the sheet in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
