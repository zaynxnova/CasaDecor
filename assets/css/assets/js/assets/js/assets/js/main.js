import { APP } from "./config.js";
import {
  isSupabaseConfigured,
  fetchPublicSettings,
  fetchPublicCategories,
  fetchPublicProducts,
  storagePublicUrl,
  createInquiry,
} from "./supabase.js";

/* =============================================================================
  Utilities
============================================================================= */

function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatPKR(value, currency = "PKR") {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${currency} —`;
  const nf = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
  return `${currency} ${nf.format(n)}`;
}

export function computeDiscountPercent(price, salePrice) {
  const p = Number(price);
  const s = Number(salePrice);
  if (!Number.isFinite(p) || !Number.isFinite(s) || p <= 0 || s <= 0 || s >= p) return null;
  return Math.round((1 - s / p) * 100);
}

export function isSaleActive(product) {
  // Prefer DB-computed boolean from view, fallback to client time
  if (typeof product?.sale_active === "boolean") return product.sale_active;

  if (!product?.sale_price) return false;
  const now = Date.now();

  const start = product.sale_start ? Date.parse(product.sale_start) : null;
  const end = product.sale_end ? Date.parse(product.sale_end) : null;

  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

export function availabilityLabel(val) {
  const v = (val || "").toLowerCase();
  if (v === "in_stock") return "In stock";
  if (v === "made_to_order") return "Made to order";
  if (v === "out_of_stock") return "Out of stock";
  if (v === "limited") return "Limited availability";
  return "Availability —";
}

export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function setCanonicalToCurrent() {
  const link = document.querySelector("[data-canonical]");
  if (!link) return;
  link.setAttribute("href", window.location.href);
}

function setAriaCurrentNav() {
  const page = document.body.getAttribute("data-page");
  const map = {
    home: "./index.html",
    shop: "./shop.html",
    product: "./shop.html",
    services: "./services.html",
    about: "./about.html",
    contact: "./contact.html",
    privacy: "./privacy.html",
    "404": "./404.html",
  };
  const currentHref = map[page] || "";

  qsa(".nav a, .mobileNav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    if (href === currentHref) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/* =============================================================================
  Toasts
============================================================================= */
export function toast({ type = "info", title = "Notice", message = "" } = {}) {
  const mount = qs("#toastMount");
  if (!mount) return;

  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <div>
      <div class="toast__title">${escapeHtml(title)}</div>
      <div class="toast__msg">${escapeHtml(message)}</div>
    </div>
    <button class="toast__close" type="button" aria-label="Close notification">
      <span aria-hidden="true">×</span>
    </button>
  `;

  const closeBtn = qs(".toast__close", el);
  closeBtn.addEventListener("click", () => el.remove());

  mount.appendChild(el);
  window.setTimeout(() => el.remove(), 5200);
}

/* =============================================================================
  Header / Footer mount
============================================================================= */
function mountHeader() {
  const mount = qs("#siteHeaderMount");
  if (!mount) return;

  mount.innerHTML = `
    <div class="siteHeader siteHeader--top" id="siteHeader">
      <div class="container">
        <div class="siteHeader__bar">
          <a class="logo" href="./index.html" aria-label="${APP.brandName} home">
            <div class="logo__mark">${APP.brandName}</div>
            <div class="logo__tag" data-setting="tagline">${escapeHtml(APP.taglineFallback)}</div>
          </a>

          <nav class="nav" aria-label="Primary">
            <a href="./index.html">Home</a>
            <a href="./shop.html">Collection</a>
            <a href="./services.html">Services</a>
            <a href="./about.html">About</a>
            <a href="./contact.html">Contact</a>
          </nav>

          <div class="headerActions">
            <button class="iconBtn" type="button" data-action="search" aria-label="Search">
              <span aria-hidden="true">⌕</span>
            </button>

            <div class="headerCta">
              <button class="btn btn--primary" type="button" data-action="inquiry">Inquiry</button>
            </div>

            <button class="iconBtn mobileMenuBtn" type="button" data-mobile-open aria-label="Open menu">
              <span aria-hidden="true">≡</span>
            </button>
          </div>
        </div>
      </div>

      <div class="mobileMenu" aria-hidden="true" data-mobile-menu>
        <div class="mobileMenu__backdrop" data-mobile-close aria-hidden="true"></div>
        <div class="mobileMenu__panel" role="dialog" aria-modal="true" aria-label="Menu">
          <div class="mobileMenu__top">
            <div class="logo">
              <div class="logo__mark">${APP.brandName}</div>
              <div class="logo__tag" data-setting="tagline">${escapeHtml(APP.taglineFallback)}</div>
            </div>
            <button class="iconBtn" type="button" data-mobile-close aria-label="Close menu">
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <nav class="mobileNav" aria-label="Mobile primary">
            <a href="./index.html">Home</a>
            <a href="./shop.html">Collection</a>
            <a href="./services.html">Services</a>
            <a href="./about.html">About</a>
            <a href="./contact.html">Contact</a>
          </nav>

          <div class="mobileMenu__footer">
            <div class="row">
              <button class="btn btn--primary" type="button" data-action="inquiry">Send Inquiry</button>
              <a class="btn btn--secondary" href="./shop.html">Browse</a>
            </div>
            <div class="mobileMenu__mini" data-setting="address_short">Bahria Town, Karachi</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function mountFooter() {
  const mount = qs("#siteFooterMount");
  if (!mount) return;

  mount.innerHTML = `
    <footer class="siteFooter">
      <div class="container">
        <div class="footerGrid">
          <div>
            <div class="footerTitle">${APP.brandName}</div>
            <div class="muted" data-setting="footer_tagline">${escapeHtml(APP.taglineFallback)}</div>
            <div class="divider divider--gold" aria-hidden="true"></div>
            <div class="muted small" data-setting="footer_text">
              Everything Your Home Needs. Under One Roof.
            </div>
          </div>

          <div>
            <div class="footerKicker">Quick Links</div>
            <div class="footerLinks">
              <a href="./index.html">Home</a>
              <a href="./shop.html">Collection</a>
              <a href="./services.html">Services</a>
              <a href="./about.html">About</a>
              <a href="./contact.html">Contact</a>
              <a href="./privacy.html">Privacy</a>
            </div>
          </div>

          <div>
            <div class="footerKicker">Categories</div>
            <div class="footerLinks" data-footer-categories>
              <a href="./shop.html">Browse collection</a>
            </div>
          </div>

          <div>
            <div class="footerKicker">Contact</div>
            <div class="footerLinks">
              <span class="muted small" data-setting="address_full">
                Present 19, Shop number 25, Shopping Gallery, Bahria Town, Karachi, Pakistan
              </span>
              <span class="muted small" data-setting="phone_placeholder">Phone: Set in Admin → Settings</span>
              <span class="muted small" data-setting="email_placeholder">Email: Set in Admin → Settings</span>
              <div class="row" style="margin-top:10px">
                <a class="socialLink" href="#" data-social="instagram" aria-label="Instagram (set in settings)">Instagram</a>
                <a class="socialLink" href="#" data-social="facebook" aria-label="Facebook (set in settings)">Facebook</a>
                <a class="socialLink" href="#" data-social="tiktok" aria-label="TikTok (set in settings)">TikTok</a>
              </div>
            </div>
          </div>
        </div>

        <div class="footerNote">
          © 2026 ${APP.brandName}. All rights reserved.
        </div>
      </div>
    </footer>
  `;
}

/* =============================================================================
  Header scroll state + mobile menu
============================================================================= */
function initHeaderBehavior() {
  const header = qs("#siteHeader");
  if (!header) return;

  const onScroll = () => {
    const scrolled = window.scrollY > 12;
    header.classList.toggle("siteHeader--scrolled", scrolled);
    header.classList.toggle("siteHeader--top", !scrolled);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const menu = qs("[data-mobile-menu]");
  const openBtn = qs("[data-mobile-open]");
  const closeBtns = qsa("[data-mobile-close]");
  if (!menu || !openBtn) return;

  const open = () => {
    menu.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // focus first link
    const first = qs(".mobileNav a", menu);
    first?.focus?.();
  };

  const close = () => {
    menu.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    openBtn.focus?.();
  };

  openBtn.addEventListener("click", open);
  closeBtns.forEach((b) => b.addEventListener("click", close));

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.getAttribute("aria-hidden") === "false") close();
  });

  // Trap basic focus inside when open
  menu.addEventListener("keydown", (e) => {
    if (menu.getAttribute("aria-hidden") !== "false") return;
    if (e.key !== "Tab") return;

    const focusables = qsa(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      menu
    ).filter((el) => el.offsetParent !== null);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/* =============================================================================
  Drawer (Inquiry) behavior + unified inquiry form handler
============================================================================= */
function initDrawerAndInquiryForms(settings) {
  const drawer = qs("[data-drawer]");
  if (!drawer) return;

  const openTriggers = [
    ...qsa("[data-open-consultation]"),
    ...qsa('[data-action="inquiry"]'),
  ];

  const closeTriggers = qsa("[data-drawer-close]", drawer);

  const open = () => {
    drawer.hidden = false;
    drawer.setAttribute("data-open", "true");
    document.body.style.overflow = "hidden";
    const first = qs("input, select, textarea, button", drawer);
    first?.focus?.();
  };

  const close = () => {
    drawer.setAttribute("data-open", "false");
    document.body.style.overflow = "";
    window.setTimeout(() => {
      drawer.hidden = true;
    }, 180);
  };

  openTriggers.forEach((t) => t.addEventListener("click", open));
  closeTriggers.forEach((t) => t.addEventListener("click", close));

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) close();
  });

  // If WhatsApp is configured, show WhatsApp within drawer? (We keep note only on home)
  // Public pages use inquiry form primarily; product page may show WhatsApp too.

  // Submit handler for any quick inquiry form on the page
  qsa("[data-quick-inquiry-form]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!isSupabaseConfigured()) {
        toast({
          type: "error",
          title: "Supabase not configured",
          message: "Add Supabase URL and anon key in assets/js/config.js",
        });
        return;
      }

      const fd = new FormData(form);

      const payload = {
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        email: String(fd.get("email") || "").trim() || null,
        interested_in: String(fd.get("interested_in") || fd.get("product_name") || "Inquiry").trim(),
        message: String(fd.get("message") || "").trim(),
        product_slug: String(fd.get("product_slug") || "").trim() || null,
        product_name: String(fd.get("product_name") || "").trim() || null,
        status: "new",
        source_page: window.location.pathname.split("/").pop() || "unknown",
      };

      if (!payload.name || !payload.phone || !payload.message) {
        toast({
          type: "error",
          title: "Missing details",
          message: "Please fill name, phone and message.",
        });
        return;
      }

      const { error } = await createInquiry(payload);
      if (error) {
        toast({
          type: "error",
          title: "Inquiry failed",
          message: error.message || "Unable to send inquiry.",
        });
        return;
      }

      toast({
        type: "success",
        title: "Inquiry sent",
        message: "Your inquiry has been submitted successfully.",
      });

      form.reset();
      close();
    });
  });
}

/* =============================================================================
  Search button behavior
============================================================================= */
function initSearchButton() {
  const searchBtn = qs('[data-action="search"]');
  if (!searchBtn) return;

  searchBtn.addEventListener("click", () => {
    const page = document.body.getAttribute("data-page");
    if (page === "shop") {
      qs("#q")?.focus?.();
      return;
    }
    // route to collection with intent
    window.location.href = "./shop.html#search";
  });

  // If landed with #search, focus
  if (window.location.hash === "#search") {
    window.setTimeout(() => qs("#q")?.focus?.(), 50);
  }
}

/* =============================================================================
  IntersectionObserver reveals
============================================================================= */
function initReveals() {
  const els = qsa("[data-animate]");
  if (!els.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const ent of entries) {
        if (ent.isIntersecting) {
          ent.target.classList.add("is-visible");
          io.unobserve(ent.target);
        }
      }
    },
    { root: null, threshold: 0.12 }
  );

  els.forEach((el) => io.observe(el));
}

/* =============================================================================
  Settings application
============================================================================= */
function applySettings(settings) {
  if (!settings) return;

  // Generic binding: [data-setting="key"]
  qsa("[data-setting]").forEach((el) => {
    const key = el.getAttribute("data-setting");
    if (!key) return;

    const val = settings[key];
    // Some elements are placeholders; only overwrite if val exists
    if (val === null || val === undefined || String(val).trim() === "") return;

    el.textContent = String(val);
  });

  // Hero settings
  const heroTitle = qs("[data-hero-title]");
  const heroSubtitle = qs("[data-hero-subtitle]");
  const heroEyebrow = qs("[data-hero-eyebrow]");
  const heroImage = qs("[data-hero-image]");

  if (heroTitle && settings.hero_title) heroTitle.innerHTML = escapeHtml(settings.hero_title).replaceAll("\n", "<br/>");
  if (heroSubtitle && settings.hero_subtitle) heroSubtitle.textContent = settings.hero_subtitle;
  if (heroEyebrow && settings.hero_eyebrow) heroEyebrow.textContent = settings.hero_eyebrow;

  if (heroImage && settings.hero_image_path) {
    heroImage.src = storagePublicUrl(settings.hero_image_path);
  }

  // Open Graph default image
  const ogImg = qs("[data-og-image]");
  if (ogImg && settings.hero_image_path) ogImg.setAttribute("content", storagePublicUrl(settings.hero_image_path));

  // Social links
  const socialMap = {
    instagram: settings.instagram_url,
    facebook: settings.facebook_url,
    tiktok: settings.tiktok_url,
  };
  qsa("[data-social]").forEach((a) => {
    const k = a.getAttribute("data-social");
    const href = socialMap[k];
    if (href && /^https?:\/\//i.test(href)) {
      a.setAttribute("href", href);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
      a.style.display = "";
    } else {
      // No fake links
      a.setAttribute("href", "#");
      a.removeAttribute("target");
      a.removeAttribute("rel");
      a.style.display = "none";
    }
  });

  // Map embed placeholder
  const mapBody = qs(".mapShell__body");
  if (mapBody && settings.google_maps_embed_html) {
    mapBody.innerHTML = settings.google_maps_embed_html;
  }

  // Organization structured data (no fake phone/social)
  const ldOrg = qs("#ld-organization");
  if (ldOrg) {
    const org = {
      "@context": "https://schema.org",
      "@type": "HomeAndConstructionBusiness",
      name: settings.business_name || APP.brandName,
      description: settings.tagline || APP.taglineFallback,
      address: {
        "@type": "PostalAddress",
        streetAddress: settings.address_full || "Present 19, Shop number 25, Shopping Gallery, Bahria Town, Karachi, Pakistan",
        addressLocality: "Karachi",
        addressCountry: "PK",
      },
    };
    ldOrg.textContent = JSON.stringify(org);
  }
}

/* =============================================================================
  Render helpers
============================================================================= */
function renderCategoryCard(cat) {
  const img = storagePublicUrl(cat.image_path) || "./assets/images/placeholder-category.svg";
  const desc = cat.description ? escapeHtml(cat.description) : "Explore pieces and solutions in this category.";

  const href = `./shop.html?cat=${encodeURIComponent(cat.slug || cat.id)}`;

  return `
    <a class="categoryCard" href="${href}">
      <img class="categoryCard__img" src="${img}" alt="${escapeHtml(cat.name)} category image" loading="lazy" />
      <div class="categoryCard__overlay" aria-hidden="true"></div>
      <div class="categoryCard__content">
        <h3 class="categoryCard__title">${escapeHtml(cat.name)}</h3>
        <p class="categoryCard__desc">${desc}</p>
      </div>
    </a>
  `;
}

function renderProductCard(p, { showInquiry = true } = {}) {
  const currency = p.currency || APP.currencyFallback;

  const mainImg = storagePublicUrl(p.primary_image_path) || "./assets/images/placeholder-product.svg";
  const saleActive = isSaleActive(p);
  const discount = saleActive ? computeDiscountPercent(p.price, p.sale_price) : null;

  const badges = [];
  if (p.featured) badges.push(`<span class="badge badge--gold">Featured</span>`);
  if (saleActive && discount) badges.push(`<span class="badge">-${discount}%</span>`);
  if (p.availability && p.availability !== "in_stock") badges.push(`<span class="badge">${escapeHtml(availabilityLabel(p.availability))}</span>`);

  const priceHtml = saleActive && p.sale_price
    ? `
      <div class="priceLine">
        <div class="priceLine__now">${escapeHtml(formatPKR(p.sale_price, currency))}</div>
        <div class="priceLine__was">${escapeHtml(formatPKR(p.price, currency))}</div>
        ${discount ? `<div class="priceLine__off">${discount}% off</div>` : ""}
      </div>
    `
    : `
      <div class="priceLine">
        <div class="priceLine__now">${escapeHtml(formatPKR(p.price, currency))}</div>
      </div>
    `;

  const href = `./product.html?slug=${encodeURIComponent(p.slug)}`;
  const meta = [p.category_name || p.category?.name, availabilityLabel(p.availability)].filter(Boolean).join(" • ");

  return `
    <article class="productCard">
      <a class="productCard__media" href="${href}" aria-label="View details for ${escapeHtml(p.name)}">
        <img src="${mainImg}" alt="${escapeHtml(p.name)}" loading="lazy" />
        <div class="badgeStack" aria-hidden="true">${badges.join("")}</div>
      </a>

      <div class="productCard__body">
        <div class="productCard__top">
          <h3 class="productCard__name">${escapeHtml(p.name)}</h3>
          <div class="productCard__meta">${escapeHtml(meta)}</div>
          ${p.short_description ? `<p class="productCard__desc">${escapeHtml(p.short_description)}</p>` : ""}
        </div>

        ${priceHtml}

        <div class="productCard__actions">
          <a class="btn btn--secondary" href="${href}">View</a>
          ${
            showInquiry
              ? `<button class="btn btn--primary" type="button" data-card-inquire data-product-name="${escapeHtml(p.name)}" data-product-slug="${escapeHtml(p.slug)}">Inquiry</button>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

/* =============================================================================
  Home page dynamic sections (categories + featured products)
============================================================================= */
async function initHomeDynamic() {
  // Categories grid
  const catGrid = qs("[data-category-grid]");
  if (catGrid) {
    const { data, error } = await fetchPublicCategories();
    if (error) {
      catGrid.innerHTML = "";
      toast({ type: "error", title: "Categories", message: "Unable to load categories." });
    } else {
      const cats = (data || []).slice(0, 8);
      catGrid.innerHTML = cats.map(renderCategoryCard).join("");
    }
  }

  // Featured products
  const featuredMount = qs("[data-featured-products]");
  if (featuredMount) {
    const { data, error } = await fetchPublicProducts({ limit: 60 });
    if (error) {
      featuredMount.innerHTML = "";
      toast({ type: "error", title: "Products", message: "Unable to load products." });
    } else {
      const featured = (data || []).filter((p) => p.featured).slice(0, 8);
      featuredMount.innerHTML = featured.map((p) => renderProductCard(p)).join("");
      initCardInquiryButtons(featuredMount);
    }
  }

  // Footer categories (if footer present)
  await hydrateFooterCategories();
}

/* =============================================================================
  Footer categories
============================================================================= */
async function hydrateFooterCategories() {
  const mount = qs("[data-footer-categories]");
  if (!mount) return;

  const { data, error } = await fetchPublicCategories();
  if (error || !data?.length) {
    // keep default
    return;
  }

  const top = data.slice(0, 6);
  mount.innerHTML = top
    .map((c) => `<a href="./shop.html?cat=${encodeURIComponent(c.slug || c.id)}">${escapeHtml(c.name)}</a>`)
    .join("");
}

/* =============================================================================
  Inquiry buttons on product cards
============================================================================= */
function initCardInquiryButtons(root = document) {
  qsa("[data-card-inquire]", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      const drawer = qs("[data-drawer]");
      if (!drawer) return;

      // Fill product fields if present in drawer form
      const name = btn.getAttribute("data-product-name") || "";
      const slug = btn.getAttribute("data-product-slug") || "";

      const pn = qs("[data-inquiry-product-name]", drawer);
      const ps = qs("[data-inquiry-product-slug]", drawer);
      const msg = qs("textarea[name='message']", drawer);

      if (pn) pn.value = name;
      if (ps) ps.value = slug;
      if (msg && name) msg.value = `Hi Casa Decor, I am interested in the ${name}.`;

      drawer.hidden = false;
      drawer.setAttribute("data-open", "true");
      document.body.style.overflow = "hidden";
      qs("input[name='name']", drawer)?.focus?.();
    });
  });
}

/* =============================================================================
  Bootstrap (runs on every public page)
============================================================================= */
(async function boot() {
  setCanonicalToCurrent();
  mountHeader();
  mountFooter();

  initHeaderBehavior();
  initSearchButton();
  initReveals();
  setAriaCurrentNav();

  if (!isSupabaseConfigured()) {
    // Avoid spamming: only show a gentle notice on first load
    toast({
      type: "info",
      title: "Setup required",
      message: "Connect Supabase in assets/js/config.js to load products and settings.",
    });
    initDrawerAndInquiryForms(null);
    return;
  }

  const { data: settings, error } = await fetchPublicSettings();
  if (error) {
    toast({ type: "error", title: "Settings", message: "Unable to load showroom settings." });
  } else {
    window.__CASA_SETTINGS = settings;
    applySettings(settings);
  }

  initDrawerAndInquiryForms(settings);

  // Home page: dynamic blocks
  if (document.body.getAttribute("data-page") === "home") {
    await initHomeDynamic();
  } else {
    // Still hydrate footer categories for other pages
    await hydrateFooterCategories();
  }

  // Bind inquiry buttons created dynamically later
  initCardInquiryButtons(document);
})();
