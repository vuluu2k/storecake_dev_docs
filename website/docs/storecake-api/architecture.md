---
sidebar_position: 2
title: Kiến trúc
---

# Architecture

Sơ đồ tổng quan, các lớp chính và cách `builderx_api` tương tác với ngoại vi.

## Bức tranh tổng

```
                ┌──────────────────────────────────────────────────────────┐
                │                       Clients                             │
                │   builderx_spa, mobile, partners, super-admin, pancake…   │
                └──────────────┬────────────────────────────┬───────────────┘
                               │ HTTP / WS                  │ Webhook
                               ▼                            ▼
                       ┌─────────────────────────────────────────┐
                       │           Phoenix Endpoint              │
                       │   (plugs: CORS, auth, rate limit,…)     │
                       └─────────┬──────────────┬────────────────┘
                                 │ Router       │ Channels
                                 ▼              ▼
                ┌─────────────────────┐  ┌────────────────────────┐
                │ Controllers / Views │  │ Channels (realtime)    │
                └─────────┬───────────┘  └──────────┬─────────────┘
                          │                          │
                          ▼                          ▼
                ┌─────────────────────────────────────────────────┐
                │           Domain modules (lib/builderx_api/)    │
                │   Accounts, Products, Orders, Sites, Customers, │
                │   Payments, Integrations, Catalogs, …           │
                └──────┬───────────┬───────────┬─────────┬────────┘
                       │           │           │         │
                       ▼           ▼           ▼         ▼
                 Citus (PG)   ElasticSearch  Redis     RabbitMQ / Kafka
                 MongoDB      QuestDB        S3        SMTP / Webhook
```

## Phân lớp code

```
lib/
├── builderx_api/              # ① Domain – Pure business logic + Ecto schemas
├── builderx_api_web/          # ② Web – Router, Controllers, Channels, Views, Plugs
├── cronjob/                   # Quantum scheduler & jobs
├── rabbit/                    # RabbitMQ consumer/producer
├── kafka/                     # Kafka producer/consumer
├── ets/                       # In-memory cache layer
├── search/                    # Elastic helpers (DSL, mapping)
├── redis/                     # Redis helpers (cache, lock, pubsub)
├── outbox/                    # Outbox pattern (transactional event)
├── pool/                      # Poolboy worker
├── passive/                   # Background services
├── questdb/                   # Time-series client
├── qwik/                      # AI/quick action services
├── landingpage/               # Bridge tới landing_page_backend
├── dynamic_app.ex             # Dynamic supervisor (multi-site runtime)
├── application.ex             # OTP Application
├── email.ex / mail templates  # Outbound email
├── error_tracker.ex           # Sentry/logger
├── guards.ex / validator.ex   # Domain guards & validators
└── …
```

### ① Domain modules (`lib/builderx_api/`)

Mỗi domain là một folder + file root cùng tên:

```
lib/builderx_api/products/
├── product.ex          # schema Ecto
├── product_variant.ex
├── products.ex         # context (CRUD + business)
├── elastic.ex          # bridge index Elastic
├── events.ex           # publish event Rabbit/Kafka
└── …
```

Quy tắc:

* Module ngoài chỉ gọi context (`BuilderxApi.Products.list/2`, `BuilderxApi.Products.create/2`).
* Không gọi `Repo` ngoài context.
* Schema nhúng changeset & validation; không leak Plug/Connection vào schema.
* Khi tạo domain mới: tạo folder, đặt context module, đăng ký supervisor (nếu cần) trong `application.ex`.

### ② Web layer (`lib/builderx_api_web/`)

```
builderx_api_web/
├── endpoint.ex                # Plug pipeline gốc
├── router/                    # Router con (chia theo prefix)
├── controllers/               # REST controller
│   ├── v1/                    # Public/admin v1 APIs
│   ├── pancake_controller.ex  # endpoint cho Pancake legacy
│   ├── super_admin_controller.ex
│   ├── susa_controller.ex
│   ├── crm_pancake_controller.ex
│   ├── mini_app_controller.ex
│   └── fallback_controller.ex
├── channels/                  # Phoenix Channels (realtime)
├── plugs/                     # Plug nội bộ (auth, site context, rate limit)
├── services/                  # Service layer (thin) cho controller
├── views/                     # JSON view
├── templates/                 # HTML view (legacy)
├── schedule.ex                # Quantum scheduler entry
├── telemetry.ex
└── presence.ex                # Phoenix.Presence
```

Quy tắc:

* Controller mỏng: parse param → gọi context → render view.
* `plugs/` phụ trách auth (Bearer JWT), site context, rate limit, audit.
* Channel topic theo cấu trúc `site:<site_id>`, `account:<account_id>`, `super_admin:lobby`.

## OTP / Supervision tree

`application.ex` (rút gọn):

```
BuilderxApi.Application (Supervisor :one_for_one)
├── BuilderxApi.Repo
├── BuilderxApi.Citus
├── Phoenix.PubSub
├── BuilderxApiWeb.Endpoint
├── BuilderxApi.DynamicApp        # spawn worker theo site
├── Rabbit.Supervisor             # consumer / producer queue
├── Kafka.Supervisor              # Brod producer/consumer
├── Redis.Supervisor
├── Pool.Supervisor               # poolboy workers
├── Cronjob.Scheduler             # Quantum
├── Passive.Supervisor
└── …
```

> `DynamicApp` spawn module GenServer riêng theo site khi cần (cache ETS, indexing job, multi-tenant cron). Đọc `dynamic_app.ex` để hiểu lifecycle khi onboard site mới.

## Multi-tenancy

* Đa số bảng có cột `site_id` (UUID). Index phân theo `site_id` → tận dụng Citus distribute.
* Một số bảng global (account, plan, geo) ở Postgres thường (không shard).
* Cấu hình Citus xem [Database](database.md).

## Tích hợp ngoại vi

| Tích hợp                | Vị trí code                                 | Ghi chú                                              |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Pancake CRM             | `lib/builderx_api/...` + `pancake_controller`| OAuth + webhook 2 chiều                              |
| Sapo / Haravan / Shopify| `lib/builderx_api/integrations`              | Sync product/order                                   |
| Google Drive / Sheets   | `lib/builderx_api/...`                       | Sync danh mục, export                                |
| Stripe                  | `lib/builderx_api/payments`                  | Plan, subscription                                   |
| SMTP                    | `lib/email/` + Bamboo                        | Email transactional                                  |
| Push / Webhook ngoài    | `lib/builderx_api/...` + `outbox`            | Đảm bảo idempotent qua outbox                        |
| ElasticSearch           | `lib/search/`, `lib/builderx_api/.../elastic.ex` | Index product, customer, order              |
| MongoDB                 | `lib/db_collections/` (+ schema)             | Lưu dữ liệu động                                     |

## Realtime

* Channel join cần auth token (`BuilderxApiWeb.UserSocket.connect/3`).
* Một số topic: `site:<id>:editor`, `site:<id>:order`, `account:<id>:notification`.
* Publish event từ domain bằng `Phoenix.PubSub` hoặc `BuilderxApiWeb.Endpoint.broadcast/3`.

## Background workflows

1. **Outbox**: domain ghi DB → ghi row outbox (cùng transaction) → outbox dispatcher đẩy sang Rabbit/Kafka/Webhook.
2. **Rabbit Consumers**: `lib/rabbit/` định nghĩa các consumer (`IndexingConsumer`, `TaskPoolConsumer`, …). Start trong supervisor; có thể chạy thủ công khi debug (xem [Run book](../run.md)).
3. **Kafka Consumers**: dùng cho analytic & conversion. Mỗi consumer định nghĩa group + topic.
4. **Cronjobs**: `lib/cronjob/` + `lib/builderx_api/business_cronjobs/` chứa job định kỳ.
5. **Workers ad-hoc**: `lib/passive/`, `lib/pool/`.

## Pipeline request điển hình

```
HTTP request
 → Endpoint plugs (parser, CORS)
 → AuthPlug (verify JWT, gán current_user)
 → SiteContextPlug (chọn site, gán site_id)
 → Router → Controller action
 → Context (lib/builderx_api/<domain>)
 → Repo (Postgres) / Elastic / Redis
 → View (JSON) → response
 → Outbox / Channel broadcast (nếu có write)
```

## Tham chiếu

* [Project structure](project-structure.md)
* [Domains](domains.md)
* [Database](database.md)
* [Integrations](integrations.md)
* [Cronjobs](cronjobs.md)
* [Run book](../run.md)
* [Error catalogue](../error.md)
