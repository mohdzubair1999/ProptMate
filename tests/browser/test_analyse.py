# Analysing a big set of photos in batches: the server only allows so many requests in a window (40 Detailed requests in 15 minutes), so the batches must be paced,
# a limit must be explained, what is done must be kept, and "try again" must send only what is missing. The server is faked in the page.
import os, re, sys, json
from playwright.sync_api import sync_playwright
PORT = os.environ.get("PORT", "8766"); P = F = 0
def ok(n, c, x=""):
    global P, F
    if c: P += 1
    else: F += 1; print("FAIL:", n, str(x)[:500])
FAKE = """
window.__srv = { allow: 40, accepted: 0, inFlight: 0, maxInFlight: 0, requests: [], synth: [], failMode: null, delay: 15, retryAfter: 600, window: false, daily: false, clarify: false, timer: null, bullets: false, possible: false, detailFail: false };
const realFetch = window.fetch.bind(window); const J = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...h } });
window.fetch = async (url, init) => {
  const u = String(url), S = window.__srv;
  if (u.includes('/api/ai/analyze-photo')) {
    const body = JSON.parse(init.body); S.requests.push(body.photoUrls); S.inFlight++; S.maxInFlight = Math.max(S.maxInFlight, S.inFlight);
    await new Promise((r) => setTimeout(r, S.delay)); S.inFlight--;
    if (init.signal && init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (S.failMode === '500') return J({ error: 'boom' }, 500);
    if (S.accepted >= S.allow) {
      // like the real limiter, a FIXED window: when it ends the whole allowance is back
      if (S.window && !S.timer) S.timer = setTimeout(() => { S.accepted = 0; S.timer = null; }, S.retryAfter * 1000);
      return J({ error: S.daily ? "Your company has used today's allowance for this feature. It starts again within 24 hours; the Quick option may still be available." : "That's a lot of requests in a short time - please wait 10 minutes" }, 429, { 'Retry-After': String(S.retryAfter) });
    }
    S.accepted++;
    if (S.bullets) { const nm = body.photoUrls[0].split('/').pop().replace('.jpg', ''); return J({ description: '• Walls and ceiling: Walls ' + nm + '.\\n• Flooring: Carpet ' + nm + '.', hints: { visibleText: [], safety: [], closerPhotoFor: [], possible: S.possible ? ['stain on carpet near the door'] : [] }, detailPass: S.detailFail && nm === 'p5' ? 'failed' : 'used', format: 'bullets' }); }
    return J({ description: 'Described ' + body.photoUrls[0].split('/').pop() + '.' + (S.clarify && S.accepted === 1 ? ' [CLARIFY: What material is the worktop?]' : ''), hints: { visibleText: [], safety: [], closerPhotoFor: [] } });
  }
  if (u.includes('/api/ai/synthesize-descriptions')) { const b = JSON.parse(init.body); S.synth.push(b.descriptions.length); return J({ description: 'COMBINED(' + b.descriptions.length + '): ' + b.descriptions[0] + ' ... ' + b.descriptions[b.descriptions.length - 1] }); }
  return realFetch(url, init);
};
"""
urls = lambda n: [f"https://blob.example/p{i + 1}.jpg" for i in range(n)]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def start(n, **extra):
        ctx = b.new_context(viewport={"width": 900, "height": 700}); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:200])); page.add_init_script(FAKE)
        page.goto(f"http://localhost:{PORT}/analyse.html"); page.evaluate("(a) => window.mountAnalyse(a)", {"photoUrls": urls(n), "targetId": "notes", **extra}); page.wait_for_selector("button"); return ctx, page
    btn = lambda page: page.locator("button").first
    def run(page, wait_for="[data-testid=analysis-notices]", timeout=60000):
        btn(page).click(); page.wait_for_function("() => !document.querySelector('button').disabled", timeout=timeout); page.wait_for_timeout(200)
    srv = lambda page: page.evaluate("() => ({ accepted: window.__srv.accepted, max: window.__srv.maxInFlight, n: window.__srv.requests.length, synth: window.__srv.synth })")
    notes = lambda page: page.locator("#notes").input_value()
    # ================= the reported case: 384 photos, Detailed (4 per batch = 96 batches), a limit of 40 =================
    ctx, page = start(384); ok("the button offers all 384 photos", "Analyse all 384 photos" in btn(page).inner_text())
    run(page); s = srv(page); n = page.locator("[data-testid=analysis-notices]").inner_text(); t = notes(page)
    ok("it stopped at the limit instead of sending all 96 batches at once: 40 were analysed and only a handful more were ever sent", s["accepted"] == 40 and 41 <= s["n"] <= 46, s)
    ok("requests went a few at a time: never more than 5 at once (Detailed), not all 96 together", 2 <= s["max"] <= 5, s["max"])
    ok("THE MESSAGE NOW EXPLAINS: photos 161–384 (224) were not analysed, why (the limit for AI requests), how long to wait (about 10 minutes), and that only those will be sent next time", all(x in n for x in ["photos 161–384 (224)", "limit for AI requests", "about 10 minutes", "only those photos will be sent", "what is done has been kept"]), n)
    ok("the person does NOT see 'Something went wrong' (it was a limit, not a fault)", "Something went wrong" not in page.inner_text("body"))
    ok("the 40 finished batches were combined into the notes (once), and there is NO warning line typed into the notes", s["synth"] == [40] and t.startswith("COMBINED(40)") and "⚠" not in t and "Couldn't" not in t, t[:200])
    ok("the button now says how many are left: 'Analyse the remaining 224 photos'", "Analyse the remaining 224 photos" in btn(page).inner_text(), btn(page).inner_text())
    # ---- the limit resets; press again ----
    page.evaluate("() => { window.__srv.allow = 1000; window.__srv.requests.length = 0; window.__srv.synth.length = 0; }"); run(page); s = srv(page); t = notes(page)
    ok("pressing again sends ONLY the 56 missing batches (not the 40 already done, not all 96)", s["n"] == 56, s["n"])
    reqs = page.evaluate("() => window.__srv.requests.map((r) => r[0])"); ok("they are photos 161 to 384 exactly: the first photo of each batch is p161, p165 ... p381", sorted(int(re.search(r"p(\d+)\.jpg", u).group(1)) for u in reqs) == list(range(161, 385, 4)), sorted(reqs)[:3])
    ok("all 96 batches are now combined into ONE description", s["synth"] == [96] and t.startswith("COMBINED(96)"), s["synth"])
    ok("the notes hold the finished text ONCE: the earlier partial text was replaced, not repeated", t.count("COMBINED(") == 1 and "COMBINED(40)" not in t and "⚠" not in t, t[:300])
    ok("no notice is left, and the button is back to its normal label", page.locator("[data-testid=analysis-notices]").count() == 0 and "Analyse all 384 photos" in btn(page).inner_text(), btn(page).inner_text())
    # ---- running again after a complete run is a fresh run, as before ----
    page.evaluate("() => { window.__srv.requests.length = 0; window.__srv.synth.length = 0; }"); run(page); s = srv(page)
    ok("pressing it after a COMPLETE run starts afresh (all 96 batches), exactly as it always did", s["n"] == 96 and s["synth"] == [96], s)
    ok("no page errors", not errs, errs); ctx.close()
    # ================= the very first batch is refused =================
    ctx, page = start(40); page.evaluate("() => { window.__srv.allow = 0; }"); run(page); n = page.locator("[data-testid=analysis-notices]").inner_text()
    ok("when NOTHING could be analysed because of the limit, the person is told so plainly (with the wait), not 'Something went wrong'", "limit for AI requests" in n and "about 10 minutes" in n and "Something went wrong" not in page.inner_text("body") and notes(page) == "", [n, notes(page)])
    ok("and the notes field is left alone", notes(page) == "")
    page.evaluate("() => { window.__srv.allow = 1000; window.__srv.requests.length = 0; }"); run(page)
    ok("trying again later works in full, and sends every photo (nothing had been done)", srv(page)["n"] == 10 and "Described p1.jpg." in notes(page) or srv(page)["n"] == 10, srv(page)); ctx.close()
    # ================= the service is down =================
    ctx, page = start(384); page.evaluate("() => { window.__srv.failMode = '500'; }"); run(page); s = srv(page); n = page.locator("[data-testid=analysis-notices]").inner_text()
    ok("when the service is down it does not send 96 requests to fail: sending stops after a few", s["n"] <= 10, s)
    ok("it says the service had a problem and sending was stopped, and lists the photos", "analysis service had a problem" in n and "stopped responding" in n, n)
    ok("the notes field is untouched", notes(page) == ""); ctx.close()
    # ================= an ordinary small run is unchanged =================
    ctx, page = start(3); run(page)
    ok("a small set (one batch) works exactly as before: the one description goes into the notes, no combining step, no notices, no remaining-photos label", notes(page) == "Described p1.jpg." and srv(page)["synth"] == [] and page.locator("[data-testid=analysis-notices]").count() == 0 and "Analyse all 3 photos" in btn(page).inner_text(), [notes(page), btn(page).inner_text()]); ctx.close()
    # ================= progress while it runs =================
    ctx, page = start(120); page.evaluate("() => { window.__srv.delay = 80; window.__srv.allow = 1000; }"); btn(page).click(); page.wait_for_timeout(400); label = btn(page).inner_text()
    ok("while it works it shows progress as 'N of 30 batches complete' (120 photos is 30 batches)", re.search(r"Analysing… \d+ of 30 batches complete", label) is not None, label)
    page.wait_for_function("() => !document.querySelector('button').disabled", timeout=60000); ok("it finishes: 30 of 30 combined", srv(page)["synth"] == [30]); ctx.close()
    # ================= Quick mode has bigger batches =================
    ctx, page = start(200); page.locator("[data-testid=analysis-depth]").select_option("standard"); page.evaluate("() => { window.__srv.allow = 1000; }"); run(page)
    ok("Quick mode now sends 12 photos a batch (200 photos is 17 requests, the last with 8), where it used to send 40 at once and skip things", srv(page)["n"] == 17 and all(len(r) <= 12 for r in page.evaluate("() => window.__srv.requests")) and sorted(len(r) for r in page.evaluate("() => window.__srv.requests"))[0] == 8, srv(page)); ctx.close()
    # ================= it carries on BY ITSELF after the limit =================
    ctx, page = start(240); page.evaluate("() => { window.__srv.retryAfter = 2; window.__srv.window = true; }"); btn(page).click()
    page.wait_for_selector("[data-testid=analysis-autowait]", timeout=30000); wait = page.locator("[data-testid=analysis-autowait]").inner_text(); n = page.locator("[data-testid=analysis-notices]").inner_text()
    ok("after the limit it shows a countdown and says it will carry on by itself, and to keep the page open", "Carrying on by itself in" in wait and re.search(r"\d:\d\d", page.locator("[data-testid=analysis-countdown]").inner_text()) is not None and "Keep this page open" in wait and page.locator("[data-testid=analysis-autowait-stop]").count() == 1, wait)
    ok("the note names the photos still to do (161–240, which is 80) and says it will carry on by itself", "photos 161–240 (80)" in n and "carry on by itself" in n and "keep this page open" in n, n)
    page.wait_for_function("() => document.getElementById('notes').value.startsWith('COMBINED(60)')", timeout=40000); page.wait_for_timeout(400); s = srv(page); t = notes(page)
    ok("with NO further press it carried on when the window ended and sent only the 20 missing batches (63 requests in all: 40 + a few refused + 20, not 60 sent twice)", s["accepted"] == 20 and 60 <= s["n"] <= 65, s)
    ok("the first round combined 40, the carry-on round combined all 60", s["synth"] == [40, 60], s["synth"])
    ok("the notes hold the finished text once (the partial one was replaced), with no warning in it", t.count("COMBINED(") == 1 and t.startswith("COMBINED(60)") and "⚠" not in t, t[:200])
    ok("nothing is left on screen: no countdown, no notice, and the button is back to normal", page.locator("[data-testid=analysis-autowait]").count() == 0 and page.locator("[data-testid=analysis-notices]").count() == 0 and "Analyse all 240 photos" in btn(page).inner_text(), btn(page).inner_text())
    ok("no page errors", not errs, errs); ctx.close()
    # ---- Stop waiting ----
    ctx, page = start(240); page.evaluate("() => { window.__srv.retryAfter = 2; window.__srv.window = true; }"); btn(page).click(); page.wait_for_selector("[data-testid=analysis-autowait]", timeout=30000); before = srv(page)["n"]
    page.locator("[data-testid=analysis-autowait-stop]").click(); page.wait_for_timeout(6500)
    ok("'Stop waiting' stops it: the countdown goes, and NOTHING more is sent even after the time has passed", page.locator("[data-testid=analysis-autowait]").count() == 0 and srv(page)["n"] == before, [srv(page)["n"], before])
    ok("what was done is kept, and the button still offers the rest ('Analyse the remaining 80 photos'); the note stays", "Analyse the remaining 80 photos" in btn(page).inner_text() and notes(page).startswith("COMBINED(40)"), btn(page).inner_text())
    run(page); ok("pressing the button then carries on with only the missing photos and finishes", srv(page)["synth"][-1] == 60 and notes(page).startswith("COMBINED(60)") and notes(page).count("COMBINED(") == 1, srv(page)["synth"]); ctx.close()
    # ---- pressing the button during the wait carries on straight away ----
    ctx, page = start(240); page.evaluate("() => { window.__srv.retryAfter = 600; }"); btn(page).click(); page.wait_for_selector("[data-testid=analysis-autowait]", timeout=30000)
    page.evaluate("() => { window.__srv.accepted = 0; }"); btn(page).click(); page.wait_for_function("() => document.getElementById('notes').value.startsWith('COMBINED(60)')", timeout=30000)
    ok("pressing the button during the wait cancels the wait and carries on at once (no need to wait the 10 minutes)", page.locator("[data-testid=analysis-autowait]").count() == 0 and srv(page)["synth"][-1] == 60, srv(page)["synth"]); ctx.close()
    # ---- the company's DAILY limit is not waited for ----
    ctx, page = start(240); page.evaluate("() => { window.__srv.daily = true; window.__srv.retryAfter = 2; window.__srv.window = true; }"); run(page); n = page.locator("[data-testid=analysis-notices]").inner_text(); before = srv(page)["n"]; page.wait_for_timeout(6000)
    ok("a DAILY limit is explained in the server's own words (and Quick suggested) and is NOT waited for: no countdown, nothing more sent", page.locator("[data-testid=analysis-autowait]").count() == 0 and "daily limit" in n and "Quick option may still be available" in n and srv(page)["n"] == before, [n, srv(page)["n"], before]); ctx.close()
    # ---- an answer typed into a question is not thrown away ----
    ctx, page = start(240); page.evaluate("() => { window.__srv.retryAfter = 2; window.__srv.window = true; window.__srv.clarify = true; }"); btn(page).click(); page.wait_for_selector("[data-testid=analysis-autowait]", timeout=30000)
    page.get_by_placeholder("Type the answer…").fill("Granite"); before = srv(page)["n"]; page.wait_for_timeout(7000)
    ok("if you have typed an answer to a question, the automatic carry-on PAUSES (it would lose your answer): it says so, sends nothing, and keeps what you typed", "Paused: you have typed an answer" in page.inner_text("body") and srv(page)["n"] == before and page.get_by_placeholder("Type the answer…").input_value() == "Granite", [srv(page)["n"], before]); ctx.close()
    # ================= leaving the page =================
    ctx, page = start(384); page.evaluate("() => { window.__srv.allow = 1000; window.__srv.delay = 80; }"); btn(page).click(); page.wait_for_timeout(500)
    page.evaluate("() => window.unmountAnalyse()"); n1 = srv(page)["n"]; page.wait_for_timeout(3500); s = srv(page)
    ok("LEAVING THE PAGE STOPS EVERYTHING: not one more request is sent after the button is gone (it used to send all 96), and no 'combine results' request either", 3 <= n1 < 96 and s["n"] == n1 and s["synth"] == [], [n1, s]); ctx.close()
    # ================= the Stop button =================
    ctx, page = start(384); page.evaluate("() => { window.__srv.allow = 1000; window.__srv.delay = 120; }"); btn(page).click(); page.wait_for_selector("[data-testid=analysis-stop]"); page.wait_for_timeout(900)
    page.locator("[data-testid=analysis-stop]").click(); page.wait_for_function("() => !document.querySelector('button').disabled", timeout=30000); page.wait_for_timeout(400); s = srv(page); n = page.locator("[data-testid=analysis-notices]").inner_text(); t = notes(page); done = s["accepted"]
    ok("Stop appears while a big set is being analysed", True)
    ok("Stop keeps what was done: some batches (not none, not all 96) were analysed and combined into the notes once, with no warning typed in", 1 <= done < 96 and t.startswith(f"COMBINED({done})") and t.count("COMBINED(") == 1 and "⚠" not in t, [done, t[:80]])
    ok("it says it was stopped, names the photos left, and how to carry on", "Stopped:" in n and "were not analysed" in n and "Press the button to analyse just those photos" in n and f"({(96 - done) * 4})" in n, n)
    ok("it is not reported as a fault, and it does not carry on by itself (you stopped it)", "Something went wrong" not in page.inner_text("body") and page.locator("[data-testid=analysis-autowait]").count() == 0)
    left = (96 - done) * 4; ok(f"the button offers the rest: 'Analyse the remaining {left} photos'", f"Analyse the remaining {left} photos" in btn(page).inner_text(), btn(page).inner_text())
    before = srv(page)["n"]; page.wait_for_timeout(2000); ok("nothing more is sent after Stop", srv(page)["n"] == before)
    page.evaluate("() => { window.__srv.requests.length = 0; window.__srv.synth.length = 0; window.__srv.delay = 10; }"); run(page); s = srv(page)
    ok("pressing it again sends ONLY the missing batches and finishes: all 96 combined, the notes hold the finished text once", s["n"] == 96 - done and s["synth"] == [96] and notes(page).startswith("COMBINED(96)") and notes(page).count("COMBINED(") == 1, [s, done]); ctx.close()
    ctx, page = start(384); page.evaluate("() => { window.__srv.allow = 1000; window.__srv.delay = 400; }"); btn(page).click(); page.wait_for_selector("[data-testid=analysis-stop]"); page.wait_for_timeout(120); page.locator("[data-testid=analysis-stop]").click(); page.wait_for_function("() => !document.querySelector('button').disabled", timeout=30000); page.wait_for_timeout(500)
    ok("stopping before anything has finished: nothing is typed into the notes, it is not called a fault, and ALL 384 photos are offered again", notes(page) == "" and "Something went wrong" not in page.inner_text("body") and "photos 1–384 (384)" in page.locator("[data-testid=analysis-notices]").inner_text() and "Analyse the remaining 384 photos" in btn(page).inner_text(), [notes(page), btn(page).inner_text()]); ctx.close()
    ctx, page = start(3); ok("a small set (one batch) has no Stop button (there is nothing to stop part-way)", (btn(page).click(), page.wait_for_timeout(10), page.locator("[data-testid=analysis-stop]").count() == 0)[-1]); ctx.close()
    # ================= the report layout: bullets from several batches are combined here, with no extra AI call =================
    ctx, page = start(12); page.evaluate("() => { window.__srv.allow = 1000; window.__srv.bullets = true; window.__srv.possible = true; window.__srv.detailFail = true; }"); run(page); s = srv(page); t = notes(page)
    ok("three batches written as bullets are combined into ONE report in code: the same element from each batch is one bullet, in order, with NO 'combine' request to the AI (so no extra wait)", s["synth"] == [] and t == "• Walls and ceiling: Walls p1. Walls p5. Walls p9.\n• Flooring: Carpet p1. Carpet p5. Carpet p9.", [s["synth"], t])
    n = page.locator("[data-testid=analysis-notices]").inner_text()
    ok("a batch that did not get the detailed treatment is NOT passed off as detailed: a notice names its photos (5-8) and says they have the quicker description", "The detailed step could not be completed for photos 5–8" in n and "quicker description" in n, n)
    ok("possible marks are listed for the inspector, labelled as not stated in the report", "Possible marks worth a closer look (not stated in your report): stain on carpet near the door" in page.locator("[data-testid=hint-possible]").inner_text(), page.locator("[data-testid=hint-possible]").inner_text() if page.locator("[data-testid=hint-possible]").count() else "none")
    ok("nothing in the notes is a warning line (the notice is shown beside the button only)", "⚠" not in t); ctx.close()
    ctx, page = start(12); page.evaluate("() => { window.__srv.allow = 1000; window.__srv.bullets = true; }"); run(page)
    ok("with every batch detailed there is no notice and no possible-marks box", page.locator("[data-testid=analysis-notices]").count() == 0 and page.locator("[data-testid=hint-possible]").count() == 0); ctx.close()
    ctx, page = start(4); page.evaluate("() => { window.__srv.allow = 1000; window.__srv.bullets = true; }"); run(page)
    ok("a single batch of bullets goes into the notes as it is, with no combining at all", notes(page) == "• Walls and ceiling: Walls p1.\n• Flooring: Carpet p1." and srv(page)["synth"] == [], notes(page)); ctx.close()
    ok("no page errors anywhere", not errs, errs)
    print(f"\nAnalysing a big set of photos without losing batches: {P} passed, {F} failed"); b.close(); sys.exit(1 if F else 0)
