# The Measure tool: it shows a distance on screen while you work, and must NEVER end up in an exported sheet, a saved snapshot or a DXF.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:420])
def room(name, x, y, w="6", l="4"): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.goto(f"http://localhost:{PORT}/index.html"); page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM', initialShareToken: 'T'.repeat(32), initialShareExpiresAt: null })", [{"name": "Ground floor", "rooms": [room("Kitchen", 0, 0)]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(400)
    page.get_by_role("button", name=re.compile("Measure")).click(); page.wait_for_timeout(150)
    svgEl = page.locator("svg").filter(has=page.locator("[data-room]")).first; svgEl.scroll_into_view_if_needed(); page.wait_for_timeout(200); box = svgEl.bounding_box()
    before = page.evaluate("() => [...document.querySelectorAll('svg text')].map((t) => t.textContent)")
    page.mouse.move(box["x"] + 80, box["y"] + 120); page.mouse.down(); page.mouse.move(box["x"] + 300, box["y"] + 120, steps=8); page.mouse.up(); page.wait_for_timeout(250)
    after = page.evaluate("() => [...document.querySelectorAll('svg text')].map((t) => t.textContent)"); new = [x for x in after if x not in before]
    ok("measuring between two points shows the distance in metres on screen (5.50m), with two red end dots, and it stays after you let go", new == ["5.50m"] and page.evaluate("() => [...document.querySelectorAll('circle')].filter((c) => (c.getAttribute('fill') || '').toUpperCase() === '#DC2626').length") == 2, new)
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as d: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    d.value.save_as("/tmp/measure-sheet.svg"); svg = open("/tmp/measure-sheet.svg", encoding="utf-8").read()
    ok("an exported SVG sheet made while a measurement is showing has NO measurement in it: no red end dots or dashed line, and no 5.50m label (the plan's own 6.00m and 4.00m overall dimensions are meant to be there)", "5.50m" not in svg and not re.search(r"DC2626", svg, re.I) and "6.00m" in svg, [("5.50m" in svg), len(re.findall("DC2626", svg, re.I))])
    ok("...but the plan itself is in it (the room outline)", "<polygon" in svg)
    page.wait_for_timeout(200); page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(1200); blob = json.dumps(page.evaluate("window.__saves || []"))
    ok("a SAVE of a shared plan while a measurement is showing stores a snapshot with NO measurement in it", "innerSvg" in blob and "DC2626" not in blob.upper(), "DC2626" in blob.upper())
    ok("the measurement is still showing on screen after exporting and saving (nothing disturbed it)", page.evaluate("() => [...document.querySelectorAll('text')].some((t) => /^\\d+\\.\\d+m$/.test(t.textContent))"))
    ok("no page errors", not errs, errs)
    print(f"\nThe measure tool stays out of exports and saved plans: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
