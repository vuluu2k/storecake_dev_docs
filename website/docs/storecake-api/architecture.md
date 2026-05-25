---
sidebar_position: 2
title: Architecture
---

# Architecture

How `builderx_api` is layered and how it talks to the rest of the platform.

## Big picture

```text
                ┌──────────────────────────────────────────────────────────┐
                │                       Clients                             │
                │   builderx_spa, mobile, partners, super-admin, pancake…   │
                └──────────────┬────────────────────────┬───────────────────┘
                               │ HTTP / WS              │ Webhook
                               ▼                        ▼
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
                │         Domain modules (lib/builderx_api/)      │
                │   Accounts, Products, Orders, Sites, Customers, │
                │   Payments, Integrations, Catalogs, …           │
                └──────┬───────────┬───────────┬─────────┬────────┘
                       │           │           │         │
                       ▼           ▼           ▼         ▼
                 Citus (PG)   ElasticSearch  Redis     RabbitMQ / Kafka
                 MongoDB      QuestDB        S3        SMTP / Webhook
```

## Code layout

```text
lib/
├── builderx_api/              # ① Domain — Pure business logic + Ecto schemas
├── builderx_api_web/          # ② Web — Router, Controllers, Channels, Views, Plugs
├── cronjob/                   # Quantum scheduler + jobs
├── rabbit/                    # RabbitMQ consumers / producers
├── kafka/                     # Kafka producers / consumers
├── ets/                       # In-memory cache layer
├── search/                    # Elastic helpers (DSL, mappings)
├── redis/                     # Redis helpers (cache, lock, pubsub)
├── outbox/                    # Outbox pattern (transactional events)
├── pool/                      # Poolboy workers
├── passive/                   # Long-running supervised processes
├── questdb/                   # Time-series client
├── qwik/                      # AI / quick-action services
├── landingpage/               # Bridge to landing_page_backend
├── dynamic_app.ex             # Dynamic supervisor (multi-tenant)
├── application.ex             # OTP Application
└── …
```

### ① Domain modules (`lib/builderx_api/`)

Each domain is a folder + a root module of the same name:

```text
lib/builderx_api/products/
├── product.ex          # Ecto schema
├── product_variant.ex
├── products.ex         # Context (CRUD + business rules)
├── elastic.ex          # Bridge to Elastic index
├── events.ex           # Publishes events (Rabbit/Kafka)
└── …
```

Rules:

- Outside callers only touch the context module (`BuilderxApi.Products.list/2`, `BuilderxApi.Products.create/2`).
- Never call `Repo` outside a context.
- Schemas hold their own changeset and validation; never leak `Plug.Conn` into a schema.

### ② Web layer (`lib/builderx_api_web/`)

```text
builderx_api_web/
├── endpoint.ex                # Root plug pipeline
├── router/                    # Sub-routers per prefix
├── controllers/
│   ├── v1/                    # Public / admin v1 APIs
│   ├── pancake_controller.ex  # Pancake legacy
│   ├── super_admin_controller.ex
│   ├── susa_controller.ex
│   ├── crm_pancake_controller.ex
│   ├── mini_app_controller.ex
│   └── fallback_controller.ex
├── channels/                  # Phoenix Channels (realtime)
├── plugs/                     # Auth, site context, rate limit, audit
├── services/                  # Thin service layer for controllers
├── views/                     # JSON views
├── templates/                 # HTML (legacy)
├── schedule.ex                # Quantum scheduler entry
├── telemetry.ex
└── presence.ex                # Phoenix.Presence
```

Rules:

- Controllers stay thin: parse params → call context → render view.
- Plugs in `plugs/` cover auth (Bearer JWT), site context, rate limiting, auditing.
- Channel topics follow `site:<site_id>`, `account:<account_id>`, `super_admin:lobby`.

## OTP / Supervision tree

`application.ex` (simplified):

```text
BuilderxApi.Application (Supervisor :one_for_one)
├── BuilderxApi.Repo
├── BuilderxApi.Citus
├── Phoenix.PubSub
├── BuilderxApiWeb.Endpoint
├── BuilderxApi.DynamicApp        # spawns workers per site
├── Rabbit.Supervisor
├── Kafka.Supervisor
├── Redis.Supervisor
├── Pool.Supervisor               # poolboy
├── Cronjob.Scheduler             # Quantum
├── Passive.Supervisor
└── …
```

`DynamicApp` spawns dedicated GenServers per site (ETS cache, indexing job, per-tenant cron). Skim `dynamic_app.ex` to understand onboarding behavior.

## Multi-tenancy

- Most tables include a `site_id` (UUID) column. Indices are partitioned by `site_id` so Citus can distribute.
- Global tables (account, plan, geo) stay on the regular Postgres repo (no sharding).
- Citus configuration is documented in [Database](./database.md).

## External integrations

| Integration | Code | Notes |
| --- | --- | --- |
| Pancake CRM | `pancake_controller`, related modules | OAuth + webhooks |
| Sapo / Haravan / Shopify | `lib/builderx_api/integrations` | Sync product / order |
| Google Drive / Sheets | `lib/builderx_api/...` | Catalog sync, export |
| Stripe | `lib/builderx_api/payments` | Plans / subscriptions |
| SMTP | `lib/email/`, Bamboo | Transactional email |
| Webhooks | `lib/builderx_api/...` + `outbox` | Idempotent via outbox |
| ElasticSearch | `lib/search/`, `<domain>/elastic.ex` | Product / customer / order index |
| MongoDB | `lib/db_collections/` | Dynamic-shape documents |

See [Integrations](./integrations.md) for the full list.

## Realtime

- Channel joins require an auth token (`BuilderxApiWeb.UserSocket.connect/3`).
- Common topics: `site:<id>:editor`, `site:<id>:order`, `account:<id>:notification`.
- Publish from a domain with `Phoenix.PubSub` or `BuilderxApiWeb.Endpoint.broadcast/3`.

## Background workflows

1. **Outbox** — A domain writes a row to outbox **inside** the same transaction as its main write; a dispatcher later forwards to Rabbit / Kafka / webhooks.
2. **Rabbit consumers** — `lib/rabbit/` declares consumers (`IndexingConsumer`, `TaskPoolConsumer`, …). Started by the supervisor; you can also boot them manually for debugging.
3. **Kafka consumers** — Analytic and conversion events. Each consumer declares its group + topic.
4. **Cronjobs** — `lib/cronjob/` + `lib/builderx_api/business_cronjobs/` contain scheduled jobs.
5. **Ad-hoc workers** — `lib/passive/`, `lib/pool/`.

## Request lifecycle

```text
HTTP request
 → Endpoint plugs (parser, CORS)
 → AuthPlug (verify JWT, assign current_user)
 → SiteContextPlug (assign site_id)
 → Router → Controller action
 → Context (lib/builderx_api/<domain>)
 → Repo (Postgres) / Elastic / Redis
 → View (JSON) → response
 → Outbox / Channel broadcast (if a write happened)
```

## Further reading

- [Project structure](./project-structure.md)
- [Domains](./domains.md)
- [Database](./database.md)
- [Integrations](./integrations.md)
- [Cronjobs](./cronjobs.md)
- [Run book](./run.md)
- [Error catalogue](./error.md)
