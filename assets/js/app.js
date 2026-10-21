/* Tidewater Goods demo shop: shared code for every page.
   Static site: data comes from /data/*.json, the cart lives in this browser only, and nothing is ever sent anywhere.
   "Request order" shows what the shop's Discord ticket would look like in a real build. */
(function () {
  "use strict";

  // ---------- small helpers ----------
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var money = (function () {
    var f;
    try { f = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }); } catch (e) { f = null; }
    return function (n) { return f ? f.format(n) : "$" + Number(n).toFixed(2); };
  })();
  function clampInt(v, lo, hi) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = lo;
    return Math.max(lo, Math.min(hi, v));
  }

  // ---------- storage (per browser, optional: the site works without it) ----------
  // If localStorage is blocked (some private windows), an in-memory copy keeps the cart working for this page view.
  var mem = Object.create(null);
  var store = {
    get: function (k, d) {
      // memory first: it always holds this page's latest write, even when storage refused it (quota, blocked)
      if (k in mem) { try { return JSON.parse(mem[k]); } catch (e) { delete mem[k]; } }
      try {
        var v = window.localStorage.getItem("tw:" + k);
        if (v != null) return JSON.parse(v);
      } catch (e) { /* blocked or corrupt */ }
      return d;
    },
    forget: function (k) { delete mem[k]; },
    set: function (k, v) {
      mem[k] = JSON.stringify(v);
      try { window.localStorage.setItem("tw:" + k, mem[k]); } catch (e) { /* blocked: memory copy still works */ }
    }
  };
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ---------- data ----------
  var DATA = null;
  function base() {
    var s = document.querySelector('script[src*="assets/js/app.js"]');
    return s ? s.getAttribute("src").replace(/assets\/js\/app\.js.*$/, "") : "";
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    var b = base();
    function get(p) {
      return fetch(b + p, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error(p + " " + r.status);
        return r.json();
      });
    }
    return Promise.all([get("data/settings.json"), get("data/items.json")]).then(function (r) {
      DATA = { settings: r[0], items: r[1] };
      DATA.byId = Object.create(null);
      DATA.items.forEach(function (it) { DATA.byId[it.id] = it; });
      DATA.cat = Object.create(null);
      DATA.settings.categories.forEach(function (c) { DATA.cat[c.id] = c; });
      return DATA;
    });
  }

  // ---------- price engine: cost x variant factor x (1 + category markup), rounded up to .95; member discount ----------
  function priceUp(x, ending) {
    // smallest N + ending (N whole) that is >= x, e.g. 31.20 -> 31.95, 31.96 -> 32.95
    var n = Math.ceil(x - ending - 1e-9);
    return Math.round((n + ending) * 100) / 100;
  }
  function priceDown(x, ending) {
    // largest N + ending (N whole) that is <= x, so a member saving is never less than the stated discount
    var n = Math.floor(x - ending + 1e-9);
    return Math.round((n + ending) * 100) / 100;
  }
  function price(item, variant, member) {
    var P = DATA.settings.pricing;
    var factor = has(P.variant_cost_factor, variant) ? P.variant_cost_factor[variant] : 1;
    var markup = has(P.markup_by_category, item.category) ? P.markup_by_category[item.category] : 1;
    var cost = Math.round(item.cost * factor * 100) / 100;
    var raw = cost * (1 + markup);
    var list = priceUp(raw, P.price_ending);
    var mem = Math.max(P.price_ending, priceDown(list * (1 - P.member_discount), P.price_ending));
    if (mem > list) mem = list;
    return {
      cost: cost, factor: factor, markup: markup, raw: raw, list: list, member: mem,
      final: member ? mem : list, discount: P.member_discount
    };
  }
  function stockOf(item, variant) {
    var n = item && item.stock && has(item.stock, variant) ? parseInt(item.stock[variant], 10) : 0;
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  function inCart(id, variant) {
    return cart().filter(function (l) { return l.id === id && l.variant === variant; })
      .reduce(function (s, l) { return s + l.qty; }, 0);
  }
  function totalStock(item) { return stockOf(item, "standard") + stockOf(item, "premium"); }
  function stockBadge(n) {
    if (n <= 0) return '<span class="badge badge-out">Sold out</span>';
    if (n <= 3) return '<span class="badge badge-low">Only ' + n + " left</span>";
    return '<span class="badge badge-in">' + n + " in stock</span>";
  }
  function variantLabel(v) {
    var f = DATA.settings.variants.filter(function (x) { return x.id === v; })[0];
    return f ? f.label : v;
  }

  // ---------- member prices toggle (demo) ----------
  function isMember() { return !!store.get("member", false); }
  function setMember(on) {
    store.set("member", !!on);
    document.documentElement.classList.toggle("is-member", !!on);
    $$(".member-toggle input").forEach(function (i) { i.checked = !!on; });
    document.dispatchEvent(new CustomEvent("tw:pricing"));
  }

  // ---------- cart (this browser only) ----------
  // Whatever is in storage is treated as untrusted: must be a list of known items, whole quantities, capped at stock.
  function cart() {
    var raw = store.get("cart", []);
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (l) {
      if (!l || typeof l.id !== "string" || !DATA.byId[l.id] || (l.variant !== "standard" && l.variant !== "premium")) return;
      var q = clampInt(l.qty, 0, stockOf(DATA.byId[l.id], l.variant));
      var dup = out.filter(function (o) { return o.id === l.id && o.variant === l.variant; })[0];
      if (dup) dup.qty = Math.min(dup.qty + q, stockOf(DATA.byId[l.id], l.variant));
      else if (q > 0) out.push({ id: l.id, variant: l.variant, qty: q });
    });
    return out;
  }
  function saveCart(c, quiet) {
    store.set("cart", c); renderCartCount();
    if (quiet) patchCart(); else renderCart();
    document.dispatchEvent(new CustomEvent("tw:cart"));
  }
  function addToCart(id, variant, qty) {
    var item = DATA.byId[id];
    if (!item) return false;
    var max = stockOf(item, variant);
    var c = cart();
    var line = c.filter(function (l) { return l.id === id && l.variant === variant; })[0];
    var have = line ? line.qty : 0;
    var add = Math.min(qty, max - have);
    if (add <= 0) { toast("No more " + variantLabel(variant) + " " + item.name + " in stock."); return false; }
    if (line) line.qty += add; else c.push({ id: id, variant: variant, qty: add });
    saveCart(c);
    toast("Added " + add + " × " + item.name + " (" + variantLabel(variant) + ").", true);
    return true;
  }
  function setQty(id, variant, qty, quiet) {
    var item = DATA.byId[id];
    var c = cart().map(function (l) {
      if (l.id === id && l.variant === variant) l.qty = clampInt(qty, 0, stockOf(item, variant));
      return l;
    }).filter(function (l) { return l.qty > 0; });
    saveCart(c, quiet);
  }
  function cartTotals(c) {
    var m = isMember(), t = { lines: 0, items: 0, list: 0, final: 0 };
    c.forEach(function (l) {
      var p = price(DATA.byId[l.id], l.variant, m);
      t.lines++; t.items += l.qty; t.list += p.list * l.qty; t.final += p.final * l.qty;
    });
    t.list = Math.round(t.list * 100) / 100; t.final = Math.round(t.final * 100) / 100;
    return t;
  }
  function renderCartCount() {
    var n = cart().reduce(function (s, l) { return s + l.qty; }, 0);
    $$(".cart-count").forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
    $$(".cart-button").forEach(function (b) { b.setAttribute("aria-label", "Cart, " + n + (n === 1 ? " item" : " items")); });
  }

  // ---------- toasts ----------
  function toast(msg, withCart) {
    var host = $("#toasts");
    if (!host) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = "<span>" + esc(msg) + "</span>" + (withCart ? '<button type="button" class="link-btn" data-open-cart>View cart</button>' : "");
    host.appendChild(el);
    setTimeout(function () { el.classList.add("leaving"); }, 3200);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3700);
  }

  // ---------- dialogs (focus kept inside, Esc closes, focus returns) ----------
  // Each open dialog remembers what opened it, so focus walks back through nested dialogs correctly.
  var focusStack = [];
  function openDialog(id) {
    var d = document.getElementById(id);
    if (!d) return;
    clearTimeout(d._hideTimer);
    focusStack.push({ dialog: d, from: document.activeElement });
    d.hidden = false;
    document.body.classList.add("no-scroll");
    requestAnimationFrame(function () { d.classList.add("open"); });
    var f = d.querySelector("[autofocus], input, button, select, textarea, a[href]");
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeDialog(d) {
    if (!d || d.hidden) return;
    d.classList.remove("open");
    clearTimeout(d._hideTimer);
    d._hideTimer = setTimeout(function () {
      d.hidden = true;
      if (!$(".overlay.open")) document.body.classList.remove("no-scroll");
    }, 180);
    var entry = null;
    for (var i = focusStack.length - 1; i >= 0; i--) {
      if (focusStack[i].dialog === d) { entry = focusStack.splice(i, 1)[0]; break; }
    }
    var back = entry && entry.from;
    // the opener may have been redrawn or hidden: fall back to the next open dialog, then the cart button
    if (!back || !document.contains(back) || back.closest(".overlay[hidden]") || (back.closest(".overlay") && !back.closest(".overlay.open"))) {
      var top = focusStack.length ? focusStack[focusStack.length - 1].dialog : null;
      back = top ? top.querySelector("button, input, a[href]") : $(".cart-button");
    }
    if (back && back.focus) back.focus();
  }
  document.addEventListener("keydown", function (e) {
    var open = $$(".overlay.open");
    if (!open.length) return;
    var top = open[open.length - 1];
    if (e.key === "Escape") { e.preventDefault(); closeDialog(top); return; }
    if (e.key === "Tab") {
      var f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]', top)
        .filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- shared chrome: ribbon, header, footer, cart drawer, request + ticket dialogs ----------
  var NAV = [
    { href: "index.html", label: "Home", page: "home" },
    { href: "shop.html", label: "Shop", page: "shop" },
    { href: "sell.html", label: "We buy", page: "sell" },
    { href: "how.html", label: "How it works", page: "how" }
  ];
  function chrome() {
    var page = document.body.getAttribute("data-page");
    var s = DATA.settings.shop;
    var b = base();
    var header = document.createElement("div");
    header.innerHTML =
      '<a class="skip" href="' + esc(location.pathname + location.search) + '#main">Skip to content</a>' +
      '<div class="ribbon" role="note"><strong>' + esc(s.demo_notice) + "</strong> <span>A portfolio demo. Orders are never sent anywhere.</span></div>" +
      '<header class="site-header"><div class="wrap header-row">' +
        '<a class="brand" href="' + b + 'index.html" aria-label="' + esc(s.name) + ' home">' + logo() + "<span>" + esc(s.name) + "</span></a>" +
        '<nav class="main-nav" aria-label="Main"><ul>' +
          NAV.map(function (n) {
            return '<li><a href="' + b + n.href + '"' + (n.page === page ? ' aria-current="page"' : "") + ">" + esc(n.label) + "</a></li>";
          }).join("") +
        "</ul></nav>" +
        '<div class="header-tools">' +
          '<label class="member-toggle" title="Shows member prices. Demo only: there are no real accounts.">' +
            '<input type="checkbox"' + (isMember() ? " checked" : "") + '><span class="switch" aria-hidden="true"></span><span class="mt-label">Member prices</span></label>' +
          '<button type="button" class="cart-button" data-open-cart aria-label="Cart">' + icon("bag") + '<span class="cart-count" hidden>0</span></button>' +
        "</div>" +
      "</div></header>";
    var first = document.body.firstChild;
    while (header.firstChild) document.body.insertBefore(header.firstChild, first);

    var foot = document.createElement("footer");
    foot.className = "site-footer";
    foot.innerHTML = '<div class="wrap foot-grid">' +
      '<div><a class="brand brand-foot" href="' + b + 'index.html">' + logo() + "<span>" + esc(s.name) + "</span></a>" +
      "<p>" + esc(s.tagline) + "</p><p class=\"muted small\">A fictional shop. Every item, price and stock count here is made up, and the product photos are AI-generated.</p></div>" +
      '<div><h2 class="foot-h">Shop</h2><ul>' + NAV.map(function (n) { return '<li><a href="' + b + n.href + '">' + esc(n.label) + "</a></li>"; }).join("") + "</ul></div>" +
      '<div><h2 class="foot-h">About this demo</h2><p class="small">A sample build: a catalogue with stock and variants, a price engine, member prices and a buy-back form, with requests that would open a private ticket in the shop\'s Discord.</p>' +
      '<p class="small">Demo build by <strong>HAVOC Devs</strong>. Static site: no cookies or analytics. Web fonts load from Google Fonts.</p></div>' +
      "</div>";
    document.body.appendChild(foot);

    var extra = document.createElement("div");
    extra.innerHTML =
      '<div id="toasts" class="toasts" aria-live="polite"></div>' +
      // cart drawer
      '<div class="overlay drawer-overlay" id="cart" hidden><div class="scrim" data-close></div>' +
        '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">' +
          '<div class="drawer-head"><h2 id="cart-title">Your cart</h2><button type="button" class="icon-btn" data-close aria-label="Close cart">' + icon("x") + "</button></div>" +
          '<div class="drawer-body" id="cart-body"></div>' +
          '<div class="drawer-foot" id="cart-foot"></div>' +
        "</aside></div>" +
      // request form
      '<div class="overlay modal-overlay" id="request" hidden><div class="scrim" data-close></div>' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="req-title">' +
          '<div class="modal-head"><h2 id="req-title">Preview your request</h2><button type="button" class="icon-btn" data-close aria-label="Close">' + icon("x") + "</button></div>" +
          '<form id="req-form" class="form" novalidate>' +
            '<p class="muted small">In a real build this opens a private ticket in the shop\'s Discord, where staff confirm stock and arrange pickup. In this demo nothing is sent: you\'ll see a preview of that ticket instead.</p>' +
            '<div class="field"><label for="req-name">Your name</label><input id="req-name" name="name" autocomplete="off" maxlength="40" required placeholder="e.g. Sam"></div>' +
            '<div class="field"><label for="req-discord">Discord username <span class="muted">(optional)</span></label><input id="req-discord" name="discord" autocomplete="off" maxlength="32" placeholder="e.g. sam_at_the_beach"></div>' +
            '<div class="field"><label for="req-note">Note for the shop <span class="muted">(optional)</span></label><textarea id="req-note" name="note" rows="3" maxlength="300" placeholder="Pickup day, colours, questions..."></textarea></div>' +
            '<p class="form-error" id="req-error" role="alert" hidden></p>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Back</button><button type="submit" class="btn btn-primary">Preview my ticket</button></div>' +
          "</form>" +
        "</div></div>" +
      // ticket preview
      '<div class="overlay modal-overlay" id="ticket" hidden><div class="scrim" data-close></div>' +
        '<div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="ticket-title">' +
          '<div class="modal-head"><h2 id="ticket-title">Here\'s the ticket the shop would get</h2><button type="button" class="icon-btn" data-close aria-label="Close">' + icon("x") + "</button></div>" +
          '<div id="ticket-body"></div>' +
          '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="ticket-copy">Copy summary</button><button type="button" class="btn btn-primary" data-close>Done</button></div>' +
        "</div></div>";
    while (extra.firstChild) document.body.appendChild(extra.firstChild);

    document.documentElement.classList.toggle("is-member", isMember());
    $$(".member-toggle input").forEach(function (i) {
      i.addEventListener("change", function () {
        setMember(i.checked);
        toast(i.checked ? "Showing member prices (demo)." : "Showing regular prices.");
      });
    });
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : e.target.parentNode;
      if (t.closest("[data-open-cart]")) { e.preventDefault(); renderCart(); openDialog("cart"); return; }
      var c = t.closest("[data-close]");
      if (c) { e.preventDefault(); closeDialog(c.closest(".overlay")); }
    });
    $("#req-form").addEventListener("submit", onRequestSubmit);
    $("#ticket-copy").addEventListener("click", copyTicket);
    document.addEventListener("tw:pricing", function () { renderCart(); });
    window.addEventListener("storage", function (e) {
      // another tab changed the cart or member switch
      if (e.key === "tw:cart" || e.key === "tw:member") {
        store.forget(e.key.slice(3));
        setMember(isMember()); renderCartCount(); renderCart();
        document.dispatchEvent(new CustomEvent("tw:cart"));
      }
    });
    wireCart();
    renderCartCount();
  }

  // After the drawer is rebuilt, put keyboard focus back on the same control (or the close button if it's gone).
  function focusKey(el, body) {
    if (!el || !body.contains(el)) return null;
    var li = el.closest(".cart-line");
    return li ? { id: li.getAttribute("data-id"), v: li.getAttribute("data-variant"),
                  sel: el.hasAttribute("data-step") ? '[data-step="' + el.getAttribute("data-step") + '"]' : el.hasAttribute("data-remove") ? "[data-remove]" : "input" } : { gone: true };
  }
  function refocus(k, body) {
    if (!k) return;
    var target = null;
    if (!k.gone) {
      $$(".cart-line", body).forEach(function (li) {
        if (li.getAttribute("data-id") === k.id && li.getAttribute("data-variant") === k.v) target = $(k.sel, li);
      });
    }
    if (!target || target.disabled) target = $("#cart .drawer-head .icon-btn");
    if (target) target.focus();
  }
  function renderCart() {
    var body = $("#cart-body"), foot = $("#cart-foot");
    if (!body) return;
    var fk = focusKey(document.activeElement, body);
    var c = cart();
    if (!c.length) {
      body.innerHTML = '<div class="empty">' + icon("bag") + "<p>Your cart is empty.</p>" +
        '<a class="btn btn-primary" href="' + base() + 'shop.html">Browse the shop</a></div>';
      foot.innerHTML = "";
      if (fk) $("#cart .drawer-head .icon-btn").focus();
      return;
    }
    var m = isMember();
    body.innerHTML = '<ul class="cart-lines">' + c.map(function (l) {
      var it = DATA.byId[l.id], p = price(it, l.variant, m), max = stockOf(it, l.variant);
      return '<li class="cart-line" data-id="' + esc(l.id) + '" data-variant="' + esc(l.variant) + '">' +
        '<div class="cl-art">' + pic(it) + "</div>" +
        '<div class="cl-main"><a href="' + base() + "item.html?id=" + encodeURIComponent(it.id) + '" class="cl-name">' + esc(it.name) + "</a>" +
          '<div class="muted small">' + esc(variantLabel(l.variant)) + " · " + money(p.final) + " each</div>" +
          '<div class="stepper" role="group" aria-label="Quantity for ' + esc(it.name) + '">' +
            '<button type="button" class="step" data-step="-1" aria-label="One fewer">−</button>' +
            '<input type="number" min="0" max="' + max + '" value="' + l.qty + '" aria-label="Quantity" inputmode="numeric">' +
            '<button type="button" class="step" data-step="1" aria-label="One more"' + (l.qty >= max ? " disabled" : "") + ">+</button>" +
          "</div></div>" +
        '<div class="cl-side"><strong>' + money(p.final * l.qty) + '</strong><button type="button" class="link-btn small" data-remove>Remove</button></div>' +
      "</li>";
    }).join("") + "</ul>";
    foot.innerHTML = '<div id="cart-sum">' + cartSumHTML(c) + "</div>" +
      '<p class="muted small">Demo: nothing is sent. A real build sends this to the shop’s Discord.</p>' +
      '<button type="button" class="btn btn-primary btn-block" id="cart-request">Preview order request</button>';
    refocus(fk, body);
  }
  function cartSumHTML(c) {
    var m = isMember(), t = cartTotals(c);
    return (m && t.list > t.final ? '<div class="row muted small"><span>Regular price</span><s>' + money(t.list) + "</s></div>" +
        '<div class="row small save"><span>Member saving (demo)</span><span>−' + money(t.list - t.final) + "</span></div>" : "") +
      '<div class="row total"><span>Total</span><strong>' + money(t.final) + "</strong></div>";
  }
  // A typed quantity is applied without rebuilding the drawer, so a click that follows (e.g. on the request
  // button) still lands on the same element. Only text is patched.
  function patchCart() {
    var c = cart(), m = isMember();
    if (!c.length) { renderCart(); return; }
    $$(".cart-line").forEach(function (li) {
      var l = c.filter(function (x) { return x.id === li.getAttribute("data-id") && x.variant === li.getAttribute("data-variant"); })[0];
      if (!l) { li.parentNode.removeChild(li); return; }
      var it = DATA.byId[l.id], max = stockOf(it, l.variant);
      $("input", li).value = l.qty;
      $('[data-step="1"]', li).disabled = l.qty >= max;
      $(".cl-side strong", li).textContent = money(price(it, l.variant, m).final * l.qty);
    });
    var sum = $("#cart-sum");
    if (sum) sum.innerHTML = cartSumHTML(c);
  }
  function wireCart() {
    var body = $("#cart-body"), foot = $("#cart-foot");
    function line(el) {
      var li = el.closest(".cart-line");
      return li ? { li: li, id: li.getAttribute("data-id"), v: li.getAttribute("data-variant") } : null;
    }
    body.addEventListener("click", function (e) {
      var s = e.target.closest("[data-step]"), r = e.target.closest("[data-remove]"), L = line(e.target);
      if (!L) return;
      if (s) setQty(L.id, L.v, clampInt($("input", L.li).value, 0, 999) + parseInt(s.getAttribute("data-step"), 10));
      if (r) { setQty(L.id, L.v, 0); toast("Removed from cart."); }
    });
    body.addEventListener("change", function (e) {
      var L = e.target.matches("input") && line(e.target);
      if (!L) return;
      if (String(e.target.value).trim() === "") { patchCart(); return; } // cleared field: keep the old quantity
      setQty(L.id, L.v, e.target.value, true);
    });
    foot.addEventListener("click", function (e) {
      if (e.target.closest("#cart-request")) { REQUEST = { kind: "order" }; openDialog("request"); }
    });
  }

  // ---------- request -> ticket preview (nothing leaves the browser) ----------
  var REQUEST = null, LAST_TICKET = "";
  function clean(s, n) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/@/g, "@​").trim().slice(0, n); }
  function onRequestSubmit(e) {
    e.preventDefault();
    var f = e.target, err = $("#req-error");
    var name = clean(f.name.value, 40), note = clean(f.note.value, 300);
    var discord = clean(String(f.discord.value || "").replace(/^[\s@]+/, ""), 32).replace(/\s+/g, "");
    if (!name) { err.textContent = "Please add your name so the shop knows who to reply to."; err.hidden = false; f.name.focus(); return; }
    err.hidden = true;
    var lines = REQUEST && REQUEST.kind === "sell" ? REQUEST.lines : null;
    if (!lines && !cart().length) { err.textContent = "Your cart is empty."; err.hidden = false; return; }
    closeDialog($("#request"));
    var drawer = $("#cart");
    if (drawer && !drawer.hidden) closeDialog(drawer);
    showTicket({ kind: REQUEST ? REQUEST.kind : "order", name: name, discord: discord, note: note, lines: lines });
  }
  function nextTicketNo() {
    var n = clampInt(store.get("ticketNo", 0), 0, 9998) + 1;
    store.set("ticketNo", n);
    return ("000" + n).slice(-4);
  }
  function ticketHTML(t) {
    var no = t.sample ? "0042" : nextTicketNo(), m = t.sample ? false : isMember(), rows = [], total = 0, txt = [];
    var who = t.discord ? "@" + t.discord : t.name;
    if (t.kind === "sell") {
      t.lines.forEach(function (l) {
        rows.push("<tr><td>" + esc(l.name) + '</td><td>' + esc(l.condition) + '</td><td class="num">' + l.qty + '</td><td class="num">' + money(l.offer * l.qty) + "</td></tr>");
        total += l.offer * l.qty;
        txt.push("- " + l.qty + " x " + l.name + " (" + l.condition + "): " + money(l.offer * l.qty));
      });
    } else {
      (t.cartLines || cart()).forEach(function (l) {
        var it = DATA.byId[l.id], p = price(it, l.variant, m);
        rows.push("<tr><td>" + esc(it.name) + "</td><td>" + esc(variantLabel(l.variant)) + '</td><td class="num">' + l.qty + '</td><td class="num">' + money(p.final * l.qty) + "</td></tr>");
        total += p.final * l.qty;
        txt.push("- " + l.qty + " x " + it.name + " (" + variantLabel(l.variant) + "): " + money(p.final * l.qty));
      });
    }
    total = Math.round(total * 100) / 100;
    var title = t.kind === "sell" ? "sell-" : "order-";
    var kindLabel = t.kind === "sell" ? "Sell request (we buy)" : "Order request";
    var now = new Date();
    var time = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    if (!t.sample) LAST_TICKET = "Tidewater Goods (DEMO) " + kindLabel + " #" + no + "\nFrom: " + t.name + (t.discord ? " (" + who + ")" : "") + "\n" +
      txt.join("\n") + "\n" + (t.kind === "sell" ? "Estimated offer: " : "Total: ") + money(total) + (t.note ? "\nNote: " + t.note : "") +
      "\n(Demo only: nothing was sent.)";
    return (t.sample ? "" : '<p class="muted small">Nothing was sent. This is a mock-up of the private ticket a real build opens in the shop\'s Discord server.</p>') +
      '<div class="discord" aria-label="Mock-up of a Discord ticket">' +
        '<div class="dc-side" aria-hidden="true"><span>#</span><span class="dc-chan">' + title + no + "</span></div>" +
        '<div class="dc-main">' +
          '<div class="dc-topbar"><span class="dc-hash">#</span> ' + title + no + ' <span class="dc-topic">Private: you and shop staff</span></div>' +
          '<div class="dc-msg">' +
            '<div class="dc-avatar" aria-hidden="true">' + logo() + "</div>" +
            '<div class="dc-body"><div class="dc-meta"><strong>Tidewater Bot</strong> <span class="dc-app">APP</span> <span class="dc-time">Today at ' + time + "</span></div>" +
              "<p>Hi " + esc(who) + "! Thanks for your " + (t.kind === "sell" ? "sell request" : "order") + ". A staff member will reply here soon.</p>" +
              '<div class="dc-embed"><div class="dc-embed-title">' + esc(kindLabel) + " #" + no + (m && t.kind !== "sell" ? " · member prices" : "") + "</div>" +
                '<table class="dc-table"><thead><tr><th>Item</th><th>' + (t.kind === "sell" ? "Condition" : "Version") + '</th><th class="num">Qty</th><th class="num">' + (t.kind === "sell" ? "Offer" : "Price") + "</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>" +
                '<div class="dc-total">' + (t.kind === "sell" ? "Estimated offer" : "Total") + " <strong>" + money(total) + "</strong></div>" +
                (t.note ? '<div class="dc-note"><span>Note</span> ' + esc(t.note) + "</div>" : "") +
              "</div>" +
              '<div class="dc-buttons"><span class="dc-btn dc-green">Claim (staff)</span><span class="dc-btn dc-grey">Mark ready for pickup</span><span class="dc-btn dc-red">Close ticket</span></div>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
  }
  function showTicket(t) {
    $("#ticket-body").innerHTML = ticketHTML(t);
    openDialog("ticket");
  }
  function copyTicket() {
    var done = function () { toast("Summary copied."); };
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(LAST_TICKET).then(done, function () { toast("Couldn't copy here."); }); return; }
    } catch (e) { /* fall through */ }
    var ta = document.createElement("textarea");
    ta.value = LAST_TICKET; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy here."); }
    document.body.removeChild(ta);
  }

  // ---------- icons + logo ----------
  function icon(n) {
    var p = {
      bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>',
      search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
      check: '<path d="M5 12l5 5 9-10"/>',
      wave: '<path d="M3 15c3-3 6-3 9 0s6 3 9 0"/><path d="M3 10c3-3 6-3 9 0s6 3 9 0"/>',
      ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7z"/>',
      tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
      swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>'
    }[n] || "";
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>";
  }
  function logo() {
    return '<svg class="logo" viewBox="0 0 40 40" aria-hidden="true" focusable="false">' +
      '<circle cx="20" cy="20" r="19" fill="#1f4e5a"/>' +
      '<circle cx="27" cy="13" r="5" fill="#d9a441"/>' +
      '<path d="M5 24c4-4 8-4 12 0s8 4 12 0 6-3 7-2v8a15 15 0 0 1-31 0z" fill="#7bb6d9"/>' +
      '<path d="M5 24c4-4 8-4 12 0s8 4 12 0 6-3 7-2" fill="none" stroke="#f7efe2" stroke-width="2.2" stroke-linecap="round"/></svg>';
  }

  // ---------- product pictures: a photo when the item has one, the code-drawn illustration otherwise ----------
  function pic(it, opts) {
    opts = opts || {};
    var badge = opts.premium ? '<span class="pic-badge">Premium</span>' : "";
    if (it.img) {
      return '<span class="pic">' + '<img src="' + base() + esc(it.img) + '" alt="' + esc(opts.alt || "") + '"' +
        (opts.eager ? "" : ' loading="lazy"') + ' decoding="async" width="800" height="800">' + badge + "</span>";
    }
    return '<span class="pic pic-art">' + TWArt.svg(it.art, it.colors || ["#0e8fa0", "#ffffff"], { label: opts.alt }) + badge + "</span>";
  }

  // ---------- product card ----------
  function card(it) {
    var m = isMember(), p = price(it, "standard", m), n = totalStock(it), cat = DATA.cat[it.category];
    var url = base() + "item.html?id=" + encodeURIComponent(it.id);
    var std = stockOf(it, "standard");
    return '<article class="card' + (n <= 0 ? " is-out" : "") + '">' +
      '<a class="card-art" href="' + url + '" tabindex="-1" aria-hidden="true">' + pic(it) + "</a>" +
      '<div class="card-body">' +
        '<div class="card-cat">' + esc(cat ? cat.label : "") + "</div>" +
        '<h3 class="card-title"><a href="' + url + '">' + esc(it.name) + "</a></h3>" +
        '<div class="card-price">' + (m && p.member < p.list ? '<s class="muted">' + money(p.list) + '</s> <span class="price-member">' + money(p.member) + "</span>" : "<span>" + money(p.list) + "</span>") +
          (stockOf(it, "premium") > 0 ? ' <span class="muted small">Premium too</span>' : "") + "</div>" +
        '<div class="card-foot">' + stockBadge(n) +
          (std > 0 ? '<button type="button" class="btn btn-small" data-quick="' + esc(it.id) + '" aria-label="Add Standard ' + esc(it.name) + ' to cart">Add</button>'
                   : '<a class="btn btn-small btn-ghost" href="' + url + '">View</a>') +
        "</div>" +
      "</div></article>";
  }
  function wireQuickAdd(root) {
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-quick]");
      if (b) addToCart(b.getAttribute("data-quick"), "standard", 1);
    });
  }

  // ---------- pages ----------
  var PAGES = {};

  PAGES.home = function () {
    var feat = DATA.items.filter(function (i) { return i.featured; }).slice(0, 6);
    var grid = $("#featured");
    function draw() { grid.innerHTML = feat.map(card).join(""); }
    draw();
    wireQuickAdd(grid);
    document.addEventListener("tw:pricing", draw);
    var hero = $("#hero-art");
    var heroImg = DATA.settings.shop.hero_img;
    if (hero && heroImg) {
      hero.classList.add("hero-photo");
      hero.innerHTML = '<img src="' + base() + esc(heroImg) + '" alt="" width="1600" height="907" fetchpriority="high">';
    } else if (hero) {
      hero.innerHTML =
        '<div class="ha ha-1">' + TWArt.svg("umbrella", ["#e8604c", "#f7efe2"]) + "</div>" +
        '<div class="ha ha-2">' + TWArt.svg("towel", ["#2f7d86", "#cfe6e3"]) + "</div>" +
        '<div class="ha ha-3">' + TWArt.svg("bottle", ["#d9a441", "#1f4e5a"]) + "</div>" +
        '<div class="ha ha-4">' + TWArt.svg("bucket", ["#e7d8b9", "#8a6f55"]) + "</div>";
    }
    $("#stat-items").textContent = DATA.items.length;
    $("#stat-cats").textContent = DATA.settings.categories.length;
  };

  PAGES.shop = function () {
    var state = { q: "", cat: "all", stock: false, sort: "featured", band: "all" };
    var params = new URLSearchParams(location.search);
    state.q = (params.get("q") || "").slice(0, 60);
    state.cat = params.get("cat") && DATA.cat[params.get("cat")] ? params.get("cat") : "all";
    var chips = $("#cat-chips"), grid = $("#grid"), count = $("#result-count"), q = $("#q");
    q.value = state.q;
    chips.innerHTML = [{ id: "all", label: "Everything" }].concat(DATA.settings.categories).map(function (c) {
      return '<button type="button" class="chip" data-cat="' + esc(c.id) + '" aria-pressed="' + (c.id === state.cat) + '">' + esc(c.label) + "</button>";
    }).join("");
    function norm(s) { return String(s).toLowerCase().normalize ? String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "") : String(s).toLowerCase(); }
    function matches(it) {
      if (state.cat !== "all" && it.category !== state.cat) return false;
      // "band" = a version that is actually available (e.g. only show items you can get in Premium)
      if (state.band !== "all" && stockOf(it, state.band) <= 0) return false;
      if (state.stock && totalStock(it) <= 0) return false;
      if (state.q) {
        var hay = norm([it.name, it.blurb, (it.tags || []).join(" "), DATA.cat[it.category].label].join(" "));
        var ok = norm(state.q).split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) >= 0; });
        if (!ok) return false;
      }
      return true;
    }
    function sorter(a, b) {
      var m = isMember();
      if (state.sort === "price-asc") return price(a, "standard", m).final - price(b, "standard", m).final;
      if (state.sort === "price-desc") return price(b, "standard", m).final - price(a, "standard", m).final;
      if (state.sort === "name") return a.name.localeCompare(b.name);
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (totalStock(b) > 0) - (totalStock(a) > 0);
    }
    function draw() {
      var list = DATA.items.filter(matches).sort(sorter);
      grid.innerHTML = list.length ? list.map(card).join("") :
        '<div class="empty wide">' + icon("search") + "<p>Nothing matches that. Try another word or category.</p>" +
        '<button type="button" class="btn btn-ghost" id="reset">Clear filters</button></div>';
      count.textContent = list.length + (list.length === 1 ? " item" : " items");
      var r = $("#reset");
      if (r) r.addEventListener("click", function () {
        state = { q: "", cat: "all", stock: false, sort: "featured", band: "all" };
        q.value = ""; $("#in-stock").checked = false; $("#sort").value = "featured"; $("#band").value = "all";
        $$(".chip", chips).forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-cat") === "all"); });
        sync(); draw();
      });
    }
    function sync() {
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.cat !== "all") p.set("cat", state.cat);
      var s = p.toString();
      try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "")); } catch (e) { /* file:// */ }
    }
    var t;
    q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = q.value.trim().slice(0, 60); sync(); draw(); }, 120); });
    $("#search-form").addEventListener("submit", function (e) { e.preventDefault(); state.q = q.value.trim().slice(0, 60); sync(); draw(); });
    chips.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".chip");
      if (!b) return;
      state.cat = b.getAttribute("data-cat");
      $$(".chip", chips).forEach(function (c) { c.setAttribute("aria-pressed", c === b); });
      sync(); draw();
    });
    $("#in-stock").addEventListener("change", function (e) { state.stock = e.target.checked; draw(); });
    $("#sort").addEventListener("change", function (e) { state.sort = e.target.value; draw(); });
    $("#band").addEventListener("change", function (e) { state.band = e.target.value; draw(); });
    wireQuickAdd(grid);
    document.addEventListener("tw:pricing", draw);
    draw();
  };

  PAGES.item = function () {
    var id = new URLSearchParams(location.search).get("id");
    var it = DATA.byId[id];
    var root = $("#item");
    if (!it) {
      document.title = "Item not found · Tidewater Goods (demo)";
      root.innerHTML = '<div class="empty wide">' + icon("search") + "<h1>We couldn't find that item.</h1>" +
        '<a class="btn btn-primary" href="' + base() + 'shop.html">Back to the shop</a></div>';
      return;
    }
    document.title = it.name + " · Tidewater Goods (demo)";
    var cat = DATA.cat[it.category];
    var variant = stockOf(it, "standard") > 0 || stockOf(it, "premium") <= 0 ? "standard" : "premium";
    var qty = 1;
    function draw() {
      var m = isMember(), p = price(it, variant, m), stock = stockOf(it, variant), have = inCart(it.id, variant);
      var max = Math.max(0, stock - have);
      if (qty > Math.max(1, max)) qty = Math.max(1, max);
      var wasOpen = !!root.querySelector("details.breakdown[open]");
      var ae = document.activeElement;
      var hadFocus = root.contains(ae) && ae !== root ? (ae.name === "variant" ? "variant" : "buy") : "";
      root.innerHTML =
        '<nav class="crumbs" aria-label="Breadcrumb"><a href="' + base() + 'shop.html">Shop</a><span aria-hidden="true">/</span>' +
          '<a href="' + base() + "shop.html?cat=" + encodeURIComponent(it.category) + '">' + esc(cat.label) + '</a><span aria-hidden="true">/</span><span aria-current="page">' + esc(it.name) + "</span></nav>" +
        '<div class="item-grid">' +
          '<div class="item-art">' + pic(it, { premium: variant === "premium", alt: it.name, eager: true }) + "</div>" +
          '<div class="item-info">' +
            '<div class="card-cat">' + esc(cat.label) + "</div>" +
            "<h1>" + esc(it.name) + "</h1>" +
            '<p class="lead">' + esc(it.blurb) + "</p>" +
            '<fieldset class="variants"><legend>Choose a version</legend>' +
              DATA.settings.variants.map(function (v) {
                var s = stockOf(it, v.id), vp = price(it, v.id, m);
                return '<label class="variant' + (s <= 0 ? " is-out" : "") + '"><input type="radio" name="variant" value="' + esc(v.id) + '"' +
                  (v.id === variant ? " checked" : "") + (s <= 0 ? " disabled" : "") + ">" +
                  '<span class="v-top"><strong>' + esc(v.label) + "</strong><span>" + money(vp.final) + "</span></span>" +
                  '<span class="v-blurb">' + esc(v.blurb) + "</span>" + stockBadge(s) + "</label>";
              }).join("") +
            "</fieldset>" +
            '<div class="price-block">' +
              (m && p.member < p.list ? '<div class="pb-row"><s class="muted">' + money(p.list) + '</s><span class="price-big price-member">' + money(p.member) + '</span><span class="badge badge-member">Member price</span></div>'
                                       : '<div class="pb-row"><span class="price-big">' + money(p.list) + "</span>" + (!m ? '<span class="muted small">Members ' + money(p.member) + "</span>" : "") + "</div>") +
            "</div>" +
            '<div class="buy-row">' +
              '<div class="stepper" role="group" aria-label="Quantity">' +
                '<button type="button" class="step" data-d="-1" aria-label="One fewer"' + (qty <= 1 ? " disabled" : "") + ">−</button>" +
                '<input type="number" id="qty" min="1" max="' + Math.max(1, max) + '" value="' + qty + '" aria-label="Quantity" inputmode="numeric"' + (max <= 0 ? " disabled" : "") + ">" +
                '<button type="button" class="step" data-d="1" aria-label="One more"' + (qty >= max ? " disabled" : "") + ">+</button>" +
              "</div>" +
              '<button type="button" class="btn btn-primary" id="add"' + (max <= 0 ? " disabled" : "") + ">" +
                (stock <= 0 ? "Sold out" : max <= 0 ? "All in your cart" : "Add to cart") + "</button>" +
            "</div>" +
            (have > 0 ? '<p class="small muted in-cart-note">' + have + " already in your cart. " +
              '<button type="button" class="link-btn" data-open-cart>View cart</button></p>' : "") +
            '<details class="breakdown"' + (wasOpen ? " open" : "") + '><summary>How this price is built</summary>' +
              '<p class="small muted">Every price on this site comes from one formula, so a stock or cost change updates the whole shop at once.</p>' +
              '<table class="calc"><tbody>' +
                "<tr><td>Base cost</td><td class=\"num\">" + money(it.cost) + "</td></tr>" +
                "<tr><td>" + esc(variantLabel(variant)) + " materials ×" + p.factor.toFixed(2) + '</td><td class="num">' + money(p.cost) + "</td></tr>" +
                "<tr><td>" + esc(cat.label) + " markup +" + Math.round(p.markup * 100) + '%</td><td class="num">' + money(p.raw) + "</td></tr>" +
                '<tr><td>Rounded up to a .95 price</td><td class="num">' + money(p.list) + "</td></tr>" +
                "<tr><td>Member price (" + Math.round(p.discount * 100) + '%+ off, rounded down to .95)</td><td class="num">' + money(p.member) + "</td></tr>" +
              "</tbody></table></details>" +
          "</div>" +
        "</div>" +
        '<section class="related"><h2>More ' + esc(cat.label.toLowerCase()) + '</h2><div class="grid" id="related"></div></section>';
      $$('input[name="variant"]', root).forEach(function (r) { r.addEventListener("change", function () { variant = r.value; qty = 1; draw(); }); });
      var qi = $("#qty");
      // quantity changes patch the stepper in place (no redraw), so a click that follows still lands
      function setQ(n) {
        qty = clampInt(n, 1, Math.max(1, max));
        qi.value = qty;
        $('[data-d="-1"]', root).disabled = qty <= 1;
        $('[data-d="1"]', root).disabled = qty >= max;
      }
      $$("[data-d]", root).forEach(function (b) {
        b.addEventListener("click", function () { setQ(qty + parseInt(b.getAttribute("data-d"), 10)); });
      });
      qi.addEventListener("change", function () { setQ(qi.value); });
      $("#add").addEventListener("click", function () { if (addToCart(it.id, variant, qty)) { qty = 1; draw(); } });
      var rel = DATA.items.filter(function (x) { return x.category === it.category && x.id !== it.id; }).slice(0, 4);
      var rg = $("#related");
      rg.innerHTML = rel.map(card).join("");
      wireQuickAdd(rg);
      // keep keyboard users where they were after a redraw
      if (hadFocus === "variant") { var r = $('input[name="variant"]:checked', root); if (r) r.focus(); }
      else if (hadFocus) {
        var t = [$("#add"), $("#qty"), $('input[name="variant"]:checked', root)].filter(function (x) { return x && !x.disabled; })[0];
        if (t) t.focus();
      }
    }
    document.addEventListener("tw:pricing", draw);
    document.addEventListener("tw:cart", draw);
    draw();
  };

  PAGES.sell = function () {
    var B = DATA.settings.buy, list = $("#buy-list"), picks = {};
    $("#buy-intro").textContent = B.intro;
    function offer(item, cond) {
      var c = B.conditions.filter(function (x) { return x.id === cond; })[0];
      return Math.round(item.base_offer * (c ? c.factor : 0));
    }
    list.innerHTML = B.items.map(function (b) {
      return '<article class="buy-card' + (b.wanted ? "" : " is-paused") + '" data-id="' + esc(b.id) + '">' +
        '<div class="buy-art">' + pic(b) + "</div>" +
        '<div class="buy-main"><h3>' + esc(b.name) + "</h3>" +
          (b.wanted ? '<p class="muted small">Up to ' + b.max_qty + " per request · best offer " + money(offer(b, "likenew")) + "</p>"
                    : '<p class="muted small">Not buying these right now.</p>') +
          (b.wanted ? '<div class="cond" role="radiogroup" aria-label="Condition of your ' + esc(b.name) + '">' +
            B.conditions.map(function (c, i) {
              return '<label class="cond-opt"><input type="radio" name="c-' + esc(b.id) + '" value="' + esc(c.id) + '"' + (i === 1 ? " checked" : "") + ">" +
                "<span><strong>" + esc(c.label) + "</strong> " + money(offer(b, c.id)) + '<em class="small muted">' + esc(c.blurb) + "</em></span></label>";
            }).join("") + "</div>" +
            '<div class="buy-row"><div class="stepper" role="group" aria-label="How many"><button type="button" class="step" data-d="-1" aria-label="One fewer">−</button>' +
            '<input type="number" min="1" max="' + b.max_qty + '" value="1" aria-label="How many" inputmode="numeric"><button type="button" class="step" data-d="1" aria-label="One more">+</button></div>' +
            '<button type="button" class="btn btn-small" data-add>Add to my list</button></div>' : "") +
        "</div></article>";
    }).join("");
    function drawPicks() {
      var keys = Object.keys(picks), box = $("#sell-summary");
      if (!keys.length) { box.innerHTML = '<p class="muted">Nothing on your list yet. Add items on the left.</p>'; return; }
      var total = 0;
      box.innerHTML = '<ul class="pick-list">' + keys.map(function (k) {
        var p = picks[k]; total += p.offer * p.qty;
        return '<li><span>' + p.qty + " × " + esc(p.name) + ' <span class="muted small">(' + esc(p.condition) + ")</span></span>" +
          "<span>" + money(p.offer * p.qty) + ' <button type="button" class="icon-btn small" data-del="' + esc(k) + '" aria-label="Remove ' + esc(p.name) + '">' + icon("x") + "</button></span></li>";
      }).join("") + "</ul>" +
        '<div class="row total"><span>Estimated offer</span><strong>' + money(total) + "</strong></div>" +
        '<p class="muted small">Final offers are made after the shop sees the item. Demo only: nothing is sent.</p>' +
        '<button type="button" class="btn btn-primary btn-block" id="sell-request">Preview sell request</button>';
      $$("[data-del]", box).forEach(function (b) { b.addEventListener("click", function () { delete picks[b.getAttribute("data-del")]; drawPicks(); }); });
      $("#sell-request").addEventListener("click", function () {
        REQUEST = { kind: "sell", lines: Object.keys(picks).map(function (k) { return picks[k]; }) };
        openDialog("request");
      });
    }
    $$(".buy-card", list).forEach(function (card) {
      var b = B.items.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
      if (!b.wanted) return;
      var inp = $('input[type="number"]', card);
      $$("[data-d]", card).forEach(function (s) {
        s.addEventListener("click", function () { inp.value = clampInt(clampInt(inp.value, 1, b.max_qty) + parseInt(s.getAttribute("data-d"), 10), 1, b.max_qty); });
      });
      inp.addEventListener("change", function () { inp.value = clampInt(inp.value, 1, b.max_qty); });
      $("[data-add]", card).addEventListener("click", function () {
        var cond = ($('input[type="radio"]:checked', card) || {}).value || "good";
        var c = B.conditions.filter(function (x) { return x.id === cond; })[0];
        var key = b.id + ":" + cond, have = picks[key] ? picks[key].qty : 0;
        var already = Object.keys(picks).filter(function (k) { return k.indexOf(b.id + ":") === 0; })
          .reduce(function (s, k) { return s + picks[k].qty; }, 0);
        var want = clampInt(inp.value, 1, b.max_qty);
        var room = b.max_qty - already;
        if (room <= 0) { toast("That's the most we take of " + b.name.toLowerCase() + " in one request."); return; }
        var add = Math.min(want, room);
        picks[key] = { name: b.name, condition: c.label, offer: offer(b, cond), qty: have + add };
        toast("Added " + add + " × " + b.name + " (" + c.label + ") to your list.");
        drawPicks();
      });
    });
    drawPicks();
  };

  PAGES.how = function () {
    var demo = $("#ticket-demo");
    if (!demo) return;
    // A sample ticket built from fixed lines: the visitor's own cart and ticket counter are not touched.
    var it = DATA.byId["tidepool-insulated-bottle"], it2 = DATA.byId["harbour-canvas-tote"];
    demo.innerHTML = ticketHTML({
      kind: "order", name: "Sam", discord: "sam_at_the_beach", note: "Can I pick up Saturday morning?", sample: true,
      cartLines: [{ id: it.id, variant: "premium", qty: 1 }, { id: it2.id, variant: "standard", qty: 2 }]
    });
  };

  // ---------- boot ----------
  function boot() {
    load().then(function () {
      chrome();
      var page = document.body.getAttribute("data-page");
      if (PAGES[page]) PAGES[page]();
      document.documentElement.classList.add("ready");
    }).catch(function (e) {
      var main = $("#main") || document.body;
      main.insertAdjacentHTML("afterbegin",
        '<div class="load-error" role="alert"><strong>The shop data didn\'t load.</strong> ' +
        "This demo reads its catalogue from JSON files, so it needs to be served over http(s) " +
        "(for example GitHub Pages, or <code>python -m http.server</code> in this folder), not opened as a file.</div>");
      if (window.console) console.error(e);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  // Exposed for automated tests.
  window.TW = { price: function (i, v, m) { return price(i, v, m); }, priceUp: priceUp, load: load, esc: esc, data: function () { return DATA; } };
})();
