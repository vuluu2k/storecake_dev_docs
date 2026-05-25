---
sidebar_position: 2
title: Kiến trúc
---

# Kiến trúc

`landing_page_backend` (Webcake API) thiên về **page builder + publish + analytics**. Khác với `builderx_api` (tập trung vào thương mại), service này phụ thuộc nhiều vào **Oban** cho job nền và **Kafka** cho stream sự kiện. Tài liệu này mô tả các lớp và những luồng quan trọng.

## Bức tranh tổng quan

```text
                   ┌────────────────────────────────────────────────────────┐
                   │                       Client                            │
                   │  builderx_spa (landing builder), trang landing public,  │
                   │  Webhook (Sapo/Haravan/Shopify/Paypal/Stripe), Mobile   │
                   └─────────┬─────────────────────────────────┬─────────────┘
                             │ HTTP/HTTPS                      │ WebSocket
                             ▼                                 ▼
                ┌────────────────────────────────────────────────────────┐
                │              Phoenix Endpoint                          │
                │  CORS · Auth (JWT) · Rate limit · Plug site context    │
                └──────┬───────────────┬──────────────────┬───────────────┘
                       │ Router        │ Public API       │ Channel
                       ▼               ▼                  ▼
              ┌───────────────────────────────────────────────────────┐
              │             Domain (lib/landing_page/)                │
              │ Page · Form · Payment · Integration · Analytic…      │
              └──────┬───────────┬────────────┬─────────────┬─────────┘
                     │           │            │             │
                     ▼           ▼            ▼             ▼
              Postgres      Oban Queue    Rabbit/Kafka    Redis / S3
              (+ replica)   (DB-backed)   (event stream)  (cache / asset)
```

## Phân lớp

```text
lib/
├── landing_page/             # ① Logic domain + Ecto schema
├── landing_page_web/         # ② Lớp web (router, controller, channel, plug)
├── workers/                  # ③ Worker Oban (cron / event)
├── oban/                     # Cấu hình + queue cho Oban
├── queue/                    # Abstraction cho queue
├── rabbit/                   # Consumer RabbitMQ
├── event_streaming/          # Producer / consumer Kafka
├── changes_log/              # Audit trail
├── outbox/                   # Pattern Outbox
├── passive/                  # Tiến trình giám sát chạy dài
├── questdb/                  # Client time-series
├── access/                   # Helper ACL (lib/access)
├── assets/                   # Helper asset cấp compile (không phải FE)
├── dynamic_app.ex            # Supervisor động (đa tenant)
├── prod_dynamic_app.ex
├── application.ex            # Entry OTP
├── repo.ex                   # Ecto Repo
├── manage.ex                 # Helper admin
├── tools.ex / traversal.ex   # Helper tổng quát
├── elastic.ex / elastic_index.ex
└── …
```

### ① Domain (`lib/landing_page/`)

Cấu trúc thư mục phản ánh các nhóm page builder + capture lead + analytics. Một số đáng chú ý:

- **`pages/`** — Landing page (block, version, publish).
- **`global_sections/`, `global_tracks/`** — Section / tracking script dùng chung.
- **`form_data/`, `datasets/`** — Form capture lead, dataset tham chiếu.
- **`payments/`, `pos/`** — Thanh toán và POS.
- **`integrations/`, `intergrations/`** — Tích hợp đối tác (cả hai tên đều tồn tại).
- **`shopify/`, `sapo/`, `haravan/`** — Adapter nền tảng eCommerce.
- **`organizations/`** — Tổ chức đa tài khoản.
- **`accounts/`, `permissions/`, `access/`** — User và RBAC.
- **`afiliates/`, `commissions/`, `campaigns/`** — Affiliate / campaign (lưu ý chính tả).
- **`pixel_tracking/`, `analytics/`, `conversion_api.ex`** — Đo conversion và analytic.
- **`statistics/`** — Báo cáo.
- **`partner_services/`** — Đối tác cung cấp dịch vụ.
- **`scheduler.ex`, `schedules/`** — Lịch hẹn và cron domain.
- **`email_templates/`** — Template email transactional.
- **`fonts/`, `images/`, `remove_bacgrounds/`** — Asset (lưu ý chính tả "bacgrounds").
- **`domains/`, `domains_error.ex`, `short_links/`** — Domain, redirect.
- **`forbidden_keywords/`, `detect_scam.ex`, `detect_phone_number.ex`** — Anti-abuse.
- **`sheets/`** — Đồng bộ Google Sheets.
- **`ip2locations/`** — Geo IP.
- **`changes_log/`** — Audit log.
- **`outbox/`** — Outbox dispatcher.
- **`run.ex`** — Entry script vận hành.
- **`request.ex`, `ecto_middleware.ex`, `enum.ex`, `cache.ex`** — Helper hạ tầng.

Quy tắc (giống `builderx_api`):

- Phía gọi bên ngoài chỉ chạm context, không động vào `Repo`.
- Cross-domain communicate qua Outbox + Oban / Rabbit / Kafka.
- Schema mang theo changeset; không leak Plug.

### ② Lớp web (`lib/landing_page_web/`)

```text
landing_page_web/
├── endpoint.ex
├── router.ex                # API admin + nội bộ
├── public_api_router.ex     # Endpoint public (landing hit, form submit, webhook)
├── controllers/
│   ├── v1/                  # API admin
│   ├── alert_controller.ex
│   ├── auth_controller.ex
│   ├── fallback_controller.ex
│   ├── public_api_controller.ex
│   ├── super_admin_controller.ex
│   └── third_party_controller.ex
├── channels/
├── plugs/                   # Auth, site context, rate limit, captcha
├── templates/               # HTML render server-side (legacy)
├── views/                   # JSON view
└── gettext.ex
```

Điểm cần lưu: dự án có **hai router**:

- `router.ex` — API admin + nội bộ (cần auth).
- `public_api_router.ex` — endpoint public (landing publish, form submit, webhook).

### ③ Worker (`lib/workers/`)

Mỗi tệp là một Oban worker (`use Oban.Worker`) hoặc consumer:

| Worker | Mục đích |
| --- | --- |
| `analytics_worker.ex` | Gộp event analytics theo batch. |
| `botcake_worker.ex` | Gửi event sang Botcake. |
| `domain_worker.ex` | Verify domain TXT + SSL. |
| `draft_form_worker.ex` | Xử lý lead dạng draft. |
| `email_worker.ex` | Gửi email transactional. |
| `form_data_worker.ex` | Đẩy lead sang CRM / Sheets / queue. |
| `google_worker.ex` | Job Google Ads / Sheets / Drive. |
| `indexing_worker.ex` | Index Elasticsearch. |
| `main_worker.ex` | Worker tổng / fallback. |
| `partner_service_worker.ex` | Job partner service. |
| `susa_worker.ex` | Đồng bộ Susa. |
| `task_pool_worker.ex` | Task tuần tự tổng quát. |
| `transactions_worker.ex` | Đối soát giao dịch. |

Xem [Worker (Oban) và Queue](./workers.md).

## OTP / giám sát

`application.ex` khởi động:

- `LandingPage.Repo`
- `Phoenix.PubSub`
- `LandingPageWeb.Endpoint`
- `Oban` supervisor (cấu hình theo từng env).
- `Quantum` scheduler (`LandingPage.Scheduler`).
- `LandingPage.DynamicApp` / `ProdDynamicApp` — supervisor theo tenant.
- `Rabbit.Supervisor`, `EventStreaming.Supervisor`.
- `Redis.Supervisor`.
- `Passive.Supervisor`.

## Đa tenant

- Phần lớn bảng scope theo `account_id` hoặc `organization_id`.
- Không shard ngang (không Citus); dựa vào index + partition + offload sang replica.
- Replica Postgres dùng cho các workload analytic đọc nhiều.

## Vòng đời request

```text
HTTP request
 → Endpoint plug (CORS, JSON parse)
 → AuthPlug (JWT) hoặc PublicGuard (cho public_api_router)
 → Plug SiteContext / AccountContext
 → Router → Controller action
 → Context (lib/landing_page/<domain>)
 → Repo / Oban.insert / Redis / Rabbit
 → View (JSON) / template (HTML)
```

## Tài liệu liên quan

- [Cấu trúc dự án](./project-structure.md)
- [Bounded context](./domains.md)
- [Cơ sở dữ liệu + Replica](./database.md)
- [Worker (Oban) và Queue](./workers.md)
- [Tích hợp](./integrations.md)
- [Biến môi trường](./environment.md)
- [Triển khai](./deployment.md)
