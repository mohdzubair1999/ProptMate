# Importing a DXF drawing in the real editor: real files made by ezdxf, uploaded through the real file picker. PORT = where this folder is served.
import os, re, sys, json, subprocess
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8767"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:600])
def room(name, x, y, w="5", l="4", **k): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False, **k}
mk = subprocess.run(["python3", "-c", """
import ezdxf
doc = ezdxf.new("R2010", setup=True); doc.header["$INSUNITS"] = 4; m = doc.modelspace()
m.add_lwpolyline([(0,0),(5000,0),(5000,4000),(0,4000)], close=True, dxfattribs={"layer": "WALLS"})
m.add_line((1000,0),(1000,2000)); m.add_text("Lounge", dxfattribs={"insert": (2500,2000), "height": 200}); m.add_circle((3000,1000), 300)
doc.saveas("/tmp/imp-a.dxf")
doc = ezdxf.new("R2010", setup=True); doc.header["$INSUNITS"] = 4; m = doc.modelspace()
for i in range(450): m.add_line((0, i * 20), (1000 + i, i * 20))
doc.saveas("/tmp/imp-many.dxf")
open("/tmp/imp-junk.dxf", "w").write("this is not a drawing\\nat all\\n")
"""], capture_output=True, text=True)
if mk.returncode != 0: print("(ezdxf is not installed here: the DXF import browser test was skipped)", mk.stderr[:200]); sys.exit(0)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1500, "height": 950}); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.goto(f"http://localhost:{PORT}/index.html")
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM' })", [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0)]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(500)
    note = lambda: page.locator("[data-testid=tool-note]").inner_text() if page.locator("[data-testid=tool-note]").count() else ""
    def saved(kind):
        page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(900); saves = page.evaluate("window.__saves || []"); out = []
        for a in saves[-1] if saves else []:
            if isinstance(a, list):
                for lvl in a:
                    if isinstance(lvl, dict):
                        o = lvl.get("objects"); o = json.loads(o) if isinstance(o, str) else (o or []); out += [x for x in o if x.get("kind") == kind]
        return out
    def upload(path, unit="auto"):
        page.locator("[data-testid=dxf-unit]").select_option(unit); page.locator("[data-testid=dxf-file]").set_input_files(path); page.wait_for_timeout(700)
    undo = lambda: (page.get_by_role("button", name=re.compile("Undo")).click(), page.wait_for_timeout(250))
    ok("the toolbar has an '⤓ Import DXF' button and a units choice", page.locator("[data-testid=dxf-import-button]").count() == 1 and page.locator("[data-testid=dxf-unit]").count() == 1 and "Import DXF" in page.locator("[data-testid=dxf-import-button]").inner_text())
    upload("/tmp/imp-a.dxf"); w = saved("wall"); l = saved("label"); n = note()
    ok("an AutoCAD-style file brings in 5 walls (the four sides of the closed polyline and the line) and 1 label", len(w) == 5 and len(l) == 1 and l[0]["text"] == "Lounge", [len(w), len(l)])
    ok("in plain words: how many, that the units were read as millimetres, the size 5 by 4 m, that it is at the top left, and that the circle was not used", "Imported 5 walls and 1 label" in n and "millimetres" in n and "5 by 4 m" in n and "top left" in n and "Not used: 1 circle" in n, n)
    ok("the drawing's bottom edge is at the bottom of the plan: a wall from (0.5, 4.5) to (5.5, 4.5), and the top edge at (0.5, 0.5)", any(abs(x["y1"] - 4.5) < 0.001 and abs(x["y2"] - 4.5) < 0.001 and abs(abs(x["x2"] - x["x1"]) - 5) < 0.001 for x in w) and any(abs(x["y1"] - 0.5) < 0.001 and abs(x["y2"] - 0.5) < 0.001 for x in w), [(x["x1"], x["y1"], x["x2"], x["y2"]) for x in w])
    ok("the walls are 0.1 m thick and have ids of their own", all(x["t"] == 0.1 and x.get("id") for x in w) and len({x["id"] for x in w}) == 5)
    undo(); ok("ONE Undo takes the whole import back", len(saved("wall")) == 0 and len(saved("label")) == 0, [len(saved("wall")), len(saved("label"))])
    upload("/tmp/imp-a.dxf", "cm"); w = saved("wall"); n = note()
    ok("choosing centimetres reads the same file as 50 m by 40 m (the person's choice is exact), and says so", len(w) == 5 and "centimetres" in n and "50 by 40 m" in n and any(abs(abs(x["x2"] - x["x1"]) - 50) < 0.001 for x in w), n); undo()
    upload("/tmp/imp-a.dxf", "m"); n = note()
    ok("choosing metres makes it 5,000 m across: refused with a plain message to choose a different unit, and nothing is added", "choose a different unit" in n and len(saved("wall")) == 0, n)
    upload("/tmp/imp-junk.dxf"); ok("a file that is not a drawing says so and adds nothing", "No lines or text were found" in note() and len(saved("wall")) == 0, note())
    upload("/tmp/imp-many.dxf"); w = saved("wall"); n = note()
    ok("450 lines: only 400 come in (the plan's limit), the longest ones, and it says how many were left out", len(w) == 400 and "Only the longest lines were kept: 50 shorter ones were left out" in n, [len(w), n])
    ok("the longest ones were kept: no kept wall is shorter than 1.05 m (the 50 left out are the 50 shortest)", all(abs(x["x2"] - x["x1"]) >= 1.04 for x in w), min(abs(x["x2"] - x["x1"]) for x in w))
    upload("/tmp/imp-a.dxf"); ok("on a full floor (400 items) a further import is refused with the reason, and changes nothing", "No room" in note() and len(saved("wall")) == 400, note())
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as dl: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    dl.value.save_as("/tmp/imp-sheet.svg"); svg = open("/tmp/imp-sheet.svg", encoding="utf-8").read()
    ok("the imported walls print on the sheet like any others, and nothing of the tool does", svg.count("<line") > 100 and "tool-note" not in svg and "data-editor-only" not in svg)
    ok("no page errors", not errs, errs)
    print(f"\nImporting a DXF drawing in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
