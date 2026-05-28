---
sidebar_position: 3
title: Cấu trúc dự án
---

# Project structure

Hơn 120 domain module trong `lib/builderx_api/` được tổ chức theo **bounded context**. File này map các nhóm chính giúp dev mới biết tìm code ở đâu.

## Tổng quát

```
builderx_api/
├── lib/
│   ├── builderx_api/            # ① Domain logic (bounded contexts)
│   ├── builderx_api_web/        # ② Web layer (HTTP + WS)
│   ├── cronjob/                 # Quantum scheduler/jobs
│   ├── rabbit/                  # AMQP producer/consumer
│   ├── kafka/                   # Kafka producer/consumer
│   ├── ets/                     # In-memory cache
│   ├── search/                  # Elastic helpers
│   ├── redis/                   # Redis helpers
│   ├── outbox/                  # Outbox pattern
│   ├── pool/                    # Poolboy worker
│   ├── passive/                 # Long-running supervised processes
│   ├── questdb/                 # Time-series client
│   ├── qwik/                    # AI/quick-actions
│   ├── landingpage/             # Bridge sang landing_page_backend
│   ├── mix/                     # Mix tasks
│   ├── dynamic_app.ex           # Dynamic supervisor (multi-site)
│   ├── application.ex           # OTP entrypoint
│   ├── email.ex
│   ├── error_tracker.ex
│   ├── custom_ecto.ex
│   ├── guards.ex
│   └── validator.ex
├── assets/                      # FE nội bộ (Vue 3 + Webpack)
├── config/                      # Phoenix config
├── priv/                        # Migration, static, gettext
├── test/                        # Test
├── data/                        # Dataset lớn (geo, taxonomy)
├── mongo/                       # Mongo schema/seed
├── tools/                       # Script dev/ops
├── w_external_command/          # External worker
├── ansible/                     # Playbook deploy
├── docker-compose.yml / docker-compose-service.yml
├── Dockerfile
├── Makefile
└── mix.exs / mix.lock
```

## `lib/builderx_api/` – Phân theo nhóm domain

### Account & Auth

* `accounts/` – User, login, role.
* `api_keys/` – Token developer.
* `invitations/` – Mời thành viên.
* `otp_codes/` – OTP / passwordless.
* `permissions/` – RBAC permission.
* `super_admin/` – Admin nội bộ Storecake.

### Site & Domain

* `sites/`, `site_products/`, `site_styles/`, `site_tag/`, `site_utms/`
* `domains/` – Domain management (verify, cert).
* `pages/`, `seos/`, `sitemaps/`
* `pwas/` – Progressive Web App config.

### Sản phẩm

* `products/`, `variations/`, `product_comments/`, `product_reviews/`, `product_measurements/`
* `categories/`, `tags/`, `ribbons/`
* `combo_products/`, `bonus_products/`
* `personal_product_designs/`
* `materials/`, `shapes/`
* `catalogs/`, `fb_catalogs/`, `tiktok_catalog_products/`, `google_merchant/`
* `collections/` (curated collection)
* `device_templates/` (theme template UI)

### Đơn hàng & Thanh toán

* `orders/`, `order_transactions/`
* `customer_invoices/`, `package_subscriptions/`, `packages/`
* `payments/`, `payment_accounts/`, `transactions_bank/`
* `customer_levels/`, `bonus_products/`, `promotion_advances/`

### Khách hàng & Marketing

* `customers/`, `contacts/`, `subscribers/`
* `commissions/`, `affiliates/`, `affiliate_storecakes/`, `user_affiliates/` (nằm tại folder gốc nếu dùng), `percent_com_for_sale/`
* `discounts/` (qua promotion_advances), `cart_triggers/`
* `automations/`, `notifications/`, `send_email/`

### Tích hợp

* `integrations/`, `intergrations/` (legacy, lưu ý chính tả)
* `partner_services/`, `merchant_syncs/`, `sync_pos/`
* `google_ad_accounts/`, `google_ad_transactions/`
* `google_merchant/`, `fb_catalogs/`, `tiktok_catalog_products/`
* `zalo_mini_app/`, `mini_app_controller` (web)
* `course_app/`
* `appointments/`, `appointments` cho service businesses
* `agents/`, `ai/` (AI assist)

### Nội dung

* `blogs/`, `templates/`, `global_sources/`
* `cms_files/`, `tinymces/`
* `form_data/`, `builder_data_grids/`
* `translations/`, `languages.ex`, `locale.ex`
* `images/`, `photos/`, `videos/`, `hls/`
* `fonts/`

### Logistics / Geo

* `geo/`, `shippings/`, `warehouses/`
* `block_phone_numbers/`, `phone_detect.ex`

### Audit & Logging

* `system_logs/`, `system_log_rollback.ex`
* `error_sync_logs/`
* `trackings/`, `short_links/`
* `transaction_task.ex`, `transaction_task_supervisor.ex`

### Background

* `business_cronjobs/` – Cron logic chuyên biệt.
* `workers/` – Worker domain.
* `db_collections/` – Mongo collection helper.

### Infra-level helpers

* `repo.ex`, `custom_ecto.ex`, `parse.ex`, `request.ex`
* `tools.ex`, `traversal.ex`, `statics.ex`, `time_util.ex`, `url`, `types`
* `ecto_middleware.ex`, `enum.ex`, `cache_manifest.ex`, `default_theme.ex`, `default_data/`
* `mailer.ex`, `image_resize.ex`, `aws_s3.ex`
* `elastic.ex`, `elastic_index.ex` (cấp domain)
* `redis/` (cấp infra) tách riêng `lib/redis/`

> Lưu ý: một số folder có tên gần giống (`integrations` vs `intergrations`). Khi tạo code mới, **dùng đúng tên đang được Phoenix compile**. Trước khi rename, search cross-codebase để tránh break.

## `lib/builderx_api_web/`

```
builderx_api_web/
├── endpoint.ex
├── router/
├── controllers/
│   ├── v1/                       # Endpoint chính (REST)
│   ├── crm_pancake_controller.ex
│   ├── fallback_controller.ex
│   ├── mini_app_controller.ex
│   ├── pancake_controller.ex
│   ├── super_admin_controller.ex
│   └── susa_controller.ex
├── channels/
├── plugs/                        # Auth, site context, rate limit,…
├── services/                     # Service mỏng giữa controller & domain
├── views/                        # JSON view
├── templates/                    # HTML (legacy)
├── presence.ex
├── schedule.ex                   # Quantum entry
└── telemetry.ex
```

## `config/`

| File                 | Mục đích                                                            |
| -------------------- | ------------------------------------------------------------------- |
| `config.exs`         | Cấu hình base (compile-time).                                       |
| `dev.exs`            | Dev overrides.                                                      |
| `test.exs`           | Test overrides (DB sandbox).                                        |
| `prod.exs`           | Prod base (không secret).                                           |
| `prod.secret.exs`    | Prod secret (gitignored / Ansible inject).                          |
| `env_config.exs`     | Đọc env runtime (`System.get_env/1`) – source of truth khi deploy.   |

## `priv/`

* `repo/migrations/` – migration Postgres thường.
* `repo/citus_migrations/` – migration Citus shard (nếu tách riêng).
* `repo/seeds.exs` – seed data.
* `static/` – asset đã build từ `assets/`.
* `gettext/` – translation file backend (chữ trong email/template).
* `cert/` – cert dev (nếu có).

## `assets/`

Frontend nội bộ (legacy) – không phải `builderx_spa`. Dùng để render một số trang admin server-side (Vue 3 + Ant Design Vue 3 nhúng bằng Webpack 4).

```
assets/
├── webpack.config.js
├── package.json
├── src/
└── static/
```

## Quy tắc tạo domain mới

1. Tạo `lib/builderx_api/<domain>/` chứa schema + context.
2. Migration ở `priv/repo/migrations/` (hoặc `citus_migrations` nếu là bảng shard).
3. Thêm controller `lib/builderx_api_web/controllers/v1/<domain>_controller.ex`.
4. Đăng ký route trong `lib/builderx_api_web/router/...` (theo prefix `/api/v1`).
5. Thêm view `lib/builderx_api_web/views/<domain>_view.ex`.
6. Nếu cần index Elastic → thêm module `<domain>/elastic.ex`.
7. Nếu cần publish event → dùng `Outbox` thay vì gọi Rabbit/Kafka trực tiếp.
8. Test ở `test/builderx_api/<domain>/` + `test/builderx_api_web/controllers/`.

## Tham chiếu

* [Architecture](architecture.md)
* [Domains](domains.md)
* [Database](database.md)
* [Integrations](integrations.md)
