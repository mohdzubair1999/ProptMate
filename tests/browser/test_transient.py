# Whatever is on screen only because you are EDITING (selection outlines, handles, hover previews, a half-drawn wall, the grid ...) must never reach an
# export. This exports the same plan in many editing states and requires every export to be identical to a clean one.
import os, re, sys
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:600])
def room(name, x, y, w="4", l="3"): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.goto(f"http://localhost:{PORT}/index.html"); page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", [{"name": "Ground floor", "rooms": [room("Kitchen", 0, 0), room("Lounge", 4.5, 0)]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(400)
    svgEl = page.locator("svg").filter(has=page.locator("[data-room]")).first
    def at(dx, dy): svgEl.scroll_into_view_if_needed(); bb = svgEl.bounding_box(); return bb["x"] + dx, bb["y"] + dy
    def export():
        page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
        with page.expect_download() as d: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
        d.value.save_as("/tmp/transient.svg"); return open("/tmp/transient.svg", encoding="utf-8").read()
    def escape(): page.keyboard.press("Escape"); page.wait_for_timeout(150)
    # place one symbol so there is an object to select
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); x, y = at(90, 90); page.mouse.click(x, y); page.wait_for_timeout(300)
    escape(); x, y = at(40, 150); page.mouse.click(x, y); page.wait_for_timeout(200); escape()
    base = export(); ok("the clean export has the rooms, the alarm and the plan's own labels", base.count("<polygon") >= 2 and "Kitchen" in base and "Lounge" in base)
    def same(label, svg):
        if svg == base: ok(label, True); return
        a, b2 = base.split("<"), svg.split("<"); extra = [t for t in b2 if t not in a][:3]; missing = [t for t in a if t not in b2][:3]
        ok(label, False, {"extra in the export": [t[:120] for t in extra], "missing from it": [t[:120] for t in missing]})
    # 1. a room selected
    x, y = at(60, 60); page.mouse.click(x, y); page.wait_for_timeout(250); same("with a ROOM selected (its outline and handles showing), the export is identical to the clean one", export()); escape()
    # 2. the alarm selected
    obj = page.locator("[data-plan-objects] [data-object-kind=symbol]").first; obj.click(); page.wait_for_timeout(250); ok("(the alarm really is selected: its options appear)", page.locator("[data-testid=obj-delete]").count() == 1); same("with an OBJECT selected (selection box, resize and rotate handles), the export is identical to the clean one", export()); escape()
    # 3. placing mode with the pointer hovering over the plan
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=heat-alarm]").click(); x, y = at(200, 120); page.mouse.move(x, y); page.mouse.move(x + 20, y + 10, steps=4); page.wait_for_timeout(250); same("while PLACING an item with the pointer hovering (the ghost preview showing), the export is identical to the clean one", export()); escape()
    # 4. a wall started
    wall_btn = page.get_by_role("button", name=re.compile(r"Wall")).first
    if wall_btn.count(): wall_btn.click(); x, y = at(150, 200); page.mouse.click(x, y); page.mouse.move(x + 60, y + 5, steps=4); page.wait_for_timeout(250); same("with a WALL half-drawn (its start point and rubber band showing), the export is identical to the clean one", export()); escape(); escape()
    # 5. the grid on
    grid_btn = page.get_by_role("button", name=re.compile(r"Grid"))
    if grid_btn.count(): grid_btn.first.click(); page.wait_for_timeout(250); same("with the GRID on, the export is identical to the clean one", export()); grid_btn.first.click(); page.wait_for_timeout(200)
    # 6. a measurement left showing
    page.get_by_role("button", name=re.compile("Measure")).click(); x, y = at(60, 170); page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 150, y, steps=6); page.mouse.up(); page.wait_for_timeout(250); same("with a MEASUREMENT left showing, the export is identical to the clean one", export()); page.get_by_role("button", name=re.compile("Measure")).click(); page.wait_for_timeout(150)
    # 7. the editor back in its normal state
    same("and after all of that, with nothing selected, the export is still identical to the clean one (nothing was left behind)", export())
    ok("no page errors", not errs, errs)
    print(f"\nEditing aids stay out of exports: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
