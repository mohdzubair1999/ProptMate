import os, re, sys, json
PORT = os.environ.get('PORT', '8766')
from playwright.sync_api import sync_playwright
P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:300])
def room(name, x, y, w="3", l="3", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
TINTS = ["#DDEFE5", "#F4EBC6", "#F9DDB5", "#F5C2BE", "#E8A19C"]
COND = { "byRoom": { "kitchen": "damaged", "bedroom 1": "good" }, "source": "Check-in, 12/03/2026" }
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def start(rooms, cond=COND):
        ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.goto("http://localhost:" + PORT + "/index.html"); page.evaluate("(a) => window.mountEditor(a[0], 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM', conditionData: a[1] })", [[{"name": "Ground floor", "rooms": rooms}], cond]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(300); return ctx, page
    base_rooms = [room("Kitchen", 0, 0), room("Bedroom 1", 3.5, 0), room("Study", 7, 0)]
    ctx, page = start(base_rooms); base = page.evaluate("() => [...document.querySelectorAll('[data-room] > polygon:not([data-condition-tint])')].map((p) => p.getAttribute('fill'))"); ctx.close()
    ctx, page = start(base_rooms); page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200)
    tints = page.evaluate("() => [...document.querySelectorAll('[data-condition-tint]')].map((p) => p.getAttribute('fill'))"); real = page.evaluate("() => [...document.querySelectorAll('[data-room] > polygon:not([data-condition-tint])')].map((p) => p.getAttribute('fill'))")
    ok("on screen the Kitchen is tinted damaged and Bedroom 1 good, as overlays (Study has no record, so no overlay)", tints == ["#F5C2BE", "#DDEFE5"], tints)
    ok("the rooms' OWN fills are untouched by the toggle (exactly as with it off)", real == base, [real, base])
    ok("the tints are editor-only and cannot be clicked (they never get in the way of dragging a room)", page.evaluate("() => [...document.querySelectorAll('[data-condition-tint]')].every((p) => p.getAttribute('data-editor-only') === 'true' && p.style.pointerEvents === 'none')"))
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as d: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    d.value.save_as("/tmp/condition-sheet.svg"); svg = open("/tmp/condition-sheet.svg", encoding="utf-8").read().lower()
    ok("the exported SVG sheet has NO condition colour in it", not any(t.lower() in svg for t in TINTS), [t for t in TINTS if t.lower() in svg])
    ok("...and still has the rooms' own colours (the plan itself is not lost)", len(re.findall(r"<polygon", svg)) >= 3)
    ok("after exporting, the tints are still on screen (the export did not disturb the editor)", page.locator("[data-condition-tint]").count() == 2)
    page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200); ok("turning it off removes the overlays and restores the plan", page.locator("[data-condition-tint]").count() == 0)
    # a SHARED plan refreshes its saved picture (used by the public link and reports) on every save: the colours must not be in it
    ctx2 = b.new_context(viewport={"width": 1300, "height": 900}); pg = ctx2.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.goto("http://localhost:" + PORT + "/index.html")
    pg.evaluate("(a) => window.mountEditor(a[0], 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM', conditionData: a[1], initialShareToken: 'T'.repeat(32), initialShareExpiresAt: null })", [[{"name": "Ground floor", "rooms": base_rooms}], COND]); pg.wait_for_selector("[data-room]"); pg.wait_for_timeout(300)
    pg.locator("[data-testid=condition-toggle]").click(); pg.wait_for_timeout(200); pg.get_by_role("button", name="Save floor plan").click(); pg.wait_for_timeout(1200); blob = json.dumps(pg.evaluate("window.__saves || []")).lower()
    ok("(the shared plan's save really includes a drawing snapshot: it holds the rooms' shapes)", "polygon" in blob and "innersvg" in blob, blob[:120])
    ok("a SAVE of a SHARED plan while Condition is on stores a snapshot (the public link and reports show it) with NO condition colour in it", not any(t.lower() in blob for t in TINTS), [t for t in TINTS if t.lower() in blob])
    ok("...while the tints are still showing on the editor screen after the save", pg.locator("[data-condition-tint]").count() == 2); ctx2.close()
    ctx.close()
    ctx, page = start([room("Kitchen", 0, 0), room("Bedroom 1", 1, 1)]); page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200); ok("overlapping rooms get no tint (the red overlap warning stays visible)", page.locator("[data-condition-tint]").count() == 0); ctx.close()
    ctx, page = start([room("Kitchen", 0, 0), room("Garden", 3.5, 0, isGarden=True)], cond={"byRoom": {"kitchen": "damaged", "garden": "damaged"}, "source": None}); page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200); ok("a garden gets no tint (it keeps its hatch), the kitchen does", page.locator("[data-condition-tint]").count() == 1); ctx.close()
    # ---- the key names the rooms that were left plain, and any items that could not be coloured ----
    ctx, page = start([room("Kitchen", 0, 0), room("Hall", 3.5, 0), room("Study", 7, 0), room("Garden", 0, 3.5)], cond={"byRoom": {"kitchen": "damaged", "hallway": "worn"}, "source": "Check-in, 12/03/2026", "ignoredItems": 2}); page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200)
    tints = page.evaluate("() => [...document.querySelectorAll('[data-condition-tint]')].map((p) => p.getAttribute('fill'))")
    ok("'Hall' on the plan is coloured from the inspection's 'Hallway' (worn), and the Kitchen (damaged)", tints == ["#F5C2BE", "#F9DDB5"], tints)
    ok("the key names the rooms with no record, so the person can see which were skipped", "left plain: Study, Garden." in page.locator("[data-testid=condition-skipped]").inner_text(), page.locator("[data-testid=condition-skipped]").inner_text())
    ok("the key says 2 inspection items have a condition not on the current scale and are not coloured", "2 inspection items have a condition that is not on the current scale" in page.locator("[data-testid=condition-ignored]").inner_text(), page.locator("[data-testid=condition-ignored]").inner_text())
    ctx.close()
    ctx, page = start([room("Kitchen", 0, 0), room("Bedroom 1", 3.5, 0)]); page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200)
    ok("when every room matches the key says so, and there is no ignored-items line", "Every room on this floor has a matching record." in page.locator("[data-testid=condition-skipped]").inner_text() and page.locator("[data-testid=condition-ignored]").count() == 0); ctx.close()
    ctx, page = start([room("Kitchen", 0, 0)], cond={"byRoom": {"kitchen": "good"}, "source": None, "ignoredItems": 1}); page.locator("[data-testid=condition-toggle]").click(); page.wait_for_timeout(200)
    ok("one ignored item reads 'has' and 'it is' (singular)", "1 inspection item has a condition that is not on the current scale, so it is not coloured." in page.locator("[data-testid=condition-ignored]").inner_text()); ctx.close()
    ok("no page errors", not errs, errs)
    print(f"\nCondition colours stay out of exports and saved plans: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
