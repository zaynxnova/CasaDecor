begin;

-- =============================================================================
-- Seed: Site settings (single row id=1)
-- =============================================================================
insert into public.site_settings (
  id,
  business_name,
  tagline,
  address_full,
  address_short,
  phone,
  whatsapp_number,
  email,
  instagram_url,
  facebook_url,
  tiktok_url,
  hero_eyebrow,
  hero_title,
  hero_subtitle,
  hero_image_path,
  footer_text,
  google_maps_embed_html,
  google_maps_link,
  business_hours,
  default_currency
) values (
  1,
  'CASA DECOR',
  'Complete Home Decoration & Interior Solutions',
  'Present 19, Shop number 25, Shopping Gallery, Bahria Town, Karachi, Pakistan',
  'Bahria Town, Karachi',
  null,
  null,
  null,
  null,
  null,
  null,
  'INTERIORS • FURNITURE • DECOR',
  'Complete Home Decoration',
  'Premium furniture, flooring, wall panels, ceilings and complete interior solutions — beautifully brought together under one roof.',
  null,
  'Everything Your Home Needs. Under One Roof.',
  null,
  null,
  null,
  'PKR'
)
on conflict (id) do update set
  business_name = excluded.business_name,
  tagline = excluded.tagline,
  address_full = excluded.address_full,
  address_short = excluded.address_short,
  hero_eyebrow = excluded.hero_eyebrow,
  hero_title = excluded.hero_title,
  hero_subtitle = excluded.hero_subtitle,
  footer_text = excluded.footer_text,
  default_currency = excluded.default_currency,
  updated_at = now();

-- =============================================================================
-- Seed: Categories
-- IMPORTANT: hidden=false by default; images are null (upload later via Admin)
-- =============================================================================
insert into public.categories (name, slug, description, image_path, hidden, sort_order)
values
  ('Furniture', 'furniture', 'Curated furniture pieces and sets.', null, false, 10),
  ('Sofas', 'sofas', 'Sofas designed for proportion, comfort and finish.', null, false, 20),
  ('Dining', 'dining', 'Dining sets and dining solutions.', null, false, 30),
  ('Beds', 'beds', 'Beds and bedroom sets.', null, false, 40),
  ('Chairs', 'chairs', 'Seating pieces and accent chairs.', null, false, 50),
  ('Tables', 'tables', 'Tables including marble and glass options.', null, false, 60),
  ('Marble Tables', 'marble-tables', 'Premium marble top tables.', null, false, 70),
  ('Glass Tables', 'glass-tables', 'Glass top and mixed-material tables.', null, false, 80),
  ('Study Tables', 'study-tables', 'Study and work tables.', null, false, 90),
  ('Consoles', 'consoles', 'Entry, hallway and TV consoles.', null, false, 100),
  ('TV Consoles', 'tv-consoles', 'TV consoles and media units.', null, false, 110),
  ('Mirrors', 'mirrors', 'Mirrors for dressing units and feature walls.', null, false, 120),
  ('Flooring', 'flooring', 'Wood and marble flooring solutions.', null, false, 130),
  ('Wall Panels', 'wall-panels', 'Decorative wall panels, media walls and feature walls.', null, false, 140),
  ('Ceilings', 'ceilings', 'False ceilings and ceiling designs with lighting integration.', null, false, 150),
  ('Nets & Blackouts', 'nets-blackouts', 'Nets and blackout solutions.', null, false, 160),
  ('Electrical Fittings', 'electrical-fittings', 'Electrical home fitting work coordinated with interior finishing.', null, false, 170),
  ('Complete Home Decoration', 'complete-home-decoration', 'End-to-end home decoration and interior solutions under one roof.', null, false, 180)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  hidden = excluded.hidden,
  sort_order = excluded.sort_order,
  updated_at = now();

-- =============================================================================
-- Seed: Products
-- NOTE: published=true so public website shows them immediately
-- NOTE: Images are not seeded here; upload via Admin and set primary image
-- =============================================================================

-- Helper CTEs for category ids
with
  c_beds as (select id from public.categories where slug='beds' limit 1),
  c_sofas as (select id from public.categories where slug='sofas' limit 1),
  c_dining as (select id from public.categories where slug='dining' limit 1),
  c_chairs as (select id from public.categories where slug='chairs' limit 1),
  c_tables as (select id from public.categories where slug='tables' limit 1)
insert into public.products (
  name, slug, category_id,
  short_description, description,
  price, sale_price, sale_start, sale_end,
  currency, featured, published, availability,
  dimensions, warranty,
  fabric_options, color_options, marble_options,
  pricing_components,
  seo_title, seo_description
)
values
  (
    'Panel Bed',
    'panel-bed',
    (select id from c_beds),
    'Premium panel bed set with matching dressing and three side tables.',
    'Premium panel bed set with matching dressing and three side tables.

Includes:
- Bed
- Dressing
- 3 side tables
- Matching mirror',
    265000,
    null, null, null,
    'PKR',
    true,
    true,
    'made_to_order',
    null,
    null,
    ARRAY[]::text[],
    ARRAY[]::text[],
    ARRAY[]::text[],
    null,
    null,
    null
  ),
  (
    'L-Shape Sofa',
    'l-shape-sofa',
    (select id from c_sofas),
    '6-seater L-shape sofa with premium comfort and customization options.',
    'Details:
- 6-seater
- Length: 7.5 ft
- Width: 9 ft

Features:
- Multi-foam interior
- 10-year warranty
- 4 cushion sets
- Fabric options
- Multiple colors
- Customization available',
    160000,
    null, null, null,
    'PKR',
    true,
    true,
    'made_to_order',
    '7.5 ft × 9 ft',
    '10-year warranty',
    ARRAY['Multiple fabric options']::text[],
    ARRAY['Multiple colors']::text[],
    ARRAY[]::text[],
    null,
    null,
    null
  ),
  (
    'Coffee Chairs + Coffee Table',
    'coffee-chairs-coffee-table',
    (select id from c_chairs),
    'Premium coffee chairs with matching coffee table. Component pricing available.',
    'Features:
- Premium seating
- Matching table
- Fabric options
- Multiple colors
- Customization available

Pricing:
- Coffee Chairs: PKR 65,000
- Coffee Table: PKR 30,000',
    95000,
    null, null, null,
    'PKR',
    false,
    true,
    'in_stock',
    null,
    null,
    ARRAY['Fabric options available']::text[],
    ARRAY['Multiple colors']::text[],
    ARRAY[]::text[],
    jsonb_build_array(
      jsonb_build_object('label','Coffee Chairs','price',65000,'currency','PKR'),
      jsonb_build_object('label','Coffee Table','price',30000,'currency','PKR')
    ),
    null,
    null
  ),
  (
    'Seven Seater Sofa',
    'seven-seater-sofa',
    (select id from c_sofas),
    'Elegant luxury seven-seater sofa composition.',
    'Composition:
- 1 × 2-seater
- 1 × 3-seater
- 2 × 1-seater armchairs

Total: 7 seats

Style: Elegant luxury',
    245000,
    null, null, null,
    'PKR',
    true,
    true,
    'made_to_order',
    null,
    null,
    ARRAY[]::text[],
    ARRAY[]::text[],
    ARRAY[]::text[],
    null,
    null,
    null
  ),
  (
    'Classical Dining Set',
    'classical-dining-set',
    (select id from c_dining),
    '8-seater dining set with marble top and Sheesham wood frame.',
    'Details:
- 8-seater dining set
- Includes: 6 normal chairs + 2 head chairs
- Materials: High-quality marble top, Sheesham wood frame

Customization:
- Fabric customizable
- Color customizable
- Marble customizable',
    435000,
    null, null, null,
    'PKR',
    true,
    true,
    'made_to_order',
    null,
    null,
    ARRAY['Customizable fabric']::text[],
    ARRAY['Customizable colors']::text[],
    ARRAY['Customizable marble']::text[],
    null,
    null,
    null
  )
on conflict (slug) do update set
  name = excluded.name,
  category_id = excluded.category_id,
  short_description = excluded.short_description,
  description = excluded.description,
  price = excluded.price,
  currency = excluded.currency,
  featured = excluded.featured,
  published = excluded.published,
  availability = excluded.availability,
  dimensions = excluded.dimensions,
  warranty = excluded.warranty,
  fabric_options = excluded.fabric_options,
  color_options = excluded.color_options,
  marble_options = excluded.marble_options,
  pricing_components = excluded.pricing_components,
  updated_at = now();

commit;
