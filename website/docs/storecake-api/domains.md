---
sidebar_position: 4
title: Domains
---

# Domains

The bounded contexts in `lib/builderx_api/`. Each context owns its own Ecto schemas + business functions. The cardinal rule: outside callers only touch the context module, never `Repo`.

## Accounts & Auth

- **`accounts/`** — User, account, password, profile.
  - `BuilderxApi.Accounts.create_account/1`, `get_account_by_email/1`, `authenticate/2`.
  - Passwords hashed with Argon2.
- **`api_keys/`** — Tokens for developer integrations.
- **`invitations/`** — Member invites.
- **`otp_codes/`** — OTP codes (email / SMS).
- **`permissions/`** — RBAC permissions. Plug `BuilderxApiWeb.Plugs.Permission` enforces.
- **`super_admin/`** — Storecake internal admin, routed via `super_admin_controller`.

## Sites & Domain

- **`sites/`** — Tenant unit. Every commerce row scopes by `site_id`.
- **`domains/`** — Custom domains (TXT verify, SSL).
- **`pages/`** — CMS pages tied to a site.
- **`seos/`** — SEO meta per page / product.
- **`sitemaps/`** — Sitemap generation.
- **`pwas/`** — PWA manifest per site.
- **`site_styles/`** — Theme overrides.
- **`site_products/`, `site_tag/`, `site_utms/`** — Helper join tables.

## Catalog

- **`products/`** — Core product + variants. Index via `products/elastic.ex`.
- **`variations/`** — Variant combinations.
- **`product_comments/`, `product_reviews/`, `product_measurements/`** — UGC + spec.
- **`categories/`, `tags/`, `ribbons/`** — Taxonomy + labels.
- **`combo_products/`, `bonus_products/`** — Bundles / promotions.
- **`personal_product_designs/`** — Customised products.
- **`materials/`, `shapes/`** — Attributes for jewellery / gifts.
- **`catalogs/`** — Generic catalog uploads + per-platform: `fb_catalogs/`, `tiktok_catalog_products/`, `google_merchant/`.
- **`collections/`** — Curated collections.
- **`device_templates/`** — Theme templates surfaced in the Editor.

## Orders & Payments

- **`orders/`** — Orders, status, fulfillment.
- **`order_transactions/`** — Transactions per order.
- **`customer_invoices/`** — Invoices.
- **`payments/`, `payment_accounts/`** — Payment-method config (Stripe, COD, MoMo, ZaloPay,…).
- **`transactions_bank/`** — Bank reconciliation.
- **`packages/`, `package_subscriptions/`** — Plans + subscriptions.
- **`promotion_advances/`** — Advanced vouchers.
- **`cart_triggers/`** — Cart events (abandon, recover).
- **`appointments/`** — Booking-based services.

## Customers & Marketing

- **`customers/`** — End customers.
- **`contacts/`, `subscribers/`** — Leads, mailing list.
- **`customer_levels/`** — Loyalty tiers.
- **`commissions/`, `affiliates/`, `user_affiliates/`, `percent_com_for_sale/`** — Affiliate / commission.
- **`automations/`** — Trigger + action flows.
- **`notifications/`** — Push, in-app, web-push.
- **`send_email/`** — Transactional email (via Bamboo).

## Integrations

- **`integrations/`** + **`intergrations/`** (legacy spelling — be careful when grepping).
- **`partner_services/`** — Shipping / fulfillment / AI partners.
- **`merchant_syncs/`, `sync_pos/`** — POS / merchant sync.
- **`google_ad_accounts/`, `google_ad_transactions/`** — Google Ads.
- **`google_merchant/`** — Google Merchant feed.
- **`fb_catalogs/`, `tiktok_catalog_products/`** — Meta / TikTok feeds.
- **`zalo_mini_app/`** — Zalo mini-app endpoints.
- **`course_app/`** — Course platform.
- **`webcake/`** — Integration with `landing_page_backend`.
- **`agents/`, `ai/`, `qwik/`** — Internal AI assistants.

## Content

- **`blogs/`, `templates/`, `global_sources/`**
- **`cms_files/`** — S3-backed file storage.
- **`tinymces/`** — TinyMCE drafts.
- **`form_data/`** — Dynamic forms.
- **`builder_data_grids/`** — Admin data grids.
- **`translations/`, `languages.ex`, `locale.ex`** — Storefront i18n.
- **`images/`, `photos/`, `videos/`, `hls/`, `fonts/`** — Media + streaming.

## Logistics

- **`geo/`** — Provinces / districts / communes (new + legacy).
- **`shippings/`** — Shipping config.
- **`warehouses/`** — Warehouses.
- **`block_phone_numbers/`, `phone_detect.ex`** — Anti-abuse.

## Audit & Tracking

- **`system_logs/`**, **`system_log_rollback.ex`**
- **`error_sync_logs/`**
- **`trackings/`**, **`short_links/`**
- **`transaction_task.ex`**, **`transaction_task_supervisor.ex`**

## Infra helpers

- `repo.ex`, `custom_ecto.ex`, `parse.ex`, `request.ex`, `validator.ex`, `guards.ex`
- `tools.ex`, `traversal.ex`, `statics.ex`, `time_util.ex`, `url`, `types`
- `ecto_middleware.ex`, `enum.ex`, `cache_manifest.ex`
- `default_theme.ex`, `default_data/`
- `mailer.ex`, `image_resize.ex`, `aws_s3.ex`
- `elastic.ex`, `elastic_index.ex`
- `redlock.ex` (distributed lock over Redis)

## Cross-domain rules

- If domain A needs data from domain B, call B's context — never query B's tables directly.
- If A's write should notify others, write to the **Outbox** (`lib/outbox/`) inside the same transaction. The dispatcher fans out to queues.
- Avoid circular dependencies: extract a shared `events` module and broadcast via PubSub / Outbox.
- Index Elastic asynchronously through `Rabbit.IndexingConsumer` — don't block requests.

## Example

```elixir
defmodule BuilderxApi.Products do
  alias BuilderxApi.{Repo, Products.Product, Outbox}

  def create(site_id, attrs) do
    Repo.transaction(fn ->
      changeset =
        %Product{}
        |> Product.changeset(Map.put(attrs, :site_id, site_id))

      with {:ok, product} <- Repo.insert(changeset),
           {:ok, _} <- Outbox.publish("product.created", %{id: product.id, site_id: site_id}) do
        product
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end
end
```

Subscribers under `lib/rabbit/` / `lib/kafka/` consume those events to update the search index or notify external systems.
