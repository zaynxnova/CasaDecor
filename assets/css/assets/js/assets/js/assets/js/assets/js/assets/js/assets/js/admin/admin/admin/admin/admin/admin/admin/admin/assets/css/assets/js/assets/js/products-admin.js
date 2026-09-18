import { SUPABASE } from "./config.js";
import { getSupabase, storagePublicUrl } from "./supabase.js";
import { adminToast, bindConfirmModal, slugify, parseCsvToArray, arrayToCsv, setBusy } from "./admin.js";

/* shared helpers */
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function esc(s="") {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function fmtPKR(n, currency="PKR") {
  const v = Number(n);
  if (!Number.isFinite(v)) return `${currency} —`;
  return `${currency} ${new Intl.NumberFormat("en-PK",{maximumFractionDigits:0}).format(v)}`;
}
function dtLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (x)=>String(x).padStart(2,"0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromDtLocal(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function safeJsonParse(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return { __invalid_json: true }; }
}

/* =============================================================================
  PRODUCTS LIST PAGE
============================================================================= */
async function initProductsList() {
  const tbody = qs("[data-products-tbody]");
  if (!tbody) return;

  const sb = getSupabase();
  const confirmDialog = bindConfirmModal();

  const qEl = qs("#q");
  const catEl = qs("#cat");
  const pubEl = qs("#pub");
  const featEl = qs("#feat");
  const refreshBtn = qs("[data-refresh]");
  const countEl = qs("[data-count]");
  const errEl = qs("[data-error]");
  const emptyEl = qs("[data-empty]");

  let categories = [];
  let all = [];

  async function loadCategories() {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,slug")
      .order("sort_order", { ascending:true })
      .order("name", { ascending:true });

    if (error) {
      adminToast({ type:"error", title:"Categories", message:"Unable to load categories." });
      return;
    }
    categories = data || [];
    if (catEl) {
      catEl.innerHTML = `<option value="">All</option>` + categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    }
  }

  async function loadProducts() {
    if (errEl) errEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    tbody.innerHTML = `<tr><td colspan="7" class="muted">Loading…</td></tr>`;

    const { data, error } = await sb
      .from("products")
      .select("id,name,slug,price,sale_price,sale_start,sale_end,featured,published,currency,category_id,categories(name)")
      .order("created_at", { ascending:false })
      .limit(600);

    if (error) {
      tbody.innerHTML = "";
      if (errEl) { errEl.hidden = false; errEl.textContent = error.message || "Unable to load products."; }
      return;
    }

    all = data || [];
    render();
  }

  function matches(p) {
    const q = String(qEl?.value || "").toLowerCase().trim();
    const cat = catEl?.value || "";
    const pub = pubEl?.value || "";
    const feat = featEl?.value || "";

    if (q) {
      const hay = `${p.name||""} ${p.slug||""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (cat && p.category_id !== cat) return false;
    if (pub === "published" && !p.published) return false;
    if (pub === "hidden" && p.published) return false;
    if (feat === "featured" && !p.featured) return false;
    if (feat === "not_featured" && p.featured) return false;

    return true;
  }

  function saleLabel(p) {
    if (!p.sale_price) return `<span class="muted">—</span>`;
    const hasWindow = !!(p.sale_start || p.sale_end);
    return `
      <div><strong>${esc(fmtPKR(p.sale_price, p.currency || "PKR"))}</strong></div>
      <div class="muted">${hasWindow ? "Timed" : "Manual"}</div>
    `;
  }

  function render() {
    const rows = all.filter(matches);
    if (countEl) countEl.textContent = String(rows.length);

    if (!rows.length) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    tbody.innerHTML = rows.map(p => `
      <tr>
        <td>
          <div><strong>${esc(p.name || "—")}</strong></div>
          <div class="muted">${esc(p.slug || "")}</div>
        </td>
        <td class="muted">${esc(p.categories?.name || "—")}</td>
        <td><strong>${esc(fmtPKR(p.price, p.currency || "PKR"))}</strong></td>
        <td>${saleLabel(p)}</td>
        <td>${p.featured ? `<span class="tag tag--gold">featured</span>` : `<span class="tag">—</span>`}</td>
        <td>${p.published ? `<span class="tag tag--ok">published</span>` : `<span class="tag">hidden</span>`}</td>
        <td>
          <div class="actions">
            <a class="btn btn--secondary btn--sm" href="./product-editor.html?id=${p.id}">Edit</a>
            <button class="btn btn--secondary btn--sm" data-toggle-featured="${p.id}">${p.featured ? "Unfeature" : "Feature"}</button>
            <button class="btn btn--secondary btn--sm" data-toggle-published="${p.id}">${p.published ? "Hide" : "Publish"}</button>
            <button class="btn btn--danger btn--sm" data-delete="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");

    // bind actions
    qsa("[data-toggle-featured]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle-featured");
        const item = all.find(x => x.id === id);
        if (!item) return;

        setBusy(btn, true);
        const { error } = await sb.from("products").update({ featured: !item.featured }).eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Update failed", message:error.message });
        item.featured = !item.featured;
        adminToast({ type:"success", title:"Updated", message:`Featured: ${item.featured ? "ON" : "OFF"}` });
        render();
      });
    });

    qsa("[data-toggle-published]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle-published");
        const item = all.find(x => x.id === id);
        if (!item) return;

        setBusy(btn, true);
        const { error } = await sb.from("products").update({ published: !item.published }).eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Update failed", message:error.message });
        item.published = !item.published;
        adminToast({ type:"success", title:"Updated", message:`Published: ${item.published ? "YES" : "NO"}` });
        render();
      });
    });

    qsa("[data-delete]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete");
        const item = all.find(x => x.id === id);

        const ok = confirmDialog
          ? await confirmDialog({ title:"Delete product", message:`Delete "${item?.name || "this product"}"? This cannot be undone.`, confirmText:"Delete" })
          : window.confirm("Delete product?");

        if (!ok) return;

        setBusy(btn, true, "Deleting…");
        const { error } = await sb.from("products").delete().eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });
        all = all.filter(x => x.id !== id);
        adminToast({ type:"success", title:"Deleted", message:"Product removed." });
        render();
      });
    });
  }

  const rerender = debounce(render, 160);
  qEl?.addEventListener("input", rerender);
  catEl?.addEventListener("change", render);
  pubEl?.addEventListener("change", render);
  featEl?.addEventListener("change", render);

  refreshBtn?.addEventListener("click", loadProducts);

  await loadCategories();
  await loadProducts();
}

/* =============================================================================
  PRODUCT EDITOR PAGE (create/edit + image management)
============================================================================= */
async function initProductEditor() {
  const form = qs("#productForm");
  if (!form) return;

  const sb = getSupabase();
  const confirmDialog = bindConfirmModal();

  // fields
  const idEl = qs("#productId");
  const nameEl = qs("#name");
  const slugEl = qs("#slug");
  const catEl = qs("#category");
  const availEl = qs("#availability");
  const shortEl = qs("#short_description");
  const descEl = qs("#description");

  const currencyEl = qs("#currency");
  const priceEl = qs("#price");
  const salePriceEl = qs("#sale_price");
  const saleStartEl = qs("#sale_start");
  const saleEndEl = qs("#sale_end");
  const compEl = qs("#pricing_components");

  const dimEl = qs("#dimensions");
  const warEl = qs("#warranty");

  const fabricEl = qs("#fabric_options");
  const colorEl = qs("#color_options");
  const marbleEl = qs("#marble_options");

  const seoTitleEl = qs("#seo_title");
  const seoDescEl = qs("#seo_description");

  const featuredEl = qs("#featured");
  const publishedEl = qs("#published");

  const saveTop = qs("[data-save]");
  const saveBottom = qs("[data-save-bottom]");
  const delBtn = qs("[data-delete]");
  const savedEl = qs("[data-saved]");
  const saveErrEl = qs("[data-save-error]");
  const loadErrEl = qs("[data-load-error]");

  const editorTitle = qs("[data-editor-title]");
  const preview = qs("[data-preview]");

  // image ui
  const imageInput = qs("#imageInput");
  const uploadBtn = qs("[data-upload]");
  const imageHint = qs("[data-image-hint]");
  const imageList = qs("[data-image-list]");
  const imageErr = qs("[data-image-error]");

  // slugify
  qs("[data-slugify]")?.addEventListener("click", () => {
    slugEl.value = slugify(nameEl.value);
  });

  // load categories
  const { data: cats, error: catsErr } = await sb
    .from("categories")
    .select("id,name,hidden")
    .order("sort_order", { ascending:true })
    .order("name", { ascending:true });

  if (catsErr) {
    adminToast({ type:"error", title:"Categories", message:"Unable to load categories." });
  } else {
    catEl.innerHTML = `<option value="" disabled>Select…</option>` +
      (cats || []).map(c => `<option value="${c.id}">${esc(c.name)}${c.hidden ? " (hidden)" : ""}</option>`).join("");
  }

  // determine edit/new
  const params = new URLSearchParams(location.search);
  const editId = params.get("id");

  async function loadProduct(id) {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      if (loadErrEl) { loadErrEl.hidden = false; loadErrEl.textContent = error?.message || "Unable to load product."; }
      return null;
    }
    return data;
  }

  function validate() {
    if (!nameEl.value.trim()) return "Name is required.";
    if (!slugEl.value.trim()) return "Slug is required.";
    if (!catEl.value) return "Category is required.";

    const price = Number(priceEl.value);
    if (!Number.isFinite(price) || price <= 0) return "Regular price must be a positive number.";

    const sale = salePriceEl.value ? Number(salePriceEl.value) : null;
    if (sale !== null && (!Number.isFinite(sale) || sale <= 0)) return "Sale price must be a positive number.";
    if (sale !== null && sale >= price) return "Sale price must be less than regular price.";

    const start = saleStartEl.value ? new Date(saleStartEl.value).getTime() : null;
    const end = saleEndEl.value ? new Date(saleEndEl.value).getTime() : null;
    if (start && end && end <= start) return "Sale end must be after sale start.";

    // pricing components JSON (optional)
    const parsed = safeJsonParse(compEl.value);
    if (parsed && parsed.__invalid_json) return "Pricing components JSON is invalid.";

    return null;
  }

  async function upsertProduct() {
    if (savedEl) savedEl.hidden = true;
    if (saveErrEl) saveErrEl.hidden = true;

    const msg = validate();
    if (msg) {
      if (saveErrEl) { saveErrEl.hidden = false; saveErrEl.textContent = msg; }
      return null;
    }

    const payload = {
      name: nameEl.value.trim(),
      slug: slugify(slugEl.value),
      category_id: catEl.value,
      availability: availEl.value,
      short_description: shortEl.value.trim() || null,
      description: descEl.value.trim() || null,

      currency: currencyEl.value || "PKR",
      price: Number(priceEl.value),
      sale_price: salePriceEl.value ? Number(salePriceEl.value) : null,
      sale_start: fromDtLocal(saleStartEl.value),
      sale_end: fromDtLocal(saleEndEl.value),

      pricing_components: compEl.value.trim() ? safeJsonParse(compEl.value.trim()) : null,

      dimensions: dimEl.value.trim() || null,
      warranty: warEl.value.trim() || null,

      fabric_options: parseCsvToArray(fabricEl.value),
      color_options: parseCsvToArray(colorEl.value),
      marble_options: parseCsvToArray(marbleEl.value),

      seo_title: seoTitleEl.value.trim() || null,
      seo_description: seoDescEl.value.trim() || null,

      featured: Boolean(featuredEl.checked),
      published: Boolean(publishedEl.checked),
      updated_at: new Date().toISOString(),
    };

    const id = idEl.value || null;

    let res;
    if (!id) {
      res = await sb.from("products").insert(payload).select("*").maybeSingle();
    } else {
      res = await sb.from("products").update(payload).eq("id", id).select("*").maybeSingle();
    }

    if (res.error) {
      if (saveErrEl) { saveErrEl.hidden = false; saveErrEl.textContent = res.error.message || "Save failed."; }
      adminToast({ type:"error", title:"Save failed", message: res.error.message || "Unable to save." });
      return null;
    }

    const saved = res.data;
    idEl.value = saved.id;

    if (editorTitle) editorTitle.textContent = saved.name ? `Edit: ${saved.name}` : "Edit product";
    if (preview) {
      preview.hidden = false;
      preview.href = `../product.html?slug=${encodeURIComponent(saved.slug)}`;
    }
    if (delBtn) delBtn.hidden = false;

    // enable uploads
    if (uploadBtn) uploadBtn.disabled = false;
    if (imageHint) imageHint.hidden = true;

    adminToast({ type:"success", title:"Saved", message:"Product updated successfully." });
    if (savedEl) savedEl.hidden = false;

    // refresh images
    await loadImages(saved.id);

    return saved;
  }

  // bind save buttons
  const saveHandler = async () => {
    setBusy(saveTop, true, "Saving…");
    setBusy(saveBottom, true, "Saving…");
    await upsertProduct();
    setBusy(saveTop, false);
    setBusy(saveBottom, false);
  };
  saveTop?.addEventListener("click", saveHandler);
  saveBottom?.addEventListener("click", saveHandler);

  // delete product
  delBtn?.addEventListener("click", async () => {
    const id = idEl.value;
    if (!id) return;

    const ok = confirmDialog
      ? await confirmDialog({ title:"Delete product", message:"This will delete the product record. Images can remain in storage if not removed.", confirmText:"Delete" })
      : window.confirm("Delete product?");

    if (!ok) return;

    setBusy(delBtn, true, "Deleting…");
    const { error } = await sb.from("products").delete().eq("id", id);
    setBusy(delBtn, false);

    if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });
    adminToast({ type:"success", title:"Deleted", message:"Product deleted." });
    location.href = "./products.html";
  });

  /* -----------------------
    Images
  ------------------------ */
  const MAX_MB = 8;
  const allowed = ["image/jpeg","image/png","image/webp","image/avif"];

  function validateFiles(files) {
    for (const f of files) {
      if (!allowed.includes(f.type)) return `Unsupported file type: ${f.type}`;
      if (f.size > MAX_MB * 1024 * 1024) return `File too large (max ${MAX_MB}MB): ${f.name}`;
    }
    return null;
  }

  imageInput?.addEventListener("change", () => {
    const files = imageInput.files ? Array.from(imageInput.files) : [];
    uploadBtn.disabled = !(files.length && idEl.value);
  });

  async function loadImages(productId) {
    if (!imageList) return;
    if (imageErr) imageErr.hidden = true;

    imageList.innerHTML = `<div class="muted">Loading images…</div>`;

    const { data, error } = await sb
      .from("product_images")
      .select("id,product_id,path,alt,sort_order,is_primary,created_at")
      .eq("product_id", productId)
      .order("is_primary", { ascending:false })
      .order("sort_order", { ascending:true })
      .order("created_at", { ascending:true });

    if (error) {
      imageList.innerHTML = "";
      if (imageErr) { imageErr.hidden = false; imageErr.textContent = error.message || "Unable to load images."; }
      return;
    }

    const imgs = data || [];
    if (!imgs.length) {
      imageList.innerHTML = `<div class="notice notice--info">No images yet.</div>`;
      return;
    }

    imageList.innerHTML = imgs.map((img) => {
      const url = storagePublicUrl(img.path) || "../assets/images/placeholder-product.svg";
      return `
        <div class="imageItem" data-img="${img.id}">
          <img src="${esc(url)}" alt="${esc(img.alt || "Product image")}" loading="lazy" />
          <div class="imageItem__meta">
            <div class="imageItem__row">
              ${img.is_primary ? `<span class="tag tag--gold">primary</span>` : `<span class="tag">image</span>`}
              <span class="muted small">Sort: ${img.sort_order ?? 0}</span>
            </div>
            <div class="field">
              <label>Alt text</label>
              <input data-alt value="${esc(img.alt || "")}" placeholder="Alt text (accessibility/SEO)" />
            </div>
            <div class="imageItem__row">
              <button class="btn btn--secondary btn--sm" type="button" data-set-primary>Set primary</button>
              <button class="btn btn--secondary btn--sm" type="button" data-up>Up</button>
              <button class="btn btn--secondary btn--sm" type="button" data-down>Down</button>
              <button class="btn btn--danger btn--sm" type="button" data-remove>Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // bind actions
    qsa("[data-img]", imageList).forEach((row) => {
      const imgId = row.getAttribute("data-img");
      const altInput = qs("[data-alt]", row);

      altInput?.addEventListener("change", async () => {
        const alt = altInput.value.trim() || null;
        const { error } = await sb.from("product_images").update({ alt }).eq("id", imgId);
        if (error) adminToast({ type:"error", title:"Alt update failed", message:error.message });
      });

      qs("[data-set-primary]", row)?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        setBusy(btn, true);
        // set all to false, then set chosen true (transaction handled by DB constraints/policies later)
        const { error: e1 } = await sb.from("product_images").update({ is_primary:false }).eq("product_id", productId);
        const { error: e2 } = await sb.from("product_images").update({ is_primary:true }).eq("id", imgId);
        setBusy(btn, false);
        if (e1 || e2) return adminToast({ type:"error", title:"Primary failed", message:(e1||e2).message });
        adminToast({ type:"success", title:"Updated", message:"Primary image set." });
        await loadImages(productId);
      });

      qs("[data-up]", row)?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        setBusy(btn, true);

        const { data: img } = await sb.from("product_images").select("id,sort_order").eq("id", imgId).maybeSingle();
        const current = img?.sort_order ?? 0;

        const { data: prev } = await sb
          .from("product_images")
          .select("id,sort_order")
          .eq("product_id", productId)
          .lt("sort_order", current)
          .order("sort_order", { ascending:false })
          .limit(1);

        if (!prev?.length) { setBusy(btn,false); return; }
        const p = prev[0];

        await sb.from("product_images").update({ sort_order: p.sort_order }).eq("id", imgId);
        await sb.from("product_images").update({ sort_order: current }).eq("id", p.id);

        setBusy(btn, false);
        await loadImages(productId);
      });

      qs("[data-down]", row)?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        setBusy(btn, true);

        const { data: img } = await sb.from("product_images").select("id,sort_order").eq("id", imgId).maybeSingle();
        const current = img?.sort_order ?? 0;

        const { data: next } = await sb
          .from("product_images")
          .select("id,sort_order")
          .eq("product_id", productId)
          .gt("sort_order", current)
          .order("sort_order", { ascending:true })
          .limit(1);

        if (!next?.length) { setBusy(btn,false); return; }
        const n = next[0];

        await sb.from("product_images").update({ sort_order: n.sort_order }).eq("id", imgId);
        await sb.from("product_images").update({ sort_order: current }).eq("id", n.id);

        setBusy(btn, false);
        await loadImages(productId);
      });

      qs("[data-remove]", row)?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;

        const ok = window.confirm("Delete this image? This removes DB row and storage object.");
        if (!ok) return;

        setBusy(btn, true, "Deleting…");

        // fetch path then delete
        const { data: img, error: e0 } = await sb.from("product_images").select("id,path").eq("id", imgId).maybeSingle();
        if (e0 || !img) { setBusy(btn,false); return adminToast({ type:"error", title:"Delete failed", message:e0?.message || "Not found." }); }

        const { error: e1 } = await sb.from("product_images").delete().eq("id", imgId);
        const { error: e2 } = await sb.storage.from(SUPABASE.storage.bucket).remove([img.path]);

        setBusy(btn, false);

        if (e1 || e2) return adminToast({ type:"error", title:"Delete failed", message:(e1||e2).message });
        adminToast({ type:"success", title:"Deleted", message:"Image removed." });
        await loadImages(productId);
      });
    });
  }

  async function uploadImages() {
    const productId = idEl.value;
    if (!productId) return;

    const files = imageInput.files ? Array.from(imageInput.files) : [];
    if (!files.length) return;

    if (imageErr) imageErr.hidden = true;

    const v = validateFiles(files);
    if (v) {
      if (imageErr) { imageErr.hidden = false; imageErr.textContent = v; }
      return;
    }

    setBusy(uploadBtn, true, "Uploading…");

    // Determine next sort_order start
    const { data: existing } = await sb
      .from("product_images")
      .select("sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending:false })
      .limit(1);

    let nextOrder = (existing?.[0]?.sort_order ?? 0) + 10;

    for (const file of files) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `products/${productId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await sb.storage.from(SUPABASE.storage.bucket).upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: "3600",
      });

      if (upErr) {
        setBusy(uploadBtn, false);
        if (imageErr) { imageErr.hidden = false; imageErr.textContent = upErr.message; }
        return;
      }

      const { error: insErr } = await sb.from("product_images").insert({
        product_id: productId,
        path,
        alt: null,
        sort_order: nextOrder,
        is_primary: false,
      });

      if (insErr) {
        setBusy(uploadBtn, false);
        if (imageErr) { imageErr.hidden = false; imageErr.textContent = insErr.message; }
        return;
      }

      nextOrder += 10;
    }

    // if no primary exists, set first as primary
    const { data: prim } = await sb
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .eq("is_primary", true)
      .limit(1);

    if (!prim?.length) {
      const { data: first } = await sb
        .from("product_images")
        .select("id")
        .eq("product_id", productId)
        .order("sort_order", { ascending:true })
        .limit(1);

      if (first?.[0]?.id) {
        await sb.from("product_images").update({ is_primary:true }).eq("id", first[0].id);
      }
    }

    imageInput.value = "";
    setBusy(uploadBtn, false);
    adminToast({ type:"success", title:"Uploaded", message:"Images uploaded successfully." });
    await loadImages(productId);
  }

  uploadBtn?.addEventListener("click", uploadImages);

  // preload if editing
  if (editId) {
    if (editorTitle) editorTitle.textContent = "Loading…";

    const p = await loadProduct(editId);
    if (!p) return;

    idEl.value = p.id;

    if (editorTitle) editorTitle.textContent = `Edit: ${p.name || "Product"}`;
    qs("[data-editor-subtitle]") && (qs("[data-editor-subtitle]").textContent = `Editing ${p.slug || ""}`);

    nameEl.value = p.name || "";
    slugEl.value = p.slug || "";
    catEl.value = p.category_id || "";
    availEl.value = p.availability || "in_stock";
    shortEl.value = p.short_description || "";
    descEl.value = p.description || "";

    currencyEl.value = p.currency || "PKR";
    priceEl.value = p.price ?? "";
    salePriceEl.value = p.sale_price ?? "";
    saleStartEl.value = dtLocalValue(p.sale_start);
    saleEndEl.value = dtLocalValue(p.sale_end);

    compEl.value = p.pricing_components ? JSON.stringify(p.pricing_components, null, 2) : "";

    dimEl.value = p.dimensions || "";
    warEl.value = p.warranty || "";

    fabricEl.value = arrayToCsv(p.fabric_options);
    colorEl.value = arrayToCsv(p.color_options);
    marbleEl.value = arrayToCsv(p.marble_options);

    seoTitleEl.value = p.seo_title || "";
    seoDescEl.value = p.seo_description || "";

    featuredEl.checked = !!p.featured;
    publishedEl.checked = !!p.published;

    if (preview) {
      preview.hidden = false;
      preview.href = `../product.html?slug=${encodeURIComponent(p.slug)}`;
    }
    if (delBtn) delBtn.hidden = false;

    // enable upload
    if (uploadBtn) uploadBtn.disabled = false;
    if (imageHint) imageHint.hidden = true;

    await loadImages(p.id);
  } else {
    // new product mode
    if (qs("[data-editor-title]")) qs("[data-editor-title]").textContent = "Add Product";
    if (uploadBtn) uploadBtn.disabled = true;
    if (imageHint) imageHint.hidden = false;
  }
}

/* =============================================================================
  Boot
============================================================================= */
(async function boot() {
  const page = document.body.getAttribute("data-admin-page") || "";

  if (page === "products") await initProductsList();
  if (page === "product-editor") await initProductEditor();
})();
