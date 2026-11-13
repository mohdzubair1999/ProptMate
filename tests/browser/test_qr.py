# The tenant QR report form and the staff list of reports (with the server actions faked).
import os, re, sys
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:420])
R = lambda id, d, t, status="new", **k: {"id": id, "description": d, "photoUrl": None, "reporterName": k.get("name"), "reporterContact": k.get("contact"), "status": status, "createdAt": t}
REPORTS = [R("paint", "paint is peeling in the lounge", "2026-06-04T10:00:00Z"), R("heat", "we have no heating", "2026-06-02T10:00:00Z", name="Sam", contact="07700 900123"), R("gas", "I can smell gas in the kitchen", "2026-05-01T10:00:00Z"), R("old", "gas leak near the boiler", "2026-06-06T10:00:00Z", "resolved"), R("drip", "tap dripping all night", "2026-06-03T10:00:00Z", "reviewed")]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def start(fn, arg=None):
        ctx = b.new_context(viewport={"width": 1000, "height": 900}); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200])); page.goto(f"http://localhost:{PORT}/qr.html"); page.evaluate(f"(a) => window.{fn}(a)", arg); page.wait_for_timeout(300); return ctx, page
    ctx, page = start("mountList", REPORTS); cards = page.locator("[data-testid=qr-report]")
    ok("the staff list puts open reports in danger order, then finished ones: gas (emergency), no heating and tap dripping (urgent, newest first), paint (routine), then the resolved gas leak last", [c.get_attribute("data-urgency") for c in cards.all()] == ["emergency", "urgent", "urgent", "routine", "emergency"] and "gas in the kitchen" in cards.nth(0).inner_text() and "tap dripping" in cards.nth(1).inner_text() and "no heating" in cards.nth(2).inner_text() and "paint is peeling" in cards.nth(3).inner_text() and "gas leak near the boiler" in cards.nth(4).inner_text(), [c.inner_text()[:30] for c in cards.all()])
    ok("each report has a label and a category: 'Emergency' + 'Gas or carbon monoxide', 'Urgent' + 'Leak or water', 'Urgent' + 'Heating or hot water', 'Routine' + 'Decoration and surfaces'", [(c.locator("[data-testid=qr-urgency]").inner_text(), c.locator("[data-testid=qr-category]").inner_text()) for c in cards.all()[:4]] == [("Emergency", "Gas or carbon monoxide"), ("Urgent", "Leak or water"), ("Urgent", "Heating or hot water"), ("Routine", "Decoration and surfaces")])
    ok("an open report shows the words it was suggested from (so staff can see why), a finished one does not", cards.nth(0).locator("[data-testid=qr-reasons]").inner_text() == 'Suggested from: "smell gas"' and cards.nth(4).locator("[data-testid=qr-reasons]").count() == 0)
    ok("one emergency banner says '1 open report sounds like an emergency' with the 999 and gas emergency advice, and does not count the finished gas leak", "1 open report sounds like an emergency" in page.locator("[data-testid=qr-emergency-banner]").inner_text() and "999" in page.locator("[data-testid=qr-emergency-banner]").inner_text() and "0800 111 999" in page.locator("[data-testid=qr-emergency-banner]").inner_text())
    ok("the list says the label is only a suggestion and the report should be read", "suggestion from the words used" in page.inner_text("body"))
    ok("a finished report has no 'Make a maintenance job' button; every open one has", cards.nth(4).locator("[data-testid=qr-make-job]").count() == 0 and all(cards.nth(i).locator("[data-testid=qr-make-job]").count() == 1 for i in range(4)))
    cards.nth(0).locator("[data-testid=qr-make-job]").click(); page.wait_for_timeout(300)
    ok("pressing it asks for a job for THAT report (the gas one), then shows 'Maintenance job created' in its place", ["job", "gas"] in page.evaluate("window.__qr") and "Maintenance job created" in cards.nth(0).inner_text() and cards.nth(0).locator("[data-testid=qr-make-job]").count() == 0)
    ok("only that report changed (the others still have their button)", cards.nth(1).locator("[data-testid=qr-make-job]").count() == 1)
    page.evaluate("window.__qr.length = 0"); cards.nth(1).locator("select").select_option("resolved"); page.wait_for_timeout(300); ok("the status drop-down still works: choosing Resolved asks to set that report to resolved", ["status", "drip", "resolved"] in page.evaluate("window.__qr"))
    ok("no page errors so far", not errs, errs); ctx.close()
    ctx, page = start("mountList", [R("a", "paint is peeling", "2026-06-04T10:00:00Z"), R("b", "gas smell", "2026-06-05T10:00:00Z", "resolved")])
    ok("with no OPEN emergency there is no banner (a finished emergency does not count)", page.locator("[data-testid=qr-emergency-banner]").count() == 0); ctx.close()
    ctx, page = start("mountList", [R("g1", "gas smell", "2026-06-04T10:00:00Z"), R("g2", "smoke coming from the plug", "2026-06-05T10:00:00Z")]); ok("two open emergencies: 'sound like emergencies' (plural)", "2 open reports sound like emergencies" in page.locator("[data-testid=qr-emergency-banner]").inner_text()); ctx.close()
    ctx, page = start("mountList", [R("boom", "tap dripping", "2026-06-04T10:00:00Z")]); page.locator("[data-testid=qr-make-job]").click(); page.wait_for_timeout(300)
    ok("if making the job fails the person sees the message and can try again (the button is still there)", "Report not found" in page.inner_text("body") and page.locator("[data-testid=qr-make-job]").count() == 1); ctx.close()
    ctx, page = start("mountList", [R("x", "<img src=x onerror=alert(1)> gas leak", "2026-06-04T10:00:00Z")]); ok("markup in a tenant's report is shown as plain text, never run", page.locator("[data-testid=qr-report] img").count() == 0 and "<img src=x" in page.inner_text("body")); ctx.close()
    ctx, page = start("mountList", []); ok("no reports: nothing is shown", page.inner_text("#root").strip() == ""); ctx.close()
    # ---------- the tenant form ----------
    ctx, page = start("mountForm"); n = page.locator("[data-testid=qr-emergency-notice]")
    ok("the tenant form always shows an emergency notice above the fields: it is for repairs not emergencies, 999, and the gas number", n.count() == 1 and "This form is for repairs, not emergencies" in n.inner_text() and "999" in n.inner_text() and "0800 111 999" in n.inner_text() and page.locator("textarea").bounding_box()["y"] > n.bounding_box()["y"])
    page.locator("textarea").fill("tap in the bathroom is dripping"); page.get_by_role("button", name=re.compile("Submit|Send|Report", re.I)).last.click(); page.wait_for_timeout(300)
    ok("an ordinary report is sent and thanked, with NO emergency warning", ["submit", "prop1", "tap in the bathroom is dripping", None, None] in page.evaluate("window.__qr") and "Thanks - this has been reported." in page.inner_text("body") and page.locator("[data-testid=qr-emergency-notice-after]").count() == 0); ctx.close()
    ctx, page = start("mountForm"); page.locator("textarea").fill("I can smell gas in the hallway"); page.get_by_role("button", name=re.compile("Submit|Send|Report", re.I)).last.click(); page.wait_for_timeout(300); a = page.locator("[data-testid=qr-emergency-notice-after]")
    ok("a report that sounds like an emergency is still sent, and the thank-you page ALSO says: do not wait for us, call 999 or the gas emergency number, and that a report here is not an emergency call", a.count() == 1 and "may be an emergency" in a.inner_text() and "leave the property" in a.inner_text() and "0800 111 999" in a.inner_text() and "not an emergency call" in a.inner_text() and any(x[0] == "submit" for x in page.evaluate("window.__qr")), a.inner_text() if a.count() else "none"); ctx.close()
    ok("no page errors", not errs, errs)
    print(f"\nTenant QR reports and the staff list: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
