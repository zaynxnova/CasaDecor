import { SUPABASE } from "./config.js";
import { getSupabase, isSupabaseConfigured, storagePublicUrl, fetchPublicSettings } from "./supabase.js";

/* =============================================================================
  Helpers
============================================================================= */
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function esc(s="") {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function fmtDT(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function debounce(fn, ms=200) {
  let t=null;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}
export function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
export function parseCsvToArray(s) {
  return String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}
export function arrayToCsv(a) {
  if (!a) return "";
  if (Array.isArray(a)) return a.filter(Boolean).join(", ");
  return String(a);
}
export function adminToast({ type="info", title="Notice", message="" } = {}) {
  const mount = qs("#adminToastMount");
  if (!mount) return;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <div>
      <div class="toast__title">${esc(title)}</div>
      <div class="toast__msg">${esc(message)}</div>
    </div>
    <button class="toast__close" type="button" aria-label="Close"><span aria-hidden="true">×</span></button>
  `;
  el.querySelector(".toast__close").addEventListener("click", () => el.remove());
  mount.appendChild(el);
  setTimeout(()=>el.remove(), 5200);
}

export function setBusy(btn, busy=true, label="Working…") {
  if (!btn) return;
  if (busy) {
    btn.dataset._old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
  } else {
    btn.disabled = false;
    if (btn.dataset._old) btn.textContent = btn.dataset._old;
  }
}

/* =============================================================================
  Modal confirm (shared)
============================================================================= */
export function bindConfirmModal() {
  const modal = qs("[data-modal]");
  if (!modal) return null;

  const closeEls = qsa("[data-modal-close], [data-modal-cancel]", modal);
  const titleEl = qs("[data-modal-title]", modal);
  const bodyEl = qs("[data-modal-body]", modal);
  const confirmBtn = qs("[data-modal-confirm]", modal);

  let resolver = null;

  const close = () => {
    modal.hidden = true;
    resolver = null;
  };

  closeEls.forEach(el => el.addEventListener("click", close));
  window.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && !modal.hidden) close(); });

  confirmBtn?.addEventListener("click", () => {
    if (resolver) resolver(true);
    close();
  });

  return function confirmDialog({ title="Confirm", message="Are you sure?", confirmText="Confirm" } = {}) {
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = `<div class="muted">${esc(message)}</div>`;
    if (confirmBtn) confirmBtn.textContent = confirmText;

    modal.hidden = false;
    confirmBtn?.focus?.();

    return new Promise((resolve) => {
      resolver = resolve;
      // cancel resolves false
      const cancel = () => {
        if (resolver) resolver(false);
        close();
      };
      // one-time listeners for cancel buttons
      const cancelEls = qsa("[data-modal-close], [data-modal-cancel]", modal);
      cancelEls.forEach(el => {
        const handler = () => { el.removeEventListener("click", handler); cancel(); };
        el.addEventListener("click", handler);
      });
    });
  };
}

/* =============================================================================
  Drawer helper (categories/offers)
============================================================================= */
export function bindDrawer() {
  const drawer = qs("[data-drawer]");
  if (!drawer) return null;
  const closeEls = qsa("[data-drawer-close]", drawer);
  const open = () => { drawer.hidden = false; document.body.style.overflow = "hidden"; };
  const close = () => { drawer.hidden = true; document.body.style.overflow = ""; };

  closeEls.forEach(el => el.addEventListener("click", close));
  window.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && !drawer.hidden) close(); });

  return { drawer, open, close };
}

/* =============================================================================
  Supabase auth + admin guard
============================================================================= */
export async function requireAdmin() {
  if (!isSupabaseConfigured()) {
    adminToast({ type:"error", title:"Supabase not configured", message:"Set URL + anon key in assets/js/config.js" });
    // On admin pages, still allow UI to show
    return { ok:false, user:null, role:null };
  }

  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  const user = sess?.session?.user || null;

  if (!user) {
    const returnTo = encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
    location.href = `./index.html?returnTo=${returnTo}`;
    return { ok:false, user:null, role:null };
  }

  // Must be admin
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || profile.role !== "admin") {
    // Signed in but not admin
    const hint = qs("[data-admin-rls-hint]");
    if (hint) hint.hidden = false;
    adminToast({ type:"error", title:"Access denied", message:"Your account is not an admin. Check profiles.role and RLS." });
    return { ok:false, user, role: profile?.role || null };
  }

  return { ok:true, user, role: profile.role };
}

async function signIn(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOut() {
  const sb = getSupabase();
  await sb.auth.signOut();
  location.href = "./index.html";
}

/* =============================================================================
  Layout mount
============================================================================= */
function mountSidebar(activePage) {
  const mount = qs("#adminSidebar");
  if (!mount) return;

  mount.innerHTML = `
    <div class="sidebar">
      <div class="sidebarBrand">
        <div class="sidebarBrand__name">CASA DECOR</div>
        <div class="sidebarBrand__sub">Admin Console</div>
      </div>

      <nav class="nav" aria-label="Admin navigation">
        <a href="./dashboard.html" data-nav="dashboard">Dashboard</a>
        <a href="./products.html" data-nav="products">Products</a>
        <a href="./categories.html" data-nav="categories">Categories</a>
        <a href="./offers.html" data-nav="offers">Offers</a>
        <a href="./inquiries.html" data-nav="inquiries">Inquiries</a>
        <a href="./settings.html" data-nav="settings">Settings</a>
      </nav>

      <div class="sidebarFoot">
        <a class="btn btn--secondary btn--full" href="../index.html">Open website</a>
        <button class="btn btn--danger btn--full" type="button" data-logout>Logout</button>
      </div>
    </div>
  `;

  qsa("[data-nav]", mount).forEach(a => {
    if (a.getAttribute("data-nav") === activePage) a.setAttribute("aria-current","page");
  });

  qs("[data-logout]", mount)?.addEventListener("click", signOut);
}

function mountTopbar(title="Admin") {
  const mount = qs("#adminTopbar");
  if (!mount) return;

  mount.innerHTML = `
    <div class="topbar">
      <div class="topbarLeft">
        <div class="topbarTitle">${esc(title)}</div>
        <div class="pill"><span class="muted">Project</span> <strong>${esc((SUPABASE.url || "Not configured").replace(/^https?:\/\//,""))}</strong></div>
      </div>
      <div class="topbarRight">
        <div class="pill"><span class="muted">Role</span> <strong>admin</strong></div>
      </div>
    </div>
  `;
}

/* =============================================================================
  Dashboard init
============================================================================= */
async function initDashboard() {
  const sb = getSupabase();

  const setKpi = (key, val) => {
    const el = qs(`[data-kpi="${key}"]`);
    if (el) el.textContent = String(val ?? "—");
  };

  // Use head/count queries (efficient)
  const productsAll = await sb.from("products").select("id", { count:"exact", head:true });
  const productsPublished = await sb.from("products").select("id", { count:"exact", head:true }).eq("published", true);
  const productsFeatured = await sb.from("products").select("id", { count:"exact", head:true }).eq("featured", true);
  const inquiriesAll = await sb.from("inquiries").select("id", { count:"exact", head:true });
  const inquiriesNew = await sb.from("inquiries").select("id", { count:"exact", head:true }).eq("status", "new");
  const offersActive = await sb.from("offers").select("id", { count:"exact", head:true }).eq("active", true);

  setKpi("products", productsAll.count ?? 0);
  setKpi("published_products", productsPublished.count ?? 0);
  setKpi("featured_products", productsFeatured.count ?? 0);
  setKpi("inquiries", inquiriesAll.count ?? 0);
  setKpi("unread_inquiries", inquiriesNew.count ?? 0);
  setKpi("active_offers", offersActive.count ?? 0);

  // Recent inquiries
  const inqTbody = qs("[data-recent-inquiries]");
  const prodTbody = qs("[data-recent-products]");

  const { data: inq, error: inqErr } = await sb
    .from("inquiries")
    .select("id,name,phone,email,interested_in,status,created_at,product_name")
    .order("created_at", { ascending:false })
    .limit(6);

  if (inqTbody) {
    if (inqErr) {
      inqTbody.innerHTML = `<tr><td colspan="4" class="muted">Unable to load.</td></tr>`;
    } else if (!inq?.length) {
      inqTbody.innerHTML = `<tr><td colspan="4" class="muted">No inquiries yet.</td></tr>`;
    } else {
      inqTbody.innerHTML = inq.map(x => `
        <tr>
          <td>
            <div><strong>${esc(x.name || "—")}</strong></div>
            <div class="muted">${esc(x.phone || "")}${x.email ? " • " + esc(x.email) : ""}</div>
          </td>
          <td>${esc(x.product_name || x.interested_in || "—")}</td>
          <td><span class="tag ${x.status==="new"?"tag--gold":""}">${esc(x.status)}</span></td>
          <td class="muted">${esc(fmtDT(x.created_at))}</td>
        </tr>
      `).join("");
    }
  }

  // Recent products
  const { data: prods, error: prodErr } = await sb
    .from("products")
    .select("id,name,category_id,published,created_at,categories(name)")
    .order("created_at", { ascending:false })
    .limit(6);

  if (prodTbody) {
    if (prodErr) {
      prodTbody.innerHTML = `<tr><td colspan="4" class="muted">Unable to load.</td></tr>`;
    } else if (!prods?.length) {
      prodTbody.innerHTML = `<tr><td colspan="4" class="muted">No products yet.</td></tr>`;
    } else {
      prodTbody.innerHTML = prods.map(p => `
        <tr>
          <td><strong>${esc(p.name || "—")}</strong></td>
          <td class="muted">${esc(p.categories?.name || "—")}</td>
          <td>${p.published ? `<span class="tag tag--ok">published</span>` : `<span class="tag">hidden</span>`}</td>
          <td class="muted">${esc(fmtDT(p.created_at))}</td>
        </tr>
      `).join("");
    }
  }
}

/* =============================================================================
  Login init
============================================================================= */
async function initLogin() {
  const form = qs("#loginForm");
  const err = qs("#loginError");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (err) err.hidden = true;

    if (!isSupabaseConfigured()) {
      if (err) { err.hidden = false; err.textContent = "Supabase not configured. Set URL + anon key in assets/js/config.js"; }
      return;
    }

    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "").trim();

    const btn = form.querySelector("button[type='submit']");
    setBusy(btn, true, "Signing in…");

    const { error } = await signIn(email, password);
    setBusy(btn, false);

    if (error) {
      if (err) { err.hidden = false; err.textContent = error.message || "Unable to sign in."; }
      adminToast({ type:"error", title:"Login failed", message: error.message || "Check your credentials." });
      return;
    }

    // Check role quickly, then redirect
    const guard = await requireAdmin();
    if (!guard.ok) {
      if (err) { err.hidden = false; err.textContent = "Signed in but not an admin. Check profiles.role and RLS."; }
      return;
    }

    const params = new URLSearchParams(location.search);
    const returnTo = params.get("returnTo") || "dashboard.html";
    location.href = `./${returnTo}`;
  });
}

/* =============================================================================
  Boot (admin)
============================================================================= */
(async function bootAdmin() {
  const page = document.body.getAttribute("data-admin-page") || "";

  // Login page: no layout guard
  if (page === "login") {
    await initLogin();
    return;
  }

  mountSidebar(page);
  mountTopbar(page.charAt(0).toUpperCase() + page.slice(1).replaceAll("-"," "));

  const guard = await requireAdmin();
  if (!guard.ok) return;

  // If settings are needed globally later, load once
  try {
    const { data } = await fetchPublicSettings();
    window.__CASA_SETTINGS = data || null;
  } catch {}

  if (page === "dashboard") {
    await initDashboard();
  }
})();
