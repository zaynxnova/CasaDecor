import { APP } from "./config.js";
import { fetchPublicCategories, fetchPublicProducts } from "./supabase.js";
import { debounce, escapeHtml, formatPKR, isSaleActive, computeDiscountPercent, availabilityLabel, toast } from "./main.js";
import { storagePublicUrl } from "./supabase.js";

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function renderProductCard(p) {
  const currency = p.currency || APP.currencyFallback;
  const img = storagePublicUrl(p.primary_image_path) || "./assets/images/placeholder-product.svg";

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
        <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" />
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
          <button class="btn btn--primary" type="button" data-card-inquire data-product-name="${escapeHtml(p.name)}" data-product-slug="${escapeHtml(p.slug)}">Inquiry</button>
        </div>
      </div>
    </article>
  `;
}

function initCardInquiryButtons(root = document) {
  qsa("[data-card-inquire]", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      const drawer = qs("[data-drawer]");
      if (!drawer) {
        // shop page doesn't include drawer; route to contact
        window.location.href = "./contact.html";
        return;
      }

      const name = btn.getAttribute("data-product-name") || "";
      const slug = btn.getAttribute("data-product-slug") || "";

      const pn = drawer.querySelector("[data-inquiry-product-name]");
      const ps = drawer.querySelector("[data-inquiry-product-slug]");
      const msg = drawer.querySelector("textarea[name='message']");

      if (pn) pn.value = name;
      if (ps) ps.value = slug;
      if (msg && name) msg.value = `Hi Casa Decor, I am interested in the ${name}.`;

      drawer.hidden = false;
      drawer.setAttribute("data-open", "true");
      document.body.style.overflow = "hidden";
      drawer.querySelector("input[name='name']")?.focus?.();
    });
  });
}

function normalize(str) {
  return String(str || "").toLowerCase().trim();
}

function productMatchesQuery(p, q) {
  if (!q) return true;
  const hay = [
    p.name,
    p.short_description,
    p.description,
    p.category_name,
  ].map(normalize).join(" ");
  return hay.includes(normalize(q));
}

function productMatchesCategory(p, catSlugOrId) {
  if (!catSlugOrId) return true;
  const cSlug = p.category_slug || p.category?.slug || "";
  const cId = p.category_id || p.category?.id || "";
  return String(catSlugOrId) === String(cSlug) || String(catSlugOrId) === String(cId);
}

function productMatchesFeatured(p, onlyFeatured) {
  if (!onlyFeatured) return true;
  return Boolean(p.featured);
}

function productMatchesAvailability(p, onlyAvailable) {
  if (!onlyAvailable) return true;
  const v = (p.availability || "in_stock").toLowerCase();
  return v !== "out_of_stock";
}

function sortProducts(list, sortKey) {
  const arr = [...list];

  const effectivePrice = (p) => {
    const saleActive = isSaleActive(p);
    const val = saleActive && p.sale_price ? Number(p.sale_price) : Number(p.price);
    return Number.isFinite(val) ? val : 0;
  };

  if (sortKey === "newest") {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sortKey === "price_asc") {
    arr.sort((a, b) => effectivePrice(a) - effectivePrice(b));
  } else if (sortKey === "price_desc") {
    arr.sort((a, b) => effectivePrice(b) - effectivePrice(a));
  } else {
    // featured first (default)
    arr.sort((a, b) => (b.featured === true) - (a.featured === true));
  }

  return arr;
}

(async function bootShop() {
  const grid = qs("[data-product-grid]");
  const countEl = qs("[data-result-count]");
  const errEl = qs("[data-shop-error]");
  const emptyEl = qs("[data-shop-empty]");

  const qInput = qs("#q");
  const clearBtn = qs("[data-clear-search]");
  const catSel = qs("#cat");
  const sortSel = qs("#sort");
  const onlyFeatured = qs("#onlyFeatured");
  const onlyAvailable = qs("#onlyAvailable");

  // Apply initial category from query
  const params = new URLSearchParams(window.location.search);
  const initialCat = params.get("cat") || "";

  // Load categories
  const { data: cats, error: catsErr } = await fetchPublicCategories();
  if (catsErr) {
    toast({ type: "error", title: "Categories", message: "Unable to load categories." });
  } else if (catSel && Array.isArray(cats)) {
    catSel.insertAdjacentHTML(
      "beforeend",
      cats.map((c) => `<option value="${escapeHtml(c.slug || c.id)}">${escapeHtml(c.name)}</option>`).join("")
    );
    if (initialCat) catSel.value = initialCat;
  }

  // Load products
  const { data: products, error: prodErr } = await fetchPublicProducts({ limit: 240 });
  if (prodErr) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Unable to load products. Please try again later.";
    }
    if (grid) grid.innerHTML = "";
    return;
  }

  const all = Array.isArray(products) ? products : [];

  const render = () => {
    if (!grid) return;

    const q = qInput?.value || "";
    const cat = catSel?.value || "";
    const sort = sortSel?.value || "featured";
    const feat = Boolean(onlyFeatured?.checked);
    const avail = Boolean(onlyAvailable?.checked);

    const filtered = all
      .filter((p) => productMatchesQuery(p, q))
      .filter((p) => productMatchesCategory(p, cat))
      .filter((p) => productMatchesFeatured(p, feat))
      .filter((p) => productMatchesAvailability(p, avail));

    const sorted = sortProducts(filtered, sort);

    if (countEl) countEl.textContent = String(sorted.length);

    if (emptyEl) emptyEl.hidden = sorted.length !== 0;
    if (errEl) errEl.hidden = true;

    grid.innerHTML = sorted.map(renderProductCard).join("");
    initCardInquiryButtons(grid);
  };

  const rerenderDebounced = debounce(render, 180);

  qInput?.addEventListener("input", rerenderDebounced);
  catSel?.addEventListener("change", render);
  sortSel?.addEventListener("change", render);
  onlyFeatured?.addEventListener("change", render);
  onlyAvailable?.addEventListener("change", render);

  clearBtn?.addEventListener("click", () => {
    if (!qInput) return;
    qInput.value = "";
    qInput.focus();
    render();
  });

  // Initial render
  render();
})();
