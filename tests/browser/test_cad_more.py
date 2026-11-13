# Snapping when placing furniture, perpendicular and parallel snaps, trim / extend and corner, in the real editor. PORT = where this folder is served.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8767"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
def room(name, x, y, w="5", l="4", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1500, "height": 950}); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.goto(f"http://localhost:{PORT}/index.html")
    levels = [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0), room("Hall", 6, 0, "4", "4", shape="l-shape", notchWidthM="2", notchDepthM="2"), room("Bedroom", 0, 5, "5", "4")]}]
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", levels); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def screen(mx, my): return page.evaluate("([mx, my]) => { const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('[data-room]')); svg.scrollIntoView({ block: 'center', behavior: 'instant' }); const pt = svg.createSVGPoint(); pt.x = 10 + mx * 40; pt.y = 10 + my * 40; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }", [mx, my])
    def move(mx, my): x, y = screen(mx, my); page.mouse.move(x, y); page.wait_for_timeout(130)
    def click(mx, my): x, y = screen(mx, my); page.mouse.move(x, y); page.wait_for_timeout(80); page.mouse.click(x, y); page.wait_for_timeout(200)
    marker = lambda: page.locator("[data-testid=snap-marker]")
    status = lambda: page.locator("[data-testid=wall-status]").inner_text() if page.locator("[data-testid=wall-status]").count() else ""
    note = lambda: page.locator("[data-testid=tool-note]").inner_text() if page.locator("[data-testid=tool-note]").count() else ""
    def saved(kind):
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); out = []
        for a in saves[-1] if saves else []:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); out += [x for x in o if x.get("kind") == kind]
        return out
    key = lambda w: (w["x1"], w["y1"], w["x2"], w["y2"])
    undo = lambda: (page.get_by_role("button", name=re.compile("Undo")).click(), page.wait_for_timeout(250))
    def wall(a, c): page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); click(*a); click(*c); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    # ---------------- furniture snaps when placed ----------------
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); page.wait_for_timeout(150)
    move(5.03, 4.02)
    ok("placing a smoke alarm near the Lounge's corner shows the Endpoint marker", marker().count() == 1 and marker().get_attribute("data-snap-kind") == "endpoint", [marker().count()])
    click(5.03, 4.02); page.keyboard.press("Escape"); page.wait_for_timeout(150); s = saved("symbol")
    ok("it lands exactly on the corner: its middle is at (5, 4)", len(s) == 1 and s[0]["x"] == 5 and s[0]["y"] == 4, s)
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); page.wait_for_timeout(120); move(2.5, 0.03)
    ok("and near the middle of an edge it is a Midpoint (a triangle)", marker().get_attribute("data-snap-kind") == "midpoint"); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    # ---------------- perpendicular ----------------
    page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); page.keyboard.press("F8"); page.keyboard.press("F8"); page.wait_for_timeout(100)
    click(1.3, 4.8); move(1.35, 4.02)
    ok("from (1.3, 4.8), pointing at the Lounge's bottom edge, a PERPENDICULAR marker appears (an L shape) and the status says so", marker().get_attribute("data-snap-kind") == "perpendicular" and "Snap: Perpendicular" in status() and marker().locator("polyline").count() == 1, [marker().get_attribute("data-snap-kind") if marker().count() else None, status()])
    click(1.35, 4.02); page.keyboard.press("Escape"); page.wait_for_timeout(150); w = [key(x) for x in saved("wall")]
    ok("the wall ends exactly at (1.3, 4): straight down to the edge at a right angle (the pointer was at 1.35, which would otherwise have made it slope)", (1.3, 4.8, 1.3, 4) in w, w)
    # ---------------- parallel ----------------
    wall((6.5, 6.0), (9.5, 6.6))
    page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); click(6.5, 7.5); move(9.5, 8.14)
    ok("pointing within a few degrees of the slanted wall's direction shows a PARALLEL marker, and the status says so", marker().get_attribute("data-snap-kind") == "parallel" and "Snap: Parallel" in status(), [marker().get_attribute("data-snap-kind") if marker().count() else None, status()])
    click(9.5, 8.14); page.keyboard.press("Escape"); page.wait_for_timeout(150); ws = saved("wall"); new = [x for x in ws if x["x1"] == 6.5 and x["y1"] == 7.5][0]; ref = [x for x in ws if x["x1"] == 6.5 and x["y1"] == 6][0]
    sinang = abs((new["x2"] - new["x1"]) * (ref["y2"] - ref["y1"]) - (new["y2"] - new["y1"]) * (ref["x2"] - ref["x1"])) / ((new["x2"] - new["x1"]) ** 2 + (new["y2"] - new["y1"]) ** 2) ** 0.5 / ((ref["x2"] - ref["x1"]) ** 2 + (ref["y2"] - ref["y1"]) ** 2) ** 0.5
    ok("the new wall really is parallel to it (to better than a hundredth of a degree), although the pointer was a little off", sinang < 0.0003, [sinang, new, ref])
    # ---------------- extend and trim ----------------
    wall((9, 5), (9, 8.8)); wall((6.5, 5.3), (7.5, 5.3)); wall((6.5, 5.6), (9.8, 5.6)); page.keyboard.press("Escape")
    click(7, 5.3); page.wait_for_timeout(200)
    ok("a selected wall has Trim/extend buttons for each end", page.locator("[data-testid=trimext-1]").count() == 1 and page.locator("[data-testid=trimext-2]").count() == 1)
    page.locator("[data-testid=trimext-2]").click(); page.wait_for_timeout(300); ws = saved("wall"); t1 = [x for x in ws if x["x1"] == 6.5 and x["y1"] == 5.3][0]
    ok("a wall that stops short is EXTENDED to the next line: (6.5, 5.3) to (7.5, 5.3) now reaches the upright wall at x 9, and says so", t1["x2"] == 9 and t1["y2"] == 5.3 and "Extended" in note(), [t1, note()])
    click(7.5, 5.6); page.wait_for_timeout(200); page.locator("[data-testid=trimext-2]").click(); page.wait_for_timeout(300); ws = saved("wall"); h2 = [x for x in ws if x["x1"] == 6.5 and x["y1"] == 5.6][0]
    ok("a wall that runs past another is TRIMMED back to it: (6.5, 5.6) to (9.8, 5.6) now ends at the upright wall, x 9, and says so", h2["x2"] == 9 and h2["y2"] == 5.6 and "Trimmed" in note(), [h2, note()])
    undo(); ws = saved("wall"); h2 = [x for x in ws if x["x1"] == 6.5 and x["y1"] == 5.6][0]; ok("one Undo takes the trim back", h2["x2"] == 9.8, h2)
    # ---------------- corner ----------------
    wall((6.5, 4.5), (7.5, 4.5)); wall((8.0, 4.3), (8.0, 4.8)); page.keyboard.press("Escape")
    click(7.0, 4.5); page.keyboard.down("Shift"); click(8.0, 4.65); page.keyboard.up("Shift"); page.wait_for_timeout(200)
    ok("with two walls selected there is a ⌐ Corner button", page.locator("[data-testid=walls-corner]").count() == 1)
    page.locator("[data-testid=walls-corner]").click(); page.wait_for_timeout(300); ws = saved("wall"); c1 = [key(x) for x in ws if x["x1"] == 6.5 and x["y1"] == 4.5]; c2 = [key(x) for x in ws if x["x1"] == 8 and x["y1"] in (4.3, 4.5)]
    ok("the two walls are joined at their corner (8, 4.5): the horizontal one extended to it, the upright one trimmed back to it", c1 == [(6.5, 4.5, 8, 4.5)] and c2 == [(8, 4.5, 8, 4.8)] and "Joined" in note(), [c1, c2, note()])
    undo(); ws = saved("wall"); ok("one Undo takes the corner back", [key(x) for x in ws if x["x1"] == 6.5 and x["y1"] == 4.5] == [(6.5, 4.5, 7.5, 4.5)] and [key(x) for x in ws if x["x1"] == 8 and x["y1"] == 4.3] == [(8, 4.3, 8, 4.8)], [key(x) for x in ws])
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl.value.save_as("/tmp/more-sheet.svg"); svg = open("/tmp/more-sheet.svg", encoding="utf-8").read()
    ok("no snap markers, handles or notes in the printed sheet", "snap-marker" not in svg and "data-handle" not in svg and "data-editor-only" not in svg)
    ok("no page errors", not errs, errs)
    print(f"\nPlacing snaps, perpendicular, parallel, trim, extend and corner in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
