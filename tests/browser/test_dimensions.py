# Dimension lines in the real editor: the three-click tool with snaps, the saved plan, editing (offset, flip, handles), the Dimensions layer, the printed sheet and DXF. PORT = where this folder is served.
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
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.goto(f"http://localhost:{PORT}/index.html")
    levels = [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0), room("Hall", 6, 0, "4", "4", shape="l-shape", notchWidthM="2", notchDepthM="2"), room("Bedroom", 0, 5, "5", "4")]}]
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", levels); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    def screen(mx, my): return page.evaluate("([mx, my]) => { const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('[data-room]')); svg.scrollIntoView({ block: 'center', behavior: 'instant' }); const pt = svg.createSVGPoint(); pt.x = 10 + mx * 40; pt.y = 10 + my * 40; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }", [mx, my])
    def move(mx, my, dx=0, dy=0): x, y = screen(mx, my); page.mouse.move(x + dx, y + dy); page.wait_for_timeout(120)
    def click(mx, my, dx=0, dy=0): x, y = screen(mx, my); page.mouse.move(x + dx, y + dy); page.wait_for_timeout(80); page.mouse.click(x + dx, y + dy); page.wait_for_timeout(180)
    marker = lambda: page.locator("[data-testid=snap-marker]")
    status = lambda: page.locator("[data-testid=wall-status]").inner_text() if page.locator("[data-testid=wall-status]").count() else ""
    dims = lambda: page.locator("[data-plan-objects] [data-object-kind=dim]")
    def saved_dims():
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); out = []
        for a in saves[-1] if saves else []:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); out += [x for x in o if x.get("kind") == "dim"]
        return out
    page.locator("[data-testid=dim-button]").click(); page.wait_for_timeout(200)
    ok("the toolbar has a '↔ Dimension' button; choosing it says to click the first point, and the status line agrees", "Dimension" in page.locator("[data-testid=dim-button]").inner_text() and "Click the first point" in page.locator("[data-testid=placing-hint]").inner_text() and status().startswith("Click the first point"), status())
    move(0, 4, 3, -2); ok("the first point snaps like a wall's: near the Lounge's bottom-left corner there is an Endpoint marker, and the status says so", marker().count() == 1 and marker().get_attribute("data-snap-kind") == "endpoint" and "Snap: Endpoint" in status(), [marker().count(), status()])
    click(0, 4, 3, -2); ok("after the first click it asks for the second point", "Click the second point" in page.locator("[data-testid=placing-hint]").inner_text() and status().startswith("Click the second point"), status())
    move(5, 4, -3, 2); ok("moving to the other corner shows the live length, 5.00 m, and snaps to that corner too", "Length 5.00 m" in status() and marker().get_attribute("data-snap-kind") == "endpoint", status())
    click(5, 4, -3, 2); ok("after the second click it asks how far out the line should sit", "how far out the dimension line sits" in page.locator("[data-testid=placing-hint]").inner_text() and "Move to set how far out" in status(), status())
    move(2.5, 4.9); ok("moving out shows the offset live (0.90 m) and a preview of the dimension with its text", "Offset 0.90 m" in status() and page.locator("[data-editor-only] text", has_text="5.00 m").count() >= 1, status())
    click(2.5, 4.9); page.wait_for_timeout(250)
    ok("the third click places it: one dimension, on the Dimensions layer, reading 5.00 m", dims().count() == 1 and dims().first.get_attribute("data-layer") == "dimensions" and "5.00 m" in dims().first.text_content(), [dims().count(), dims().first.text_content() if dims().count() else None])
    ok("the tool stays ready for the next dimension (so a run of them is quick), asking for a first point again", "Click the first point" in page.locator("[data-testid=placing-hint]").inner_text())
    d = saved_dims()
    ok("it is saved exactly: from the corner (0, 4) to the corner (5, 4), 0.9 m out (where the third click was, not a fixed amount)", len(d) == 1 and d[0]["x1"] == 0 and d[0]["y1"] == 4 and d[0]["x2"] == 5 and d[0]["y2"] == 4 and d[0]["off"] == 0.9 and d[0].get("id"), d)
    # ---- the printed sheet and the DXF ----
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl.value.save_as("/tmp/dims-sheet.svg"); svg = open("/tmp/dims-sheet.svg", encoding="utf-8").read(); texts = re.findall(r"<text[^>]*>([^<]*)</text>", svg)
    ok("the exported sheet shows the dimension: its text '5.00 m' and its colour", "5.00 m" in texts and "#0E7490" in svg.upper(), texts[:12])
    ok("nothing of the tool leaks into the sheet: no snap marker, no status text, no preview", "snap-marker" not in svg and "Click the first point" not in svg and "data-editor-only" not in svg and "Object snap" not in svg)
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl2: page.get_by_role("menuitem", name=re.compile("DXF")).first.click()
    dl2.value.save_as("/tmp/dims.dxf")
    import ezdxf
    doc = ezdxf.readfile("/tmp/dims.dxf"); on = [e for e in doc.modelspace() if e.dxf.layer == "DIMENSIONS"]; tx = [e for e in on if e.dxftype() == "TEXT"]; ln = [e for e in on if e.dxftype() == "LINE"]
    ok("the DXF (read back by an independent DXF library) has the dimension on its own DIMENSIONS layer: five lines and the text 5.00 m", len(ln) == 5 and len(tx) == 1 and tx[0].dxf.text == "5.00 m", [e.dxftype() for e in on])
    ok("the DXF dimension line is the true length, 5,000 mm", max(((e.dxf.end.x - e.dxf.start.x) ** 2 + (e.dxf.end.y - e.dxf.start.y) ** 2) ** 0.5 for e in ln) > 4999 and max(((e.dxf.end.x - e.dxf.start.x) ** 2 + (e.dxf.end.y - e.dxf.start.y) ** 2) ** 0.5 for e in ln) < 5001)
    # ---- selecting and editing ----
    page.locator("[data-testid=wall-button]").click(); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    if page.locator("[data-testid=placing-hint]").count(): page.keyboard.press("Escape")
    click(2.5, 4.9); page.wait_for_timeout(200)
    ok("clicking the dimension line selects it: the panel says 'Dimension 5.00 m', and it has a handle at each measured point and one for the offset", "Dimension 5.00 m" in page.locator("[data-testid=selected-title]").inner_text() and page.locator("[data-handle=dim-end-1]").count() == 1 and page.locator("[data-handle=dim-end-2]").count() == 1 and page.locator("[data-handle=dim-off]").count() == 1, page.locator("[data-testid=selected-title]").inner_text() if page.locator("[data-testid=selected-title]").count() else "no panel")
    page.locator("[data-testid=obj-off]").fill("-0.8"); page.keyboard.press("Enter"); page.wait_for_timeout(250); d = saved_dims()
    ok("typing an offset of -0.8 puts the line on the other side, 0.8 m out (above the wall); the length is unchanged", len(d) == 1 and d[0]["off"] == -0.8 and "5.00 m" in dims().first.text_content(), d)
    click(2.5, 3.2); page.wait_for_timeout(150); page.locator("[data-testid=dim-flip]").click(); page.wait_for_timeout(250); d = saved_dims()
    ok("'Flip side' swaps it to the other side (0.8 m)", d[0]["off"] == 0.8, d)
    hx, hy = screen(2.5, 4.8); ox, oy = screen(2.5, 5.2)
    page.mouse.move(hx, hy); page.mouse.down(); page.mouse.move(ox, oy, steps=6); page.mouse.up(); page.wait_for_timeout(250); d = saved_dims()
    ok("dragging the offset handle moves the line: 1.2 m out now (5 cm steps)", d[0]["off"] == 1.2, d)
    e2x, e2y = screen(5, 4); t2x, t2y = screen(4, 4); page.mouse.move(e2x, e2y); page.mouse.down(); page.mouse.move(t2x, t2y, steps=6); page.mouse.up(); page.wait_for_timeout(250); d = saved_dims()
    ok("dragging a measured-point handle shortens it: the second point is now at (4, 4), the text reads 4.00 m, and the first point and the offset are unchanged", d[0]["x2"] == 4 and d[0]["y2"] == 4 and d[0]["x1"] == 0 and d[0]["off"] == 1.2 and "4.00 m" in dims().first.text_content(), d)
    # ---- the layer ----
    page.locator("[data-testid=layers-button]").click(); menu = page.locator("[data-testid=layers-menu]").inner_text()
    ok("the Layers menu lists Dimensions with how many are on the plan", "Dimensions (1)" in menu, menu)
    page.locator("[data-layer-toggle=dimensions]").uncheck(); page.wait_for_timeout(200)
    ok("hiding the Dimensions layer hides the dimension on screen", dims().first.evaluate("e => getComputedStyle(e).display") == "none")
    page.keyboard.press("Escape"); page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl3: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl3.value.save_as("/tmp/dims-hidden.svg"); svg2 = open("/tmp/dims-hidden.svg", encoding="utf-8").read()
    ok("a hidden dimension still prints (hiding only tidies the screen), and now reads 4.00 m", "4.00 m" in re.findall(r"<text[^>]*>([^<]*)</text>", svg2) and "display:none" not in svg2.replace(" ", ""), re.findall(r"<text[^>]*>([^<]*)</text>", svg2)[:10])
    page.locator("[data-testid=layers-button]").click() if page.locator("[data-layer-toggle=dimensions]").count() == 0 else None
    page.locator("[data-layer-toggle=dimensions]").check(); page.wait_for_timeout(150)
    # ---- undo, and a second dimension ----
    page.keyboard.press("Escape"); page.get_by_role("button", name=re.compile("Undo")).click(); page.wait_for_timeout(250)
    ok("Undo takes the last change back (the shortening: 5.00 m again)", "5.00 m" in dims().first.text_content(), dims().first.text_content())
    ok("no page errors", not errs, errs)
    print(f"\nDimension lines in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
