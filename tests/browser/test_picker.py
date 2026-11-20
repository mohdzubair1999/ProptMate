# The searchable picker and the forms that use it (their server actions faked). Run with PORT set to the port serving this folder.
import os, re, sys, time, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
OPTS = [{"value": "p1", "label": "1 Church Lane, Hemel Hempstead", "hint": "Hemel Hempstead · HP1 1AA", "keywords": ["Mr Patel"]}, {"value": "p2", "label": "2 Tudor House, London", "hint": "London · E17 4RT", "keywords": ["ZKM Lettings"]}, {"value": "p3", "label": "12 Tudor House, London", "hint": "London · E17 4RT"}, {"value": "p4", "label": "22 Tudor Road, Watford", "hint": "Watford · WD17 2AB", "keywords": ["Mrs Okafor"]}, {"value": "p5", "label": "Bedford House", "hint": "Bedford · MK40 1XX"}]
PROPS = [{"id": o["value"], "address": o["label"].split(",")[0], "city": o["hint"].split(" · ")[0], "postcode": o["hint"].split(" · ")[1], "landlordName": (o.get("keywords") or [None])[0], "type": "flat"} for o in OPTS]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def start(fn, arg, vw=900, touch=False):
        ctx = b.new_context(viewport={"width": vw, "height": 800}, has_touch=touch, is_mobile=touch); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.goto(f"http://localhost:{PORT}/picker.html"); page.evaluate(f"(a) => window.{fn}(a)", arg); page.wait_for_selector("[role=combobox]"); return ctx, page
    cb = lambda page, i=0: page.locator("[role=combobox]").nth(i)
    opts = lambda page: page.locator("[role=option]")
    names = lambda page: [o.locator("span").first.inner_text() for o in opts(page).all()]
    fd = lambda page: page.evaluate("() => new FormData(document.getElementById('f')).get('choice')")
    # ================= the picker on its own =================
    ctx, page = start("mountPicker", {"options": OPTS, "required": True})
    ok("it is a proper combobox with a hint to search, closed at first", cb(page).get_attribute("aria-expanded") == "false" and cb(page).get_attribute("placeholder") == "Search…" and cb(page).get_attribute("aria-autocomplete") == "list" and page.locator("[role=listbox]").count() == 0)
    cb(page).click(); page.wait_for_timeout(100)
    ok("clicking it opens the list with every property and says how many ('5 properties')", cb(page).get_attribute("aria-expanded") == "true" and opts(page).count() == 5 and page.locator("[data-testid=picker-summary]").inner_text().startswith("5 properties"), page.locator("[data-testid=picker-summary]").inner_text())
    cb(page).fill("tudor 2"); page.wait_for_timeout(100)
    ok("typing 'tudor 2' narrows it to the Tudor properties, with '2 Tudor House' FIRST", names(page)[0].startswith("2 Tudor House") and len(names(page)) == 3 and "Bedford House" not in names(page), names(page))
    ok("the words you typed are shown in bold in the matches", page.locator("[role=option] mark").count() >= 2 and "tudor" in [m.inner_text().lower() for m in page.locator("[role=option] mark").all()])
    ok("the second line (city and postcode) is shown under each", "London · E17 4RT" in opts(page).first.inner_text())
    cb(page).fill("zzz"); page.wait_for_timeout(100); ok("a search with no match says so plainly, and lists nothing", page.locator("[data-testid=picker-summary]").inner_text() == "No properties match “zzz”." and opts(page).count() == 0)
    cb(page).fill("e174rt"); page.wait_for_timeout(100); ok("a postcode typed WITHOUT its space finds the properties ('e174rt')", sorted(names(page)) == ["12 Tudor House, London", "2 Tudor House, London"], names(page))
    cb(page).fill("okafor"); page.wait_for_timeout(100); ok("a landlord's name finds the property ('okafor' finds 22 Tudor Road)", names(page) == ["22 Tudor Road, Watford"], names(page))
    # keyboard
    cb(page).fill("tudor"); page.wait_for_timeout(100); first_id = cb(page).get_attribute("aria-activedescendant")
    ok("the first match is highlighted and announced (aria-activedescendant points at it)", first_id is not None and page.locator(f"[id='{first_id}']").get_attribute("role") == "option")
    page.keyboard.press("ArrowDown"); second = cb(page).get_attribute("aria-activedescendant"); ok("ArrowDown moves to the next one", second != first_id)
    page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowUp"); ok("ArrowUp wraps round to the last one", cb(page).get_attribute("aria-activedescendant") == page.locator("[role=option]").last.get_attribute("id"))
    page.keyboard.press("ArrowDown"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    ok("Enter chooses the highlighted one: the box shows its name, the list closes, and the form will send ITS id", cb(page).input_value() == "2 Tudor House, London" and cb(page).get_attribute("aria-expanded") == "false" and fd(page) == "p2", [cb(page).input_value(), fd(page)])
    ok("Enter with the list open did NOT submit the form", (page.evaluate("window.__submitted") or 0) == 0)
    cb(page).click(); page.wait_for_timeout(100); ok("opening it again shows ALL the properties (not only the one chosen), with the chosen one marked", opts(page).count() == 5 and page.locator("[role=option][aria-selected=true]").count() == 1)
    page.keyboard.press("Escape"); page.wait_for_timeout(100); ok("Escape closes it and keeps the choice", cb(page).get_attribute("aria-expanded") == "false" and cb(page).input_value() == "2 Tudor House, London" and fd(page) == "p2")
    (page.mouse.click(3, 3), page.locator("#go").click()); page.wait_for_timeout(150); ok("with a choice made, the form submits and carries the chosen id", page.evaluate("window.__submitted") == 1 and page.evaluate("window.__fd.choice") == "p2")
    # typing again clears the choice
    cb(page).click(); cb(page).fill("bed"); page.wait_for_timeout(100); ok("typing again means choosing another: the old choice is cleared (the form no longer carries it)", fd(page) == "")
    (page.mouse.click(3, 3), page.locator("#go").click()); page.wait_for_timeout(150); msg = cb(page).evaluate("e => e.validationMessage"); ok("a half-typed search is NOT a choice: submitting is blocked with a clear message and nothing is sent", msg == "Please choose a property from the list." and page.evaluate("window.__submitted") == 1, [msg, page.evaluate("window.__submitted")])
    cb(page).click(); page.wait_for_timeout(100); ok("reopening after a blocked submit still shows the search you had typed (only Bedford House)", names(page) == ["Bedford House"], names(page))
    page.locator("[role=option]").first.click(); page.wait_for_timeout(100); ok("clicking a match chooses it (Bedford House)", cb(page).input_value() == "Bedford House" and fd(page) == "p5")
    page.mouse.click(3, 3); page.wait_for_timeout(100); ok("clicking elsewhere closes the list and the choice stays", cb(page).get_attribute("aria-expanded") == "false" and cb(page).input_value() == "Bedford House" and fd(page) == "p5")
    cb(page).click(); cb(page).fill("tud"); page.mouse.click(3, 3); page.wait_for_timeout(100); ok("clicking away from a search you started over a choice leaves what you typed and sends NOTHING (a half-typed search is never submitted as the old property)", cb(page).input_value() == "tud" and fd(page) == "", [cb(page).input_value(), fd(page)])
    cb(page).click(); page.locator("[role=option]").first.click(); page.wait_for_timeout(100); cb(page).click(); cb(page).fill("church"); page.wait_for_timeout(100); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    ok("ESCAPE CANCELS a search over a choice: the choice you had is put back (name and value), and the list closes", cb(page).input_value() != "church" and fd(page) != "" and cb(page).get_attribute("aria-expanded") == "false", [cb(page).input_value(), fd(page)])
    cb(page).click(); page.locator("[role=option]").nth(0).click(); page.wait_for_timeout(100)
    cb(page).click(); cb(page).fill("tud"); page.mouse.click(3, 3); page.wait_for_timeout(100); cb(page).click(); page.locator("[role=option]").last.click(); page.wait_for_timeout(100)
    ok("(chosen again after that: the box and the form agree)", cb(page).input_value() != "" and fd(page) != "" and cb(page).evaluate("e => e.validationMessage") == "")
    cb(page).click(); page.locator("[role=option]", has_text="Bedford House").click(); page.wait_for_timeout(100)
    page.locator("[data-testid=picker-clear]").click(); page.wait_for_timeout(100); ok("the × clears it: empty box, nothing chosen, list open, ready to search again", cb(page).input_value() == "" and fd(page) == "" and page.evaluate("window.__state") == "" and opts(page).count() == 5 and page.evaluate("document.activeElement.getAttribute('role')") == "combobox")
    ok("nothing chosen and required: the browser's own message is ours ('Please choose a property from the list.') even when the box is empty", cb(page).evaluate("e => e.validationMessage") == "Please choose a property from the list."); ctx.close()
    # defaults, reset, controlled, empty choice
    ctx, page = start("mountPicker", {"options": OPTS, "initial": "p4"}); ok("a starting choice (defaultValue) is shown by its name and carried by the form", cb(page).input_value() == "22 Tudor Road, Watford" and fd(page) == "p4")
    cb(page).click(); page.locator("[role=option]").first.click(); page.wait_for_timeout(100); page.evaluate("() => document.getElementById('f').reset()"); page.wait_for_timeout(200)
    ok("resetting the form puts the starting choice back (as the invite form does after success)", cb(page).input_value() == "22 Tudor Road, Watford" and fd(page) == "p4", [cb(page).input_value(), fd(page)]); ctx.close()
    ctx, page = start("mountPicker", {"options": OPTS, "controlled": True, "initial": "p2", "externalValue": "p3"}); ok("controlled: starts on the value it is given", cb(page).input_value() == "2 Tudor House, London")
    page.locator("#ext").click(); page.wait_for_timeout(150); ok("controlled: when the page changes the value from outside, the box follows (12 Tudor House)", cb(page).input_value() == "12 Tudor House, London" and fd(page) == "p3")
    cb(page).click(); cb(page).fill("lane"); page.wait_for_timeout(100); ok("controlled: typing tells the page the choice is now empty", page.evaluate("window.__state") == "" and cb(page).input_value() == "lane")
    page.keyboard.press("Enter"); page.wait_for_timeout(100); ok("controlled: choosing tells the page the new value, and the box shows it", page.evaluate("window.__state") == "p1" and cb(page).input_value() == "1 Church Lane, Hemel Hempstead"); ctx.close()
    ctx, page = start("mountPicker", {"options": OPTS, "emptyLabel": "No template - freeform", "initial": ""}); ok("with a real 'none' choice it starts showing it, and the form carries an empty value", cb(page).input_value() == "No template - freeform" and fd(page) == "")
    cb(page).click(); ok("the 'none' choice is the first row of the list", names(page)[0] == "No template - freeform" and len(names(page)) == 6)
    cb(page).fill("church"); page.wait_for_timeout(100); page.keyboard.press("Enter"); ok("a real choice can be made over 'none'", fd(page) == "p1" and cb(page).input_value().startswith("1 Church Lane"))
    page.locator("[data-testid=picker-clear]").click(); page.wait_for_timeout(100); ok("clearing goes back to 'none' (not to an empty box)", cb(page).input_value() == "No template - freeform" and fd(page) == ""); page.mouse.click(3, 3); ok("with 'none' allowed, the form submits with nothing chosen (not required)", page.evaluate("document.getElementById('f').checkValidity()")); ctx.close()
    # a big list
    big = [{"value": f"v{i}", "label": f"{i} High Street, Town {i % 40}", "hint": f"Town {i % 40} · AB{i % 90} 1CD", "keywords": [f"Landlord {i % 30}"]} for i in range(1, 2001)]
    ctx, page = start("mountPicker", {"options": big}); cb(page).click(); page.wait_for_timeout(150); s = page.locator("[data-testid=picker-summary]").inner_text()
    ok("2,000 properties: only the first 50 are drawn, and it says how many there are and to keep typing", opts(page).count() == 50 and "2000 properties, showing the first 50" in s and "Keep typing to narrow it down" in s, s)
    t0 = time.time(); cb(page).fill("1500 high"); page.wait_for_function("() => document.querySelector('[role=option]') && document.querySelector('[role=option]').innerText.startsWith('1500 High Street')", timeout=5000); dt = time.time() - t0
    ok(f"typing into 2,000 properties finds '1500 High Street' straight away ({int(dt * 1000)} ms including the test's own overhead)", dt < 1.5, dt); ctx.close()
    # a phone
    ctx, page = start("mountPicker", {"options": OPTS, "required": True}, vw=375, touch=True); fs = cb(page).evaluate("e => parseFloat(getComputedStyle(e).fontSize)")
    ok("on a phone the box's text is at least 16 px (so the phone does not zoom in when you tap it)", fs >= 16, fs)
    cb(page).tap(); page.wait_for_timeout(150); box = page.locator("[data-testid=picker-popup]").bounding_box(); vwid = page.evaluate("window.innerWidth")
    ok("the list fits the phone's width, and each row is at least 44 px tall (easy to tap)", box["x"] >= 0 and box["x"] + box["width"] <= vwid + 1 and all(o.bounding_box()["height"] >= 44 for o in opts(page).all()), [box, vwid])
    cb(page).fill("tudor"); page.wait_for_timeout(100); opts(page).nth(1).tap(); page.wait_for_timeout(150); ok("tapping a match chooses it", fd(page) in ("p3", "p2") and cb(page).get_attribute("aria-expanded") == "false", fd(page))
    ok("the page does not scroll sideways on a phone", page.evaluate("document.documentElement.scrollWidth") <= 376); ctx.close()
    ok("no page errors so far", not errs, errs)
    # ================= the new inspection form =================
    TPL = [{"id": "t1", "name": "Check In: 1-Bed Flat", "propertyType": "flat"}, {"id": "t2", "name": "Check Out: 1-Bed Flat", "propertyType": "flat"}, {"id": "t3", "name": "Mid-Term: House", "propertyType": "house"}]
    ctx, page = start("mountNewInspection", {"properties": PROPS, "templates": TPL, "initialPropertyId": ""}); prop, tpl = page.locator("#new-inspection-property"), page.locator("#new-inspection-template"); submit = page.get_by_role("button", name="Create inspection")
    ok("the new inspection form has a SEARCH box for the property (not a drop-down), and the template starts as 'No template'", prop.get_attribute("role") == "combobox" and page.locator("select[name=propertyId]").count() == 0 and "No template" in tpl.input_value())
    submit.click(); page.wait_for_timeout(200); ok("submitting without choosing a property is blocked and nothing is sent", (page.evaluate("window.__subs") or []) == [] and prop.evaluate("e => e.validationMessage") == "Please choose a property from the list.")
    prop.click(); prop.fill("tudor 2"); page.wait_for_timeout(100); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    page.select_option("select[name=type]", "check-out"); tpl.click(); tpl.fill("check out"); page.wait_for_timeout(100); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    ok("the property and the template are chosen by searching", "2 Tudor House" in prop.input_value() and "Check Out" in tpl.input_value(), [prop.input_value(), tpl.input_value()])
    page.evaluate("window.__mode = 'error'"); submit.click(); page.wait_for_timeout(500); sub = page.evaluate("window.__subs")[0]
    ok("it sent the right property, template and type", sub["data"]["propertyId"] == "p2" and sub["data"]["templateId"] == "t2" and sub["data"]["type"] == "check-out", sub)
    ok("A FAILED SUBMIT KEEPS YOUR CHOICES (the whole reason this form is built the way it is): the error shows, and the property, template and type are all still as you left them", "That did not work" in page.inner_text("body") and "2 Tudor House" in prop.input_value() and "Check Out" in tpl.input_value() and page.eval_on_selector("select[name=type]", "e => e.value") == "check-out" and page.evaluate("() => new FormData(document.querySelector('form')).get('propertyId')") == "p2", [prop.input_value(), tpl.input_value()])
    page.evaluate("window.__mode = 'ok'"); submit.click(); page.wait_for_timeout(500); ok("trying again sends the same choices", len(page.evaluate("window.__subs")) == 2 and page.evaluate("window.__subs")[1]["data"]["propertyId"] == "p2"); ctx.close()
    ctx, page = start("mountNewInspection", {"properties": PROPS, "templates": TPL, "initialPropertyId": "p4"}); ok("a property chosen before arriving (from a property page) is already shown", "22 Tudor Road" in page.locator("#new-inspection-property").input_value())
    page.get_by_role("button", name="Create inspection").click(); page.wait_for_timeout(400); ok("with no template chosen the form sends an empty template (freeform)", page.evaluate("window.__subs")[0]["data"]["templateId"] == "" and page.evaluate("window.__subs")[0]["data"]["propertyId"] == "p4"); ctx.close()
    ctx, page = start("mountNewInspection", {"properties": [], "templates": [], "initialPropertyId": ""}); ok("with no templates the 'build one' hint still shows", "build one" in page.inner_text("body")); ctx.close()
    # ================= invite a client =================
    REPORTS = [{"id": "r1", "type": "check-in", "propertyId": "p2", "completedDate": "2026-11-01T10:00:00Z"}]
    ctx, page = start("mountInvite", {"properties": PROPS, "reports": REPORTS}); prop = page.locator("#invite-property"); ok("the invite form has a property SEARCH box", prop.get_attribute("role") == "combobox")
    prop.click(); prop.fill("zkm"); page.wait_for_timeout(100); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("searching a landlord ('zkm') finds and chooses 2 Tudor House, and that property's reports appear", "2 Tudor House" in prop.input_value() and page.locator("input[name=reportInspectionIds]").count() == 1, [prop.input_value(), page.locator("input[name=reportInspectionIds]").count()])
    for el in page.locator("form input[required]:not([role=combobox])").all():
        t = el.get_attribute("type") or "text"; el.fill("a@b.co" if t == "email" else "Secret123!" if t == "password" else "Alex Tenant")
    page.get_by_role("button", name="Invite").click(); page.wait_for_timeout(600); sub = page.evaluate("window.__subs")
    ok("the invite was sent for the chosen property", len(sub) == 1 and sub[0]["data"]["propertyId"] == "p2", sub)
    ok("after a successful invite the form is cleared back to blank, including the property box", prop.input_value() == "" and page.evaluate("() => new FormData(document.querySelector('form')).get('propertyId')") == "" and page.locator("input[name=reportInspectionIds]").count() == 0, [prop.input_value()]); ctx.close()
    # ================= add a compliance document =================
    ctx, page = start("mountAddDoc", {"properties": PROPS}); prop = page.locator("#compliance-property"); ok("the compliance form has a property SEARCH box too", prop.get_attribute("role") == "combobox" and page.locator("select[name=propertyId]").count() == 0)
    ok("it will not submit without a property", page.evaluate("document.querySelector('form').checkValidity()") is False)
    prop.click(); prop.fill("watford"); page.wait_for_timeout(100); page.keyboard.press("Enter"); page.wait_for_timeout(100); ok("searching a city ('watford') chooses 22 Tudor Road, and the form carries its id", page.evaluate("() => new FormData(document.querySelector('form')).get('propertyId')") == "p4" and "22 Tudor Road" in prop.input_value()); ctx.close()
    ok("no page errors anywhere", not errs, errs)
    print(f"\nThe searchable property picker and the forms that use it: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
