---
sidebar_position: 2
title: Architecture
---

# Architecture

`landing_page_backend` (Webcake API) is page-builder oriented — publish landing pages, capture leads, and stream events. Unlike `builderx_api` (commerce focused), it relies heavily on **Oban** jobs and **Kafka** event streams. This page maps the layers and the critical flows.

## Big picture

```text
                   ┌────────────────────────────────────────────────────────┐
                   │                       Clients                           │
                   │  builderx_spa (landing builder), Public landing pages,  │
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
              (+ replica)   (DB-backed)   (event stream)  (cache / assets)
```

## Layers

```text
lib/
├── landing_page/             # ① Domain logic + Ecto schemas
├── landing_page_web/         # ② Web layer (router, controllers, channels, plugs)
├── workers/                  # ③ Oban workers (cron / event)
├── oban/                     # Oban config + queue declarations
├── queue/                    # Queue abstraction
├── rabbit/                   # RabbitMQ consumers
├── event_streaming/          # Kafka producers / consumers
├── changes_log/              # Audit trail
├── outbox/                   # Outbox pattern
├── passive/                  # Long-running supervised processes
├── questdb/                  # Time-series client
├── access/                   # ACL helpers (lib/access)
├── assets/                   # Compile-time asset helpers (not FE)
├── dynamic_app.ex            # Dynamic supervisor (multi-tenant)
├── prod_dynamic_app.ex
├── application.ex            # OTP entry
├── repo.ex                   # Ecto Repo
├── manage.ex                 # Admin helper
├── tools.ex / traversal.ex   # Utils
├── elastic.ex / elastic_index.ex
└── …
```

### ① Domain (`lib/landing_page/`)

Folder structure mirrors the page-builder + lead-capture + analytics domains. Some notable ones:

- **`pages/`** — Landing pages (blocks, versions, publish).
- **`global_sections/`, `global_tracks/`** — Reusable sections and tracking scripts.
- **`form_data/`, `datasets/`** — Lead-capture forms and reference datasets.
- **`payments/`, `pos/`** — Payments and POS integrations.
- **`integrations/`, `intergrations/`** — Partner integrations (both spellings exist).
- **`shopify/`, `sapo/`, `haravan/`** — eCommerce platform adapters.
- **`organizations/`** — Multi-account organizations.
- **`accounts/`, `permissions/`, `access/`** — Users + RBAC.
- **`afiliates/`, `commissions/`, `campaigns/`** — Affiliate / campaign (note the spelling).
- **`pixel_tracking/`, `analytics/`, `conversion_api.ex`** — Conversion + analytics.
- **`statistics/`** — Reporting.
- **`partner_services/`** — Service providers.
- **`scheduler.ex`, `schedules/`** — Domain-level cron + bookings.
- **`email_templates/`** — Transactional email templates.
- **`fonts/`, `images/`, `remove_bacgrounds/`** — Assets (note "bacgrounds" spelling).
- **`domains/`, `domains_error.ex`, `short_links/`** — Domains, redirects.
- **`forbidden_keywords/`, `detect_scam.ex`, `detect_phone_number.ex`** — Anti-abuse.
- **`sheets/`** — Google Sheets sync.
- **`ip2locations/`** — Geo IP.
- **`changes_log/`** — Audit log.
- **`outbox/`** — Outbox dispatcher.
- **`run.ex`** — Operational scripts entry-point.
- **`request.ex`, `ecto_middleware.ex`, `enum.ex`, `cache.ex`** — Infra helpers.

Rules (same as `builderx_api`):

- Outside callers go through the context — never `Repo` directly.
- Cross-domain communication goes via Outbox + Oban / Rabbit / Kafka.
- Schemas carry their own changesets; never leak Plug.

### ② Web layer (`lib/landing_page_web/`)

```text
landing_page_web/
├── endpoint.ex
├── router.ex                # Admin + internal APIs
├── public_api_router.ex     # Public endpoints (landing hit, form submit, webhooks)
├── controllers/
│   ├── v1/                  # Admin API
│   ├── alert_controller.ex
│   ├── auth_controller.ex
│   ├── fallback_controller.ex
│   ├── public_api_controller.ex
│   ├── super_admin_controller.ex
│   └── third_party_controller.ex
├── channels/
├── plugs/                   # Auth, site context, rate limit, captcha
├── templates/               # Server-rendered HTML (legacy)
├── views/                   # JSON views
└── gettext.ex
```

Notice the **two routers**:

- `router.ex` — admin + internal API (auth required).
- `public_api_router.ex` — public endpoints (landing publish, form submit, webhooks).

### ③ Workers (`lib/workers/`)

Each file is either an Oban worker (`use Oban.Worker`) or a consumer:

| Worker | Purpose |
| --- | --- |
| `analytics_worker.ex` | Aggregates analytics events in batches. |
| `botcake_worker.ex` | Sends events to Botcake. |
| `domain_worker.ex` | Domain TXT / SSL verification. |
| `draft_form_worker.ex` | Processes draft form submissions. |
| `email_worker.ex` | Sends transactional email async. |
| `form_data_worker.ex` | Pushes leads to CRM / Sheets / queues. |
| `google_worker.ex` | Google Ads / Sheets / Drive jobs. |
| `indexing_worker.ex` | Elastic / search indexing. |
| `main_worker.ex` | Generic / fallback. |
| `partner_service_worker.ex` | Partner-service jobs. |
| `susa_worker.ex` | Susa sync. |
| `task_pool_worker.ex` | Generic sequential tasks. |
| `transactions_worker.ex` | Transaction reconciliation. |

See [Workers (Oban) & Queue](./workers.md).

## OTP / supervision

`application.ex` boots:

- `LandingPage.Repo`
- `Phoenix.PubSub`
- `LandingPageWeb.Endpoint`
- `Oban` supervisor (per env config).
- `Quantum` scheduler (`LandingPage.Scheduler`).
- `LandingPage.DynamicApp` / `ProdDynamicApp` — tenant supervisor.
- `Rabbit.Supervisor`, `EventStreaming.Supervisor`.
- `Redis.Supervisor`.
- `Passive.Supervisor`.

## Multi-tenancy

- Most tables scope by `account_id` / `organization_id`.
- No horizontal sharding (no Citus); rely on indexes + partitioning + read-replica offload.
- The Postgres replica handles read-heavy analytics workloads.

## Request lifecycle

```text
HTTP request
 → Endpoint plug (CORS, JSON parse)
 → AuthPlug (JWT) or PublicGuard (for public_api_router)
 → SiteContext / AccountContext plug
 → Router → Controller action
 → Context (lib/landing_page/<domain>)
 → Repo / Oban.insert / Redis / Rabbit
 → View (JSON) / template (HTML)
```

## Further reading

- [Project structure](./project-structure.md)
- [Domains](./domains.md)
- [Database & replica](./database.md)
- [Workers (Oban) & Queue](./workers.md)
- [Integrations](./integrations.md)
- [Environment variables](./environment.md)
- [Deployment](./deployment.md)
