# Colour and lock for layers of your own, in the real editor: drawn in colour, printed in the key, in the DXF, saved and loaded back. PORT = where this folder is served.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8767"); P = F = 0
RED = "#DC2626"
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:600])
def room(name, x, y, w="5", l="4", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
ROOMS = [room("Lounge", 0, 0), room("Bedroom", 0, 5, "5", "4")]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []; state = {"prompt": ""}
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("dialog", lambda d: d.accept(state["prompt"]) if d.type == "prompt" else d.accept())
    def mount(levels):
        page.goto(f"http://localhost:{PORT}/index.html"); page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", levels); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def screen(mx, my): return page.evaluate("([mx, my]) => { const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('[data-room]')); svg.scrollIntoView({ block: 'center', behavior: 'instant' }); const pt = svg.createSVGPoint(); pt.x = 10 + mx * 40; pt.y = 10 + my * 40; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }", [mx, my])
    def click(mx, my): x, y = screen(mx, my); page.mouse.move(x, y); page.wait_for_timeout(80); page.mouse.click(x, y); page.wait_for_timeout(200)
    def drag(frm, to):
        x0, y0 = screen(*frm); x1, y1 = screen(*to); page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up(); page.wait_for_timeout(250)
    def wall(a, c): page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); click(*a); click(*c); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    def saves_last():
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); s = page.evaluate("window.__saves || []"); return s[-1] if s else []
    def saved_walls():
        out = []
        for a in saves_last():
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); out += [x for x in o if x.get("kind") == "wall"]
        return out
    def saved_settings():
        for a in saves_last():
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict): return lvl.get("layerSettings")
        return None
    undo = lambda: (page.get_by_role("button", name=re.compile("Undo")).click(), page.wait_for_timeout(250))
    def menu():
        if not page.locator("[data-testid=layers-menu]").count(): page.locator("[data-testid=layers-button]").click(); page.wait_for_selector("[data-testid=layers-menu]")
        return page.locator("[data-testid=layers-menu]").inner_text()
    stroke = lambda sel: page.locator(sel).first.evaluate("e => e.getAttribute('stroke')")
    mount([{"name": "Ground floor", "rooms": ROOMS}])
    wall((1, 6), (4, 6)); wall((1, 8), (2, 8))
    page.locator("[data-testid=obj-select-all]").click(); page.wait_for_timeout(200)
    page.locator("[data-testid=layer-name]").fill("Electrics"); page.locator("[data-testid=layer-assign]").click(); page.wait_for_timeout(250)
    page.keyboard.press("Escape"); wall((3, 7), (4.5, 7)); page.keyboard.press("Escape"); menu()
    ok("each layer of your own has a colour choice and a lock button in the Layers menu", page.locator("[data-layer-colour='Electrics']").count() == 1 and page.locator("[data-layer-lock='Electrics']").count() == 1 and page.locator("[data-layer-colour='Electrics'] option").count() == 9)
    before = stroke("[data-layer='x:Electrics'] line")
    page.locator("[data-layer-colour='Electrics']").select_option(RED); page.wait_for_timeout(250)
    ok("choosing Red draws the layer's walls in red on screen, and the walls on other layers are unchanged", stroke("[data-layer='x:Electrics'] line") == RED and before != RED and stroke("[data-layer=walls] line") == before, [before, stroke("[data-layer='x:Electrics'] line")])
    undo(); ok("one Undo takes the colour back", stroke("[data-layer='x:Electrics'] line") == before)
    menu(); page.locator("[data-layer-colour='Electrics']").select_option(RED); page.wait_for_timeout(250)
    # ---- the printed sheet ----
    def open_export():
        if not page.locator("[data-testid=export-menu]").count(): page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    page.keyboard.press("Escape"); open_export()
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl.value.save_as("/tmp/ls-colour.svg"); svg = open("/tmp/ls-colour.svg", encoding="utf-8").read()
    ok("the printed sheet draws the layer in red AND lists it in the key: a red swatch and the name Electrics", svg.count(f'stroke="{RED}"') >= 3 and ">Electrics<" in svg and ">Key<" in svg, svg.count(f'stroke="{RED}"'))
    open_export(); page.get_by_role("button", name="Black & white").click()
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl.value.save_as("/tmp/ls-bw.svg"); bw = open("/tmp/ls-bw.svg", encoding="utf-8").read()
    ok("in black and white there is no red anywhere (it becomes a grey), and the key still names the layer", RED not in bw and "#111111" in bw and ">Electrics<" in bw)
    # ---- the DXF ----
    open_export(); page.get_by_role("button", name="Colour").click()
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("DXF")).first.click()
    dl.value.save_as("/tmp/ls.dxf")
    import ezdxf
    doc = ezdxf.readfile("/tmp/ls.dxf"); col = {l.dxf.name: l.color for l in doc.layers}
    ok("the DXF layer ELECTRICS has the colour number for red (1), read back by an independent DXF library, while WALLS keeps its own colour", col.get("ELECTRICS") == 1 and col.get("WALLS") != 1, col)
    # ---- lock ----
    page.keyboard.press("Escape"); menu(); page.locator("[data-layer-lock='Electrics']").click(); page.wait_for_timeout(250)
    ok("the lock button shows Locked, and the locked walls are marked locked on the plan", "Locked" in page.locator("[data-layer-lock='Electrics']").inner_text() and page.locator("[data-layer='x:Electrics'][data-locked=true]").count() == 2)
    page.keyboard.press("Escape"); click(2.5, 6); page.wait_for_timeout(200)
    ok("clicking a locked wall does not select it: no handles, no selection outline", page.locator("[data-handle=wall-end-1]").count() == 0 and page.locator("[data-selection-for]").count() == 0)
    locked0 = sorted((x["x1"], x["y1"], x["x2"], x["y2"]) for x in saved_walls() if x.get("lyr")); c0 = [x for x in saved_walls() if not x.get("lyr")][0]
    drag((4.5, 8.5), (5.0, 8.0))
    after = saved_walls(); locked1 = sorted((x["x1"], x["y1"], x["x2"], x["y2"]) for x in after if x.get("lyr")); c1 = [x for x in after if not x.get("lyr")][0]
    ok("dragging the ROOM the walls are in does not take the locked walls with it: they stay exactly where they are, while the unlocked wall is carried along as usual", locked1 == locked0 and (c1["x1"], c1["y1"]) != (c0["x1"], c0["y1"]), [locked0, locked1, c0, c1])
    undo(); ok("one Undo puts the room back", [(x["x1"], x["y1"]) for x in saved_walls() if not x.get("lyr")] == [(c0["x1"], c0["y1"])])
    page.locator("[data-testid=obj-select-all]").click(); page.wait_for_timeout(250)
    ok("Select all picks only what is not locked: just the one wall that is on no layer", page.locator("[data-selection-for]").count() == 1 and page.locator("[data-selection-for]").first.evaluate("e => document.querySelector('[data-object-id=\"' + e.getAttribute('data-selection-for') + '\"]').getAttribute('data-layer')") == "walls")
    page.keyboard.press("Delete"); page.wait_for_timeout(250); left = saved_walls()
    ok("pressing Delete with that selection deletes only the unlocked wall: the two locked walls are still there", len(left) == 2 and all(x.get("lyr") == "Electrics" for x in left), left)
    undo(); ok("one Undo brings it back", len(saved_walls()) == 3); page.keyboard.press("Escape")
    # ---- saved with the floor ----
    s = saved_settings(); s = json.loads(s) if isinstance(s, str) else s
    ok("saving sends the layer's colour and lock with the floor", s == {"Electrics": {"colour": RED, "locked": True}}, s)
    # ---- loaded back ----
    objs = [x for x in saved_walls()]
    mount([{"name": "Ground floor", "rooms": ROOMS, "objects": objs, "layerSettings": {"Electrics": {"colour": RED, "locked": True}}}])
    ok("opening the floor again: the layer's walls are red and locked", page.locator("[data-layer='x:Electrics'][data-locked=true]").count() == 2 and stroke("[data-layer='x:Electrics'] line") == RED)
    menu(); ok("and the Layers menu shows Red chosen and the lock on", page.locator("[data-layer-colour='Electrics']").input_value() == RED and "Locked" in page.locator("[data-layer-lock='Electrics']").inner_text())
    page.locator("[data-layer-lock='Electrics']").click(); page.wait_for_timeout(250)
    ok("unlocking makes the walls pickable again", page.locator("[data-layer='x:Electrics'][data-locked=true]").count() == 0)
    page.keyboard.press("Escape"); click(2.5, 6); page.wait_for_timeout(200); ok("a click now selects the wall (it has handles)", page.locator("[data-handle=wall-end-1]").count() == 1)
    # ---- rename and delete carry / remove the settings ----
    page.keyboard.press("Escape"); state["prompt"] = "Wiring"; menu(); page.locator("[data-layer-rename='Electrics']").click(); page.wait_for_timeout(300); menu()
    ok("renaming the layer keeps its colour", page.locator("[data-layer-colour='Wiring']").input_value() == RED and stroke("[data-layer='x:Wiring'] line") == RED)
    page.locator("[data-layer-delete='Wiring']").click(); page.wait_for_timeout(300)
    ok("deleting the layer sends its walls back to the usual layer, in the usual colour (nothing is deleted, no red left)", len(saved_walls()) == 3 and stroke("[data-layer=walls] line") != RED and page.locator("[data-layer-colour]").count() == 0)
    s = saved_settings(); ok("and its settings are gone from what is saved", s in (None, "", {}, "{}"), s)
    ok("no page errors", not errs, errs)
    print(f"\nLayer colour and lock in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
