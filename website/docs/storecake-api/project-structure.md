---
sidebar_position: 3
title: Project structure
---

# Project structure

`builderx_api` ships 120+ domain modules under `lib/builderx_api/`. This page groups them by responsibility so newcomers can find code fast.

## Repository tree

```text
builderx_api/
├── lib/
│   ├── builderx_api/            # ① Domain logic
│   ├── builderx_api_web/        # ② Web layer (HTTP + WS)
│   ├── cronjob/                 # Quantum scheduler / jobs
│   ├── rabbit/                  # AMQP producers / consumers
│   ├── kafka/                   # Kafka producers / consumers
│   ├── ets/                     # In-memory cache
│   ├── search/                  # Elastic helpers
│   ├── redis/                   # Redis helpers
│   ├── outbox/                  # Outbox pattern
│   ├── pool/                    # Poolboy workers
│   ├── passive/                 # Long-running supervised processes
│   ├── questdb/                 # Time-series client
│   ├── qwik/                    # AI / quick-actions
│   ├── landingpage/             # Bridge to landing_page_backend
│   ├── mix/                     # Mix tasks
│   ├── dynamic_app.ex           # Dynamic supervisor (multi-tenant)
│   └── …
├── assets/                      # In-repo FE (Vue 3 + Webpack)
├── config/                      # Phoenix config
├── priv/                        # Migrations, static, gettext
├── test/                        # Tests
├── data/                        # Large static datasets (geo, taxonomy)
├── mongo/                       # Mongo schemas / seed
├── tools/                       # Dev / ops scripts
├── w_external_command/          # External worker
├── ansible/                     # Deploy playbooks
├── docker-compose.yml / docker-compose-service.yml
├── Dockerfile
├── Makefile
└── mix.exs / mix.lock
```

## `lib/builderx_api/` grouped by responsibility

### Account & Auth

- `accounts/` — User, account, password, profile.
- `api_keys/` — Developer tokens.
- `invitations/` — Invite members to an account.
- `otp_codes/` — OTP (email / SMS).
- `permissions/` — RBAC.
- `super_admin/` — Storecake internal admin.

### Sites & Domain

- `sites/`, `site_products/`, `site_styles/`, `site_tag/`, `site_utms/`
- `domains/` — Custom domain (verify, cert).
- `pages/`, `seos/`, `sitemaps/`
- `pwas/` — Progressive Web App config.

### Catalog

- `products/`, `variations/`, `product_comments/`, `product_reviews/`, `product_measurements/`
- `categories/`, `tags/`, `ribbons/`
- `combo_products/`, `bonus_products/`
- `personal_product_designs/`
- `materials/`, `shapes/`
- `catalogs/`, `fb_catalogs/`, `tiktok_catalog_products/`, `google_merchant/`
- `collections/`
- `device_templates/`

### Orders & Payments

- `orders/`, `order_transactions/`
- `customer_invoices/`, `package_subscriptions/`, `packages/`
- `payments/`, `payment_accounts/`, `transactions_bank/`
- `customer_levels/`, `promotion_advances/`

### Customers & Marketing

- `customers/`, `contacts/`, `subscribers/`
- `commissions/`, `affiliates/`, `affiliate_storecakes/`, `user_affiliates/`, `percent_com_for_sale/`
- `cart_triggers/`
- `automations/`, `notifications/`, `send_email/`

### Integrations

- `integrations/`, `intergrations/` (legacy spelling — both exist)
- `partner_services/`, `merchant_syncs/`, `sync_pos/`
- `google_ad_accounts/`, `google_ad_transactions/`
- `google_merchant/`, `fb_catalogs/`, `tiktok_catalog_products/`
- `zalo_mini_app/`
- `course_app/`, `appointments/`
- `agents/`, `ai/`

### Content

- `blogs/`, `templates/`, `global_sources/`
- `cms_files/`, `tinymces/`
- `form_data/`, `builder_data_grids/`
- `translations/`, `languages.ex`, `locale.ex`
- `images/`, `photos/`, `videos/`, `hls/`
- `fonts/`

### Logistics & Geo

- `geo/`, `shippings/`, `warehouses/`
- `block_phone_numbers/`, `phone_detect.ex`

### Audit & Logging

- `system_logs/`, `system_log_rollback.ex`
- `error_sync_logs/`
- `trackings/`, `short_links/`
- `transaction_task.ex`, `transaction_task_supervisor.ex`

### Background

- `business_cronjobs/`
- `workers/`
- `db_collections/` (Mongo collection helpers)

### Infra helpers

- `repo.ex`, `custom_ecto.ex`, `parse.ex`, `request.ex`
- `tools.ex`, `traversal.ex`, `statics.ex`, `time_util.ex`, `url`, `types`
- `ecto_middleware.ex`, `enum.ex`, `cache_manifest.ex`, `default_theme.ex`, `default_data/`
- `mailer.ex`, `image_resize.ex`, `aws_s3.ex`
- `elastic.ex`, `elastic_index.ex`

> Some folder pairs (`integrations` vs `intergrations`) coexist for historical reasons. Use whichever name the compiler is using before adding code; refactor with care.

## `lib/builderx_api_web/`

```text
builderx_api_web/
├── endpoint.ex
├── router/
├── controllers/
│   ├── v1/                       # Main REST endpoints
│   ├── crm_pancake_controller.ex
│   ├── fallback_controller.ex
│   ├── mini_app_controller.ex
│   ├── pancake_controller.ex
│   ├── super_admin_controller.ex
│   └── susa_controller.ex
├── channels/
├── plugs/                        # Auth, site context, rate limit,…
├── services/                     # Thin service layer
├── views/                        # JSON views
├── templates/                    # HTML (legacy)
├── presence.ex
├── schedule.ex                   # Quantum entry
└── telemetry.ex
```

## `config/`

| File | Purpose |
| --- | --- |
| `config.exs` | Compile-time base config. |
| `dev.exs` | Dev overrides. |
| `test.exs` | Test overrides (DB sandbox). |
| `prod.exs` | Prod base (no secrets). |
| `prod.secret.exs` | Prod secrets (gitignored, Ansible injects). |
| `env_config.exs` | Runtime env reads (`System.get_env/1`). |

## `priv/`

- `repo/migrations/` — Postgres migrations.
- `repo/citus_migrations/` — Citus shard migrations (when separated).
- `repo/seeds.exs` — Seed data.
- `static/` — Built assets from `assets/`.
- `gettext/` — Backend translations (emails, templates).
- `cert/` — Dev certs (when present).

## `assets/`

Legacy in-repo FE — not `builderx_spa`. Used to render a few server-side admin pages with Vue 3 + Ant Design Vue + Webpack 4.

## Adding a new domain

1. Create `lib/builderx_api/<domain>/` with schema + context.
2. Migration in `priv/repo/migrations/` (or `citus_migrations` for shard tables).
3. Controller `lib/builderx_api_web/controllers/v1/<domain>_controller.ex`.
4. Register the route in `lib/builderx_api_web/router/...` under `/api/v1`.
5. View `lib/builderx_api_web/views/<domain>_view.ex`.
6. Add `<domain>/elastic.ex` if it needs an index.
7. Publish events via `Outbox` — never via Rabbit / Kafka directly.
8. Tests under `test/builderx_api/<domain>/` + `test/builderx_api_web/controllers/`.
