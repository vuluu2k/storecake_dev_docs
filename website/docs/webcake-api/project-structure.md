---
sidebar_position: 3
title: Cấu trúc dự án
---

# Project structure

Bản đồ thư mục `landing_page_backend`.

```
landing_page_backend/
├── lib/
│   ├── landing_page/           # ① Domain
│   ├── landing_page_web/       # ② Web layer
│   ├── workers/                # Oban workers
│   ├── oban/                   # Oban config + extension
│   ├── queue/                  # Queue helper abstraction
│   ├── rabbit/                 # AMQP producer/consumer
│   ├── event_streaming/        # Kafka producer/consumer
│   ├── changes_log/            # Audit log
│   ├── outbox/                 # Outbox pattern
│   ├── passive/                # Long-running supervised
│   ├── questdb/                # Time-series client
│   ├── access/                 # ACL helpers
│   ├── assets/                 # Compile-time asset utils (not FE)
│   ├── dynamic_app.ex          # Dynamic supervisor (multi-tenant)
│   ├── prod_dynamic_app.ex     # Variant cho prod
│   ├── application.ex
│   ├── repo.ex                 # Ecto Repo
│   ├── manage.ex
│   ├── tools.ex / traversal.ex / trace.ex
│   ├── elastic.ex / elastic_index.ex
│   ├── async.ex / cache.ex / collapser.ex / custom_ecto.ex
│   ├── ecto_middleware.ex / enum.ex
│   ├── email.ex / email_template_suport.ex / mailer.ex
│   ├── image_resizer.ex / IpUtils.ex
│   ├── detect_phone_number.ex / detect_scam.ex
│   ├── redis.ex / redis_pubsub.ex / redlock.ex
│   ├── request.ex / run.ex
│   ├── aws_s3.ex
│   ├── landing_page_web.ex / landing_page.ex
│   └── …
├── assets/                     # FE nội bộ (Vue 3 + Webpack)
├── config/                     # Phoenix config
├── priv/                       # Migration / static / gettext
├── replica/                    # Script logical replication
├── data/                       # Dataset lớn
├── ansible/                    # Playbook deploy
├── test/                       # Test
├── w_external_command/         # Worker chạy external command
├── docker-compose.yml / docker-compose-services.yml
├── Dockerfile
├── Makefile
├── add_verified_domain.sh
├── country_data.json
├── mix.exs / mix.lock
└── get-pip.py                  # Lưu lại để build python tools (deprecated)
```

## `lib/landing_page/`

### Account & Tổ chức

* `accounts/`, `organizations/`, `permissions/`, `access/`
* `partner_services/`

### Page builder & Content

* `pages/`, `global_sections/`, `global_tracks/`
* `email_templates/`, `email_template_suport.ex`
* `fonts/`, `images/`, `remove_bacgrounds/` (lưu ý chính tả)
* `emoji/`, `abbreviation.ex`

### Forms & Dataset

* `form_data/`, `datasets/`
* `forbidden_keywords/`, `detect_phone_number.ex`, `detect_scam.ex`

### Payments & Commerce

* `payments/`, `pos/`
* `commissions/`, `afiliates/` (lưu ý chính tả "afiliates")
* `campaigns/`

### Tích hợp

* `intergrations/`, `integrations/` (folder trùng concept; cẩn thận khi tạo mới — dùng tên đang được compile)
* `shopify/`, `sapo/`, `haravan/`
* `sheets/` (Google Sheets)
* `partner_services/`

### Domains & Short links

* `domains/`, `domains_error.ex`
* `short_links/`

### Analytics

* `analytics/`, `pixel_tracking/`, `statistics/`
* `conversion_api.ex`
* `event_streaming/` (Kafka)
* `questdb/`

### Geo & IP

* `geo/`, `ip2locations/`, `IpUtils.ex`

### Audit / log

* `changes_log/`, `outbox/`
* `error_sync_logs` (tên file/folder thực tế khi triển khai)

### Infra helpers

* `repo.ex`, `custom_ecto.ex`, `ecto_middleware.ex`, `enum.ex`
* `async.ex`, `cache.ex`, `collapser.ex`, `trace.ex`
* `aws_s3.ex`, `image_resizer.ex`
* `redis.ex`, `redis_pubsub.ex`, `redlock.ex`
* `elastic.ex`, `elastic_index.ex`
* `email.ex`, `mailer.ex`
* `run.ex`, `manage.ex`

## `lib/landing_page_web/`

```
landing_page_web/
├── endpoint.ex
├── router.ex                  # Admin & API nội bộ
├── public_api_router.ex       # Public endpoint (landing publish, webhook)
├── controllers/
│   ├── v1/
│   ├── alert_controller.ex
│   ├── auth_controller.ex
│   ├── fallback_controller.ex
│   ├── public_api_controller.ex
│   ├── super_admin_controller.ex
│   └── third_party_controller.ex
├── channels/
├── plugs/
├── templates/
├── views/
└── gettext.ex
```

## `priv/`

* `repo/migrations/` – Migration chính.
* `repo/seeds.exs` – Seed.
* `static/` – Static asset đã build từ `assets/`.
* `gettext/` – Locale backend.

## `assets/`

Vue 3 + Webpack 4 FE legacy phục vụ một số trang admin được Phoenix render. Khi dev sửa `assets/`, chạy `cd assets && npm run watch`; build cuối được nhúng vào `priv/static`.

## `replica/`

Script + config logical replication Postgres:

* `pg_upgrade.sh` – Upgrade data version.
* `update_primary_config.sh` – Cập nhật config primary (pub).
* `init_pub.sh` – Tạo publication.
* `init_data_replica.sh` – Khởi tạo data replica.
* `init_sub.sh` – Tạo subscription bên replica.
* `add_table_replica.sh` – Add table vào replication.

Sử dụng qua Makefile (`make update-primary-config`, `make init-replica`, `make migrate-all`). Xem [Database & replica](database.md).

## `workers/` (top-level lib)

Mỗi file là module Oban worker hoặc consumer (xem [Workers & Queue](workers.md)).

## `ansible/`

Playbook deploy: `deploy_backend.yml`, `deploy_render.yml`, `deploy_builder.yml`, `deploy_editor.yml`, `deploy_cart.yml`, `deploy_tikpage.yml`, `deploy_worker.yml`, `deploy_staging.yaml`, `hotfix/*.yaml`.

Mỗi playbook target một role khác nhau (backend API, render service, builder, editor, cart, tikpage,…). Triển khai chia nhỏ giúp rollout an toàn.

## Convention thêm mới

1. Domain mới → folder `lib/landing_page/<domain>/`.
2. Migration → `priv/repo/migrations/`.
3. Controller `lib/landing_page_web/controllers/v1/<domain>_controller.ex`.
4. Endpoint public (không auth) → đặt vào `public_api_router.ex`, qua `public_api_controller.ex` hoặc controller riêng có pipeline `:public_api`.
5. Job nền → `lib/workers/<name>_worker.ex` (Oban).
6. Sự kiện cross-domain → outbox + Rabbit/Kafka.
7. Test ở `test/landing_page/<domain>/`.

## Tham chiếu

* [Architecture](architecture.md)
* [Database & replica](database.md)
* [Workers & Queue](workers.md)
* [Integrations](integrations.md)
* [Environment](environment.md)
