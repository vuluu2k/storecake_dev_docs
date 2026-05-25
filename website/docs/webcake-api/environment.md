---
sidebar_position: 9
title: Environment variables
---

# Environment variables

`landing_page_backend` reads runtime config from `config/env_config.exs`. The local sample is `.dev.env`.

## Conventions

- Docker: env loads through `env_file` in `docker-compose.yml`.
- Native: `set -a; source .env; set +a` then `mix phx.server`.
- **Never** commit production secrets. `.dev.env` only carries internal dev values.

## Reference

### Core

| Key | Purpose |
| --- | --- |
| `MIX_ENV` | `dev` / `prod` / `test`. |
| `NODE_ENV` | Asset build (`development` / `production`). |
| `JWT_KEY` | JWT signing secret. |
| `SECRET_KEY_BASE` | Phoenix endpoint secret (prod via vault). |
| `BUILDER_HOST` | Builder host (`localhost` for dev). |
| `PHX_HOST` | Phoenix endpoint host (prod). |
| `PORT` | HTTP port (default 4000). |

### Database

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Primary Postgres URL. |
| `REPLICA_DATABASE_URL` | Replica URL (when enabled). |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis. |
| `ELASTIC_HOST` / `ELASTIC_PORT` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Elastic. |
| `QUESTDB_HOST` / `QUESTDB_HTTP_PORT` / `QUESTDB_ILP_PORT` | QuestDB. |

### RabbitMQ

| Key | Purpose |
| --- | --- |
| `R_HOST` | Host. |
| `R_PORT` | AMQP port. |
| `R_USERNAME` | User. |
| `R_PASSWORD` | Password. |

### Kafka

| Key | Purpose |
| --- | --- |
| `KAFKA1_HOST` | Broker 1 host. |
| `KAFKA1_PORT` | Broker 1 port. |
| `KAFKA2_HOST` | Broker 2 host (cluster). |
| `KAFKA2_PORT` | Broker 2 port. |

### AWS S3

| Key | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Access key. |
| `AWS_SECRET_ACCESS_KEY` | Secret. |
| `AWS_REGION` | Region. |
| `S3_BUCKET_PUBLIC` | Public bucket. |
| `S3_BUCKET_PRIVATE` | Private bucket. |

### Pancake & OAuth

| Key | Purpose |
| --- | --- |
| `PANCAKEID_CLIENT_ID` / `_SECRET` | Pancake ID OAuth. |
| `PANCAKE_SECRET_KEY` | Internal Pancake signing key. |
| `AUTH_URL` | Pancake auth URL. |
| `GOOGLE_CLIENT_ID` / `_SECRET_KEY` / `_API_KEY` | Google API. |
| `FACEBOOK_APP_ID` / `_SECRET_KEY` | Facebook (if used). |

### Internal bridges

| Key | Purpose |
| --- | --- |
| `WEBCMS_API` | WebCMS endpoint (`webcms_app:4000`). |
| `WEBCMS_SECRET_KEY` | WebCMS RPC secret. |
| `STORECAKE_SECRET_KEY` | Signs requests into `builderx_api`. |
| `WEBCAKE_SECRET_KEY` | Internal Webcake signing. |
| `SUSA_SECRET_KEY` | Susa sync. |
| `POS_SECRET_KEY` | POS secret. |
| `SERVICE_SECRET_KEY` | Generic service secret. |
| `CRM_SECRET_KEY` | CRM secret. |
| `HOST_PKE` | URL shortener / pke endpoint. |
| `ANALYTICS_HOST` / `_PORT` | Internal analytics service. |

### Stripe / Paypal

| Key | Purpose |
| --- | --- |
| `STRIPE_SK` | Stripe secret. |
| `PAYPAL_CLIENT_ID` | Paypal client. |
| `PAYPAL_SECRET_ID` | Paypal secret. |
| `PAYPAL_HOST` | Paypal endpoint (sandbox / prod). |

### eCommerce platforms

| Key | Purpose |
| --- | --- |
| `SAPO_CLIENT_ID` / `_SECRET` | Sapo OAuth. |
| `SHOPIFY_CLIENT_ID` / `_SECRET` | Shopify OAuth. |
| `HARAVAN_CLIENT_ID` / `_SECRET` | Haravan OAuth. |

### AI

| Key | Purpose |
| --- | --- |
| `DEEPINFRA_API_KEY` | DeepInfra text. |
| `DEEPINFRA_API_KEY_IMAGE` | DeepInfra image. |
| `GEMINI_API_KEY` | Google Gemini. |

### Alerts & notifications

| Key | Purpose |
| --- | --- |
| `TELEBOT_ALERT_TOKEN` | Telegram alert bot. |
| `TELEGROUP_ALERT` | Telegram group ID. |
| `SLACK_CLIENT_ID` / `_SECRET_ID` | Slack. |
| `BOTCAKE_SECRET_KEY` | Botcake bridge. |

### Assets & tooling

| Key | Purpose |
| --- | --- |
| `CLIPPING_MAGIC_ID` | Clipping Magic ID. |
| `CLIPPING_MAGIC_KEY` | Clipping Magic key. |
| `CLIPPING_MAGIC_TEST` | `true` for test env. |
| `B2C_TOKEN_GHTK` | GHTK B2C token. |
| `GITHUB_TOKEN` | GitHub token (CI / release checks). |

### Email

| Key | Purpose |
| --- | --- |
| `EMAIL_USERNAME` | SMTP user. |
| `EMAIL_PASSWORD` | SMTP password / app password. |
| `SMTP_HOST` / `SMTP_PORT` | SMTP host/port overrides. |

### Sentry

| Key | Purpose |
| --- | --- |
| `SENTRY_DSN` | Project DSN. |
| `SENTRY_ENV` | `dev` / `staging` / `prod`. |

## Tips

- Inspect inside IEx: `System.get_env("R_HOST")`.
- Editing `.env` requires a container restart.
- Missing required env causes boot failure; the log tells you which key is missing.
- Prod secrets ship through Ansible vault, never through `.env`.

## Adding a new variable

1. Read it in `config/env_config.exs`.
2. Add a placeholder to `.dev.env`.
3. Document it here.
4. Coordinate with ops to add it to Ansible secrets.
