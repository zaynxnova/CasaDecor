import { SUPABASE } from "./config.js";
import { getSupabase, storagePublicUrl } from "./supabase.js";
import { adminToast, bindConfirmModal, bindDrawer, slugify, setBusy } from "./admin.js";

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function esc(s=""){
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function debounce(fn, ms=160){ let t=null; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }

async function initCategories() {
  const tbody = qs("[data-categories-tbody]");
  if (!tbody) return;

  const sb = getSupabase();
  const confirmDialog = bindConfirmModal();
  const drawerApi = bindDrawer();

  const qEl = qs("#q");
  const refreshBtn = qs("[data-refresh]");
  const openBtn = qs("[data-open-editor]");
  const errEl = qs("[data-error]");
  const emptyEl = qs("[data-empty]");

  // drawer form
  const form = qs("#categoryForm");
  const editorTitle = qs("[data-editor-title]");
  const idEl = qs("#catId");
  const nameEl = qs("#name");
  const slugEl = qs("#slug");
  const descEl = qs("#description");
  const sortEl = qs("#sort_order");
  const hiddenEl = qs("#hidden");
  const imgInput = qs("#imageInput");
  const uploadBtn = qs("[data-upload]");
  const preview = qs("[data-image-preview]");
  const previewImg = preview?.querySelector("img");
  const removeImageBtn = qs("[data-remove-image]");
  const deleteBtn = qs("[data-delete]");
  const formErr = qs("[data-form-error]");
  const saved = qs("[data-form-saved]");

  let all = [];

  qs("[data-slugify]")?.addEventListener("click", () => {
    slugEl.value = slugify(nameEl.value);
  });

  function resetForm() {
    idEl.value = "";
    nameEl.value = "";
    slugEl.value = "";
    descEl.value = "";
    sortEl.value = "";
    hiddenEl.checked = false;
    imgInput.value = "";
    formErr.hidden = true;
    saved.hidden = true;
    deleteBtn.hidden = true;
    preview.hidden = true;
    previewImg.src = "";
    previewImg.dataset.path = "";
  }

  function fillForm(c) {
    idEl.value = c.id;
    nameEl.value = c.name || "";
    slugEl.value = c.slug || "";
    descEl.value = c.description || "";
    sortEl.value = c.sort_order ?? "";
    hiddenEl.checked = !!c.hidden;

    saved.hidden = true;
    formErr.hidden = true;
    deleteBtn.hidden = false;

    if (c.image_path) {
      preview.hidden = false;
      previewImg.src = storagePublicUrl(c.image_path) || "../assets/images/placeholder-category.svg";
      previewImg.dataset.path = c.image_path;
    } else {
      preview.hidden = true;
      previewImg.dataset.path = "";
    }
  }

  function matches(c) {
    const q = String(qEl?.value || "").toLowerCase().trim();
    if (!q) return true;
    const hay = `${c.name||""} ${c.slug||""}`.toLowerCase();
    return hay.includes(q);
  }

  function render() {
    if (errEl) errEl.hidden = true;
    const rows = all.filter(matches);

    if (!rows.length) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    tbody.innerHTML = rows.map(c => `
      <tr>
        <td>
          <div><strong>${esc(c.name || "—")}</strong></div>
          <div class="muted">${c.image_path ? "Has image" : "No image"}</div>
        </td>
        <td class="muted">${esc(c.slug || "—")}</td>
        <td>${c.hidden ? `<span class="tag">hidden</span>` : `<span class="tag tag--ok">visible</span>`}</td>
        <td class="muted">${esc(String(c.sort_order ?? "—"))}</td>
        <td>
          <div class="actions">
            <button class="btn btn--secondary btn--sm" data-edit="${c.id}">Edit</button>
            <button class="btn btn--secondary btn--sm" data-toggle="${c.id}">${c.hidden ? "Unhide" : "Hide"}</button>
            <button class="btn btn--danger btn--sm" data-delete-row="${c.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");

    qsa("[data-edit]", tbody).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const c = all.find(x => x.id === id);
        if (!c) return;
        resetForm();
        if (editorTitle) editorTitle.textContent = "Edit Category";
        fillForm(c);
        drawerApi?.open();
      });
    });

    qsa("[data-toggle]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle");
        const c = all.find(x => x.id === id);
        if (!c) return;

        setBusy(btn, true);
        const { error } = await sb.from("categories").update({ hidden: !c.hidden }).eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Update failed", message:error.message });
        c.hidden = !c.hidden;
        adminToast({ type:"success", title:"Updated", message:`Hidden: ${c.hidden ? "YES" : "NO"}` });
        render();
      });
    });

    qsa("[data-delete-row]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-row");
        const c = all.find(x => x.id === id);

        const ok = confirmDialog
          ? await confirmDialog({ title:"Delete category", message:`Delete "${c?.name || "this category"}"? Products in this category will need reassignment.`, confirmText:"Delete" })
          : window.confirm("Delete category?");

        if (!ok) return;

        setBusy(btn, true, "Deleting…");
        const { error } = await sb.from("categories").delete().eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });
        all = all.filter(x => x.id !== id);
        adminToast({ type:"success", title:"Deleted", message:"Category removed." });
        render();
      });
    });
  }

  async function load() {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;
    if (errEl) errEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    const { data, error } = await sb
      .from("categories")
      .select("*")
      .order("sort_order", { ascending:true })
      .order("name", { ascending:true });

    if (error) {
      tbody.innerHTML = "";
      if (errEl) { errEl.hidden = false; errEl.textContent = error.message || "Unable to load categories."; }
      return;
    }

    all = data || [];
    render();
  }

  // open add
  openBtn?.addEventListener("click", () => {
    resetForm();
    if (editorTitle) editorTitle.textContent = "Add Category";
    drawerApi?.open();
  });

  // upload image
  uploadBtn?.addEventListener("click", async () => {
    const id = idEl.value;
    const file = imgInput.files?.[0];
    if (!file) return;

    // allow upload for new category? must save first to get id
    if (!id) {
      adminToast({ type:"error", title:"Save first", message:"Create the category first, then upload the image." });
      return;
    }

    if (!file.type.startsWith("image/")) {
      adminToast({ type:"error", title:"Invalid file", message:"Please select an image." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      adminToast({ type:"error", title:"File too large", message:"Max 8MB per image." });
      return;
    }

    setBusy(uploadBtn, true, "Uploading…");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `categories/${id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await sb.storage.from(SUPABASE.storage.bucket).upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      setBusy(uploadBtn, false);
      return adminToast({ type:"error", title:"Upload failed", message: upErr.message });
    }

    const { error: dbErr } = await sb.from("categories").update({ image_path: path }).eq("id", id);
    setBusy(uploadBtn, false);

    if (dbErr) return adminToast({ type:"error", title:"Update failed", message: dbErr.message });

    preview.hidden = false;
    previewImg.src = storagePublicUrl(path);
    previewImg.dataset.path = path;

    adminToast({ type:"success", title:"Uploaded", message:"Category image updated." });
    await load();
  });

  removeImageBtn?.addEventListener("click", async () => {
    const id = idEl.value;
    const path = previewImg?.dataset?.path;
    if (!id) return;

    const ok = window.confirm("Remove category image? (Storage file will also be deleted)");
    if (!ok) return;

    // Update DB
    const { error: e1 } = await sb.from("categories").update({ image_path: null }).eq("id", id);
    // Remove file
    if (path) await sb.storage.from(SUPABASE.storage.bucket).remove([path]);

    if (e1) return adminToast({ type:"error", title:"Remove failed", message:e1.message });

    preview.hidden = true;
    previewImg.dataset.path = "";
    adminToast({ type:"success", title:"Removed", message:"Category image removed." });
    await load();
  });

  // save category
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    formErr.hidden = true;
    saved.hidden = true;

    const payload = {
      name: nameEl.value.trim(),
      slug: slugify(slugEl.value),
      description: descEl.value.trim() || null,
      sort_order: sortEl.value ? Number(sortEl.value) : 0,
      hidden: Boolean(hiddenEl.checked),
      updated_at: new Date().toISOString(),
    };

    if (!payload.name) {
      formErr.hidden = false;
      formErr.textContent = "Name is required.";
      return;
    }
    if (!payload.slug) {
      formErr.hidden = false;
      formErr.textContent = "Slug is required.";
      return;
    }

    const id = idEl.value || null;

    let res;
    const submitBtn = form.querySelector("button[type='submit']");
    setBusy(submitBtn, true, "Saving…");

    if (!id) {
      res = await sb.from("categories").insert(payload).select("*").maybeSingle();
    } else {
      res = await sb.from("categories").update(payload).eq("id", id).select("*").maybeSingle();
    }

    setBusy(submitBtn, false);

    if (res.error) {
      formErr.hidden = false;
      formErr.textContent = res.error.message || "Save failed.";
      return;
    }

    const savedCat = res.data;
    idEl.value = savedCat.id;
    deleteBtn.hidden = false;

    saved.hidden = false;
    adminToast({ type:"success", title:"Saved", message:"Category saved." });
    await load();
  });

  // delete from editor
  deleteBtn?.addEventListener("click", async () => {
    const id = idEl.value;
    if (!id) return;

    const ok = confirmDialog
      ? await confirmDialog({ title:"Delete category", message:"Delete this category?", confirmText:"Delete" })
      : window.confirm("Delete category?");

    if (!ok) return;

    setBusy(deleteBtn, true, "Deleting…");
    const { error } = await sb.from("categories").delete().eq("id", id);
    setBusy(deleteBtn, false);

    if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });

    adminToast({ type:"success", title:"Deleted", message:"Category removed." });
    drawerApi?.close();
    await load();
  });

  refreshBtn?.addEventListener("click", load);
  qEl?.addEventListener("input", debounce(render, 160));

  await load();
}

initCategories();
