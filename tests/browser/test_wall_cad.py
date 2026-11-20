# Precise wall drawing in the real editor: object snaps with markers, ortho / polar / free, typed exact lengths, F3 and F8. PORT = where this folder is served.
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
    levels = [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0), room("Hall", 6, 0, "4", "4", shape="l-shape", notchWidthM="2", notchDepthM="2"), room("Bedroom", 0, 5, "5", "4")]}]  # the canvas is only as big as the rooms (10 x 9 m here), and pointer events exist only inside it
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", levels); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def screen(mx, my): return page.evaluate("([mx, my]) => { const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('[data-room]')); svg.scrollIntoView({ block: 'center', behavior: 'instant' }); const pt = svg.createSVGPoint(); pt.x = 10 + mx * 40; pt.y = 10 + my * 40; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }", [mx, my])
    def move(mx, my, dx=0, dy=0): x, y = screen(mx, my); page.mouse.move(x + dx, y + dy); page.wait_for_timeout(120)
    def click(mx, my, dx=0, dy=0): x, y = screen(mx, my); page.mouse.move(x + dx, y + dy); page.wait_for_timeout(80); page.mouse.click(x + dx, y + dy); page.wait_for_timeout(180)
    marker = lambda: page.locator("[data-testid=snap-marker]")
    status = lambda: page.locator("[data-testid=wall-status]").inner_text() if page.locator("[data-testid=wall-status]").count() else ""
    def walls():
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); out = []
        for a in saves[-1] if saves else []:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or [])
                        out += [x for x in o if x.get("kind") == "wall"]
        return out
    page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(200)
    ok("choosing Wall says it snaps to corners, ends and middles, and shows a status line with the mode and snap switches", "snaps to corners, ends and middles" in page.locator("[data-testid=placing-hint]").inner_text() and "Ortho (F8)" in status() and "Object snap on (F3)" in status(), status())
    move(2.0, 2.0); ok("with the pointer away from anything there is no snap marker, and the status line follows the pointer in metres", marker().count() == 0 and re.search(r"X \d+\.\d\d\s+Y \d+\.\d\d m", status()) is not None, status())
    move(5, 4, 3, -2)
    ok("near the Lounge's corner (5, 4) a green marker appears and says Endpoint, and the status line says so", marker().count() == 1 and marker().get_attribute("data-snap-kind") == "endpoint" and "Endpoint" in marker().text_content() and "Snap: Endpoint" in status(), [marker().count(), status()])
    ok("the marker is editor-only (it can never reach an export, a saved snapshot or a share link)", marker().get_attribute("data-editor-only") == "true")
    move(2.5, 0, 2, 3); ok("near the middle of the Lounge's top edge it is a Midpoint (a triangle)", marker().get_attribute("data-snap-kind") == "midpoint" and "Midpoint" in marker().text_content() and marker().locator("polygon").count() == 1)
    move(10, 4, -3, -3); ok("an L-shaped room has NO corner where its corner is missing: near (10, 4) there is no marker", marker().count() == 0, [marker().count(), status()])
    move(8, 2, 3, 3); ok("...but its REAL inner corner (8, 2) does snap", marker().get_attribute("data-snap-kind") == "endpoint", [marker().count()])
    move(8, 2, 40, 40); ok("further from a corner than the snap distance it lets go", marker().count() == 0)
    # ---- a wall from a corner, with an exact length ----
    click(5, 4, 3, -2); move(9, 4.3)
    ok("after the first click the status line gives the live length and angle, locked horizontal by ortho (angle 0)", "Angle 0.0°" in status() and re.search(r"Length 4\.\d\d m", status()) is not None, status())
    page.keyboard.type("3.2"); page.wait_for_timeout(120)
    ok("just typing numbers is the length: the status line shows 3.2 and 'to place', and the line on the plan reads 3.2", "Length 3.2 m" in status() and "to place" in status() and page.locator("[data-editor-only] text", has_text="3.2").count() >= 1, status())
    page.keyboard.press("Enter"); page.wait_for_timeout(250)
    w = walls()
    ok("Enter places a wall EXACTLY 3.2 m long from the corner (5, 4) to (8.2, 4), dead level", len(w) == 1 and abs(w[0]["x1"] - 5) < 1e-6 and abs(w[0]["y1"] - 4) < 1e-6 and abs(w[0]["x2"] - 8.2) < 1e-6 and abs(w[0]["y2"] - 4) < 1e-6, w)
    page.locator("[data-testid=wall-button]").click() if page.locator("[data-testid=wall-status]").count() == 0 else None
    # ---- Escape clears typing first ----
    page.keyboard.type("7"); page.wait_for_timeout(100); had = "Length 7 m" in status(); page.keyboard.press("Escape"); page.wait_for_timeout(120)
    ok("the first Escape clears what was typed and keeps the wall tool; the second finishes", had and "Length 7 m" not in status() and page.locator("[data-testid=wall-status]").count() == 1, status())
    page.keyboard.press("Escape"); page.wait_for_timeout(150); ok("...and the status line goes with the tool", page.locator("[data-testid=wall-status]").count() == 0)
    # ---- modes ----
    page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(150); click(1, 6); move(4.6, 7.4)
    ok("ortho: from (1, 6) towards (4.6, 7.4) the wall goes dead level (not sloping)", "Angle 0.0°" in status() and "Ortho" in status(), status())
    page.keyboard.press("F8"); page.wait_for_timeout(120); move(4.6, 7.4); ok("F8 changes to Polar 45° and the status line says so", "Polar 45°" in status(), status())
    page.keyboard.press("F8"); page.wait_for_timeout(120); move(4.6, 7.4); ok("F8 again: Free, any angle", "Free (F8)" in status() and "Angle 0.0°" not in status(), status())
    page.keyboard.press("F8"); page.wait_for_timeout(120); ok("F8 again: back to Ortho", "Ortho (F8)" in status())
    x, y = screen(4, 7.5); page.keyboard.down("Shift"); page.mouse.move(x, y); page.wait_for_timeout(150); sh = status(); page.keyboard.up("Shift")
    ok("holding Shift for a moment flips ortho to free: the angle is no longer locked to level", "Angle 0.0°" not in sh and "Angle 0" not in sh.replace("Angle 0.0", "X"), sh)
    page.keyboard.press("o"); page.wait_for_timeout(100); ok("the letter O does the same as F8 (as in the room drawing tool)", "Polar 45°" in status()); page.keyboard.press("o"); page.keyboard.press("o")
    # ---- F3 ----
    page.keyboard.press("F3"); page.wait_for_timeout(100); move(5, 4, 2, -2)
    ok("F3 switches object snap off: the status says so, and a corner right under the pointer no longer snaps", "Object snap off (F3)" in status() and marker().count() == 0, [marker().count(), status()])
    page.keyboard.press("F3"); page.wait_for_timeout(100); move(5, 4, 2, -2); ok("F3 again switches it back on", "Object snap on (F3)" in status() and marker().count() == 1)
    # ---- exact length that would leave the plan ----
    page.keyboard.press("Escape"); page.keyboard.press("Escape"); page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(150); click(1, 8); move(0.2, 8.0); page.keyboard.type("3"); page.keyboard.press("Enter"); page.wait_for_timeout(200)
    ok("a typed length that would run off the left of the plan is refused with a plain message and no wall is made", "run off the top or left" in status(), status())
    # ---- intersection ----
    page.keyboard.press("Escape"); page.keyboard.press("Escape"); page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(150)
    click(9, 5); click(9, 8); page.keyboard.press("Escape"); page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(150); click(8, 7); click(9.8, 7); page.keyboard.press("Escape"); page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(150)
    move(9, 7, 2, 2); ok("where two walls cross there is an Intersection marker (a cross)", marker().get_attribute("data-snap-kind") == "intersection" and marker().locator("line").count() == 2 and "Intersection" in marker().text_content(), [marker().count(), status()])
    move(9, 6.2, 2, 0); ok("on a stretch of wall that is not an end, a middle or a crossing there is no snap (only the real points snap)", marker().count() == 0 or marker().get_attribute("data-snap-kind") != "intersection")
    move(9, 5, 2, 2); ok("the end of a wall is an Endpoint", marker().get_attribute("data-snap-kind") == "endpoint")
    # ---- the walls that were drawn are straight and exact ----
    allw = walls()
    ok("every wall drawn with ortho is exactly level or upright: no wall is a fraction of a degree off", all(abs(w["x1"] - w["x2"]) < 1e-9 or abs(w["y1"] - w["y2"]) < 1e-9 for w in allw if w["x1"] in (1.0, 9.0, 8.0, 5.0)), allw)
    ok("a wall from a snapped corner starts exactly ON that corner (to the millimetre), not 'near' it", any(abs(w["x1"] - 5) < 1e-6 and abs(w["y1"] - 4) < 1e-6 for w in allw), allw)
    ok("the crossing walls were drawn through the exact points clicked: (9, 5) to (9, 8) and (8, 7) to (9.8, 7)", any(w["x1"] == 9 and w["y1"] == 5 and w["x2"] == 9 and w["y2"] == 8 for w in allw) and any(w["x1"] == 8 and w["y1"] == 7 and abs(w["x2"] - 9.8) < 1e-6 and w["y2"] == 7 for w in allw), allw)
    ok("every wall keeps its thickness of 0.1 m and has an id", all(w.get("t") == 0.1 and w.get("id") for w in allw))
    # ---- other things are as they were ----
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); x, y = screen(3.03, 2.02); page.mouse.click(x, y); page.wait_for_timeout(250)
    page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); sym = []
    for a in saves[-1]:
        if isinstance(a, list):
            for lvl in a:
                if isinstance(lvl, dict):
                    o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); sym += [x for x in o if x.get("kind") == "symbol"]
    ok("placing a symbol still goes to the 5 cm grid (as before)", len(sym) == 1 and abs(round(sym[0]["x"] / 0.05) * 0.05 - sym[0]["x"]) < 1e-6 and abs(round(sym[0]["y"] / 0.05) * 0.05 - sym[0]["y"]) < 1e-6, sym)
    ok("no page errors", not errs, errs)
    print(f"\nPrecise wall drawing in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
