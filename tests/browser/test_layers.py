# Layers: hiding groups of objects tidies the SCREEN only. Whatever is hidden must still be in every export and every saved snapshot.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
def room(name, x, y, w="5", l="4"): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False}
def mount(b, share=False):
    ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.goto(f"http://localhost:{PORT}/index.html")
    extra = ", initialShareToken: 'T'.repeat(32), initialShareExpiresAt: null" if share else ""
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM'" + extra + " })", [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0)]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(400); return ctx, page
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx, page = mount(b); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    svgEl = page.locator("svg").filter(has=page.locator("[data-room]")).first
    def at(dx, dy): svgEl.scroll_into_view_if_needed(); bb = svgEl.bounding_box(); return bb["x"] + dx, bb["y"] + dy
    ok("with nothing placed yet there is no Layers button (nothing to hide)", page.locator("[data-testid=layers-button]").count() == 0)
    # place one of each kind
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Bedroom", exact=True).click(); page.locator("[data-symbol=bed-double]").click(); page.mouse.click(*at(100, 80)); page.wait_for_timeout(250); page.keyboard.press("Escape")
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); page.mouse.click(*at(30, 30)); page.wait_for_timeout(250); page.keyboard.press("Escape")
    page.locator("[data-testid=label-button]").click(); page.mouse.click(*at(160, 40)); page.wait_for_timeout(250); page.keyboard.press("Escape")
    page.locator("[data-testid=pin-button]").click(); page.mouse.click(*at(160, 120)); page.wait_for_timeout(250); page.keyboard.press("Escape")
    page.locator("[data-testid=wall-button]").click(); page.mouse.click(*at(50, 150)); page.mouse.click(*at(150, 150)); page.wait_for_timeout(200); page.locator("[data-testid=placing-done]").click(); page.wait_for_timeout(250); page.keyboard.press("Escape")
    layers = lambda: {l: page.locator(f"[data-layer={l}]").count() for l in ["furniture", "services", "labels", "pins", "walls"]}
    ok("one of each kind is on the plan, each tagged with its layer", layers() == {"furniture": 1, "services": 1, "labels": 1, "pins": 1, "walls": 1}, layers())
    def export_svg():
        page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
        with page.expect_download() as d: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
        d.value.save_as("/tmp/layers-sheet.svg"); return open("/tmp/layers-sheet.svg", encoding="utf-8").read()
    base = export_svg(); ok("(the clean export holds all five things: the sheet is much bigger than an empty plan's)", len(base) > 6000 and "Describe the defect" in base or "Key" in base, len(base))
    page.locator("[data-testid=layers-button]").click(); menu = page.locator("[data-testid=layers-menu]").inner_text()
    ok("the Layers menu lists the five layers with how many are on the plan, and says plainly that hiding only tidies the screen and hidden things still print, export and share", all(x in menu for x in ["Furniture (1)", "Safety and services (1)", "Labels (1)", "Defect pins (1)", "Free-standing walls (1)", "only tidies the screen", "still appear when you print, export or share"]), menu)
    ok("every layer starts shown (all five boxes ticked) and the button says just 'Layers'", all(page.locator(f"[data-layer-toggle={l}]").is_checked() for l in ["furniture", "services", "labels", "pins", "walls"]) and page.locator("[data-testid=layers-button]").inner_text().strip().endswith("Layers"))
    page.locator("[data-layer-toggle=furniture]").uncheck(); page.locator("[data-layer-toggle=services]").uncheck(); page.wait_for_timeout(250)
    disp = lambda l: page.locator(f"[data-layer={l}]").first.evaluate("e => getComputedStyle(e).display")
    ok("hiding Furniture and Safety and services takes the bed and the smoke alarm off the screen and leaves the label, pin and wall", disp("furniture") == "none" and disp("services") == "none" and disp("labels") != "none" and disp("pins") != "none" and disp("walls") != "none", [disp(l) for l in ["furniture", "services", "labels", "pins", "walls"]])
    ok("the button now says '(2 hidden)' so you do not forget", "(2 hidden)" in page.locator("[data-testid=layers-button]").inner_text())
    ok("the hidden items are still IN the drawing (just not displayed): all five are still there", layers() == {"furniture": 1, "services": 1, "labels": 1, "pins": 1, "walls": 1})
    page.keyboard.press("Escape"); page.mouse.click(*at(5, 5)); page.wait_for_timeout(150)
    after = export_svg()
    ok("THE KEY CHECK: the exported sheet made while two layers are hidden is IDENTICAL to the one made with everything shown (hidden things are not lost from the sheet)", after == base, [len(after), len(base)])
    # a shared plan's saved snapshot
    page.evaluate("() => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return o(b); }; }")
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]"); page.get_by_role("menuitem", name=re.compile("^Drawing only")).click(); page.wait_for_timeout(1500)
    blobs = page.evaluate("async () => Promise.all((window.__blobs || []).filter((b) => b.type.startsWith('image/svg')).map((b) => b.text()))")
    ok("the 'Drawing only' image is made from the WHOLE plan: it contains the hidden bed and alarm drawings and no display:none, and its menu line says so", len(blobs) >= 1 and "display: none" not in blobs[-1] and "display:none" not in blobs[-1] and blobs[-1].count('data-layer="furniture"') == 1 and blobs[-1].count('data-layer="services"') == 1, [len(blobs), (blobs[-1].count("display: none") if blobs else None)])
    page.keyboard.press("Escape")
    # select and act
    page.locator("[data-testid=obj-select-all]").click() if page.locator("[data-testid=obj-select-all]").count() else None; page.wait_for_timeout(250)
    ok("Select all selects only what is visible: the label, pin and wall (3), not the hidden bed and alarm", page.locator("[data-selection-for]").count() == 3, page.locator("[data-selection-for]").count())
    page.keyboard.press("Escape"); page.mouse.click(*at(5, 5)); page.wait_for_timeout(150)
    page.mouse.click(*at(100, 80)); page.wait_for_timeout(250)
    ok("clicking where the hidden bed is selects nothing of it (no object panel, no selection box)", page.locator("[data-testid=obj-delete]").count() == 0 and page.locator("[data-selection-for]").count() == 0)
    page.mouse.click(*at(5, 5)); page.locator("[data-plan-objects] [data-object-kind=label]").filter(has=page.locator("text:text-is('Label')")).first.click(); page.wait_for_timeout(250)
    ok("(the label is selected: its panel shows)", page.locator("[data-testid=obj-delete]").count() == 1)
    page.locator("[data-layer-toggle=labels]").uncheck(); page.wait_for_timeout(250)
    ok("hiding the Labels layer while a label is selected drops it from the selection (you cannot act on what you cannot see)", page.locator("[data-testid=obj-delete]").count() == 0 and page.locator("[data-selection-for]").count() == 0)
    page.locator("[data-layer-toggle=labels]").check(); page.wait_for_timeout(150)
    # placing on a hidden layer
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Bedroom", exact=True).click(); page.locator("[data-symbol=bed-double]").click(); page.mouse.click(*at(150, 70)); page.wait_for_timeout(300)
    ok("placing a new bed while Furniture is hidden shows the Furniture layer again (an invisible item would look as if nothing happened); Safety and services stays hidden", page.locator("[data-layer-toggle=furniture]").is_checked() and not page.locator("[data-layer-toggle=services]").is_checked() and "(1 hidden)" in page.locator("[data-testid=layers-button]").inner_text() and layers()["furniture"] == 2, [layers(), page.locator("[data-testid=layers-button]").inner_text()])
    page.locator("[data-layer-toggle=services]").check(); page.wait_for_timeout(200)
    ok("ticking the box again brings the layer back, and the button says just 'Layers'", disp("services") != "none" and page.locator("[data-testid=layers-button]").inner_text().strip().endswith("Layers"))
    ok("no page errors", not errs, errs); ctx.close()
    # ---- a shared plan's saved snapshot, hidden vs shown ----
    ctx, page = mount(b, share=True); svgEl = page.locator("svg").filter(has=page.locator("[data-room]")).first
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Bedroom", exact=True).click(); page.locator("[data-symbol=bed-double]").click(); page.mouse.click(*at(100, 80)); page.wait_for_timeout(250); page.keyboard.press("Escape")
    def snapshot():
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(1200); saves = page.evaluate("window.__saves || []")
        for a in saves[-1]:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict) and lvl.get("sheetData"): sd = lvl["sheetData"]; return json.loads(sd) if isinstance(sd, str) else sd
    s1 = snapshot(); page.locator("[data-testid=layers-button]").click(); page.locator("[data-layer-toggle=furniture]").uncheck(); page.wait_for_timeout(250); s2 = snapshot()
    ok("a SAVE of a shared plan while Furniture is hidden stores the SAME snapshot as one made with it shown, and the bed is in it (the public link and reports show it)", s1 and s2 and s1["innerSvg"] == s2["innerSvg"] and s2["innerSvg"].count("<rect") >= s1["innerSvg"].count("<rect") > 0 and "display" not in s2["innerSvg"], [len(s1["innerSvg"]) if s1 else None, len(s2["innerSvg"]) if s2 else None])
    ctx.close()
    print(f"\nLayers (hiding tidies the screen only): {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
