import { isSupabaseConfigured, createInquiry } from "./supabase.js";
import { toast } from "./main.js";

function qs(sel, root = document) { return root.querySelector(sel); }

function buildWhatsAppLink(numberRaw, text) {
  if (!numberRaw) return null;
  const digits = String(numberRaw).replace(/[^\d]/g, "");
  if (!digits) return null;
  const t = encodeURIComponent(text || "Hi Casa Decor, I would like to inquire.");
  return `https://wa.me/${digits}?text=${t}`;
}

(async function bootContact() {
  const settings = window.__CASA_SETTINGS || null;

  // WhatsApp CTA (only show if configured)
  const waBtn = qs("[data-whatsapp-cta]");
  const wa = settings?.whatsapp_number || settings?.whatsapp || null;
  if (waBtn) {
    const link = buildWhatsAppLink(wa, "Hi Casa Decor, I would like to inquire.");
    if (link) {
      waBtn.hidden = false;
      waBtn.addEventListener("click", () => window.open(link, "_blank", "noopener"));
    } else {
      waBtn.hidden = true;
    }
  }

  const form = qs("#contactForm");
  const ok = qs("#contactSuccess");
  const err = qs("#contactError");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ok) ok.hidden = true;
    if (err) err.hidden = true;

    if (!isSupabaseConfigured()) {
      if (err) {
        err.hidden = false;
        err.textContent = "Supabase is not configured. Add Supabase URL + anon key in assets/js/config.js";
      }
      toast({ type: "error", title: "Setup required", message: "Connect Supabase to receive inquiries." });
      return;
    }

    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      email: String(fd.get("email") || "").trim() || null,
      interested_in: String(fd.get("interested_in") || "").trim(),
      message: String(fd.get("message") || "").trim(),
      status: "new",
      source_page: "contact",
    };

    if (!payload.name || !payload.phone || !payload.interested_in || !payload.message) {
      if (err) {
        err.hidden = false;
        err.textContent = "Please complete all required fields.";
      }
      return;
    }

    const { error } = await createInquiry(payload);
    if (error) {
      if (err) {
        err.hidden = false;
        err.textContent = error.message || "Unable to submit inquiry.";
      }
      toast({ type: "error", title: "Inquiry failed", message: "Please try again." });
      return;
    }

    form.reset();
    if (ok) ok.hidden = false;
    toast({ type: "success", title: "Inquiry sent", message: "We’ve received your message." });
  });
})();
