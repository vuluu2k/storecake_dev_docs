---
sidebar_position: 2
title: Kiến trúc
---

# Architecture

`landing_page_backend` (Webcake API) thiên về **page builder + publish + analytics**. Khác với `builderx_api` (thiên về e-commerce), service này có nhiều job nền chạy bằng Oban và stream sự kiện qua Kafka. Tài liệu này mô tả layer + flow data chính.

## Bức tranh tổng

```
                   ┌────────────────────────────────────────────────────────┐
                   │                       Clients                           │
                   │  builderx_spa (landing builder), Public landing,        │
                   │  Webhooks (Sapo/Haravan/Shopify/Paypal/Stripe), Mobile  │
                   └─────────┬─────────────────────────────────┬─────────────┘
                             │ HTTP/HTTPS                      │ WS
                             ▼                                 ▼
                ┌────────────────────────────────────────────────────────┐
                │              Phoenix Endpoint                          │
                │  CORS · Auth (JWT) · Rate limit · Site context plug    │
                └──────┬───────────────┬──────────────────┬───────────────┘
                       │ Router        │ Public API       │ Channels
                       ▼               ▼                  ▼
              ┌───────────────────────────────────────────────────────┐
              │             Domain (lib/landing_page/)                │
              │ Pages · Forms · Payments · Integrations · Analytics… │
              └──────┬───────────┬────────────┬─────────────┬─────────┘
                     │           │            │             │
                     ▼           ▼            ▼             ▼
              Postgres      Oban Queue    Rabbit/Kafka    Redis / S3
              (+ replica)   (DB-backed)   (event stream)  (cache / asset)
```

## Phân lớp

```
lib/
├── landing_page/             # ① Domain – business logic + Ecto schemas
├── landing_page_web/         # ② Web – router, controllers, channels, plugs
├── workers/                  # ③ Oban workers (cron / event)
├── oban/                     # Oban config + queue declaration
├── queue/                    # Queue abstraction layer
├── rabbit/                   # RabbitMQ producer/consumer
├── event_streaming/          # Kafka producer/consumer
├── changes_log/              # Audit trail
├── outbox/                   # Outbox pattern
├── passive/                  # Long-running supervised processes
├── questdb/                  # Time-series client
├── access/                   # ACL helper (lib/access)
├── assets/                   # Compile-time asset helper (KHÔNG phải FE)
├── dynamic_app.ex            # Dynamic supervisor cho multi-tenant
├── prod_dynamic_app.ex       # Variant cho prod
├── application.ex            # OTP entry
├── repo.ex                   # Ecto.Repo
├── manage.ex                 # Admin helper
├── tools.ex / traversal.ex   # Util
├── elastic.ex / elastic_index.ex  # Elastic bridge
└── …
```

### ① Domain (`lib/landing_page/`)

Tổ chức theo bounded context. Một số folder tiêu biểu:

* **`pages/`** – Landing page CMS (block, version, publish).
* **`global_sections/`, `global_tracks/`** – Section/tracking dùng chung.
* **`form_data/`, `datasets/`** – Form thu thập lead, dataset thông tin.
* **`payments/`, `pos/`** – Tích hợp thanh toán & POS.
* **`integrations/` (`intergrations/`)** – Tích hợp đối tác.
* **`shopify/`, `sapo/`, `haravan/`** – Adapter eCom platform.
* **`organizations/`** – Tổ chức (multi-account).
* **`accounts/`, `permissions/`, `access/`** – Quản lý user & RBAC.
* **`afiliates/`, `commissions/`, `campaigns/`** – Affiliate / campaign.
* **`pixel_tracking/`, `analytics/`, `conversion_api.ex`** – Đo lường conversion.
* **`statistics/`** – Báo cáo.
* **`partner_services/`** – Đối tác cung cấp dịch vụ.
* **`scheduler.ex`, `schedules/`** – Lịch hẹn / cron domain.
* **`email_templates/`** – Mẫu email.
* **`fonts/`, `images/`, `remove_bacgrounds/`** – Asset (lưu ý chính tả `bacgrounds`).
* **`domains/`, `domains_error.ex`, `short_links/`** – Domain & redirect.
* **`forbidden_keywords/`, `detect_scam.ex`, `detect_phone_number.ex`** – Anti-abuse.
* **`emoji/`, `abbreviation.ex`** – Util content.
* **`sheets/`** – Google Sheets sync.
* **`ip2locations/`** – Geo IP.
* **`changes_log/`** – Audit log (xem cùng tên ở root lib).
* **`outbox/`** – Outbox dispatcher.
* **`run.ex`** – Script entry point (chạy thủ công trong iex).
* **`request.ex`, `ecto_middleware.ex`, `enum.ex`, `cache.ex`** – Helper infra.

Quy tắc giống `builderx_api`:

* Ngoài context không chạm `Repo`.
* Cross-domain communicate qua **Outbox + queue** (Oban / Rabbit / Kafka).
* Schema giữ changeset + validation; không leak Plug.

### ② Web layer (`lib/landing_page_web/`)

```
landing_page_web/
├── endpoint.ex
├── router.ex                # Router chính (admin / API nội bộ)
├── public_api_router.ex     # Router public (landing publish hit)
├── controllers/
│   ├── v1/                  # API admin
│   ├── alert_controller.ex
│   ├── auth_controller.ex
│   ├── fallback_controller.ex
│   ├── public_api_controller.ex
│   ├── super_admin_controller.ex
│   └── third_party_controller.ex
├── channels/                # Realtime cho builder
├── plugs/                   # Auth, site context, rate limit, captcha
├── templates/               # HTML server-render (legacy)
├── views/                   # JSON view
└── gettext.ex
```

Lưu ý: router **chia 2 endpoint**:
* `router.ex` – cho admin & API nội bộ (yêu cầu auth).
* `public_api_router.ex` – endpoint công khai (landing publish, form submit, webhook).

### ③ Workers (`lib/workers/`)

Mỗi worker là một module Oban (`use Oban.Worker`) hoặc consumer:

| Worker                       | Mô tả                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `analytics_worker.ex`        | Tổng hợp event analytics theo batch.                     |
| `botcake_worker.ex`          | Tích hợp Botcake (gửi event/chatbot).                    |
| `domain_worker.ex`           | Verify domain (TXT), SSL.                                |
| `draft_form_worker.ex`       | Xử lý draft form data.                                   |
| `email_worker.ex`            | Gửi email transactional async.                           |
| `form_data_worker.ex`        | Đẩy lead vào CRM / Google Sheet / queue khác.            |
| `google_worker.ex`           | Google Ads/Sheet/Drive job.                              |
| `indexing_worker.ex`         | Index Elastic / search.                                  |
| `main_worker.ex`             | Worker tổng hợp / fallback.                              |
| `partner_service_worker.ex`  | Job partner services.                                    |
| `susa_worker.ex`             | Sync nội bộ Susa.                                        |
| `task_pool_worker.ex`        | Worker generic chạy task tuần tự.                        |
| `transactions_worker.ex`     | Đối soát giao dịch.                                      |

Chi tiết tại [Workers (Oban) & Queue](workers.md).

## OTP / Supervision

`application.ex` (rút gọn) khởi chạy:

* `LandingPage.Repo`
* `Phoenix.PubSub`
* `LandingPageWeb.Endpoint`
* `Oban` supervisor (đọc cấu hình từ `config/`).
* `Quantum` scheduler (`LandingPage.Scheduler`).
* `LandingPage.DynamicApp` / `ProdDynamicApp` – spawn supervisor theo tenant.
* `Rabbit.Supervisor`, `EventStreaming.Supervisor`.
* `Redis.Supervisor`.
* `Passive.Supervisor`.

## Multi-tenant

* Đa số bảng có `account_id` hoặc `organization_id`.
* Không shard ngang (Citus); thay vào đó dùng index theo `account_id` + partition.
* Replica Postgres cho phép tách read-heavy (analytics).

## Pipeline request

```
HTTP request
 → Endpoint plug (CORS, JSON parse)
 → AuthPlug (JWT) hoặc PublicGuard (cho public_api_router)
 → SiteContext/AccountContext plug
 → Router → Controller action
 → Context (lib/landing_page/<domain>)
 → Repo / Oban.insert / Redis / Rabbit
 → View (JSON) / template (HTML)
```

## Tham chiếu

* [Project structure](project-structure.md)
* [Database & replica](database.md)
* [Workers & Queue](workers.md)
* [Integrations](integrations.md)
* [Environment](environment.md)
* [Deployment](deployment.md)
