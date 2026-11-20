# Dragging existing furniture and walls snaps their key points onto corners, ends, middles and crossings. PORT = where this folder is served.
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
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0), room("Bedroom", 0, 5, "5", "4")]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def screen(mx, my): return page.evaluate("([mx, my]) => { const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('[data-room]')); svg.scrollIntoView({ block: 'center', behavior: 'instant' }); const pt = svg.createSVGPoint(); pt.x = 10 + mx * 40; pt.y = 10 + my * 40; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }", [mx, my])
    def click(mx, my): x, y = screen(mx, my); page.mouse.move(x, y); page.wait_for_timeout(80); page.mouse.click(x, y); page.wait_for_timeout(200)
    def drag(frm, to, alt=False):
        x0, y0 = screen(*frm); x1, y1 = screen(*to)
        if alt: page.keyboard.down("Alt")
        page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=8); page.mouse.up()
        if alt: page.keyboard.up("Alt")
        page.wait_for_timeout(250)
    def saved(kind):
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); out = []
        for a in saves[-1] if saves else []:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); out += [x for x in o if x.get("kind") == kind]
        return out
    undo = lambda: (page.get_by_role("button", name=re.compile("Undo")).click(), page.wait_for_timeout(250))
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); page.wait_for_timeout(120); click(3, 7.5); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    s = saved("symbol"); ok("a smoke alarm is placed at (3, 7.5)", len(s) == 1 and s[0]["x"] == 3 and s[0]["y"] == 7.5, s)
    drag((3, 7.5), (5.03, 4.03)); s = saved("symbol")
    ok("dragging it to near the Lounge's corner snaps its middle exactly onto the corner (5, 4)", len(s) == 1 and s[0]["x"] == 5 and s[0]["y"] == 4, s)
    undo(); s = saved("symbol"); ok("one Undo puts it back where it was", s[0]["x"] == 3 and s[0]["y"] == 7.5, s)
    page.keyboard.press("Escape"); page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); click(1, 6); click(4, 6); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    drag((2.5, 6), (3.53, 4.97)); w = saved("wall"); w = [x for x in w if abs(x["y2"] - x["y1"]) < 0.001][0]
    ok("dragging a wall so that its far end is near the Bedroom's corner (5, 5) snaps that end exactly on it: the whole wall moves exactly (1, -1), to (2, 5) - (5, 5)", (w["x1"], w["y1"], w["x2"], w["y2"]) == (2, 5, 5, 5), w)
    drag((3.5, 5), (3.7125, 5.1125), alt=True); w = [x for x in saved("wall") if abs(x["y2"] - x["y1"]) < 0.001][0]
    ok("with Alt held, a drag moves exactly as far as the pointer (not onto the 5 cm grid, and not onto the corner it is near)", w["y1"] > 5.05 and (abs(round(w["x1"] / 0.05) * 0.05 - w["x1"]) > 0.003 or abs(round(w["y1"] / 0.05) * 0.05 - w["y1"]) > 0.003), w)
    page.keyboard.press("Escape"); drag((8, 8), (8.4, 8.4)); ok("dragging empty space does not move anything", len(saved("wall")) == 1)
    ok("no page errors", not errs, errs)
    print(f"\nDragging snaps onto corners in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
