---
sidebar_position: 3
title: Cấu trúc dự án
---

# Cấu trúc dự án

Bản đồ thư mục của `landing_page_backend`.

```text
landing_page_backend/
├── lib/
│   ├── landing_page/           # ① Domain
│   ├── landing_page_web/       # ② Lớp web
│   ├── workers/                # Worker Oban
│   ├── oban/                   # Cấu hình + mở rộng Oban
│   ├── queue/                  # Abstraction queue
│   ├── rabbit/                 # Producer / consumer AMQP
│   ├── event_streaming/        # Producer / consumer Kafka
│   ├── changes_log/            # Audit log
│   ├── outbox/                 # Pattern Outbox
│   ├── passive/                # Tiến trình giám sát chạy dài
│   ├── questdb/                # Client time-series
│   ├── access/                 # Helper ACL
│   ├── assets/                 # Helper asset cấp compile (không phải FE)
│   ├── dynamic_app.ex          # Supervisor động (đa tenant)
│   ├── prod_dynamic_app.ex     # Biến thể cho prod
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
│   └── …
├── assets/                     # Frontend nội bộ (Vue 3 + Webpack)
├── config/                     # Cấu hình Phoenix
├── priv/                       # Migration / static / gettext
├── replica/                    # Script logical replication
├── data/                       # Dataset lớn
├── ansible/                    # Playbook deploy
├── test/                       # Test
├── w_external_command/         # Worker external
├── docker-compose.yml / docker-compose-services.yml
├── Dockerfile
├── Makefile
├── add_verified_domain.sh
├── country_data.json
├── mix.exs / mix.lock
└── get-pip.py                  # Giữ lại cho tooling Python legacy
```

## `lib/landing_page/`

### Tài khoản và tổ chức

- `accounts/`, `organizations/`, `permissions/`, `access/`
- `partner_services/`

### Page builder và nội dung

- `pages/`, `global_sections/`, `global_tracks/`
- `email_templates/`, `email_template_suport.ex`
- `fonts/`, `images/`, `remove_bacgrounds/` (lưu ý chính tả)
- `emoji/`, `abbreviation.ex`

### Form và dataset

- `form_data/`, `datasets/`
- `forbidden_keywords/`, `detect_phone_number.ex`, `detect_scam.ex`

### Thanh toán và thương mại

- `payments/`, `pos/`
- `commissions/`, `afiliates/` (chính tả thiếu chữ "f")
- `campaigns/`

### Tích hợp

- `intergrations/`, `integrations/` (cả hai tên đều có)
- `shopify/`, `sapo/`, `haravan/`
- `sheets/` (Google Sheets)
- `partner_services/`

### Domain và short link

- `domains/`, `domains_error.ex`
- `short_links/`

### Analytics

- `analytics/`, `pixel_tracking/`, `statistics/`
- `conversion_api.ex`
- `event_streaming/` (Kafka)
- `questdb/`

### Địa lý và IP

- `geo/`, `ip2locations/`, `IpUtils.ex`

### Audit và log

- `changes_log/`, `outbox/`
- `error_sync_logs` (khi có)

### Helper hạ tầng

- `repo.ex`, `custom_ecto.ex`, `ecto_middleware.ex`, `enum.ex`
- `async.ex`, `cache.ex`, `collapser.ex`, `trace.ex`
- `aws_s3.ex`, `image_resizer.ex`
- `redis.ex`, `redis_pubsub.ex`, `redlock.ex`
- `elastic.ex`, `elastic_index.ex`
- `email.ex`, `mailer.ex`
- `run.ex`, `manage.ex`

## `lib/landing_page_web/`

```text
landing_page_web/
├── endpoint.ex
├── router.ex                  # API admin + nội bộ
├── public_api_router.ex       # Endpoint public
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

- `repo/migrations/` — Migration.
- `repo/seeds.exs` — Seed.
- `static/` — Asset đã build.
- `gettext/` — Bản dịch backend.

## `assets/`

Frontend nội bộ Vue 3 + Webpack 4, phục vụ một số trang admin render server-side. Khi sửa, chạy `cd assets && npm run watch`. Build cuối nằm trong `priv/static`.

## `replica/`

Script cho logical replication Postgres:

- `pg_upgrade.sh` — Nâng version data.
- `update_primary_config.sh` — Cập nhật cấu hình primary.
- `init_pub.sh` — Tạo publication.
- `init_data_replica.sh` — Sync data lần đầu sang replica.
- `init_sub.sh` — Tạo subscription.
- `add_table_replica.sh` — Thêm bảng vào publication.

Gói qua các target Makefile (`make update-primary-config`, `make init-replica`, `make migrate-all`). Xem [Cơ sở dữ liệu + Replica](./database.md).

## `workers/`

Mỗi tệp là một worker Oban hoặc consumer (xem [Worker (Oban) và Queue](./workers.md)).

## `ansible/`

Playbook theo từng vai trò: `deploy_backend.yml`, `deploy_render.yml`, `deploy_builder.yml`, `deploy_editor.yml`, `deploy_cart.yml`, `deploy_tikpage.yml`, `deploy_worker.yml`, `deploy_staging.yaml`, kèm `hotfix/*.yaml`. Tách stack theo vai trò để rollout an toàn từng phần.

## Quy tắc thêm domain mới

1. Tạo `lib/landing_page/<domain>/`.
2. Migration trong `priv/repo/migrations/`.
3. Controller admin ở `lib/landing_page_web/controllers/v1/`.
4. Endpoint public không cần auth → đăng ký trong `public_api_router.ex` qua controller riêng có pipeline `:public_api`.
5. Job nền → `lib/workers/<name>_worker.ex` (Oban).
6. Event cross-domain → outbox + Rabbit / Kafka.
7. Test ở `test/landing_page/<domain>/`.
