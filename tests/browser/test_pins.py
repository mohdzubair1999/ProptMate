# Defect pins and the printed key, in the real editor.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
def room(name, x, y, w="5", l="4"): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.goto(f"http://localhost:{PORT}/index.html"); page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM', initialShareToken: 'T'.repeat(32), initialShareExpiresAt: null })", [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0)]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(400)
    svgEl = page.locator("svg").filter(has=page.locator("[data-room]")).first
    def at(dx, dy): svgEl.scroll_into_view_if_needed(); bb = svgEl.bounding_box(); return bb["x"] + dx, bb["y"] + dy
    objs = lambda: page.locator("[data-plan-objects] [data-object-kind=label]")
    def place_pin(dx, dy, note=None):
        page.locator("[data-testid=pin-button]").click(); x, y = at(dx, dy); page.mouse.click(x, y); page.wait_for_timeout(300)
        if note is not None: page.locator("[data-testid=obj-text]").fill(note); page.keyboard.press("Enter"); page.wait_for_timeout(200)
    ok("the toolbar has a 📍 Pin button", page.locator("[data-testid=pin-button]").count() == 1 and "Pin" in page.locator("[data-testid=pin-button]").inner_text())
    page.locator("[data-testid=pin-button]").click(); ok("choosing it says which pin will be placed: 'Click the plan to place pin 1, then describe the defect'", "place pin 1, then describe the defect" in page.locator("[data-testid=placing-hint]").inner_text(), page.locator("[data-testid=placing-hint]").inner_text())
    x, y = at(100, 90); page.mouse.click(x, y); page.wait_for_timeout(300)
    ok("clicking the plan places pin 1: an orange disc with a white '1'", objs().count() == 1 and objs().first.locator("circle").get_attribute("fill") == "#C2410C" and objs().first.locator("text").text_content() == "1" and objs().first.locator("text").get_attribute("fill") == "#FFFFFF")
    ok("its panel says 'Pin 1' and offers a Note field, already selected so you can just type (and no Size or Turn: they mean nothing for a pin)", page.locator("[data-testid=selected-title]").inner_text() == "Pin 1" and page.locator("[data-testid=obj-text]").input_value() == "Describe the defect" and page.get_by_text("Size", exact=True).count() == 0 and page.locator("[data-testid=obj-rot]").count() == 0)
    page.locator("[data-testid=obj-text]").fill("Damp patch behind the sofa"); page.keyboard.press("Enter"); page.wait_for_timeout(250)
    ok("typing a note and pressing Enter keeps it (the pin on the plan still shows just its number, never the note)", "Damp patch" not in svgEl.text_content() and objs().first.locator("text").text_content() == "1")
    ok("a selected pin has NO turn handle (its number always reads upright), but a selected symbol does", page.locator("[data-handle=rotate]").count() == 0)
    place_pin(170, 140, "Cracked tile by the door"); ok("the next pin is number 2", objs().count() == 2 and objs().nth(1).locator("text").text_content() == "2")
    # a safety symbol too, so the key has both parts
    page.locator("[data-testid=furniture-button]").click(); page.get_by_role("button", name="Safety and services").click(); page.locator("[data-symbol=smoke-alarm]").click(); x, y = at(60, 60); page.mouse.click(x, y); page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    ok("(the smoke alarm is placed too: a symbol, so its handles include the turn handle)", page.locator("[data-plan-objects] [data-object-kind=symbol]").count() == 1)
    # ---- the printed sheet ----
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
    with page.expect_download() as d: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
    d.value.save_as("/tmp/pins-sheet.svg"); svg = open("/tmp/pins-sheet.svg", encoding="utf-8").read(); texts = re.findall(r"<text[^>]*>([^<]*)</text>", svg)
    ok("the exported sheet has a KEY with the smoke alarm's name and both pin notes", "Key" in texts and "Smoke alarm" in texts and "Damp patch behind the sofa" in texts and "Cracked tile by the door" in texts, [t for t in texts if t not in ("0", "0.5", "1", "1.5", "2 m")][:14])
    ok("the key lists the pins by number (1 then 2), each with an orange marker", texts.index("Damp patch behind the sofa") < texts.index("Cracked tile by the door") and svg.count('fill="#C2410C"') >= 4, svg.count('fill="#C2410C"'))
    ok("the numbers are on the plan itself too (the white 1 and 2 inside the discs)", svg.count('font-weight="700"') >= 4)
    page.wait_for_timeout(200); page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(1200); saves = page.evaluate("window.__saves || []"); blob = json.dumps(saves)
    snap = None
    for a in saves[-1]:
        if isinstance(a, list):
            for lvl in a:
                if isinstance(lvl, dict) and lvl.get("sheetData"): snap = lvl["sheetData"]
    sd = json.loads(snap) if isinstance(snap, str) else snap
    ok("a SAVE of a shared plan stores the key in its snapshot (so the public link and reports print it too): the alarm and both notes", bool(sd) and sd.get("key", {}).get("symbols") == ["smoke-alarm"] and [n["text"] for n in sd["key"]["notes"]] == ["Damp patch behind the sofa", "Cracked tile by the door"], sd.get("key") if sd else blob[:200])
    ok("the saved plan itself holds the pins as numbered labels (so reopening it brings them back)", '"pin": 1' in blob.replace('":1', '": 1') and '"pin": 2' in blob.replace('":2', '": 2'), blob[:300])
    # ---- numbering ----
    objs().first.click(); page.wait_for_timeout(200); page.locator("[data-testid=obj-delete]").click(); page.wait_for_timeout(250)
    ok("deleting pin 1 leaves pin 2 as it was (numbers are not renumbered behind your back)", objs().count() == 1 and objs().first.locator("text").text_content() == "2")
    place_pin(170, 40); ok("the next new pin takes the smallest free number, 1", objs().count() == 2 and sorted(objs().nth(i).locator("text").text_content() for i in range(2)) == ["1", "2"])
    page.locator("[data-testid=obj-duplicate]").click(); page.wait_for_timeout(250)
    ok("duplicating a pin gives the copy the next free number (3), never a second pin with the same number", objs().count() == 3 and sorted(objs().nth(i).locator("text").text_content() for i in range(3)) == ["1", "2", "3"], [objs().nth(i).locator("text").text_content() for i in range(objs().count())])
    ok("blanking a pin's note and leaving the field removes the pin (as it does for a label)", (lambda: (page.locator("[data-testid=obj-text]").fill(""), page.keyboard.press("Enter"), page.wait_for_timeout(250), objs().count() == 2)[-1])())
    ok("no page errors", not errs, errs)
    print(f"\nDefect pins and the printed key, in the real editor: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
