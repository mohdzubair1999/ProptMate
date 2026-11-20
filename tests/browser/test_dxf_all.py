# Exports a two-floor plan as ONE DXF from the real editor, and checks the file with the independent ezdxf reader (pip install ezdxf).
import os, re, sys, json, subprocess
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:420])
def room(name, x, y, w="3", l="3", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
CHECK = """
import sys, json, ezdxf
doc = ezdxf.readfile(sys.argv[1]); aud = doc.audit(); msp = doc.modelspace(); out = {"open_walls": sum(1 for e in msp if e.dxftype() == "POLYLINE" and e.dxf.layer.endswith("WALLS") and not e.is_closed), "closed_walls": sum(1 for e in msp if e.dxftype() == "POLYLINE" and e.dxf.layer.endswith("WALLS") and e.is_closed), "openings": sum(1 for e in msp if e.dxf.layer.endswith("OPENINGS")), "audit": len(aud.errors) + len(aud.fixes), "version": doc.dxfversion, "layers": sorted(l.dxf.name for l in doc.layers if l.dxf.name not in ("0", "Defpoints")), "texts": sorted(e.dxf.text for e in msp if e.dxftype() == "TEXT"), "walls": {}}
for e in msp:
    if e.dxftype() == "POLYLINE" and e.dxf.layer.endswith("_WALLS"):
        xs = [v.dxf.location.x for v in e.vertices]; lo, hi = out["walls"].get(e.dxf.layer, [1e12, -1e12]); out["walls"][e.dxf.layer] = [min(lo, min(xs)), max(hi, max(xs))]
print(json.dumps(out))
"""
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def start(levels):
        ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.goto(f"http://localhost:{PORT}/index.html"); page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road, Hemel', companyName: 'ZKM' })", levels); page.wait_for_selector("[data-room]"); page.wait_for_timeout(400); return ctx, page
    two = [{"name": "Ground floor", "rooms": [room("Kitchen", 0, 0), room("Lounge", 3.5, 0, w="4")]}, {"name": "First floor", "rooms": [room("Bedroom", 0, 0, w="5", l="4")]}]
    ctx, page = start(two); n0 = page.locator("[data-room]").count()
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    ok("with two floors the Export menu offers 'DXF, all floors' as well as the single 'DXF'", page.locator("[data-testid=export-dxf-all]").count() == 1 and page.locator("[data-testid=export-dxf]").count() == 1 and "each floor on its own layers" in page.locator("[data-testid=export-dxf-all]").inner_text())
    with page.expect_download() as d: page.locator("[data-testid=export-dxf-all]").click()
    dl = d.value; path = "/tmp/dxf-all-test.dxf"; dl.save_as(path)
    ok("the file is named after the property, with '-all-floors'", dl.suggested_filename == "12-example-road-hemel-all-floors.dxf", dl.suggested_filename)
    r = json.loads(subprocess.check_output(["python3", "-c", CHECK, path], text=True))
    ok("the independent reader opens it as a classic DXF with no errors and no repairs", r["audit"] == 0 and r["version"] == "AC1009", r)
    ok("both floors' layers are in it: GROUND_FLOOR_WALLS and FIRST_FLOOR_WALLS", "GROUND_FLOOR_WALLS" in r["layers"] and "FIRST_FLOOR_WALLS" in r["layers"] and "GROUND_FLOOR_TEXT" in r["layers"] and "FIRST_FLOOR_TEXT" in r["layers"], r["layers"])
    g = r["walls"].get("GROUND_FLOOR_WALLS"); f = r["walls"].get("FIRST_FLOOR_WALLS")
    ok("the ground floor is 7.5 m wide (Kitchen 3 m, gap, Lounge 4 m) starting at 0, and the first floor starts 5 m clear of it", g and f and abs(g[0]) < 2 and abs((g[1] - g[0]) - 7500) < 2 and abs(f[0] - (g[1] + 5000)) < 2 and abs((f[1] - f[0]) - 5000) < 2, [g, f])
    ok("every room's name is in the file, and each floor is labelled with its own name", {"Kitchen", "Lounge", "Bedroom", "Ground floor", "First floor"} <= set(r["texts"]), r["texts"])
    page.wait_for_timeout(500)
    ok("the editor is back on the floor you were on (the ground floor, with its own rooms showing), not left on the last one", page.locator("[data-room]").count() == n0 and "Kitchen" in page.inner_text("body"), [page.locator("[data-room]").count(), n0])
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as d2: page.locator("[data-testid=export-dxf]").click()
    d2.value.save_as("/tmp/dxf-one-test.dxf"); r1 = json.loads(subprocess.check_output(["python3", "-c", CHECK, "/tmp/dxf-one-test.dxf"], text=True))
    ok("(the single floor file has the plain layer names and no first floor in it)", "WALLS" in r1["layers"] and not any("FLOOR" in l for l in r1["layers"]) and "Bedroom" not in r1["texts"] and r1["audit"] == 0, r1["layers"]); ctx.close()
    ctx, page = start([two[0]]); page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    ok("with only ONE floor the 'all floors' option is not offered", page.locator("[data-testid=export-dxf-all]").count() == 0 and page.locator("[data-testid=export-dxf]").count() == 1); ctx.close()
    # ---- doors: two CONNECTED rooms that touch show a doorway in their shared wall, and the DXF wall is cut open there ----
    ctx, page = start([{"name": "Ground floor", "rooms": [room("Kitchen", 0, 0, connectedTo=["Lounge"]), room("Lounge", 3, 0, connectedTo=["Kitchen"])]}]); page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as d3: page.locator("[data-testid=export-dxf]").click()
    d3.value.save_as("/tmp/dxf-door-test.dxf"); r3 = json.loads(subprocess.check_output(["python3", "-c", CHECK, "/tmp/dxf-door-test.dxf"], text=True))
    ok("two touching rooms: the editor draws a doorway in their shared wall, so the DXF has door-gap outlines on the OPENINGS layer", r3["openings"] >= 1 and r3["audit"] == 0, r3)
    ok("...and the wall lines are CUT OPEN there: the room outlines are no longer all closed shapes (a wall no longer runs through the doorway)", r3["open_walls"] >= 1, r3)
    ctx.close()
    ctx, page = start([{"name": "Ground floor", "rooms": [room("Kitchen", 0, 0, connectedTo=["Lounge"]), room("Lounge", 6, 0, connectedTo=["Kitchen"])]}]); page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as d4: page.locator("[data-testid=export-dxf]").click()
    d4.value.save_as("/tmp/dxf-nodoor-test.dxf"); r4 = json.loads(subprocess.check_output(["python3", "-c", CHECK, "/tmp/dxf-nodoor-test.dxf"], text=True))
    ok("two connected rooms with a gap between them (not touching) have no doorway: both outlines stay closed and nothing is cut", r4["openings"] == 0 and r4["open_walls"] == 0 and r4["closed_walls"] == 2, r4); ctx.close()
    ok("no page errors", not errs, errs)
    print(f"\nExporting every floor as one DXF, in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
