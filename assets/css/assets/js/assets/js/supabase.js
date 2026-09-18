import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE } from "./config.js";

let _client = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE.url && SUPABASE.anonKey);
}

export function getSupabase() {
  if (_client) return _client;
  if (!isSupabaseConfigured()) return null;

  _client = createClient(SUPABASE.url, SUPABASE.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}

export function storagePublicUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const sb = getSupabase();
  if (!sb) return pathOrUrl;

  const { data } = sb.storage.from(SUPABASE.storage.bucket).getPublicUrl(pathOrUrl);
  return data?.publicUrl || pathOrUrl;
}

/** SETTINGS */
export async function fetchPublicSettings() {
  const sb = getSupabase();
  if (!sb) return { data: null, error: new Error("Supabase not configured.") };

  const { data, error } = await sb
    .from(SUPABASE.views.publicSettings)
    .select("*")
    .limit(1)
    .maybeSingle();

  return { data, error };
}

/** CATEGORIES */
export async function fetchPublicCategories() {
  const sb = getSupabase();
  if (!sb) return { data: null, error: new Error("Supabase not configured.") };

  const { data, error } = await sb
    .from(SUPABASE.views.publicCategories)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return { data, error };
}

/** PRODUCTS (catalog) */
export async function fetchPublicProducts({ limit = 120 } = {}) {
  const sb = getSupabase();
  if (!sb) return { data: null, error: new Error("Supabase not configured.") };

  const safeLimit = Math.min(limit, SUPABASE.maxProductsToLoad);

  const { data, error } = await sb
    .from(SUPABASE.views.publicProducts)
    .select("*")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  return { data, error };
}

/** PRODUCT by slug */
export async function fetchPublicProductBySlug(slug) {
  const sb = getSupabase();
  if (!sb) return { data: null, error: new Error("Supabase not configured.") };

  const { data, error } = await sb
    .from(SUPABASE.views.publicProducts)
    .select("*")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  return { data, error };
}

/** Product images */
export async function fetchProductImages(productId) {
  const sb = getSupabase();
  if (!sb) return { data: null, error: new Error("Supabase not configured.") };

  const { data, error } = await sb
    .from(SUPABASE.tables.productImages)
    .select("id, path, alt, sort_order, is_primary")
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return { data, error };
}

/** Inquiries (public can insert) */
export async function createInquiry(payload) {
  const sb = getSupabase();
  if (!sb) return { data: null, error: new Error("Supabase not configured.") };

  const { data, error } = await sb
    .from(SUPABASE.tables.inquiries)
    .insert(payload)
    .select("id")
    .limit(1)
    .maybeSingle();

  return { data, error };
}
