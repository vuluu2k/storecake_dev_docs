---
sidebar_position: 3
title: Cấu trúc dự án
---

# Cấu trúc dự án

`builderx_api` có hơn 120 module domain dưới `lib/builderx_api/`. Tài liệu này nhóm chúng theo trách nhiệm để dev mới định vị code nhanh.

## Cấu trúc thư mục

```text
builderx_api/
├── lib/
│   ├── builderx_api/            # ① Logic domain
│   ├── builderx_api_web/        # ② Lớp web (HTTP + WebSocket)
│   ├── cronjob/                 # Quantum scheduler / job
│   ├── rabbit/                  # Producer / consumer RabbitMQ
│   ├── kafka/                   # Producer / consumer Kafka
│   ├── ets/                     # Cache in-memory
│   ├── search/                  # Helper Elasticsearch
│   ├── redis/                   # Helper Redis
│   ├── outbox/                  # Pattern Outbox
│   ├── pool/                    # Worker Poolboy
│   ├── passive/                 # Tiến trình giám sát chạy dài
│   ├── questdb/                 # Client time-series
│   ├── qwik/                    # AI / quick-action
│   ├── landingpage/             # Cầu nối sang landing_page_backend
│   ├── mix/                     # Mix task
│   ├── dynamic_app.ex           # Supervisor động (đa tenant)
│   └── …
├── assets/                      # Frontend nội bộ (Vue 3 + Webpack)
├── config/                      # Cấu hình Phoenix
├── priv/                        # Migration, static, gettext
├── test/                        # Test
├── data/                        # Dataset lớn (geo, taxonomy)
├── mongo/                       # Schema / seed Mongo
├── tools/                       # Script dev / ops
├── w_external_command/          # Worker external
├── ansible/                     # Playbook deploy
├── docker-compose.yml / docker-compose-service.yml
├── Dockerfile
├── Makefile
└── mix.exs / mix.lock
```

## `lib/builderx_api/` theo trách nhiệm

### Tài khoản và xác thực

- `accounts/` — User, account, mật khẩu, profile.
- `api_keys/` — Token cho integration của developer.
- `invitations/` — Mời thành viên.
- `otp_codes/` — Mã OTP (email / SMS).
- `permissions/` — Quyền theo RBAC.
- `super_admin/` — Tài khoản admin nội bộ của Storecake.

### Site và domain

- `sites/`, `site_products/`, `site_styles/`, `site_tag/`, `site_utms/`
- `domains/` — Tên miền tuỳ chỉnh (verify TXT, SSL).
- `pages/`, `seos/`, `sitemaps/`
- `pwas/` — Cấu hình PWA theo site.

### Sản phẩm

- `products/`, `variations/`, `product_comments/`, `product_reviews/`, `product_measurements/`
- `categories/`, `tags/`, `ribbons/`
- `combo_products/`, `bonus_products/`
- `personal_product_designs/`
- `materials/`, `shapes/`
- `catalogs/`, `fb_catalogs/`, `tiktok_catalog_products/`, `google_merchant/`
- `collections/`
- `device_templates/`

### Đơn hàng và thanh toán

- `orders/`, `order_transactions/`
- `customer_invoices/`, `package_subscriptions/`, `packages/`
- `payments/`, `payment_accounts/`, `transactions_bank/`
- `customer_levels/`, `promotion_advances/`

### Khách hàng và marketing

- `customers/`, `contacts/`, `subscribers/`
- `commissions/`, `affiliates/`, `affiliate_storecakes/`, `user_affiliates/`, `percent_com_for_sale/`
- `cart_triggers/`
- `automations/`, `notifications/`, `send_email/`

### Tích hợp

- `integrations/`, `intergrations/` (tên cũ — cả hai vẫn tồn tại)
- `partner_services/`, `merchant_syncs/`, `sync_pos/`
- `google_ad_accounts/`, `google_ad_transactions/`
- `google_merchant/`, `fb_catalogs/`, `tiktok_catalog_products/`
- `zalo_mini_app/`
- `course_app/`, `appointments/`
- `agents/`, `ai/`

### Nội dung

- `blogs/`, `templates/`, `global_sources/`
- `cms_files/`, `tinymces/`
- `form_data/`, `builder_data_grids/`
- `translations/`, `languages.ex`, `locale.ex`
- `images/`, `photos/`, `videos/`, `hls/`
- `fonts/`

### Logistics và địa lý

- `geo/`, `shippings/`, `warehouses/`
- `block_phone_numbers/`, `phone_detect.ex`

### Audit và log

- `system_logs/`, `system_log_rollback.ex`
- `error_sync_logs/`
- `trackings/`, `short_links/`
- `transaction_task.ex`, `transaction_task_supervisor.ex`

### Job nền

- `business_cronjobs/`
- `workers/`
- `db_collections/` (helper cho collection Mongo)

### Helper hạ tầng

- `repo.ex`, `custom_ecto.ex`, `parse.ex`, `request.ex`
- `tools.ex`, `traversal.ex`, `statics.ex`, `time_util.ex`, `url`, `types`
- `ecto_middleware.ex`, `enum.ex`, `cache_manifest.ex`, `default_theme.ex`, `default_data/`
- `mailer.ex`, `image_resize.ex`, `aws_s3.ex`
- `elastic.ex`, `elastic_index.ex`

> Một số thư mục tồn tại song song do lịch sử (`integrations` so với `intergrations`). Khi thêm code mới, dùng đúng tên đang được compile; refactor cẩn thận khi rename.

## `lib/builderx_api_web/`

```text
builderx_api_web/
├── endpoint.ex
├── router/
├── controllers/
│   ├── v1/                       # Endpoint REST chính
│   ├── crm_pancake_controller.ex
│   ├── fallback_controller.ex
│   ├── mini_app_controller.ex
│   ├── pancake_controller.ex
│   ├── super_admin_controller.ex
│   └── susa_controller.ex
├── channels/
├── plugs/                        # Auth, site context, rate limit,…
├── services/                     # Service mỏng
├── views/                        # JSON view
├── templates/                    # HTML (legacy)
├── presence.ex
├── schedule.ex                   # Entry Quantum
└── telemetry.ex
```

## `config/`

| Tệp | Mục đích |
| --- | --- |
| `config.exs` | Cấu hình base (compile-time). |
| `dev.exs` | Override cho dev. |
| `test.exs` | Override cho test (DB sandbox). |
| `prod.exs` | Cấu hình base cho prod (không secret). |
| `prod.secret.exs` | Secret prod (gitignored, do Ansible inject). |
| `env_config.exs` | Đọc env runtime (`System.get_env/1`). |

## `priv/`

- `repo/migrations/` — Migration Postgres.
- `repo/citus_migrations/` — Migration cho bảng Citus (khi tách).
- `repo/seeds.exs` — Seed data.
- `static/` — Asset đã build từ `assets/`.
- `gettext/` — Bản dịch backend (email, template).
- `cert/` — Cert dev (nếu có).

## `assets/`

Frontend nội bộ (legacy) — không phải `builderx_spa`. Phục vụ vài trang admin render server-side bằng Vue 3 + Ant Design Vue + Webpack 4.

## Quy tắc thêm domain mới

1. Tạo `lib/builderx_api/<domain>/` chứa schema + context.
2. Migration ở `priv/repo/migrations/` (hoặc `citus_migrations` nếu là bảng shard).
3. Controller `lib/builderx_api_web/controllers/v1/<domain>_controller.ex`.
4. Đăng ký route trong `lib/builderx_api_web/router/...` (prefix `/api/v1`).
5. View `lib/builderx_api_web/views/<domain>_view.ex`.
6. Thêm `<domain>/elastic.ex` nếu cần index.
7. Phát event qua `Outbox` — không gọi Rabbit / Kafka trực tiếp.
8. Test ở `test/builderx_api/<domain>/` và `test/builderx_api_web/controllers/`.
