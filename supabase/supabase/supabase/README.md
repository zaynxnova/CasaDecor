# CASA DECOR — Luxury Showroom Website (Static + Supabase)

A production-ready, GitHub Pages–deployable website for **CASA DECOR** (Complete Home Decoration & Interior Solutions) with:
- Premium public showroom website (Home, Collection, Product Details, Services, About, Contact, Privacy, 404)
- Real Supabase integration (Postgres + Auth + Storage)
- Real admin dashboard (`/admin`) with:
  - Email/password login (Supabase Auth)
  - Products CRUD (publish/hide, featured, sale pricing windows)
  - Product images upload/reorder/primary image (Supabase Storage)
  - Categories CRUD + image upload
  - Offers management
  - Inquiries management + status workflow
  - Site Settings CMS (hero, contact/social placeholders, address, map embed)

No Node backend is required.

---

## 1) Project structure

```txt
/
  index.html
  shop.html
  product.html
  about.html
  services.html
  contact.html
  privacy.html
  404.html

  admin/
    index.html              # admin login
    dashboard.html
    products.html
    product-editor.html
    categories.html
    offers.html
    inquiries.html
    settings.html

  assets/
    css/
      style.css
      admin.css
    js/
      config.js             # SET SUPABASE URL + ANON KEY HERE
      supabase.js
      main.js
      shop.js
      product.js
      contact.js
      admin.js
      products-admin.js
      categories-admin.js
      offers-admin.js
      inquiries-admin.js
      settings-admin.js
    images/
      placeholder-hero.svg
      placeholder-product.svg
      placeholder-category.svg
      placeholder-service.svg

  supabase/
    schema.sql
    storage.sql
    seed.sql

  README.md
