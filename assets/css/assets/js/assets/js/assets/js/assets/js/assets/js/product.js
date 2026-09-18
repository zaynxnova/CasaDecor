import { APP } from "./config.js";
import { fetchPublicProductBySlug, fetchProductImages, fetchPublicProducts, storagePublicUrl } from "./supabase.js";
import { escapeHtml, formatPKR, isSaleActive, computeDiscountPercent, availabilityLabel, toast } from "./main.js";

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function setMeta({ title, description, imageUrl }) {
  if (title) document.title = title;

  const ogTitle = qs("[data-og-title]");
  if (ogTitle && title) ogTitle.setAttribute("content", title);

  const ogDesc = qs("[data-og-description]");
  if (ogDesc && description) ogDesc.setAttribute("content", description);

  const ogImg = qs("[data-og-image]");
  if (ogImg && imageUrl) ogImg.setAttribute("content", imageUrl);
}

function renderBadges(p) {
  const mount = qs("[data-badges]");
  if (!mount) return;

  const saleActive = isSaleActive(p);
  const discount = saleActive ? computeDiscountPercent(p.price, p.sale_price) : null;

  const badges = [];
  if (p.featured) badges.push(`<span class="badge badge--gold">Featured</span>`);
  if (saleActive && discount) badges.push(`<span class="badge">-${discount}%</span>`);
  if (p.availability && p.availability !== "in_stock") badges.push(`<span class="badge">${escapeHtml(availabilityLabel(p.availability))}</span>`);

  mount.innerHTML = badges.join("");
}

function renderPrice(p) {
  const mount = qs("[data-price]");
  if (!mount) return;

  const currency = p.currency || APP.currencyFallback;
  const saleActive = isSaleActive(p);
  const discount = saleActive ? computeDiscountPercent(p.price, p.sale_price) : null;

  if (saleActive && p.sale_price) {
    mount.innerHTML = `
      <div class="priceBig">${escapeHtml(formatPKR(p.sale_price, currency))}</div>
      <div class="priceSub">
        <span style="text-decoration:line-through;opacity:.8">${escapeHtml(formatPKR(p.price, currency))}</span>
        ${discount ? ` • <span style="color:rgba(184,154,90,.95)">${discount}% off</span>` : ""}
      </div>
    `;
  } else {
    mount.innerHTML = `
      <div class="priceBig">${escapeHtml(formatPKR(p.price, currency))}</div>
      <div class="priceSub">Pricing in ${escapeHtml(currency)}.</div>
    `;
  }
}

function renderSpecs(p) {
  const specBlock = qs("[data-spec-block]");
  const mount = qs("[data-product-specs]");
  if (!specBlock || !mount) return;

  const specs = [];

  if (p.dimensions) specs.push({ k: "Dimensions", v: p.dimensions });
  if (p.warranty) specs.push({ k: "Warranty", v: p.warranty });
  if (p.availability) specs.push({ k: "Availability", v: availabilityLabel(p.availability) });
  if (p.category_name) specs.push({ k: "Category", v: p.category_name });

  if (!specs.length) {
    specBlock.hidden = true;
    return;
  }

  specBlock.hidden = false;
  mount.innerHTML = specs
    .map((s) => `<div class="specRow"><div class="specKey">${escapeHtml(s.k)}</div><div class="specVal">${escapeHtml(s.v)}</div></div>`)
    .join("");
}

function renderDescription(p) {
  const block = qs("[data-desc-block]");
  const mount = qs("[data-product-description]");
  if (!block || !mount) return;

  const desc = (p.description || "").trim();
  if (!desc) {
    block.hidden = true;
    return;
  }
  block.hidden = false;

  // Keep it safe: simple paragraph formatting (no raw HTML injection)
  mount.innerHTML = desc
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function asArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "string") {
    // allow comma-separated in future
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function renderOptions(p) {
  const block = qs("[data-custom-block]");
  const mount = qs("[data-product-options]");
  if (!block || !mount) return;

  const fabric = asArray(p.fabric_options);
  const color = asArray(p.color_options);
  const marble = asArray(p.marble_options);

  const groups = [];
  if (fabric.length) groups.push({ title: "Fabric", items: fabric });
  if (color.length) groups.push({ title: "Colors", items: color });
  if (marble.length) groups.push({ title: "Marble", items: marble });
  if (p.dimensions) groups.push({ title: "Dimensions", items: ["Custom available"] });

  if (!groups.length) {
    block.hidden = true;
    return;
  }

  block.hidden = false;
  mount.innerHTML = groups
    .map((g) => `
      <div class="optionGroup">
        <div class="optionGroup__title">${escapeHtml(g.title)}</div>
        <div class="optionChips">
          ${g.items.map((x) => `<span class="chip">${escapeHtml(String(x))}</span>`).join("")}
        </div>
      </div>
    `)
    .join("");
}

function initGallery(images, fallbackAlt = "Product image") {
  const main = qs("[data-main-image]");
  const thumbs = qs("[data-thumbs]");
  if (!main || !thumbs) return;

  const list = (images || []).length ? images : [{ path: "./assets/images/placeholder-product.svg", alt: fallbackAlt }];

  let idx = 0;

  const setIndex = (i) => {
    idx = Math.max(0, Math.min(list.length - 1, i));
    const img = list[idx];
    main.src = storagePublicUrl(img.path) || img.path;
    main.alt = img.alt || fallbackAlt;

    qsa(".thumbBtn", thumbs).forEach((b, bi) => b.setAttribute("aria-current", String(bi === idx)));
  };

  thumbs.innerHTML = list
    .map((img, i) => `
      <button class="thumbBtn" type="button" aria-current="${i === 0 ? "true" : "false"}" aria-label="View image ${i + 1}">
        <img src="${storagePublicUrl(img.path) || img.path}" alt="${escapeHtml(img.alt || fallbackAlt)}" loading="lazy" />
      </button>
    `)
    .join("");

  qsa(".thumbBtn", thumbs).forEach((b, i) => b.addEventListener("click", () => setIndex(i)));

  // Basic swipe on main image (mobile-friendly)
  let startX = null;
  main.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
  });
  main.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) < 38) return;
    if (dx < 0) setIndex(idx + 1);
    else setIndex(idx - 1);
  });

  setIndex(0);
}

function initCountdown(p) {
  const wrap = qs("[data-sale-countdown]");
  if (!wrap) return;

  const saleActive = isSaleActive(p);
  const end = p.sale_end ? Date.parse(p.sale_end) : null;
  if (!saleActive || !end) {
    wrap.hidden = true;
    return;
  }

  const dEl = qs("[data-cd-days]");
  const hEl = qs("[data-cd-hours]");
  const mEl = qs("[data-cd-min]");
  const sEl = qs("[data-cd-sec]");

  const tick = () => {
    const now = Date.now();
    const ms = end - now;
    if (ms <= 0) {
      wrap.hidden = true;
      return;
    }
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = Math.floor(totalSec % 60);

    if (dEl) dEl.textContent = String(days);
    if (hEl) hEl.textContent = String(hours).padStart(2, "0");
    if (mEl) mEl.textContent = String(mins).padStart(2, "0");
    if (sEl) sEl.textContent = String(secs).padStart(2, "0");

    wrap.hidden = false;
  };

  tick();
  window.setInterval(tick, 1000);
}

function hydrateInquiryDrawerForProduct(p) {
  const drawer = qs("[data-drawer]");
  if (!drawer) return;

  const openBtn = qs("[data-inquire-product]");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      const pn = qs("[data-inquiry-product-name]", drawer);
      const ps = qs("[data-inquiry-product-slug]", drawer);
      const msg = qs("textarea[name='message']", drawer);

      if (pn) pn.value = p.name || "";
      if (ps) ps.value = p.slug || "";
      if (msg && p.name) msg.value = `Hi Casa Decor, I am interested in the ${p.name}.`;

      drawer.hidden = false;
      drawer.setAttribute("data-open", "true");
      document.body.style.overflow = "hidden";
      qs("input[name='name']", drawer)?.focus?.();
    });
  }
}

function renderRelated(current) {
  const mount = qs("[data-related-grid]");
  if (!mount) return;

  fetchPublicProducts({ limit: 80 }).then(({ data, error }) => {
    if (error || !data) {
      mount.innerHTML = "";
      return;
    }

    const related = data
      .filter((p) => p.slug !== current.slug)
      .filter((p) => (current.category_id ? p.category_id === current.category_id : p.category_slug === current.category_slug))
      .slice(0, 4);

    const card = (p) => {
      const img = storagePublicUrl(p.primary_image_path) || "./assets/images/placeholder-product.svg";
      const href = `./product.html?slug=${encodeURIComponent(p.slug)}`;
      return `
        <article class="productCard">
          <a class="productCard__media" href="${href}">
            <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" />
          </a>
          <div class="productCard__body">
            <div class="productCard__top">
              <h3 class="productCard__name">${escapeHtml(p.name)}</h3>
              <div class="productCard__meta">${escapeHtml(p.category_name || "")}</div>
            </div>
            <div class="productCard__actions">
              <a class="btn btn--secondary" href="${href}">View</a>
              <a class="btn btn--primary" href="./contact.html">Inquiry</a>
            </div>
          </div>
        </article>
      `;
    };

    mount.innerHTML = related.length
      ? related.map(card).join("")
      : `<div class="notice notice--info">No related products found.</div>`;
  });
}

function injectProductLd(p, primaryImageUrl) {
  const ld = qs("#ld-product");
  if (!ld) return;

  const currency = p.currency || APP.currencyFallback;
  const saleActive = isSaleActive(p);
  const price = saleActive && p.sale_price ? Number(p.sale_price) : Number(p.price);

  const obj = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.short_description || p.description || "",
    image: primaryImageUrl ? [primaryImageUrl] : [],
    offers: {
      "@type": "Offer",
      priceCurrency: currency,
      price: Number.isFinite(price) ? String(price) : undefined,
      availability:
        (p.availability || "").toLowerCase() === "out_of_stock"
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      url: window.location.href,
      priceValidUntil: p.sale_end || undefined,
    },
  };

  ld.textContent = JSON.stringify(obj);
}

(async function bootProduct() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");

  const errEl = qs("[data-product-error]");
  const shell = qs("[data-product-shell]");

  if (!slug) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Missing product slug.";
    }
    return;
  }

  const { data: p, error } = await fetchPublicProductBySlug(slug);
  if (error || !p) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Unable to load product.";
    }
    return;
  }

  if (shell) shell.hidden = false;

  // Basic text
  qs("[data-breadcrumb-current]")?.replaceChildren(document.createTextNode(p.name || "Product"));
  qs("[data-product-name]") && (qs("[data-product-name]").textContent = p.name || "—");
  qs("[data-product-category]") && (qs("[data-product-category]").textContent = p.category_name || "—");
  qs("[data-product-availability]") && (qs("[data-product-availability]").textContent = availabilityLabel(p.availability));

  renderBadges(p);
  renderPrice(p);
  renderDescription(p);
  renderSpecs(p);
  renderOptions(p);
  initCountdown(p);
  hydrateInquiryDrawerForProduct(p);

  // Images
  const { data: imgs } = await fetchProductImages(p.id);
  const images = (imgs || []).map((i) => ({
    path: i.path,
    alt: i.alt || p.name,
  }));

  const primaryUrl = images[0]?.path ? storagePublicUrl(images[0].path) : "./assets/images/placeholder-product.svg";
  initGallery(images, p.name);

  // Meta + OG
  setMeta({
    title: `${p.name} — ${APP.brandName}`,
    description: p.short_description || "Explore product details and inquiry options.",
    imageUrl: primaryUrl,
  });

  injectProductLd(p, primaryUrl);

  // Related
  renderRelated(p);
})();
