---
sidebar_position: 3
title: Project structure
---

# Project structure

Directory map of `landing_page_backend`.

```text
landing_page_backend/
├── lib/
│   ├── landing_page/           # ① Domain
│   ├── landing_page_web/       # ② Web layer
│   ├── workers/                # Oban workers
│   ├── oban/                   # Oban config + extensions
│   ├── queue/                  # Queue helper abstraction
│   ├── rabbit/                 # AMQP producers / consumers
│   ├── event_streaming/        # Kafka producers / consumers
│   ├── changes_log/            # Audit log
│   ├── outbox/                 # Outbox pattern
│   ├── passive/                # Long-running supervised processes
│   ├── questdb/                # Time-series client
│   ├── access/                 # ACL helpers
│   ├── assets/                 # Compile-time asset utils (not FE)
│   ├── dynamic_app.ex          # Dynamic supervisor (multi-tenant)
│   ├── prod_dynamic_app.ex     # Prod variant
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
├── assets/                     # In-repo FE (Vue 3 + Webpack)
├── config/                     # Phoenix config
├── priv/                       # Migrations / static / gettext
├── replica/                    # Logical replication scripts
├── data/                       # Large datasets
├── ansible/                    # Deploy playbooks
├── test/                       # Tests
├── w_external_command/         # External worker
├── docker-compose.yml / docker-compose-services.yml
├── Dockerfile
├── Makefile
├── add_verified_domain.sh
├── country_data.json
├── mix.exs / mix.lock
└── get-pip.py                  # Kept for legacy Python tooling
```

## `lib/landing_page/`

### Account & Tenancy

- `accounts/`, `organizations/`, `permissions/`, `access/`
- `partner_services/`

### Page builder & Content

- `pages/`, `global_sections/`, `global_tracks/`
- `email_templates/`, `email_template_suport.ex`
- `fonts/`, `images/`, `remove_bacgrounds/` (note the spelling)
- `emoji/`, `abbreviation.ex`

### Forms & Datasets

- `form_data/`, `datasets/`
- `forbidden_keywords/`, `detect_phone_number.ex`, `detect_scam.ex`

### Payments & Commerce

- `payments/`, `pos/`
- `commissions/`, `afiliates/` (note the spelling — single 'f')
- `campaigns/`

### Integrations

- `intergrations/`, `integrations/` (both exist — match the active spelling before adding)
- `shopify/`, `sapo/`, `haravan/`
- `sheets/` (Google Sheets)
- `partner_services/`

### Domains & Short links

- `domains/`, `domains_error.ex`
- `short_links/`

### Analytics

- `analytics/`, `pixel_tracking/`, `statistics/`
- `conversion_api.ex`
- `event_streaming/` (Kafka)
- `questdb/`

### Geo & IP

- `geo/`, `ip2locations/`, `IpUtils.ex`

### Audit & log

- `changes_log/`, `outbox/`
- `error_sync_logs` (when present)

### Infra helpers

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
├── router.ex                  # Admin + internal API
├── public_api_router.ex       # Public endpoints
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

- `repo/migrations/` — Migrations.
- `repo/seeds.exs` — Seeds.
- `static/` — Built assets.
- `gettext/` — Backend translations.

## `assets/`

Vue 3 + Webpack 4 in-repo FE used by a handful of server-rendered admin pages. When editing, run `cd assets && npm run watch`. Final builds land in `priv/static`.

## `replica/`

Postgres logical-replication scripts:

- `pg_upgrade.sh` — Upgrade data version.
- `update_primary_config.sh` — Update primary `postgresql.conf`.
- `init_pub.sh` — Create publication.
- `init_data_replica.sh` — Initial data copy to replica.
- `init_sub.sh` — Create subscription.
- `add_table_replica.sh` — Add a table to the publication.

Wrapped via Make targets (`make update-primary-config`, `make init-replica`, `make migrate-all`). See [Database & replica](./database.md).

## `workers/`

Each file is an Oban worker or consumer (see [Workers (Oban) & Queue](./workers.md)).

## `ansible/`

Per-role playbooks: `deploy_backend.yml`, `deploy_render.yml`, `deploy_builder.yml`, `deploy_editor.yml`, `deploy_cart.yml`, `deploy_tikpage.yml`, `deploy_worker.yml`, `deploy_staging.yaml`, plus `hotfix/*.yaml`. Splitting the stack across roles enables safer staged rollouts.

## Adding a new domain

1. Create `lib/landing_page/<domain>/`.
2. Migration in `priv/repo/migrations/`.
3. Admin controller in `lib/landing_page_web/controllers/v1/`.
4. For public endpoints, add to `public_api_router.ex` with the `:public_api` pipeline.
5. Background work → `lib/workers/<name>_worker.ex` (Oban).
6. Cross-domain events → outbox + Rabbit / Kafka.
7. Tests under `test/landing_page/<domain>/`.
