# The trace-over picture: it lives on the screen only. It must never be uploaded, saved, printed, exported or shared.
import os, re, sys, json, zlib, struct
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
def room(name, x, y, w="5", l="4"): return {"name": name, "widthM": w, "lengthM": l, "xM": x, "yM": y, "shape": "rectangle", "hasBayWindow": False}
def png(w, h, rgb=(200, 120, 60)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h)); chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={"width": 1300, "height": 900}, accept_downloads=True); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200])); page.goto(f"http://localhost:{PORT}/index.html")
    page.evaluate("(l) => window.mountEditor(l, 'p', { propertyAddress: '12 Example Road', companyName: 'ZKM', initialShareToken: 'T'.repeat(32), initialShareExpiresAt: null })", [{"name": "Ground floor", "rooms": [room("Lounge", 0, 0)]}, {"name": "First floor", "rooms": [room("Bedroom", 0, 0, w="4")]}]); page.wait_for_selector("[data-room]"); page.wait_for_timeout(400)
    page.evaluate("() => { window.__revoked = 0; const r = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = (u) => { window.__revoked++; return r(u); }; }")
    svgEl = lambda: page.locator("svg").filter(has=page.locator("[data-room]")).first
    def at(dx, dy): svgEl().scroll_into_view_if_needed(); bb = svgEl().bounding_box(); return bb["x"] + dx, bb["y"] + dy
    btn = page.locator("[data-testid=underlay-button]"); img = lambda: page.locator("[data-underlay]")
    def upload(name, mime, data):
        page.set_input_files("[data-testid=underlay-file]", {"name": name, "mimeType": mime, "buffer": data}); page.wait_for_timeout(400)
    ok("the toolbar has a 🖼 Trace over image button (even on an empty plan)", btn.count() == 1 and "Trace over image" in btn.inner_text())
    btn.click(); panel = page.locator("[data-testid=underlay-panel]")
    ok("its panel says the picture stays on this screen only: not uploaded, saved, printed, exported or shared", "stays on this screen only" in panel.inner_text() and "not uploaded, saved, printed, exported or shared" in panel.inner_text())
    err = lambda: page.locator("[data-testid=underlay-error]").inner_text() if page.locator("[data-testid=underlay-error]").count() else ""
    upload("notes.txt", "text/plain", b"hello"); ok("a text file is refused with a plain message", "PNG, JPG or WebP" in err() and img().count() == 0, err())
    upload("evil.svg", "image/svg+xml", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'); ok("an SVG picture is refused (it can carry script)", "PNG, JPG or WebP" in err() and img().count() == 0, err())
    upload("broken.png", "image/png", b"this is not really a png"); ok("a file that says PNG but is not a picture is refused: 'could not be read'", "could not be read" in err() and img().count() == 0, err())
    upload("big.png", "image/png", b"\x89PNG" + b"\x00" * (16 * 1024 * 1024)); ok("a picture over 15 MB is refused", "too large" in err() and img().count() == 0, err())
    upload("plan.png", "image/png", png(200, 100))
    ok("a real PNG appears behind the plan: 10 m wide (400 px) and 5 m tall (200 px, same shape as the picture) at the top-left, half faded, from a local address", img().count() == 1 and img().get_attribute("href").startswith("blob:") and float(img().get_attribute("width")) == 400 and float(img().get_attribute("height")) == 200 and float(img().get_attribute("opacity")) == 0.5 and float(img().get_attribute("x")) == 10 and float(img().get_attribute("y")) == 10, [img().get_attribute(a) for a in ["width", "height", "opacity", "x", "y"]] if img().count() else None)
    ok("the button now says '(on)', and the picture is the FIRST thing in the drawing, so it sits beneath the rooms", "(on)" in btn.inner_text() and page.evaluate("() => { const s = document.querySelector('svg [data-underlay]').closest('svg'); const kids = [...s.children].filter((e) => e.tagName.toLowerCase() !== 'defs'); return kids[0].hasAttribute('data-underlay'); }"))
    page.locator("[data-testid=underlay-opacity]").fill("100"); page.wait_for_timeout(150); ok("the Fade slider changes how strong the picture is", float(img().get_attribute("opacity")) == 1)
    page.locator("[data-testid=underlay-x]").fill("1"); page.locator("[data-testid=underlay-y]").fill("0.5"); page.wait_for_timeout(150); ok("Left and Top move it (1 m across and 0.5 m down = 40 px and 20 px)", float(img().get_attribute("x")) == 50 and float(img().get_attribute("y")) == 30, [img().get_attribute("x"), img().get_attribute("y")])
    # ---- set the size from a known length, using the Measure tool ----
    btn.click(); page.get_by_role("button", name=re.compile("Measure")).click(); x, y = at(60, 60); page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 160, y, steps=6); page.mouse.up(); page.wait_for_timeout(250)
    sx = float(page.locator("circle[fill='#DC2626']").first.get_attribute("cx")); sy = float(page.locator("circle[fill='#DC2626']").first.get_attribute("cy"))
    btn.click(); ok("with a measurement showing, the panel reads it back ('You measured 4.00 m') and asks for the real length", "You measured 4.00 m" in page.locator("[data-testid=underlay-measured]").inner_text(), page.locator("[data-testid=underlay-measured]").inner_text() if page.locator("[data-testid=underlay-measured]").count() else "none")
    ok("'Set size' is not available until a real length is typed", page.locator("[data-testid=underlay-apply]").is_disabled())
    page.locator("[data-testid=underlay-real]").fill("2"); page.locator("[data-testid=underlay-apply]").click(); page.wait_for_timeout(250)
    mx, my = (sx - 10) / 40, (sy - 10) / 40; ex, ey = mx - (mx - 1) * 0.5, my - (my - 0.5) * 0.5
    ok("saying the 4 m you measured is really 2 m halves the picture (10 m becomes 5 m, 200 px wide) ...", float(img().get_attribute("width")) == 200 and float(img().get_attribute("height")) == 100 and "5 m wide" in page.locator("[data-testid=underlay-width]").inner_text(), [img().get_attribute("width"), page.locator("[data-testid=underlay-width]").inner_text()])
    ok("... keeping the first point you measured exactly where it was on the plan (the picture shrinks towards that point, so what you measured stays under it)", abs(float(img().get_attribute("x")) - (10 + ex * 40)) < 0.2 and abs(float(img().get_attribute("y")) - (10 + ey * 40)) < 0.2, [img().get_attribute("x"), 10 + ex * 40, img().get_attribute("y"), 10 + ey * 40])
    ok("the measurement is cleared once used", page.locator("circle[fill='#DC2626']").count() == 0 and page.locator("[data-testid=underlay-measured]").count() == 0)
    # ---- it must never leave the screen ----
    page.get_by_role("button", name=re.compile("Measure")).click(); page.keyboard.press("Escape"); btn.click(); page.wait_for_timeout(150)
    def export_svg():
        page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]")
        with page.expect_download() as d: page.get_by_role("menuitem", name=re.compile("^SVG")).click()
        d.value.save_as("/tmp/underlay-sheet.svg"); return open("/tmp/underlay-sheet.svg", encoding="utf-8").read()
    with_img = export_svg(); ok("the exported SVG sheet has no picture in it: no <image>, no blob address, nothing of the underlay", "<image" not in with_img and "blob:" not in with_img and "underlay" not in with_img.lower())
    img_count = page.evaluate("() => document.querySelectorAll('[data-underlay]').length"); ok("(the picture is still on screen after exporting)", img_count == 1)
    page.evaluate("() => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return o(b); }; }")
    page.get_by_role("button", name=re.compile("Export")).click(); page.wait_for_selector("[data-testid=export-menu]"); page.get_by_role("menuitem", name=re.compile("^Drawing only")).click(); page.wait_for_timeout(1500)
    blobs = page.evaluate("async () => Promise.all((window.__blobs || []).filter((b) => b.type.startsWith('image/svg')).map((b) => b.text()))")
    ok("the 'Drawing only' image has no picture in it either", len(blobs) >= 1 and "<image" not in blobs[-1] and "data-underlay" not in blobs[-1], len(blobs))
    page.get_by_role("button", name="Save floor plan").click(); page.wait_for_timeout(1200); blob = json.dumps(page.evaluate("window.__saves || []"))
    ok("a SAVE of a shared plan carries no picture: nothing of the underlay is in what is stored (no image, no blob address, no picture data)", "<image" not in blob and "blob:" not in blob and "underlay" not in blob.lower() and "iVBOR" not in blob, len(blob))
    # ---- one picture per floor ----
    page.get_by_role("button", name="First floor", exact=True).click(); page.wait_for_timeout(300)
    ok("on the next floor there is no picture (each floor has its own)", img().count() == 0 and "(on)" not in btn.inner_text())
    page.get_by_role("button", name="Ground floor", exact=True).click(); page.wait_for_timeout(300)
    ok("going back to the first floor brings its picture back, with its size and place kept", img().count() == 1 and float(img().get_attribute("width")) == 200, img().count())
    # ---- removing it ----
    before = page.evaluate("window.__revoked"); btn.click(); page.locator("[data-testid=underlay-remove]").click(); page.wait_for_timeout(250)
    ok("'Remove picture' takes it away, the button goes back to normal, and the picture is let go of", img().count() == 0 and "(on)" not in btn.inner_text() and page.evaluate("window.__revoked") > before)
    ok("no page errors", not errs, errs)
    print(f"\nThe trace-over picture stays on the screen: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
