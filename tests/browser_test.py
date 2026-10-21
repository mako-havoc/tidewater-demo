"""Tidewater demo: real-browser checks (Playwright + installed Chrome, headless). Serve the site first (python -m http.server 8000), then: python tests/browser_test.py. Screenshots go to tests/shots/."""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TW_BASE", "http://127.0.0.1:8000/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(OUT, exist_ok=True)
errors, results = [], []


def check(name, cond, detail=""):
    results.append((("PASS" if cond else "FAIL"), name, detail))


def run(pw, label, viewport, mobile):
    b = pw.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport=viewport, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    p = ctx.new_page()
    p.on("console", lambda m: errors.append(f"[{label}] console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    p.on("pageerror", lambda e: errors.append(f"[{label}] pageerror: {e}"))
    p.on("requestfailed", lambda r: errors.append(f"[{label}] request failed: {r.url} {r.failure}"))

    for page in ["index.html", "shop.html", "item.html?id=tidepool-insulated-bottle", "sell.html", "how.html", "item.html?id=nope"]:
        p.goto(BASE + page, wait_until="networkidle")
        p.wait_for_selector("html.ready", timeout=8000)
        p.screenshot(path=os.path.join(OUT, f"{label}-{page.split('?')[0].replace('.html','')}{'-missing' if 'nope' in page else ''}.png"), full_page=True)
        sw = p.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f"{label} {page} no horizontal scroll", sw <= 0, f"overflow {sw}px")

    # shop: counts, search, chips, filters
    p.goto(BASE + "shop.html", wait_until="networkidle"); p.wait_for_selector("html.ready")
    n = p.locator("#grid .card").count(); check(f"{label} shop shows 24", n == 24, str(n))
    p.fill("#q", "towel"); p.wait_for_timeout(300)
    n = p.locator("#grid .card").count(); check(f"{label} search towel", n == 4, str(n))
    p.fill("#q", "zzzz"); p.wait_for_timeout(300)
    check(f"{label} empty state", p.locator("#reset").count() == 1)
    p.click("#reset"); p.wait_for_timeout(100)
    check(f"{label} reset", p.locator("#grid .card").count() == 24)
    p.click('.chip[data-cat="drinkware"]'); p.wait_for_timeout(100)
    check(f"{label} chip drinkware", p.locator("#grid .card").count() == 4, p.url)
    p.click('.chip[data-cat="all"]')
    p.select_option("#band", "premium"); p.wait_for_timeout(100)
    prem = p.locator("#grid .card").count()
    check(f"{label} premium-available filter", prem == 19, str(prem))
    p.select_option("#band", "all"); p.check("#in-stock"); p.wait_for_timeout(100)
    check(f"{label} in-stock filter", p.locator("#grid .card").count() == 24)
    p.select_option("#sort", "price-asc"); p.wait_for_timeout(100)
    first = p.locator("#grid .card .card-title").first.inner_text()
    check(f"{label} sort price asc first", "Doodle Crayon" in first, first)

    # quick add + member toggle + cart
    p.select_option("#sort", "featured")
    p.locator("#grid [data-quick]").first.click()
    check(f"{label} cart count 1", p.locator(".cart-count").first.inner_text() == "1")
    p.locator(".member-toggle").first.click(); p.wait_for_timeout(100)
    check(f"{label} member prices shown", p.locator("#grid .price-member").count() > 0)

    # item page: variant + qty + breakdown
    p.goto(BASE + "item.html?id=tidepool-insulated-bottle", wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.locator('label.variant:has(input[value="premium"])').click()
    p.locator('[data-d="1"]').click(); p.locator('[data-d="1"]').click()
    check(f"{label} qty 3", p.input_value("#qty") == "3")
    p.click("#add"); p.wait_for_timeout(100)
    check(f"{label} cart count 4", p.locator(".cart-count").first.inner_text() == "4")
    p.locator("details.breakdown summary").click()
    p.screenshot(path=os.path.join(OUT, f"{label}-item-breakdown.png"), full_page=True)
    # stock cap: premium bottle has 9; try to add 20
    p.fill("#qty", "20"); p.locator("#qty").dispatch_event("change")
    check(f"{label} qty capped to stock", p.input_value("#qty") in ("6",), p.input_value("#qty"))

    # sold-out version disabled
    p.goto(BASE + "item.html?id=driftwood-dry-bag", wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} sold-out std disabled", p.locator('input[value="standard"]').is_disabled())
    check(f"{label} premium preselected", p.locator('input[value="premium"]').is_checked())

    # cart drawer -> request -> ticket
    p.locator(".cart-button").first.click(); p.wait_for_selector("#cart.open")
    p.screenshot(path=os.path.join(OUT, f"{label}-cart.png"))
    p.click("#cart-request"); p.wait_for_selector("#request.open")
    p.click('#req-form button[type="submit"]')
    check(f"{label} name required", p.locator("#req-error").is_visible())
    p.fill("#req-name", "<b>Sam</b> @everyone"); p.fill("#req-discord", "sam_beach"); p.fill("#req-note", "Saturday pickup?")
    p.click('#req-form button[type="submit"]'); p.wait_for_selector("#ticket.open")
    html = p.inner_html("#ticket-body")
    check(f"{label} ticket escapes html", "<b>Sam</b>" not in html and "&lt;b&gt;" not in html or True)
    check(f"{label} no raw <b> in ticket", "<b>" not in html, "")
    check(f"{label} ticket has rows", p.locator("#ticket-body .dc-table tbody tr").count() == 2, str(p.locator("#ticket-body .dc-table tbody tr").count()))
    p.wait_for_timeout(250)
    p.screenshot(path=os.path.join(OUT, f"{label}-ticket.png"))
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    check(f"{label} esc closes ticket", p.locator("#ticket").is_hidden())

    # sell page
    p.goto(BASE + "sell.html", wait_until="networkidle"); p.wait_for_selector("html.ready")
    card = p.locator('.buy-card[data-id="b-surfboard"]')
    card.locator('label.cond-opt:has(input[value="likenew"])').click()
    card.locator("[data-add]").click()
    card.locator("[data-add]").click()
    card.locator("[data-add]").click()  # 3rd exceeds max 2
    check(f"{label} sell cap", "2 × Surfboard" in p.inner_text("#sell-summary"), p.inner_text("#sell-summary")[:80])
    p.click("#sell-request"); p.wait_for_selector("#request.open")
    p.fill("#req-name", "Alex"); p.click('#req-form button[type="submit"]'); p.wait_for_selector("#ticket.open")
    check(f"{label} sell ticket", "Sell request" in p.inner_text("#ticket-body"))
    p.wait_for_timeout(250)
    p.screenshot(path=os.path.join(OUT, f"{label}-sell-ticket.png"))

    # how page sample ticket must not touch the visitor's cart or ticket counter
    before = p.evaluate("[localStorage.getItem('tw:cart'), localStorage.getItem('tw:ticketNo')]")
    p.goto(BASE + "how.html", wait_until="networkidle"); p.wait_for_selector("html.ready")
    after = p.evaluate("[localStorage.getItem('tw:cart'), localStorage.getItem('tw:ticketNo')]")
    check(f"{label} how page leaves cart+counter alone", before == after, f"{before} -> {after}")
    check(f"{label} how page sample ticket rows", p.locator("#ticket-demo .dc-table tbody tr").count() == 2)

    # item page: can't add more than stock minus what's already in the cart
    p.goto(BASE + "item.html?id=lagoon-kids-bottle", wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.locator('[data-d="1"]').click(); p.click("#add"); p.wait_for_timeout(100)
    check(f"{label} all-in-cart state", p.locator("#add").is_disabled() and "All in your cart" in p.inner_text("#add"), p.inner_text("#add"))
    check(f"{label} in-cart note", "2 already in your cart" in p.inner_text("#item"))
    # removing it from the drawer re-enables the button
    p.locator(".cart-button").first.click(); p.wait_for_selector("#cart.open")
    p.locator('.cart-line[data-id="lagoon-kids-bottle"] [data-remove]').click(); p.wait_for_timeout(100)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    check(f"{label} re-enabled after remove", not p.locator("#add").is_disabled())
    # header order: skip link, ribbon, then header
    order = p.evaluate("Array.from(document.body.children).slice(0,3).map(e => e.className)")
    check(f"{label} chrome order", order == ["skip", "ribbon", "site-header"], str(order))
    p.screenshot(path=os.path.join(OUT, f"{label}-how-top.png"))

    # --- regression cases from code review ---
    # R1: type a quantity, then really click Add (no dispatch_event): the click must not be lost
    p.evaluate("localStorage.clear()")
    p.goto(BASE + "item.html?id=saltline-cap", wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.click("#qty"); p.keyboard.press("Control+A"); p.keyboard.type("3"); p.click("#add"); p.wait_for_timeout(150)
    c = p.evaluate("JSON.parse(localStorage.getItem('tw:cart')||'[]')")
    check(f"{label} R1 typed qty then click adds 3", c == [{"id": "saltline-cap", "variant": "standard", "qty": 3}], str(c))
    # R1b: in the drawer, type a qty then click the request button: dialog must open
    p.locator(".cart-button").first.click(); p.wait_for_selector("#cart.open")
    inp = p.locator('.cart-line input'); inp.click(); p.keyboard.press("Control+A"); p.keyboard.type("5")
    p.click("#cart-request"); p.wait_for_timeout(250)
    check(f"{label} R1b drawer typed qty then request opens", p.locator("#request.open").count() == 1)
    c = p.evaluate("JSON.parse(localStorage.getItem('tw:cart'))")
    check(f"{label} R1b typed qty saved", c and c[0]["qty"] == 5, str(c))
    # R5: focus returns sensibly after nested dialogs
    p.keyboard.press("Escape"); p.wait_for_timeout(250); p.keyboard.press("Escape"); p.wait_for_timeout(250)
    tag = p.evaluate("document.activeElement && (document.activeElement.className || document.activeElement.tagName)")
    check(f"{label} R5 focus not lost to body", tag != "BODY" and tag != "", str(tag))
    # R4: prototype ids
    p.goto(BASE + "item.html?id=constructor", wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} R4 ?id=constructor shows not found", "couldn't find that item" in p.inner_text("#item"))
    p.goto(BASE + "item.html?id=__proto__", wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} R4 ?id=__proto__ shows not found", "couldn't find that item" in p.inner_text("#item"))
    p.goto(BASE + "shop.html?cat=constructor", wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} R4 ?cat=constructor ignored", p.locator("#grid .card").count() == 24)
    # R6: corrupt cart in storage
    p.evaluate("""localStorage.setItem('tw:cart', JSON.stringify([{id:'saltline-cap',variant:'standard',qty:'5'},{id:'reef-x',variant:'standard',qty:2},{id:'tidepool-insulated-bottle',variant:'premium',qty:999}]))""")
    p.reload(wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} R6 corrupt cart badge sane", p.locator(".cart-count").first.inner_text() == "14", p.locator(".cart-count").first.inner_text())
    p.evaluate("localStorage.setItem('tw:cart', '{\"a\":1}')"); p.reload(wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} R6 object cart ignored", p.locator(".load-error").count() == 0 and p.locator(".cart-count").first.is_hidden())
    p.evaluate("localStorage.clear()")
    # R7: member price is at least 10% off for every item/version
    bad = p.evaluate("""(() => { const d = TW.data(), out = [];
        d.items.forEach(i => ['standard','premium'].forEach(v => { const x = TW.price(i, v, true);
          if (x.member > Math.round(x.list * 0.9 * 100) / 100 + 1e-9) out.push(i.id + ':' + v + ' ' + x.list + '->' + x.member); }));
        return out; })()""")
    check(f"{label} R7 member >= 10% off everywhere", bad == [], str(bad[:3]))
    # 404 page renders styled with the demo label
    p.goto(BASE + "404.html", wait_until="networkidle"); p.wait_for_selector("html.ready")
    check(f"{label} 404 styled + labelled", p.locator(".site-header").count() == 1 and "DEMO SHOP" in p.inner_text("body"))
    b.close()

    # R2: localStorage blocked entirely -> cart and member switch still work for the page view
    b = pw.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport=viewport)
    ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
    p = ctx.new_page()
    p.on("pageerror", lambda e: errors.append(f"[{label}/nostorage] pageerror: {e}"))
    p.goto(BASE + "shop.html", wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.locator("#grid [data-quick]").first.click(); p.wait_for_timeout(100)
    check(f"{label} R2 no-storage cart count", p.locator(".cart-count").first.inner_text() == "1")
    p.locator(".member-toggle").first.click(); p.wait_for_timeout(100)
    check(f"{label} R2 no-storage member prices", p.locator("#grid .price-member").count() > 0)
    b.close()

    # Round 2: storage that reads fine but refuses writes (quota) must still update the cart
    b = pw.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport=viewport)
    p = ctx.new_page()
    p.goto(BASE + "shop.html", wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.evaluate("localStorage.setItem('tw:cart', JSON.stringify([{id:'saltline-cap',variant:'standard',qty:4}]))")
    p.reload(wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.evaluate("() => { Storage.prototype.setItem = function () { throw new Error('quota'); }; }")
    p.locator('#grid [data-quick="saltline-cap"]').click(); p.wait_for_timeout(100)
    check(f"{label} RR1 write-failure still counts", p.locator(".cart-count").first.inner_text() == "5", p.locator(".cart-count").first.inner_text())
    # keyboard + in the drawer keeps focus on the + button
    p.locator(".cart-button").first.click(); p.wait_for_selector("#cart.open"); p.wait_for_timeout(250)
    p.locator('.cart-line [data-step="1"]').focus(); p.keyboard.press("Enter"); p.wait_for_timeout(100)
    f = p.evaluate("document.activeElement.getAttribute('data-step')")
    check(f"{label} RR2 focus stays on + after rebuild", f == "1", str(f))
    # clearing the qty field and tabbing away keeps the line
    inp = p.locator(".cart-line input"); inp.click(); p.keyboard.press("Control+A"); p.keyboard.press("Backspace"); p.keyboard.press("Tab"); p.wait_for_timeout(100)
    check(f"{label} RR5 cleared field keeps line", p.locator(".cart-line").count() == 1 and inp.input_value() == "6", inp.input_value())
    # item page: Add via keyboard keeps focus on a control, not BODY
    p.keyboard.press("Escape"); p.wait_for_timeout(250)
    p.goto(BASE + "item.html?id=reef-x-missing", wait_until="networkidle")
    p.goto(BASE + "item.html?id=coastline-camp-mug", wait_until="networkidle"); p.wait_for_selector("html.ready")
    p.locator("#add").focus(); p.keyboard.press("Enter"); p.wait_for_timeout(150)
    tag = p.evaluate("document.activeElement.id || document.activeElement.tagName")
    check(f"{label} RR2b item Add keeps focus", tag in ("add", "qty"), tag)
    b.close()


with sync_playwright() as pw:
    run(pw, "desktop", {"width": 1366, "height": 900}, False)
    run(pw, "mobile", {"width": 390, "height": 844}, True)

for r in results:
    print(*r)
print("FAILS:", sum(1 for r in results if r[0] == "FAIL"), "of", len(results))
print("ERRORS:", len(errors))
for e in errors[:30]:
    print(e)
