# Layers of your own in the real editor: put things on a named layer, hide, rename, delete, export. PORT = where this folder is served.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8767"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:600])
def room(name, x, y, w="5", l="4", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []; state = {"prompt": "", "confirm": True}
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    def on_dialog(d):
        if d.type == "prompt": d.accept(state["prompt"])
        elif d.type == "confirm": d.accept() if state["confirm"] else d.dismiss()
        else: d.accept()
    page.on("dialog", on_dialog)
    page.goto(f"http://localhost:{PORT}/index.html")
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0), room("Bedroom", 0, 5, "5", "4")]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def screen(mx, my): return page.evaluate("([mx, my]) => { const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('[data-room]')); svg.scrollIntoView({ block: 'center', behavior: 'instant' }); const pt = svg.createSVGPoint(); pt.x = 10 + mx * 40; pt.y = 10 + my * 40; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }", [mx, my])
    def click(mx, my): x, y = screen(mx, my); page.mouse.move(x, y); page.wait_for_timeout(80); page.mouse.click(x, y); page.wait_for_timeout(200)
    def wall(a, c): page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); click(*a); click(*c); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    note = lambda: page.locator("[data-testid=tool-note]").inner_text() if page.locator("[data-testid=tool-note]").count() else ""
    def saved():
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); out = []
        for a in saves[-1] if saves else []:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); out += o
        return out
    undo = lambda: (page.get_by_role("button", name=re.compile("Undo")).click(), page.wait_for_timeout(250))
    def menu():
        if not page.locator("[data-testid=layers-menu]").count(): page.locator("[data-testid=layers-button]").click(); page.wait_for_selector("[data-testid=layers-menu]")
        return page.locator("[data-testid=layers-menu]").inner_text()
    wall((1, 6), (4, 6)); wall((1, 8), (2, 8))
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); page.wait_for_timeout(120); click(3, 7); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    page.locator("[data-testid=obj-select-all]").click(); page.wait_for_timeout(200)
    ok("with things selected there is a Layer field with 'Put on layer' and 'Usual layer' buttons", page.locator("[data-testid=layer-name]").count() == 1 and page.locator("[data-testid=layer-assign]").count() == 1 and page.locator("[data-testid=layer-clear]").count() == 1)
    page.locator("[data-testid=layer-name]").fill("Furniture"); page.locator("[data-testid=layer-assign]").click(); page.wait_for_timeout(200)
    ok("the name of a built-in layer is refused with the reason, and nothing changes", "cannot be the name of a built-in layer" in note() and not any("lyr" in o for o in saved()), note())
    page.locator("[data-testid=obj-select-all]").click(); page.locator("[data-testid=layer-name]").fill("Kitchen plan"); page.locator("[data-testid=layer-assign]").click(); page.wait_for_timeout(250); m = menu()
    ok("three things are put on a layer called Kitchen plan; the Layers menu shows 'Your layers' with Kitchen plan (3), and the built-in layers no longer count them (Free-standing walls (0), Safety and services (0))", "Your layers" in m and "Kitchen plan (3)" in m and "Free-standing walls (0)" in m and "Safety and services (0)" in m and "On the layer Kitchen plan" in note(), [m, note()])
    objs = saved(); ok("the layer is saved on each object: both walls and the alarm carry the name", len([o for o in objs if o.get("lyr") == "Kitchen plan"]) == 3, [(o["kind"], o.get("lyr")) for o in objs])
    ok("on screen they are on that layer instead of the usual ones", page.locator("[data-plan-objects] [data-layer='x:Kitchen plan']").count() == 3 and page.locator("[data-plan-objects] [data-layer=walls]").count() == 0)
    # export with the layer in the DXF
    page.keyboard.press("Escape")
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("DXF")).first.click()
    dl.value.save_as("/tmp/layers.dxf")
    import ezdxf
    doc = ezdxf.readfile("/tmp/layers.dxf"); names = [l.dxf.name for l in doc.layers]; on = [e for e in doc.modelspace() if e.dxf.layer == "KITCHEN_PLAN"]
    lens = sorted(round(((e.dxf.end.x - e.dxf.start.x) ** 2 + (e.dxf.end.y - e.dxf.start.y) ** 2) ** 0.5) for e in on if e.dxftype() == "LINE")
    ok("the DXF (read back by an independent DXF library) has a layer called KITCHEN_PLAN in its layer list, and on it the two walls at their true lengths (1,000 mm and 3,000 mm) and the alarm's lines; the rooms' own outlines stay on WALLS", "KITCHEN_PLAN" in names and 1000 in lens and 3000 in lens and len(on) >= 3 and sum(1 for e in doc.modelspace() if e.dxf.layer == "WALLS") >= 1, [names, lens])
    # hide: screen only
    menu(); page.locator("[data-layer-toggle='x:Kitchen plan']").uncheck(); page.wait_for_timeout(200)
    ok("hiding the layer hides all three on screen, and the Layers button says one layer is hidden", all(page.locator("[data-plan-objects] [data-layer='x:Kitchen plan']").nth(i).evaluate("e => getComputedStyle(e).display") == "none" for i in range(3)) and "1 hidden" in page.locator("[data-testid=layers-button]").inner_text())
    page.keyboard.press("Escape"); page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl2: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl2.value.save_as("/tmp/layers-hidden.svg"); svg = open("/tmp/layers-hidden.svg", encoding="utf-8").read()
    ok("a hidden layer still prints: the exported sheet has its walls (and no display:none anywhere)", svg.count("<line") >= 2 and "display:none" not in svg.replace(" ", ""), svg.count("<line"))
    menu(); page.locator("[data-layer-toggle='x:Kitchen plan']").check(); page.wait_for_timeout(150)
    # rename
    state["prompt"] = "Services plan"; page.locator("[data-layer-rename='Kitchen plan']").click(); page.wait_for_timeout(300); m = menu(); objs = saved()
    ok("renaming to 'Services plan' moves everything on it: the menu says Services plan (3), and all three saved objects carry the new name", "Services plan (3)" in m and "Kitchen plan" not in m and len([o for o in objs if o.get("lyr") == "Services plan"]) == 3, [m])
    state["prompt"] = "Walls"; page.locator("[data-layer-rename='Services plan']").click(); page.wait_for_timeout(250)
    ok("renaming to a built-in name is refused with the reason, and the layer keeps its name", "built-in layer" in note() and "Services plan (3)" in menu(), note())
    # undo of one action
    undo(); ok("Undo takes the (refused rename's none, then the) rename back in ONE step: the layer is called Kitchen plan again", "Kitchen plan (3)" in menu(), menu())
    # delete
    page.locator("[data-layer-delete='Kitchen plan']").click(); page.wait_for_timeout(300); m = menu(); objs = saved()
    ok("deleting the layer deletes NOTHING on the plan: all three are still there, back on their usual layers (Free-standing walls (2), Safety and services (1)), and 'Your layers' is gone", len(objs) == 3 and not any("lyr" in o for o in objs) and "Free-standing walls (2)" in m and "Safety and services (1)" in m and "Your layers" not in m, [len(objs), m])
    undo(); ok("one Undo brings the layer back", "Kitchen plan (3)" in menu())
    # usual layer button
    page.keyboard.press("Escape"); page.locator("[data-testid=obj-select-all]").click(); page.locator("[data-testid=layer-clear]").click(); page.wait_for_timeout(250)
    ok("'Usual layer' puts the selection back on its usual layers", "Your layers" not in menu() and not any("lyr" in o for o in saved()))
    ok("no page errors", not errs, errs)
    print(f"\nLayers of your own in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
