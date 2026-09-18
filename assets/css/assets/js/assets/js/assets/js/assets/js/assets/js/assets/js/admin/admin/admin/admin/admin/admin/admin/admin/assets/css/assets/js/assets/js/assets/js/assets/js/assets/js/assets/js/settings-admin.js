import { SUPABASE } from "./config.js";
import { getSupabase, storagePublicUrl } from "./supabase.js";
import { adminToast, setBusy } from "./admin.js";

function qs(sel, root=document){ return root.querySelector(sel); }

async function initSettings(){
  const form = qs("#settingsForm");
  if (!form) return;

  const sb = getSupabase();

  const saveBtn = qs("[data-save]");
  const errEl = qs("[data-error]");
  const savedEl = qs("[data-saved]");

  // hero upload
  const heroInput = qs("#heroImageInput");
  const uploadBtn = qs("[data-upload]");
  const uploadErr = qs("[data-upload-error]");
  const heroPreview = qs("[data-hero-preview]");
  const heroPreviewImg = heroPreview?.querySelector("img");
  const removeHeroBtn = qs("[data-remove-hero]");

  // fields (match site_settings columns)
  const fields = [
    "business_name","tagline","default_currency","business_hours",
    "address_full","address_short","google_maps_embed_html","google_maps_link",
    "phone","whatsapp_number","email",
    "instagram_url","facebook_url","tiktok_url",
    "footer_text",
    "hero_eyebrow","hero_title","hero_subtitle",
  ];

  let current = null;

  function setValue(id, val){
    const el = qs("#" + id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val ?? "";
  }

  function getValue(id){
    const el = qs("#" + id);
    if (!el) return null;
    if (el.type === "checkbox") return el.checked;
    return el.value;
  }

  async function load(){
    if (errEl) errEl.hidden = true;
    if (savedEl) savedEl.hidden = true;

    const { data, error } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) {
      if (errEl) { errEl.hidden = false; errEl.textContent = error.message || "Unable to load settings."; }
      return;
    }
    current = data || { id: 1 };

    fields.forEach(k => setValue(k, current[k]));

    // hero preview
    if (current.hero_image_path) {
      heroPreview.hidden = false;
      heroPreviewImg.src = storagePublicUrl(current.hero_image_path);
      heroPreviewImg.dataset.path = current.hero_image_path;
    } else {
      heroPreview.hidden = true;
      heroPreviewImg.dataset.path = "";
    }
  }

  function validate(payload){
    // No fake constraints; keep minimal and safe
    if (payload.instagram_url && !/^https?:\/\//i.test(payload.instagram_url)) return "Instagram URL must start with http(s)://";
    if (payload.facebook_url && !/^https?:\/\//i.test(payload.facebook_url)) return "Facebook URL must start with http(s)://";
    if (payload.tiktok_url && !/^https?:\/\//i.test(payload.tiktok_url)) return "TikTok URL must start with http(s)://";
    if (payload.google_maps_link && !/^https?:\/\//i.test(payload.google_maps_link)) return "Google Maps link must start with http(s)://";
    return null;
  }

  async function save(){
    if (errEl) errEl.hidden = true;
    if (savedEl) savedEl.hidden = true;

    const payload = { id: 1, updated_at: new Date().toISOString() };
    fields.forEach(k => payload[k] = (getValue(k) || "").trim() || null);

    // keep address default if user clears accidentally? we won't force
    const msg = validate(payload);
    if (msg) {
      if (errEl) { errEl.hidden = false; errEl.textContent = msg; }
      return;
    }

    setBusy(saveBtn, true, "Saving…");
    const { error } = await sb.from("site_settings").upsert(payload, { onConflict: "id" });
    setBusy(saveBtn, false);

    if (error) {
      if (errEl) { errEl.hidden = false; errEl.textContent = error.message || "Save failed."; }
      adminToast({ type:"error", title:"Save failed", message:error.message });
      return;
    }

    if (savedEl) savedEl.hidden = false;
    adminToast({ type:"success", title:"Saved", message:"Settings updated." });
    await load();
  }

  saveBtn?.addEventListener("click", save);

  // hero upload
  uploadBtn?.addEventListener("click", async () => {
    if (uploadErr) uploadErr.hidden = true;

    const file = heroInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      if (uploadErr) { uploadErr.hidden = false; uploadErr.textContent = "Please choose an image file."; }
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      if (uploadErr) { uploadErr.hidden = false; uploadErr.textContent = "File too large. Max 8MB."; }
      return;
    }

    setBusy(uploadBtn, true, "Uploading…");

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `site/hero/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await sb.storage.from(SUPABASE.storage.bucket).upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      setBusy(uploadBtn, false);
      if (uploadErr) { uploadErr.hidden = false; uploadErr.textContent = upErr.message; }
      return;
    }

    const { error: dbErr } = await sb.from("site_settings").upsert({ id: 1, hero_image_path: path, updated_at: new Date().toISOString() });
    setBusy(uploadBtn, false);

    if (dbErr) {
      if (uploadErr) { uploadErr.hidden = false; uploadErr.textContent = dbErr.message; }
      return;
    }

    heroPreview.hidden = false;
    heroPreviewImg.src = storagePublicUrl(path);
    heroPreviewImg.dataset.path = path;

    adminToast({ type:"success", title:"Uploaded", message:"Hero image updated." });
    await load();
  });

  removeHeroBtn?.addEventListener("click", async () => {
    const path = heroPreviewImg?.dataset?.path;
    const ok = window.confirm("Remove hero image? (Storage file will also be deleted)");
    if (!ok) return;

    const { error: e1 } = await sb.from("site_settings").upsert({ id: 1, hero_image_path: null, updated_at: new Date().toISOString() });
    if (path) await sb.storage.from(SUPABASE.storage.bucket).remove([path]);

    if (e1) {
      if (uploadErr) { uploadErr.hidden = false; uploadErr.textContent = e1.message; }
      return;
    }

    heroPreview.hidden = true;
    heroPreviewImg.dataset.path = "";
    adminToast({ type:"success", title:"Removed", message:"Hero image removed." });
    await load();
  });

  await load();
}

initSettings();
