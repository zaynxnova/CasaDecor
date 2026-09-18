import { getSupabase } from "./supabase.js";
import { adminToast, bindConfirmModal, setBusy } from "./admin.js";

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function esc(s=""){
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function debounce(fn, ms=160){ let t=null; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }
function fmtDT(iso){
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

async function initInquiries(){
  const tbody = qs("[data-inquiries-tbody]");
  if (!tbody) return;

  const sb = getSupabase();
  const confirmDialog = bindConfirmModal();

  const qEl = qs("#q");
  const statusEl = qs("#status");
  const refreshBtn = qs("[data-refresh]");
  const countEl = qs("[data-count]");
  const errEl = qs("[data-error]");
  const emptyEl = qs("[data-empty]");

  // view modal
  const viewModal = qs("[data-view-modal]");
  const viewBody = qs("[data-view-body]");
  const viewCloseEls = qsa("[data-view-close]");
  const openView = (html) => { viewBody.innerHTML = html; viewModal.hidden = false; };
  const closeView = () => { viewModal.hidden = true; };
  viewCloseEls.forEach(el => el.addEventListener("click", closeView));
  window.addEventListener("keydown",(e)=>{ if(e.key==="Escape" && !viewModal.hidden) closeView(); });

  let all = [];

  function matches(i){
    const q = String(qEl?.value || "").toLowerCase().trim();
    const st = statusEl?.value || "";
    if (st && i.status !== st) return false;
    if (!q) return true;
    const hay = `${i.name||""} ${i.phone||""} ${i.email||""} ${i.product_name||""} ${i.product_slug||""} ${i.interested_in||""} ${i.message||""}`.toLowerCase();
    return hay.includes(q);
  }

  function statusTag(s){
    if (s === "new") return `<span class="tag tag--gold">new</span>`;
    if (s === "contacted") return `<span class="tag">contacted</span>`;
    if (s === "completed") return `<span class="tag tag--ok">completed</span>`;
    if (s === "archived") return `<span class="tag">archived</span>`;
    return `<span class="tag">${esc(s||"—")}</span>`;
  }

  function render(){
    if (errEl) errEl.hidden = true;

    const rows = all.filter(matches);
    if (countEl) countEl.textContent = String(rows.length);

    if (!rows.length){
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    tbody.innerHTML = rows.map(i => `
      <tr>
        <td>
          <div><strong>${esc(i.name || "—")}</strong></div>
          <div class="muted">${esc(i.phone || "")}${i.email ? " • " + esc(i.email) : ""}</div>
        </td>
        <td class="muted">${esc(i.product_name || i.interested_in || "—")}</td>
        <td class="muted">${esc(String(i.message||"").slice(0, 90))}${(i.message||"").length>90 ? "…" : ""}</td>
        <td>
          <select data-status="${i.id}">
            <option value="new" ${i.status==="new"?"selected":""}>New</option>
            <option value="contacted" ${i.status==="contacted"?"selected":""}>Contacted</option>
            <option value="completed" ${i.status==="completed"?"selected":""}>Completed</option>
            <option value="archived" ${i.status==="archived"?"selected":""}>Archived</option>
          </select>
          <div class="small muted" style="margin-top:6px">${statusTag(i.status)}</div>
        </td>
        <td class="muted">${esc(fmtDT(i.created_at))}</td>
        <td>
          <div class="actions">
            <button class="btn btn--secondary btn--sm" data-view="${i.id}">View</button>
            <button class="btn btn--danger btn--sm" data-delete="${i.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");

    // bind status changes
    qsa("[data-status]", tbody).forEach(sel => {
      sel.addEventListener("change", async () => {
        const id = sel.getAttribute("data-status");
        const status = sel.value;

        const { error } = await sb.from("inquiries").update({ status }).eq("id", id);
        if (error) return adminToast({ type:"error", title:"Update failed", message:error.message });

        const item = all.find(x => x.id === id);
        if (item) item.status = status;

        adminToast({ type:"success", title:"Updated", message:`Status: ${status}` });
        render();
      });
    });

    qsa("[data-view]", tbody).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-view");
        const i = all.find(x => x.id === id);
        if (!i) return;

        openView(`
          <div class="form">
            <div class="notice notice--info">
              <div><strong>${esc(i.name || "—")}</strong></div>
              <div class="muted">${esc(i.phone || "")}${i.email ? " • " + esc(i.email) : ""}</div>
              <div class="muted small">Created: ${esc(fmtDT(i.created_at))}</div>
            </div>

            <div class="field">
              <label>Interested In</label>
              <input value="${esc(i.product_name || i.interested_in || "—")}" readonly />
            </div>

            <div class="field">
              <label>Product slug</label>
              <input value="${esc(i.product_slug || "")}" readonly />
            </div>

            <div class="field">
              <label>Message</label>
              <textarea rows="7" readonly>${esc(i.message || "")}</textarea>
            </div>

            <div class="field">
              <label>Status</label>
              <input value="${esc(i.status || "")}" readonly />
            </div>
          </div>
        `);
      });
    });

    qsa("[data-delete]", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete");
        const i = all.find(x => x.id === id);

        const ok = confirmDialog
          ? await confirmDialog({ title:"Delete inquiry", message:`Delete inquiry from "${i?.name || "customer"}"?`, confirmText:"Delete" })
          : window.confirm("Delete inquiry?");

        if (!ok) return;

        setBusy(btn, true, "Deleting…");
        const { error } = await sb.from("inquiries").delete().eq("id", id);
        setBusy(btn, false);

        if (error) return adminToast({ type:"error", title:"Delete failed", message:error.message });

        all = all.filter(x => x.id !== id);
        adminToast({ type:"success", title:"Deleted", message:"Inquiry removed." });
        render();
      });
    });
  }

  async function load(){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    if (errEl) errEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    const { data, error } = await sb
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending:false })
      .limit(800);

    if (error){
      tbody.innerHTML = "";
      if (errEl) { errEl.hidden=false; errEl.textContent = error.message || "Unable to load inquiries."; }
      return;
    }

    all = data || [];
    render();
  }

  refreshBtn?.addEventListener("click", load);
  qEl?.addEventListener("input", debounce(render, 160));
  statusEl?.addEventListener("change", render);

  await load();
}

initInquiries();
