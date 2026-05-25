---
sidebar_position: 7
title: Integrations
---

# Integrations

External services + infrastructure that `builderx_api` depends on. Each entry calls out where the code lives, how to switch it on/off, and gotchas you'll likely hit while developing.

## ElasticSearch

- Library: `:erlastic_search` + helpers in `lib/search/`.
- Each domain has its own mapping/index (`lib/builderx_api/<domain>/elastic.ex`).
- Indexing flow:
  1. Domain writes to DB.
  2. Outbox publishes the event.
  3. `Rabbit.IndexingConsumer` consumes and updates Elastic.
- Manual reindex (in IEx):

  ```elixir
  Elastic.re_setup_product_index
  Elastic.confirm_re_setup_product_index    # drops the old index
  ```

- Env: `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`.

## RabbitMQ

- Library: `:amqp` + modules under `lib/rabbit/`.
- Connection env: `R_HOST`, `R_PORT`, `R_USERNAME`, `R_PASSWORD`, `R_VIRTUAL_HOST`.
- Main consumers:
  - `Rabbit.IndexingConsumer` — Elastic index events.
  - `Rabbit.TaskPoolConsumer` — Batch tasks (cache, sync,…).
- During dev you can boot consumers manually from IEx:

  ```elixir
  BuilderxApi.DynamicApp.start_rabbit
  Rabbit.IndexingConsumer.start_link
  Rabbit.TaskPoolConsumer.start_link
  ```

- Queue names are prefixed per env to avoid cross-environment consumption.

## Kafka

- Library: `:brod`, configured in `lib/kafka/`.
- Env: `KAFKA1_HOST`, `KAFKA1_PORT`, …
- Used for high-throughput analytics, conversion, pixel.
- Consumers run under their own supervisor; consumer-group names match the service (`storecake.indexing`, `storecake.analytics`).

## Redis

- Library: `:redix`, modules in `lib/redis/` + `lib/redlock.ex`.
- Env: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- Use cases:
  - Site-scoped product / category cache (see [Run book](./run.md)).
  - PubSub bridging into Phoenix PubSub.
  - Distributed locks (prevent double-charge / double-publish).

## MongoDB

- Library: `:mongodb_driver`.
- Env: `MONGO_URI`.
- Avoid transactions across documents when not strictly necessary.
- For bulk inserts, prefer `Mongo.insert_many` over loops.

## Email (SMTP)

- Library: `:bamboo` + `:bamboo_smtp`; `bamboo_test_adapter` in test.
- Modules: `lib/email.ex`, `lib/builderx_api/mailer.ex`.
- Templates live in `priv/gettext/` (strings) + `lib/builderx_api_web/templates/email/` (HTML).
- Env: `EMAIL_USERNAME`, `EMAIL_PASSWORD`, SMTP host/port.

## Google APIs

- `google_api_drive`, `google_api_sheets` (shared with `landing_page_backend`).
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`, `GOOGLE_API_KEY`, `GG_CALLBACK_URL`.
- Use cases: catalog sync from Sheets, Drive picker, OAuth login.

## Pancake ID / Pancake CRM

- OAuth client: `PANCAKEID_CLIENT_ID`, `PANCAKEID_CLIENT_SECRET`.
- Endpoint: `AUTH_URL` (`https://account.pancake.vn`).
- Dedicated controllers: `pancake_controller.ex`, `crm_pancake_controller.ex`.

## Stripe

- SDK calls go through HTTPoison.
- Env: `STRIPE_SK`, `STRIPE_WEBHOOK_SECRET_KEY`.
- Powers Storecake subscription plans and per-store Stripe payments.

## Facebook / Botcake

- `FACEBOOK_APP_ID`, `FACEBOOK_SECRET_KEY` — Login + Catalog.
- `BOTCAKE_*` — Botcake chatbot integration.
- `FACEBOOK_APP_ID_LG`, `FACEBOOK_SECRET_KEY_LG` — LG-specific environment.

## Slack

- Env: `SLACK_CLIENT_ID`, `SLACK_SECRET_ID`.
- Used for automation notifications.

## Dropbox / Instagram / Dribbble / Vimeo / DeviantArt

- Asset pickers (Editor / CMS file).
- Each service has its own client ID / secret (`DROPBOX_APP_KEY`, `INSTAGRAM_CLIENT_ID`,…).

## Google Ads

- `DEVELOPER_TOKEN`, `GOOGLE_ADS_MANAGE_ACCOUNT`.
- Pull / push campaigns per store.

## Captcha (reCAPTCHA)

- `CAPTCHA_SECRET_KEY`.
- Verifies public forms (signup, contact).

## GHTK (B2C)

- `B2C_TOKEN_GHTK` — GHTK shipping integration.

## Webcake bridge

- `WEBCMS_API`, `WEBCMS_SECRET_KEY` — `webcms` endpoint.
- Bridge modules: `lib/landingpage/`, `lib/builderx_api/webcake/`.
- Landing page publish triggers RPC to `landing_page_backend`.

## RapidAPI

- `RAPID_API_KEY` — Aggregated third-party APIs (international geo, etc.).

## Sentry

- Library: `:sentry ~> 10.2`.
- Env: `SENTRY_DSN`, `SENTRY_ENV`.
- Helper module: `BuilderxApi.ErrorTracker.capture/2`.
- In dev, leave `SENTRY_DSN` empty to avoid sending events.

## QuestDB

- Env: `QUESTDB_HOST`, `QUESTDB_HTTP_PORT`, `QUESTDB_ILP_PORT`.
- Sender pushes points via ILP (TCP).

## Other infra

- **WebCMS** (`webcms` repo) — Required by indexing flow; run `make beam` inside `webcms` (see [Run book](./run.md)).
- **landing_page_backend** — Deployed separately but shares some queues; keep the Rabbit cluster aligned.

## Adding a new integration

1. Create `lib/builderx_api/<integration>/` for client + context.
2. Declare new env keys in `config/env_config.exs` and update [Environment](./environment.md).
3. For long-running integrations (consumers), add a GenServer + register it in the supervisor.
4. Always set explicit timeouts and retries (HTTPoison `recv_timeout`, Brod producer retries).
5. Add an integration test stub (`test/`).
