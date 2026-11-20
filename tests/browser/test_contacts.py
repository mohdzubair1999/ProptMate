# Email suggestions in the send form, the saved client picker on a property, the summary section's client picker, and the Client details page. PORT = where this folder is served.
import os, re, sys
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8767"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
SUG = [{"email": "joe.bloggs@gmail.com", "name": "Joe Bloggs", "source": "client"}, {"email": "kim@lettings.co.uk", "name": None, "source": "recent"}, {"email": "info@acme.co.uk", "name": "Acme Lettings", "source": "client"}, {"email": "sam@outlook.com", "name": "Sam Tenant", "source": "portal"}, {"email": "zubair@zkm.co.uk", "name": "Zubair", "source": "team"}]
CLIENTS = [{"id": "c1", "name": "Acme Lettings", "address": "1 High St\nLondon"}, {"id": "c2", "name": "Brown & Co", "address": None}]
FETCH = "window.__fetches = []; const of = window.fetch; window.fetch = async (u, i) => { if (String(u).includes('/api/email/send-report')) { window.__fetches.push(JSON.parse(i.body)); return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }); } return of(u, i); };"
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def start(fn, arg, vw=900):
        ctx = b.new_context(viewport={"width": vw, "height": 900}); ctx.add_init_script(FETCH); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200])); page.on("dialog", lambda d: d.accept())
        page.goto(f"http://localhost:{PORT}/contacts.html"); page.evaluate(f"(a) => window.{fn}(a)", arg); page.wait_for_timeout(250); return ctx, page
    # ================= the send form =================
    def send_form(suggestions=SUG, vw=900):
        ctx, page = start("mountSend", {"suggestions": suggestions}, vw); page.get_by_role("button", name="Email report").click(); page.wait_for_selector("input[placeholder='recipient@email.com']"); return ctx, page
    to = lambda page: page.locator("input[placeholder='recipient@email.com'], input[placeholder='Add another…']").first
    chips = lambda page: [c.inner_text().replace("✕", "").strip() for c in page.locator("span.rounded-full").all()]
    sug = lambda page: [o.get_attribute("data-email") for o in page.locator("[data-testid=email-suggestions] [role=option]").all()]
    err = lambda page: page.locator("text=doesn't look like a valid email").count()
    ctx, page = send_form()
    ok("with nothing typed there is no list of suggestions", page.locator("[data-testid=email-suggestions]").count() == 0)
    to(page).click(); to(page).type("jo", delay=30); page.wait_for_timeout(150)
    ok("typing two letters, 'jo', suggests the full address, with the name and where it came from", sug(page) == ["joe.bloggs@gmail.com"] and "Joe Bloggs" in page.locator("[role=option]").first.inner_text() and "Saved client" in page.locator("[role=option]").first.inner_text(), sug(page))
    ok("the letters typed are shown in bold in the suggestion", page.locator("[role=option] mark").count() >= 1 and page.locator("[role=option] mark").first.inner_text().lower() == "jo")
    page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("Enter takes the suggestion: the full address becomes a chip, the box is cleared, and there is no 'not a valid address' error", chips(page) == ["joe.bloggs@gmail.com"] and to(page).input_value() == "" and err(page) == 0, [chips(page), to(page).input_value()])
    to(page).type("kim", delay=30); page.wait_for_timeout(150); page.locator("[role=option]").first.click(); page.wait_for_timeout(200)
    ok("CLICKING a suggestion with the mouse adds it (the click does not first add the half-typed letters as a bad address when the box loses focus)", chips(page) == ["joe.bloggs@gmail.com", "kim@lettings.co.uk"] and err(page) == 0 and to(page).input_value() == "", [chips(page), err(page)])
    to(page).type("sam", delay=30); page.wait_for_timeout(150); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    ok("Tab takes the suggestion too", "sam@outlook.com" in chips(page) and err(page) == 0, chips(page))
    to(page).type("jo", delay=30); page.wait_for_timeout(150)
    ok("an address that is already a chip is not suggested again", sug(page) == [] and page.locator("[data-testid=email-suggestions]").count() == 0, sug(page))
    to(page).fill(""); to(page).type("new.person@example.com", delay=10); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("a brand new address that is in nobody's list can still be typed and added", "new.person@example.com" in chips(page) and err(page) == 0, chips(page))
    to(page).type("zubair@zkm.co", delay=10); page.wait_for_timeout(150); has = sug(page)
    page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("a WHOLE address typed (zubair@zkm.co) is added exactly as typed by Enter, even though a longer one (zubair@zkm.co.uk) is suggested: the suggestion is not forced on you", has == ["zubair@zkm.co.uk"] and "zubair@zkm.co" in chips(page) and "zubair@zkm.co.uk" not in chips(page), [has, chips(page)])
    to(page).type("info@acme.co", delay=10); page.wait_for_timeout(150); page.keyboard.press("ArrowDown"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("but after pressing an arrow key, Enter takes the highlighted suggestion (info@acme.co.uk)", "info@acme.co.uk" in chips(page) and "info@acme.co" not in chips(page), chips(page))
    to(page).fill(""); to(page).type("sam", delay=10); page.wait_for_timeout(150); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    ok("Escape closes the list and leaves what was typed", page.locator("[data-testid=email-suggestions]").count() == 0 and to(page).input_value() == "sam")
    to(page).fill("")
    page.get_by_role("button", name="Send").click(); page.wait_for_timeout(500); sent = page.evaluate("window.__fetches")
    ok("sending sends to exactly the chosen addresses, in order", len(sent) == 1 and sent[0]["recipientEmails"] == ["joe.bloggs@gmail.com", "kim@lettings.co.uk", "sam@outlook.com", "new.person@example.com", "zubair@zkm.co", "info@acme.co.uk"], sent)
    ok("no page errors so far", not errs, errs); ctx.close()
    # a name finds an address, and the list on a phone
    ctx, page = send_form(vw=375); to(page).click(); to(page).type("tenant", delay=20); page.wait_for_timeout(150)
    box = page.locator("[data-testid=email-suggestions]").bounding_box(); vwid = page.evaluate("window.innerWidth")
    ok("typing a NAME ('tenant') finds that person's address on a phone, and the list fits the screen with rows at least 44 px tall", sug(page) == ["sam@outlook.com"] and box["x"] >= 0 and box["x"] + box["width"] <= vwid + 1 and page.locator("[role=option]").first.bounding_box()["height"] >= 44, [sug(page), box, vwid]); ctx.close()
    # signature mode: named rows
    ctx, page = send_form(); page.locator("input[type=checkbox]").check(); page.wait_for_timeout(200); em = page.locator("input[type=email]").first; nm = page.locator("input[placeholder=Name]").first
    em.click(); em.type("sam", delay=20); page.wait_for_timeout(150); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("with e-signature on, choosing a suggestion fills the address AND the person's name when the name was empty", em.input_value() == "sam@outlook.com" and nm.input_value() == "Sam Tenant", [em.input_value(), nm.input_value()])
    em.fill(""); nm.fill("My own name"); em.type("joe", delay=20); page.wait_for_timeout(150); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("...but a name you have already typed is not overwritten", em.input_value() == "joe.bloggs@gmail.com" and nm.input_value() == "My own name", [em.input_value(), nm.input_value()]); ctx.close()
    ctx, page = send_form(suggestions=[]); to(page).click(); to(page).type("jo", delay=20); page.wait_for_timeout(150); to(page).type("e@x.co"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    ok("with no suggestions at all, nothing changes: typing an address and Enter adds it as before", chips(page) == ["joe@x.co"] and page.locator("[data-testid=email-suggestions]").count() == 0, chips(page)); ctx.close()
    # ================= the property's client =================
    ctx, page = start("mountProp", {"clients": CLIENTS}); pk = page.locator("#property-client"); name = page.locator("input[name=landlordName]"); addr = page.locator("textarea[name=landlordAddress]")
    fd = lambda: page.evaluate("() => Object.fromEntries([...new FormData(document.getElementById('f')).entries()])")
    ok("with saved clients there is a search box for the client, the name and address can be typed, and nothing is linked", pk.get_attribute("role") == "combobox" and name.get_attribute("readonly") is None and fd().get("clientContactId") == "", fd())
    name.fill("Typed Name"); pk.click(); pk.fill("acme"); page.wait_for_timeout(150); page.keyboard.press("Enter"); page.wait_for_timeout(200)
    ok("choosing 'Acme' (found by a few letters) fills the name and the address, links the client, and makes them read-only", name.input_value() == "Acme Lettings" and addr.input_value() == "1 High St\nLondon" and name.get_attribute("readonly") is not None and fd().get("clientContactId") == "c1" and fd().get("landlordName") == "Acme Lettings", fd())
    ok("it explains that they come from the saved client", "come from the saved client" in page.inner_text("body"))
    page.locator("[data-testid=picker-clear]").click(); page.wait_for_timeout(200); page.mouse.click(3, 3)
    ok("choosing 'No saved client' unlinks it and lets you type again, keeping what was there", fd().get("clientContactId") == "" and name.get_attribute("readonly") is None and name.input_value() == "Acme Lettings", fd()); ctx.close()
    ctx, page = start("mountProp", {"clients": CLIENTS, "initial": {"clientContactId": "c2", "landlordName": "Brown & Co", "landlordAddress": None}}); fd = lambda: page.evaluate("() => Object.fromEntries([...new FormData(document.getElementById('f')).entries()])")
    ok("EDITING a property that already has a saved client shows it chosen, linked, and read-only", page.locator("#property-client").input_value() == "Brown & Co" and fd().get("clientContactId") == "c2" and page.locator("input[name=landlordName]").get_attribute("readonly") is not None, fd()); ctx.close()
    ctx, page = start("mountProp", {"clients": [], "initial": {"landlordName": "Mr Patel", "landlordAddress": "5 Elm Rd"}}); fd = lambda: page.evaluate("() => Object.fromEntries([...new FormData(document.getElementById('f')).entries()])")
    ok("a company with no saved clients sees just the two ordinary fields (and sends no client link, so an edit cannot unlink anything)", page.locator("#property-client").count() == 0 and "clientContactId" not in fd() and fd()["landlordName"] == "Mr Patel" and fd()["landlordAddress"] == "5 Elm Rd", fd()); ctx.close()
    # ================= the summary section =================
    ctx, page = start("mountSummary", {"clients": CLIENTS}); page.get_by_role("button", name="Summary Reference").click(); page.wait_for_timeout(200)
    sp = page.locator("#summary-client"); cn = page.locator("label").filter(has_text=re.compile(r"^\s*Client name")).locator("xpath=following-sibling::*[1]"); ca = page.locator("label").filter(has_text=re.compile(r"^\s*Client address")).locator("xpath=following-sibling::*[1]")
    sp.click(); sp.fill("brown"); page.wait_for_timeout(150); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    ok("on an older inspection, choosing a saved client fills the client name and address in the summary", cn.input_value() == "Brown & Co" and ca.input_value() == "", [cn.input_value(), ca.input_value()])
    sp.click(); sp.fill("acme"); page.wait_for_timeout(150); page.keyboard.press("Enter"); page.wait_for_timeout(300); calls = [c["args"] for c in page.evaluate("window.__calls") if c["fn"] == "saveSummaryReferenceField"]
    ok("choosing another replaces both, and BOTH are saved to the inspection", cn.input_value() == "Acme Lettings" and ca.input_value() == "1 High St\nLondon" and calls[-2:] == [["insp1", "clientName", "Acme Lettings"], ["insp1", "clientAddress", "1 High St\nLondon"]], calls); ctx.close()
    ctx, page = start("mountSummary", {"clients": []}); page.get_by_role("button", name="Summary Reference").click(); page.wait_for_timeout(200)
    ok("with no saved clients there is no picker, just the two fields as before", page.locator("#summary-client").count() == 0 and page.locator("label").filter(has_text=re.compile(r"^\s*Client name")).count() == 1); ctx.close()
    ctx, page = start("mountSummary", {"clients": CLIENTS, "initialValues": {"clientName": "Typed already", "clientAddress": "Somewhere"}}); page.get_by_role("button", name="Summary Reference").click(); page.wait_for_timeout(200)
    ok("a client name already filled in is shown and is not overwritten just by opening the section", page.locator("label").filter(has_text=re.compile(r"^\s*Client name")).locator("xpath=following-sibling::*[1]").input_value() == "Typed already" and not [c for c in page.evaluate("window.__calls || []") if c["fn"] == "saveSummaryReferenceField"]); ctx.close()
    # ================= Client details (Settings) =================
    CL = [{"id": "c1", "name": "Acme Lettings", "address": "1 High St\nLondon", "email": "info@acme.co.uk", "phone": "020 7946 0000", "properties": 3}, {"id": "c2", "name": "Brown & Co", "address": None, "email": None, "phone": None, "properties": 0}, {"id": "c3", "name": "Zed Estates", "address": "Zed House", "email": "zed@zed.co", "phone": None, "properties": 1}]
    RC = [{"id": "r1", "email": "kim@lettings.co.uk", "name": "Kim Lee", "useCount": 3}, {"id": "r2", "email": "lee@x.co", "name": None, "useCount": 1}]
    ctx, page = start("mountManager", {"clients": CL, "recipients": RC, "canRemove": True}); rows = lambda: [r.inner_text() for r in page.locator("[data-testid=client-row]").all()]
    ok("all saved clients are listed A to Z with their address, email, phone and how many properties use them", len(rows()) == 3 and "Acme Lettings" in rows()[0] and "info@acme.co.uk" in rows()[0] and "Used by 3 properties" in rows()[0] and "Not chosen on any property yet" in rows()[1] and "Used by 1 property" in rows()[2], rows())
    page.locator("[data-testid=client-search]").fill("zed"); page.wait_for_timeout(150); ok("the search box finds a client by a few letters", len(rows()) == 1 and "Zed Estates" in rows()[0])
    page.locator("[data-testid=client-search]").fill("020 7946"); page.wait_for_timeout(150); ok("...by its phone number", len(rows()) == 1 and "Acme" in rows()[0])
    page.locator("[data-testid=client-search]").fill("nobody"); page.wait_for_timeout(150); ok("...and says plainly when nothing matches", page.locator("[data-testid=no-client-match]").inner_text() == "No client matches “nobody”.")
    page.locator("[data-testid=client-search]").fill("")
    page.locator("[data-testid=add-client]").click(); form = page.locator("[data-testid=add-client-form]"); form.locator("input[name=name]").fill("New Client"); form.locator("textarea[name=address]").fill("2 Low Rd"); form.locator("input[name=email]").fill("new@client.co"); form.get_by_role("button", name="Save client").click(); page.wait_for_timeout(300)
    saved = [c["args"] for c in page.evaluate("window.__calls") if c["fn"] == "saveClientContact"]
    ok("adding a client sends its details (with no client id, so it is a new one) and the form closes", len(saved) == 1 and saved[0]["name"] == "New Client" and saved[0]["address"] == "2 Low Rd" and saved[0]["email"] == "new@client.co" and "clientId" not in saved[0] and page.locator("[data-testid=add-client-form]").count() == 0, saved)
    page.evaluate("window.__mode = 'error'"); page.locator("[data-testid=add-client]").click(); form = page.locator("[data-testid=add-client-form]"); form.locator("input[name=name]").fill("Acme Lettings"); form.locator("textarea[name=address]").fill("keep this address"); form.get_by_role("button", name="Save client").click(); page.wait_for_timeout(300)
    ok("a refused save (a name already saved) shows the reason and KEEPS everything that was typed", "already saved" in page.locator("[data-testid=client-error]").inner_text() and form.locator("textarea[name=address]").input_value() == "keep this address" and form.locator("input[name=name]").input_value() == "Acme Lettings")
    form.get_by_role("button", name="Cancel").click(); page.evaluate("window.__mode = 'ok'")
    page.locator("[data-testid=client-row]").first.get_by_role("button", name="Edit").click(); ef = page.locator("[data-testid=edit-client-form]")
    ok("Edit opens that client's form filled in, with its id", ef.locator("input[name=name]").input_value() == "Acme Lettings" and ef.locator("textarea[name=address]").input_value() == "1 High St\nLondon" and ef.locator("input[name=clientId]").input_value() == "c1" and ef.locator("input[name=email]").input_value() == "info@acme.co.uk")
    ef.get_by_role("button", name="Cancel").click(); page.locator("[data-testid=client-row]").first.get_by_role("button", name="Delete").click(); page.wait_for_timeout(300)
    ok("Delete (after the person confirms) sends that client's id", any(c["fn"] == "deleteClientContact" and c["args"]["clientId"] == "c1" for c in page.evaluate("window.__calls")))
    ok("remembered addresses are listed with their use count, and can be removed", page.locator("[data-testid=recipient-row]").count() == 2 and "sent 3 times" in page.locator("[data-testid=recipient-row]").first.inner_text() and "sent 1 time" in page.locator("[data-testid=recipient-row]").nth(1).inner_text())
    page.locator("[data-testid=recipient-row]").first.get_by_role("button", name="Remove").click(); page.wait_for_timeout(250); ok("Remove sends that address's id", any(c["fn"] == "forgetRememberedAddress" and c["args"]["recipientId"] == "r1" for c in page.evaluate("window.__calls"))); ctx.close()
    ctx, page = start("mountManager", {"clients": CL, "recipients": RC, "canRemove": False})
    ok("someone who may not delete sees no Delete and no Remove buttons (but can still Edit)", page.get_by_role("button", name="Delete").count() == 0 and page.get_by_role("button", name="Remove").count() == 0 and page.get_by_role("button", name="Edit").count() == 3); ctx.close()
    ctx, page = start("mountManager", {"clients": [], "recipients": [], "canRemove": True})
    ok("with nothing saved it says so, and there is no search box", "No clients saved yet" in page.locator("[data-testid=client-list]").inner_text() and page.locator("[data-testid=client-search]").count() == 0 and "None yet" in page.locator("[data-testid=recipient-list]").inner_text()); ctx.close()
    ok("no page errors anywhere", not errs, errs)
    print(f"\nClient details and email suggestions on screen: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
