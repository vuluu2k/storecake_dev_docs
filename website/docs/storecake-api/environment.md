---
sidebar_position: 9
title: Environment variables
---

# Environment variables

`builderx_api` reads runtime config from `config/env_config.exs`. The local sample lives at `.dev.env`.

## Conventions

- Docker runs load env via `env_file` in `docker-compose.yml`.
- Native runs: `set -a; source .env; set +a` before `mix phx.server`.
- **Never** commit production secrets. `.dev.env` is only for the internal dev cluster.
- When adding a key:
  1. Read it in `config/env_config.exs`.
  2. Add a row to the table below.
  3. Coordinate with ops to add it to Ansible group vars.

## Reference

### Core

| Key | Purpose |
| --- | --- |
| `MIX_ENV` | `dev` / `prod` / `test`. |
| `JWT_KEY` | Signing secret for user / admin JWTs. |
| `SECRET_KEY_BASE` | Phoenix endpoint secret (prod via vault). |
| `PHX_HOST` | Phoenix endpoint host (prod). |
| `PORT` | HTTP port (prod, default 4000). |

### Database

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres URL for `BuilderxApi.Repo`. |
| `CITUS_DATABASE_URL` | Postgres URL for `BuilderxApi.Citus`. |
| `MONGO_URI` | MongoDB URI. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis. |
| `ELASTIC_HOST` / `ELASTIC_PORT` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Elastic. |
| `QUESTDB_HOST` / `QUESTDB_HTTP_PORT` / `QUESTDB_ILP_PORT` | QuestDB. |

### RabbitMQ

| Key | Purpose |
| --- | --- |
| `R_HOST` | Rabbit host. |
| `R_PORT` | AMQP port (5672). |
| `R_USERNAME` | User. |
| `R_PASSWORD` | Password. |
| `R_VIRTUAL_HOST` | vhost (e.g. `v1`). |

### Kafka

| Key | Purpose |
| --- | --- |
| `KAFKA1_HOST` | Broker 1 host. |
| `KAFKA1_PORT` | Broker 1 port. |
| `KAFKA2_*` | Additional brokers for larger clusters. |

### AWS S3

| Key | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Access key. |
| `AWS_SECRET_ACCESS_KEY` | Secret. |
| `AWS_REGION` | Region. |
| `S3_BUCKET_PUBLIC` | Public asset bucket. |
| `S3_BUCKET_PRIVATE` | Private bucket (CMS, invoices). |

### Pancake & OAuth

| Key | Purpose |
| --- | --- |
| `PANCAKEID_CLIENT_ID` | Pancake ID OAuth client. |
| `PANCAKEID_CLIENT_SECRET` | Pancake ID secret. |
| `PANCAKE_SECRET_KEY` | Internal signing secret. |
| `AUTH_URL` | Pancake auth URL (`https://account.pancake.vn`). |
| `GG_CLIENT_ID` / `GG_SECRET_KEY` / `GG_CALLBACK_URL` | Google OAuth (login). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET_KEY` / `GOOGLE_API_KEY` | Google API (Drive,…). |
| `FACEBOOK_APP_ID` / `FACEBOOK_SECRET_KEY` | Facebook login + catalog. |
| `BOTCAKE_*` | Botcake integration. |
| `INSTAGRAM_CLIENT_ID` / `_SECRET_KEY` | Instagram. |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | Dropbox. |
| `DRIBBBLE_CLIENT_ID` / `_SECRET_KEY` | Dribbble. |
| `VIMEO_CLIENT_ID` / `_SECRET_KEY` | Vimeo. |
| `DEVIANT_ART_CLIENT_ID` / `_SECRET_KEY` | DeviantArt. |
| `SLACK_CLIENT_ID` / `SLACK_SECRET_ID` | Slack. |
| `FLATICON_API_KEY` | Flaticon picker. |
| `RAPID_API_KEY` | RapidAPI. |
| `STORECAKE_SECRET_KEY` | Internal Storecake signing key. |
| `CAPTCHA_SECRET_KEY` | reCAPTCHA. |

### Stripe

| Key | Purpose |
| --- | --- |
| `STRIPE_SK` | Stripe secret key. |
| `STRIPE_WEBHOOK_SECRET_KEY` | Webhook signature. |

### Google Ads

| Key | Purpose |
| --- | --- |
| `DEVELOPER_TOKEN` | Google Ads developer token. |
| `GOOGLE_ADS_MANAGE_ACCOUNT` | Manager account ID (MCC). |
| `MERCHANT_ID` | Google Merchant ID. |

### Shipping / B2C

| Key | Purpose |
| --- | --- |
| `B2C_TOKEN_GHTK` | GHTK token. |

### Email

| Key | Purpose |
| --- | --- |
| `EMAIL_USERNAME` | SMTP user. |
| `EMAIL_PASSWORD` | SMTP password / app password. |
| `SMTP_HOST` / `SMTP_PORT` | Override SMTP host/port if needed. |

### WebCMS / landing_page_backend bridge

| Key | Purpose |
| --- | --- |
| `WEBCMS_API` | WebCMS endpoint (`webcms_app:4000`). |
| `WEBCMS_SECRET_KEY` | RPC secret to WebCMS. |
| `BUILDERX_SPA_URL` | `builderx_spa` URL (CORS, redirects). |

### Misc

| Key | Purpose |
| --- | --- |
| `WDS_SOCKET_HOST` / `WDS_SOCKET_PORT` | Phoenix LiveReload socket. |
| `SENTRY_DSN` / `SENTRY_ENV` | Sentry. |

## Tips

- Inspect env in IEx: `System.get_env("REDIS_HOST")`.
- Editing `.env` requires a container restart — `Application` is read at startup.
- For real prod secrets, use `Application.fetch_env!(:builderx_api, :stripe_sk)` so missing values fail fast.

## Quick check

```bash
make bash
# inside the container
echo $JWT_KEY
echo $R_HOST
```

If a required env is missing, the service crashes on boot (Sentry, Stripe,…). Read the log to find which key is missing.
