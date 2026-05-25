---
sidebar_position: 2
title: Kiến trúc
---

# Kiến trúc

Cách `builderx_api` được phân lớp và tương tác với phần còn lại của hệ thống.

## Bức tranh tổng quan

```text
                ┌──────────────────────────────────────────────────────────┐
                │                       Client                              │
                │   builderx_spa, mobile, partner, super-admin, pancake…    │
                └──────────────┬────────────────────────┬───────────────────┘
                               │ HTTP / WebSocket       │ Webhook
                               ▼                        ▼
                       ┌─────────────────────────────────────────┐
                       │           Phoenix Endpoint              │
                       │  (plug: CORS, auth, rate limit,…)       │
                       └─────────┬──────────────┬────────────────┘
                                 │ Router       │ Channel
                                 ▼              ▼
                ┌─────────────────────┐  ┌────────────────────────┐
                │ Controller / View   │  │ Channel (realtime)     │
                └─────────┬───────────┘  └──────────┬─────────────┘
                          │                          │
                          ▼                          ▼
                ┌─────────────────────────────────────────────────┐
                │      Domain module (lib/builderx_api/)          │
                │  Accounts, Products, Orders, Sites, Customers,  │
                │  Payments, Integrations, Catalogs, …            │
                └──────┬───────────┬───────────┬─────────┬────────┘
                       │           │           │         │
                       ▼           ▼           ▼         ▼
                 Citus (PG)   Elasticsearch  Redis    RabbitMQ / Kafka
                 MongoDB      QuestDB        S3       SMTP / Webhook
```

## Phân lớp mã nguồn

```text
lib/
├── builderx_api/              # ① Domain — logic nghiệp vụ + Ecto schema
├── builderx_api_web/          # ② Lớp web — router, controller, channel, view, plug
├── cronjob/                   # Quantum scheduler + job
├── rabbit/                    # Producer / consumer RabbitMQ
├── kafka/                     # Producer / consumer Kafka
├── ets/                       # Cache in-memory
├── search/                    # Helper Elasticsearch (DSL, mapping)
├── redis/                     # Helper Redis (cache, lock, pubsub)
├── outbox/                    # Pattern Outbox (event transactional)
├── pool/                      # Worker Poolboy
├── passive/                   # Tiến trình giám sát chạy dài
├── questdb/                   # Client time-series
├── qwik/                      # Dịch vụ AI / quick-action
├── landingpage/               # Cầu nối tới landing_page_backend
├── dynamic_app.ex             # Supervisor động (đa tenant)
├── application.ex             # OTP Application
└── …
```

### ① Domain (`lib/builderx_api/`)

Mỗi domain là một thư mục cộng với module gốc cùng tên:

```text
lib/builderx_api/products/
├── product.ex          # Ecto schema
├── product_variant.ex
├── products.ex         # Context (CRUD + business)
├── elastic.ex          # Cầu nối sang index Elasticsearch
├── events.ex           # Phát event qua Rabbit/Kafka
└── …
```

Quy tắc:

- Phía gọi bên ngoài chỉ chạm module context (`BuilderxApi.Products.list/2`, `BuilderxApi.Products.create/2`).
- Không gọi `Repo` bên ngoài context.
- Schema gắn liền changeset và validation; không mang `Plug.Conn` vào schema.

### ② Lớp web (`lib/builderx_api_web/`)

```text
builderx_api_web/
├── endpoint.ex                # Plug pipeline gốc
├── router/                    # Router con theo prefix
├── controllers/
│   ├── v1/                    # API admin / public v1
│   ├── pancake_controller.ex  # Endpoint Pancake legacy
│   ├── super_admin_controller.ex
│   ├── susa_controller.ex
│   ├── crm_pancake_controller.ex
│   ├── mini_app_controller.ex
│   └── fallback_controller.ex
├── channels/                  # Phoenix Channels (realtime)
├── plugs/                     # Auth, site context, rate limit, audit
├── services/                  # Service mỏng cho controller
├── views/                     # JSON view
├── templates/                 # HTML (legacy)
├── schedule.ex                # Entry Quantum
├── telemetry.ex
└── presence.ex                # Phoenix.Presence
```

Quy tắc:

- Controller mỏng: parse param → gọi context → render view.
- Plug đảm nhận xác thực (Bearer JWT), gắn site context, rate limit, audit.
- Topic channel theo cấu trúc `site:<site_id>`, `account:<account_id>`, `super_admin:lobby`.

## Cây giám sát OTP

`application.ex` (rút gọn):

```text
BuilderxApi.Application (Supervisor :one_for_one)
├── BuilderxApi.Repo
├── BuilderxApi.Citus
├── Phoenix.PubSub
├── BuilderxApiWeb.Endpoint
├── BuilderxApi.DynamicApp        # spawn worker theo site
├── Rabbit.Supervisor
├── Kafka.Supervisor
├── Redis.Supervisor
├── Pool.Supervisor               # poolboy
├── Cronjob.Scheduler             # Quantum
├── Passive.Supervisor
└── …
```

`DynamicApp` spawn GenServer riêng theo site (cache ETS, indexer, cron riêng cho từng tenant). Đọc `dynamic_app.ex` để hiểu vòng đời khi onboard site mới.

## Đa tenant

- Phần lớn bảng có cột `site_id` (UUID). Index theo `site_id` để Citus phân tán hiệu quả.
- Bảng global (account, plan, geo) nằm trên repo Postgres thường (không shard).
- Chi tiết Citus xem [Cơ sở dữ liệu](./database.md).

## Tích hợp bên ngoài

| Tích hợp | Vị trí code | Ghi chú |
| --- | --- | --- |
| Pancake CRM | `pancake_controller`, các module liên quan | OAuth + webhook |
| Sapo / Haravan / Shopify | `lib/builderx_api/integrations` | Đồng bộ sản phẩm / đơn hàng |
| Google Drive / Sheets | `lib/builderx_api/...` | Đồng bộ danh mục, export |
| Stripe | `lib/builderx_api/payments` | Gói cước / subscription |
| SMTP | `lib/email/`, Bamboo | Email transactional |
| Webhook | `lib/builderx_api/...` + `outbox` | Đảm bảo idempotent qua outbox |
| Elasticsearch | `lib/search/`, `<domain>/elastic.ex` | Index sản phẩm / khách hàng / đơn |
| MongoDB | `lib/db_collections/` | Document có cấu trúc động |

Xem danh sách đầy đủ tại [Tích hợp](./integrations.md).

## Realtime

- Channel join cần token (`BuilderxApiWeb.UserSocket.connect/3`).
- Topic phổ biến: `site:<id>:editor`, `site:<id>:order`, `account:<id>:notification`.
- Phát event từ domain qua `Phoenix.PubSub` hoặc `BuilderxApiWeb.Endpoint.broadcast/3`.

## Các luồng nền

1. **Outbox** — Domain ghi DB **và** ghi một row vào outbox trong cùng transaction; dispatcher đẩy ra Rabbit / Kafka / webhook sau đó.
2. **Rabbit consumer** — `lib/rabbit/` khai báo các consumer (`IndexingConsumer`, `TaskPoolConsumer`,…). Được supervisor khởi động; có thể chạy thủ công khi debug.
3. **Kafka consumer** — Analytic và conversion. Mỗi consumer khai báo group + topic.
4. **Cronjob** — `lib/cronjob/` + `lib/builderx_api/business_cronjobs/` chứa job định kỳ.
5. **Worker ad-hoc** — `lib/passive/`, `lib/pool/`.

## Vòng đời request

```text
HTTP request
 → Endpoint plug (parser, CORS)
 → AuthPlug (xác minh JWT, gán current_user)
 → SiteContextPlug (gán site_id)
 → Router → Controller action
 → Context (lib/builderx_api/<domain>)
 → Repo (Postgres) / Elastic / Redis
 → View (JSON) → response
 → Outbox / Channel broadcast (nếu có ghi)
```

## Tài liệu liên quan

- [Cấu trúc dự án](./project-structure.md)
- [Bounded context](./domains.md)
- [Cơ sở dữ liệu](./database.md)
- [Tích hợp](./integrations.md)
- [Cronjob](./cronjobs.md)
- [Runbook](./run.md)
- [Lỗi thường gặp](./error.md)
