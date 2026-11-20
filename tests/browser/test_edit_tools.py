# Mirror, copies in a row, a room's dimensions in one click, and snapping when a handle is dragged, in the real editor. PORT = where this folder is served.
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
    def click(mx, my, dx=0, dy=0): x, y = screen(mx, my); page.mouse.move(x + dx, y + dy); page.wait_for_timeout(80); page.mouse.click(x + dx, y + dy); page.wait_for_timeout(200)
    def drag(frm, to, shift=False, alt=False):
        x0, y0 = screen(*frm); x1, y1 = screen(*to)
        if shift: page.keyboard.down("Shift")
        if alt: page.keyboard.down("Alt")
        page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up()
        if shift: page.keyboard.up("Shift")
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
    note = lambda: page.locator("[data-testid=tool-note]").inner_text() if page.locator("[data-testid=tool-note]").count() else ""
    def wall(a, b2): page.locator("[data-testid=wall-button]").click(); page.wait_for_timeout(120); click(*a); click(*b2); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    wall((1, 6), (4, 6)); wall((1, 8), (2, 8))
    ok("two walls drawn: A (1, 6) to (4, 6) and B (1, 8) to (2, 8)", [(w["x1"], w["y1"], w["x2"], w["y2"]) for w in saved("wall")] == [(1, 6, 4, 6), (1, 8, 2, 8)], saved("wall"))
    # ---------------- mirror ----------------
    page.locator("[data-testid=obj-select-all]").click(); page.wait_for_timeout(200)
    ok("with things selected there are ⇆ Mirror and ⇅ Flip buttons and the copies controls", page.locator("[data-testid=obj-mirror-v]").count() == 1 and page.locator("[data-testid=obj-mirror-h]").count() == 1 and page.locator("[data-testid=array-controls]").count() == 1)
    page.locator("[data-testid=obj-mirror-h]").click(); page.wait_for_timeout(250); w = saved("wall"); byid = sorted((x["y1"], x["x1"], x["x2"]) for x in w)
    ok("⇅ Flip swaps top and bottom about the middle of the selection: wall A (was y 6) is now at y 8, and B (was y 8) at y 6, sideways positions unchanged", byid == [(6, 1, 2), (8, 1, 4)], byid)
    undo(); w = saved("wall"); ok("ONE Undo puts it all back", sorted((x["y1"], x["x1"], x["x2"]) for x in w) == [(6, 1, 4), (8, 1, 2)], w)
    page.locator("[data-testid=obj-select-all]").click(); page.wait_for_timeout(150); page.locator("[data-testid=obj-mirror-v]").click(); page.wait_for_timeout(250); w = sorted((x["y1"], x["x1"], x["x2"]) for x in saved("wall"))
    ok("⇆ Mirror swaps left and right: A runs from x 4 to x 1 (its ends swapped), and B (was 1 to 2) from 4 to 3; heights unchanged", w == [(6, 4, 1), (8, 4, 3)], w)
    undo(); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    # ---------------- copies in a row ----------------
    click(2.5, 6); page.wait_for_timeout(150)
    page.locator("[data-testid=array-count]").fill("2"); page.locator("[data-testid=array-dx]").fill("0"); page.locator("[data-testid=array-dy]").fill("0.5"); page.locator("[data-testid=array-make]").click(); page.wait_for_timeout(300); w = saved("wall")
    ok("two copies of wall A, each 0.5 m further down: walls at y 6, 6.5, 7 and the other wall at 8; the note says 2 copies were made", sorted(x["y1"] for x in w) == [6, 6.5, 7, 8] and "2 copies made" in note(), [x["y1"] for x in w])
    undo(); ok("both copies come off with ONE Undo", len(saved("wall")) == 2, saved("wall"))
    click(2.5, 6); page.locator("[data-testid=array-count]").fill("3"); page.locator("[data-testid=array-dx]").fill("-2"); page.locator("[data-testid=array-dy]").fill("0"); page.locator("[data-testid=array-make]").click(); page.wait_for_timeout(250)
    ok("copies that would go off the left of the plan are refused, with the reason, and nothing is added", "off the top or left" in note() and len(saved("wall")) == 2, note())
    click(2.5, 6); page.locator("[data-testid=array-dx]").fill("0"); page.locator("[data-testid=array-dy]").fill("0"); page.locator("[data-testid=array-make]").click(); page.wait_for_timeout(250)
    ok("copies on top of the original (no distance) are refused, with the reason", "not on top of each other" in note() and len(saved("wall")) == 2, note())
    # ---------------- a room's dimensions ----------------
    page.keyboard.press("Escape"); click(8, 7.5); ok("with no room selected there is no 'Dimension room' button", page.locator("[data-testid=dim-room-button]").count() == 0)
    click(2.5, 2.4); page.wait_for_timeout(200)
    ok("selecting a room offers '↔ Dimension room'", page.locator("[data-testid=dim-room-button]").count() == 1)
    page.locator("[data-testid=dim-room-button]").click(); page.wait_for_timeout(300); d = saved("dim"); ds = sorted((x["x1"], x["y1"], x["x2"], x["y2"], x["off"]) for x in d)
    ok("one click adds the Lounge's width along its bottom (0 to 5, 0.5 m below) and its length down its right side (0 to 4, 0.5 m out)", ds == [(0, 4, 5, 4, 0.5), (5, 0, 5, 4, -0.5)], ds)
    texts = page.locator("[data-plan-objects] [data-object-kind=dim]").all_text_contents()
    ok("they read 5.00 m and 4.00 m", sorted(t.strip() for t in texts) == ["4.00 m", "5.00 m"], texts)
    page.locator("[data-testid=dim-room-button]").click(); page.wait_for_timeout(250)
    ok("clicking it again adds nothing and says why", len(saved("dim")) == 2 and "already has its dimensions" in note(), [len(saved("dim")), note()])
    undo(); page.wait_for_timeout(200); ok("both dimensions come off with ONE Undo", len(saved("dim")) == 0, saved("dim"))
    # ---------------- dragging a handle ----------------
    page.keyboard.press("Escape"); click(2.5, 6); page.wait_for_timeout(200)
    ok("a selected wall has handles at its two ends", page.locator("[data-handle=wall-end-1]").count() == 1 and page.locator("[data-handle=wall-end-2]").count() == 1)
    drag((4, 6), (5.04, 4.05)); w = [x for x in saved("wall") if x["x1"] == 1 and x["y1"] == 6][0]
    ok("dragging a wall's end to near the Lounge's corner (5, 4) snaps it exactly onto the corner", w["x2"] == 5 and w["y2"] == 4, w)
    drag((5, 4), (4.6, 6.3), shift=True); w = [x for x in saved("wall") if x["x1"] == 1 and x["y1"] == 6][0]
    ok("dragging with Shift held keeps it level from the other end: to the right of (1, 6) at the same height, 4.6 across", w["y2"] == 6 and abs(w["x2"] - 4.6) < 0.001, w)
    drag((4.6, 6), (4.08, 6.1)); w = [x for x in saved("wall") if x["x1"] == 1 and x["y1"] == 6][0]
    ok("dragging with nothing near goes to the 5 cm grid and is NOT pulled straight any more (4.1 across, 6.1 down, where the old 15 cm nudge would have flattened it to 6)", abs(w["x2"] - 4.1) < 0.001 and abs(w["y2"] - 6.1) < 0.001, w)
    drag((4.1, 6.1), (3.013, 6.007), alt=True); w = [x for x in saved("wall") if x["x1"] == 1 and x["y1"] == 6][0]
    ok("Alt puts the end exactly where the pointer is (not on the grid): not a multiple of 5 cm", abs(round(w["x2"] / 0.05) * 0.05 - w["x2"]) > 0.0005 or abs(round(w["y2"] / 0.05) * 0.05 - w["y2"]) > 0.0005, w)
    page.keyboard.press("Escape"); page.locator("[data-testid=dim-button]").click(); page.wait_for_timeout(120); click(0, 4, 3, -2); click(2, 4, 0, 0); click(1, 4.5); page.keyboard.press("Escape"); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    click(1, 4.5); page.wait_for_timeout(250)
    if page.locator("[data-handle=dim-end-2]").count() == 1:
        drag((2, 4), (5.03, 4.04)); dd = saved("dim")
        ok("a dimension's measured point also snaps when dragged: its end goes exactly onto the Lounge's corner (5, 4)", len(dd) >= 1 and any(x["x2"] == 5 and x["y2"] == 4 for x in dd), dd)
    else:
        ok("a dimension was selected to test its handle", False, "no dim handle")
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl.value.save_as("/tmp/edit-sheet.svg"); svg = open("/tmp/edit-sheet.svg", encoding="utf-8").read()
    ok("handles and notes never reach the printed sheet", "data-handle" not in svg and "tool-note" not in svg and "data-editor-only" not in svg)
    ok("no page errors", not errs, errs)
    print(f"\nMirror, copies, room dimensions and handle snapping in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
