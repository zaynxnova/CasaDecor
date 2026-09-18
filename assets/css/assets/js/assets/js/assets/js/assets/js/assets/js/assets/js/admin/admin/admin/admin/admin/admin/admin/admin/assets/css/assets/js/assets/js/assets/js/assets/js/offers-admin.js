import { getSupabase } from "./supabase.js";
import { adminToast, bindConfirmModal, bindDrawer, setBusy } from "./admin.js";

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function esc(s=""){
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function debounce(fn, ms=160){ let t=null; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }
function dtLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (x)=>String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDtLocal(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function initOffers(){
  const tbody = qs("[data-offers-tbody]");
  if (!tbody) return;

  const sb = getSupabase();
  const confirmDialog = bindConfirmModal();
  const drawerApi = bindDrawer();

  const qEl = qs("#q");
  const stateEl = qs("#state");
  const refreshBtn = qs("[data-refresh]");
  const openBtn = qs("[data-open-editor]");
  const errEl = qs("[data-error]");
  const emptyEl = qs("[data-empty]");

  // drawer form
  const form = qs("#offerForm");
  const editorTitle = qs("[data-editor-title]");
  const idEl = qs("#offerId");
  const titleEl = qs("#title");
  const descEl = qs("#description");
  const typeEl = qs("#discount_type");
  const valEl = qs("#discount_value");
  const startEl = qs("#start_at");
  const endEl = qs("#end_at");
  const activeEl = qs("#active");
  const delBtn = qs("[data-delete]");
  const formErr = qs("[data-form-error]");
  const saved = qs("[data-form-saved]");

  let all = [];

  function resetForm(){
    idEl.value = "";
    titleEl.value = "";
    descEl.value = "";
    typeEl.value = "percentage";
    valEl.value = "";
    startEl.value = "";
    endEl.value = "";
    activeEl.checked = false;
    delBtn.hidden = true;
    formErr.hidden = true;
    saved.hidden = true;
  }

  function fillForm(o){
    idEl.value = o.id;
    titleEl.value = o.title || "";
    descEl.value = o.description || "";
    typeEl.value = o.discount_type || "percentage";
    valEl.value = o.discount_value ?? "";
    startEl.value = dtLocalValue(o.start_at);
    endEl.value = dtLocalValue(o.end_at);
    activeEl.checked = !!o.active;
    delBtn.hidden = false;
    formErr.hidden = true;
    saved.hidden = true;
  }

  function matches(o){
    const q = String(qEl?.value || "").toLowerCase().trim();
    const st = stateEl?.value || "";
    if (q) {
      const hay = `${o.title||""} ${o.description||""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (st === "active" && !o.active) return false;
    if (st === "inactive" && o.active) return false;
    return true;
  }

  function discountLabel(o){
    if (!o.discount_value) return "—";
    if (o.discount_type === "fixed") return `Fixed ${o.discount_value}`;
    return `${o.discount_value}%`;
  }

  function render(){
    if (errEl) errEl.hidden = true;
    const rows = all.filter(matches);

    if (!rows.length){
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    tbody.innerHTML = rows.map(o => `
      <tr>
        <td>
          <div><strong>${esc(o.title || "—")}</strong></div>
          <div class="muted">${esc(o.description || "")}</div>
        </td>
        <td>${esc(discountLabel(o))}</td>
        <td class="muted">${o.start_at ? esc(new Date(o.start_at).toLocaleString()) : "—"}</td>
        <td class="muted">${o.end_at ? esc(new Date(o.end_at).toLocaleString()) : "—"}</td>
        <td>${o.active ? `<span class="tag tag--ok">active</span>` : `<span class="tag">inactive</span>`}</td>
        <td>
          <div class="actions">
            <button class="btn btn--secondary btn--sm" data-edit="${o.id}">Edit</button>
            <button class="btn btn--secondary btn--sm" data-toggle="${o.id}">${o.active ? "Deactivate" : "Activate"}</button>
            <button class="btn btn--danger btn--sm" data-delete-row="${o.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");

    qsa("[data-edit]", tbody).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const o = all.find(x => x.id === id);
        if (!o) return;
        resetForm();
        if (editorTitle) editorTitle.textContent = "Edit Offer";
        fillForm(o);
        drawerApi?.open();
      });
    });

    qsa("[data-toggle]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle");
        const o = all.find(x => x.id === id);
        if (!o) return;

        setBusy(btn, true);
        const { error } = await sb.from("offers").update({ active: !o.active }).eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Update failed", message:error.message });
        o.active = !o.active;
        adminToast({ type:"success", title:"Updated", message:`Active: ${o.active ? "YES" : "NO"}` });
        render();
      });
    });

    qsa("[data-delete-row]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-row");
        const o = all.find(x => x.id === id);

        const ok = confirmDialog
          ? await confirmDialog({ title:"Delete offer", message:`Delete "${o?.title || "this offer"}"?`, confirmText:"Delete" })
          : window.confirm("Delete offer?");

        if (!ok) return;

        setBusy(btn, true, "Deleting…");
        const { error } = await sb.from("offers").delete().eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });
        all = all.filter(x => x.id !== id);
        adminToast({ type:"success", title:"Deleted", message:"Offer removed." });
        render();
      });
    });
  }

  async function load(){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    if (errEl) errEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    const { data, error } = await sb
      .from("offers")
      .select("*")
      .order("created_at", { ascending:false })
      .limit(400);

    if (error){
      tbody.innerHTML = "";
      if (errEl){ errEl.hidden=false; errEl.textContent = error.message || "Unable to load offers."; }
      return;
    }

    all = data || [];
    render();
  }

  openBtn?.addEventListener("click", () => {
    resetForm();
    if (editorTitle) editorTitle.textContent = "Add Offer";
    drawerApi?.open();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    formErr.hidden = true;
    saved.hidden = true;

    const payload = {
      title: titleEl.value.trim(),
      description: descEl.value.trim() || null,
      discount_type: typeEl.value || "percentage",
      discount_value: valEl.value ? Number(valEl.value) : null,
      start_at: fromDtLocal(startEl.value),
      end_at: fromDtLocal(endEl.value),
      active: Boolean(activeEl.checked),
      updated_at: new Date().toISOString(),
    };

    if (!payload.title){
      formErr.hidden = false;
      formErr.textContent = "Title is required.";
      return;
    }
    if (payload.discount_value !== null && (!Number.isFinite(payload.discount_value) || payload.discount_value < 0)) {
      formErr.hidden = false;
      formErr.textContent = "Discount value must be a valid number.";
      return;
    }
    if (payload.start_at && payload.end_at && new Date(payload.end_at) <= new Date(payload.start_at)) {
      formErr.hidden = false;
      formErr.textContent = "End must be after start.";
      return;
    }

    const id = idEl.value || null;
    const submitBtn = form.querySelector("button[type='submit']");
    setBusy(submitBtn, true, "Saving…");

    const res = !id
      ? await sb.from("offers").insert(payload).select("*").maybeSingle()
      : await sb.from("offers").update(payload).eq("id", id).select("*").maybeSingle();

    setBusy(submitBtn, false);

    if (res.error){
      formErr.hidden = false;
      formErr.textContent = res.error.message || "Save failed.";
      return;
    }

    idEl.value = res.data.id;
    delBtn.hidden = false;
    saved.hidden = false;
    adminToast({ type:"success", title:"Saved", message:"Offer saved." });
    await load();
  });

  delBtn?.addEventListener("click", async () => {
    const id = idEl.value;
    if (!id) return;

    const ok = confirmDialog
      ? await confirmDialog({ title:"Delete offer", message:"Delete this offer?", confirmText:"Delete" })
      : window.confirm("Delete offer?");

    if (!ok) return;

    setBusy(delBtn, true, "Deleting…");
    const { error } = await sb.from("offers").delete().eq("id", id);
    setBusy(delBtn, false);

    if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });

    adminToast({ type:"success", title:"Deleted", message:"Offer removed." });
    drawerApi?.close();
    await load();
  });

  refreshBtn?.addEventListener("click", load);
  qEl?.addEventListener("input", debounce(render, 160));
  stateEl?.addEventListener("change", render);

  await load();
}

initOffers();
