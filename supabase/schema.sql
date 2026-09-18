-- =============================================================================
-- CASA DECOR — Supabase Schema (Production-ready)
-- Tables: profiles, categories, products, product_images, offers, inquiries, site_settings
-- Public views: public_site_settings, public_categories, public_products, public_offers
-- Security: RLS enforced, admin role via profiles.role = 'admin'
-- =============================================================================

begin;

-- Extensions (Supabase usually has pgcrypto; safe to ensure)
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Auto-updated timestamps
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin check (used in RLS + Storage policies)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Profiles (maps auth.users -> role)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin','staff','user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Users can read own profile
drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Users can insert own profile (fallback; trigger usually handles)
drop policy if exists "Profiles: insert own" on public.profiles;
create policy "Profiles: insert own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

-- Admin can manage profiles
drop policy if exists "Profiles: admin manage" on public.profiles;
create policy "Profiles: admin manage"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  image_path text,
  hidden boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_unique unique (slug),
  constraint categories_name_nonempty check (length(trim(name)) > 0),
  constraint categories_slug_nonempty check (length(trim(slug)) > 0)
);

create index if not exists idx_categories_hidden on public.categories(hidden);
create index if not exists idx_categories_sort on public.categories(sort_order);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

-- Public can read visible categories
drop policy if exists "Categories: public read visible" on public.categories;
create policy "Categories: public read visible"
on public.categories
for select
to anon, authenticated
using (hidden = false);

-- Admin can manage categories
drop policy if exists "Categories: admin manage" on public.categories;
create policy "Categories: admin manage"
on public.categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  category_id uuid not null references public.categories(id) on delete restrict,

  short_description text,
  description text,

  price numeric(12,0) not null check (price > 0),
  sale_price numeric(12,0) check (sale_price is null or sale_price > 0),
  sale_start timestamptz,
  sale_end timestamptz,

  currency text not null default 'PKR',

  featured boolean not null default false,
  published boolean not null default false,

  availability text not null default 'in_stock'
    check (availability in ('in_stock','made_to_order','limited','out_of_stock')),

  dimensions text,
  warranty text,

  fabric_options text[] not null default '{}'::text[],
  color_options text[] not null default '{}'::text[],
  marble_options text[] not null default '{}'::text[],

  -- Optional structured breakdown for multi-priced sets
  pricing_components jsonb,

  seo_title text,
  seo_description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_slug_unique unique (slug),
  constraint products_name_nonempty check (length(trim(name)) > 0),
  constraint products_slug_nonempty check (length(trim(slug)) > 0),
  constraint products_sale_price_lt_price check (sale_price is null or sale_price < price),
  constraint products_sale_window_valid check (
    sale_start is null or sale_end is null or sale_end > sale_start
  )
);

create index if not exists idx_products_published on public.products(published);
create index if not exists idx_products_featured on public.products(featured);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_created_at on public.products(created_at desc);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.products enable row level security;

-- Public can read only published products AND only if category is visible (not hidden)
drop policy if exists "Products: public read published" on public.products;
create policy "Products: public read published"
on public.products
for select
to anon, authenticated
using (
  published = true
  and exists (
    select 1 from public.categories c
    where c.id = products.category_id
      and c.hidden = false
  )
);

-- Admin can manage products
drop policy if exists "Products: admin manage" on public.products;
create policy "Products: admin manage"
on public.products
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Product Images (Storage paths, not blobs)
-- -----------------------------------------------------------------------------
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path text not null,
  alt text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_images_path_nonempty check (length(trim(path)) > 0)
);

create index if not exists idx_product_images_product on public.product_images(product_id);
create index if not exists idx_product_images_sort on public.product_images(product_id, is_primary desc, sort_order asc, created_at asc);

-- Ensure only one primary per product
create unique index if not exists ux_product_images_one_primary
on public.product_images(product_id)
where is_primary = true;

drop trigger if exists trg_product_images_updated_at on public.product_images;
create trigger trg_product_images_updated_at
before update on public.product_images
for each row execute function public.set_updated_at();

alter table public.product_images enable row level security;

-- Public can read images only for published products in visible categories
drop policy if exists "Product images: public read for published products" on public.product_images;
create policy "Product images: public read for published products"
on public.product_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = product_images.product_id
      and p.published = true
      and c.hidden = false
  )
);

-- Admin can manage product images
drop policy if exists "Product images: admin manage" on public.product_images;
create policy "Product images: admin manage"
on public.product_images
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Offers (global banners/countdowns; product sales handled in products table)
-- -----------------------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  discount_type text not null default 'percentage' check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,0),
  start_at timestamptz,
  end_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_title_nonempty check (length(trim(title)) > 0),
  constraint offers_window_valid check (start_at is null or end_at is null or end_at > start_at)
);

create index if not exists idx_offers_active on public.offers(active);
create index if not exists idx_offers_dates on public.offers(start_at, end_at);

drop trigger if exists trg_offers_updated_at on public.offers;
create trigger trg_offers_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

alter table public.offers enable row level security;

-- Public can read offers only if active and within time window
drop policy if exists "Offers: public read active window" on public.offers;
create policy "Offers: public read active window"
on public.offers
for select
to anon, authenticated
using (
  active = true
  and (start_at is null or start_at <= now())
  and (end_at is null or end_at >= now())
);

-- Admin can manage offers
drop policy if exists "Offers: admin manage" on public.offers;
create policy "Offers: admin manage"
on public.offers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Inquiries (public can insert, admin can manage)
-- -----------------------------------------------------------------------------
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  phone text not null,
  email text,

  interested_in text,
  product_slug text,
  product_name text,

  message text not null,

  status text not null default 'new'
    check (status in ('new','contacted','completed','archived')),

  source_page text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inquiries_name_nonempty check (length(trim(name)) > 0),
  constraint inquiries_phone_nonempty check (length(trim(phone)) > 0),
  constraint inquiries_message_nonempty check (length(trim(message)) > 0)
);

create index if not exists idx_inquiries_created_at on public.inquiries(created_at desc);
create index if not exists idx_inquiries_status on public.inquiries(status);

drop trigger if exists trg_inquiries_updated_at on public.inquiries;
create trigger trg_inquiries_updated_at
before update on public.inquiries
for each row execute function public.set_updated_at();

alter table public.inquiries enable row level security;

-- Public can create inquiries
drop policy if exists "Inquiries: public insert" on public.inquiries;
create policy "Inquiries: public insert"
on public.inquiries
for insert
to anon, authenticated
with check (
  length(trim(name)) > 0
  and length(trim(phone)) > 0
  and length(trim(message)) > 0
  and (status = 'new') -- ensure public cannot write arbitrary status
);

-- Admin can read/manage inquiries
drop policy if exists "Inquiries: admin manage" on public.inquiries;
create policy "Inquiries: admin manage"
on public.inquiries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Site Settings (single-row CMS table, id=1)
-- -----------------------------------------------------------------------------
create table if not exists public.site_settings (
  id int primary key,
  business_name text,
  tagline text,
  address_full text,
  address_short text,

  phone text,
  whatsapp_number text,
  email text,

  instagram_url text,
  facebook_url text,
  tiktok_url text,

  hero_eyebrow text,
  hero_title text,
  hero_subtitle text,
  hero_image_path text,

  footer_text text,

  google_maps_embed_html text,
  google_maps_link text,

  business_hours text,
  default_currency text not null default 'PKR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

-- Public can read settings row id=1
drop policy if exists "Settings: public read" on public.site_settings;
create policy "Settings: public read"
on public.site_settings
for select
to anon, authenticated
using (id = 1);

-- Admin can manage settings
drop policy if exists "Settings: admin manage" on public.site_settings;
create policy "Settings: admin manage"
on public.site_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Public views (stable API for frontend)
-- -----------------------------------------------------------------------------

-- Categories (public-safe)
create or replace view public.public_categories as
select
  c.id,
  c.name,
  c.slug,
  c.description,
  c.image_path,
  c.sort_order
from public.categories c
where c.hidden = false;

-- Products (public-safe + DB-time sale computation + primary image)
create or replace view public.public_products as
select
  p.id,
  p.name,
  p.slug,
  p.category_id,
  c.name as category_name,
  c.slug as category_slug,

  p.short_description,
  p.description,

  p.price,
  p.sale_price,
  p.sale_start,
  p.sale_end,
  p.currency,

  p.featured,
  p.published,
  p.availability,

  p.dimensions,
  p.warranty,

  p.fabric_options,
  p.color_options,
  p.marble_options,

  p.pricing_components,

  p.seo_title,
  p.seo_description,

  p.created_at,
  p.updated_at,

  -- Secure sale logic (uses DB now(), not browser time)
  case
    when p.sale_price is not null
      and (p.sale_start is null or p.sale_start <= now())
      and (p.sale_end is null or p.sale_end >= now())
    then true
    else false
  end as sale_active,

  case
    when p.sale_price is not null
      and (p.sale_start is null or p.sale_start <= now())
      and (p.sale_end is null or p.sale_end >= now())
    then p.sale_price
    else p.price
  end as effective_price,

  (
    select pi.path
    from public.product_images pi
    where pi.product_id = p.id
    order by pi.is_primary desc, pi.sort_order asc, pi.created_at asc
    limit 1
  ) as primary_image_path

from public.products p
join public.categories c on c.id = p.category_id
where p.published = true
  and c.hidden = false;

-- Site settings (public-safe)
create or replace view public.public_site_settings as
select
  s.id,
  s.business_name,
  s.tagline,
  s.address_full,
  s.address_short,

  s.phone,
  s.whatsapp_number,
  s.email,

  s.instagram_url,
  s.facebook_url,
  s.tiktok_url,

  s.hero_eyebrow,
  s.hero_title,
  s.hero_subtitle,
  s.hero_image_path,

  s.footer_text,

  s.google_maps_embed_html,
  s.google_maps_link,

  s.business_hours,
  s.default_currency,

  s.created_at,
  s.updated_at
from public.site_settings s
where s.id = 1;

-- Offers (public-safe)
create or replace view public.public_offers as
select
  o.id,
  o.title,
  o.description,
  o.discount_type,
  o.discount_value,
  o.start_at,
  o.end_at,
  o.active,
  o.created_at,
  o.updated_at,
  (
    o.active = true
    and (o.start_at is null or o.start_at <= now())
    and (o.end_at is null or o.end_at >= now())
  ) as active_now
from public.offers o
where o.active = true
  and (o.start_at is null or o.start_at <= now())
  and (o.end_at is null or o.end_at >= now());

commit;
