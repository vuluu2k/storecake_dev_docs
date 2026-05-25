---
sidebar_position: 8
title: Integrations
---

# Integrations

External services and infrastructure `landing_page_backend` depends on.

## RabbitMQ

- Env: `R_HOST`, `R_PORT`, `R_USERNAME`, `R_PASSWORD`.
- Consumers in `lib/rabbit/`; topology in `Rabbit.Topology`.
- Carries landing publish events and sync with `builderx_api` (via `webcms`).

## Kafka

- Env: `KAFKA1_HOST`, `KAFKA1_PORT`, `KAFKA2_HOST`, `KAFKA2_PORT`.
- Producers / consumers in `lib/event_streaming/`.
- Topics: pixel tracking, analytics, conversion.

## Redis

- Env: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- Modules: `lib/redis.ex`, `redis_pubsub.ex`, `redlock.ex`.
- Cache rendered landings, pub/sub events, distributed locks for publish.

## ElasticSearch

- Indexes pages and form data.
- Env: `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`.
- Manual reindex via IEx (`LandingPage.ElasticIndex.reindex_pages/0`).

## S3 (AWS)

- Env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region.
- `lib/aws_s3.ex` provides upload + presigned URLs.
- Public bucket for rendered CSS/JS; private bucket for CMS files.

## QuestDB

- Time-series for analytics.
- Env: `QUESTDB_HOST`, `QUESTDB_HTTP_PORT`, `QUESTDB_ILP_PORT`.

## Google APIs

- `google_api_drive`, `google_api_sheets`, `google_gax`.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`, `GOOGLE_API_KEY`.
- Use cases: lead sheet sync, Drive picker, OAuth login.

## Pancake ID

- Env: `PANCAKEID_CLIENT_ID`, `PANCAKEID_CLIENT_SECRET`, `AUTH_URL`.
- OAuth login + user info.

## Pancake / Webcake / Storecake bridge

- `WEBCMS_API`, `WEBCMS_SECRET_KEY` — RPC into `webcms` (publish, indexing).
- `STORECAKE_SECRET_KEY` — Signs requests into `builderx_api`.
- `WEBCAKE_SECRET_KEY` — Internal signing.

## Stripe / Paypal

- `STRIPE_SK` — Stripe.
- `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET_ID`, `PAYPAL_HOST` — Paypal sandbox / prod.

## Sapo / Haravan / Shopify

- `SAPO_CLIENT_ID`, `SAPO_CLIENT_SECRET`.
- `HARAVAN_CLIENT_ID`, `HARAVAN_CLIENT_SECRET`.
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.
- Adapters under `lib/landing_page/shopify/`, `sapo/`, `haravan/`.

## Slack

- `SLACK_CLIENT_ID`, `SLACK_SECRET_ID` — Automation notifications.

## Botcake

- `BOTCAKE_SECRET_KEY` — Chatbot integration.

## Susa

- `SUSA_SECRET_KEY` — Sync with the Susa system.

## Telegram alerts

- `TELEBOT_ALERT_TOKEN`, `TELEGROUP_ALERT` — Send alerts to a Telegram group.

## Clipping Magic

- `CLIPPING_MAGIC_ID`, `CLIPPING_MAGIC_KEY`, `CLIPPING_MAGIC_TEST` — Background removal (`remove_bacgrounds/`).

## GHTK

- `B2C_TOKEN_GHTK` — GHTK shipping integration.

## CRM

- `CRM_SECRET_KEY` — Pancake CRM sync.

## AI providers

- `DEEPINFRA_API_KEY`, `DEEPINFRA_API_KEY_IMAGE` — DeepInfra text + image.
- `GEMINI_API_KEY` — Google Gemini.

## SMTP

- `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `SMTP_HOST`, `SMTP_PORT` — Transactional email.

## Sentry

- `SENTRY_DSN`, `SENTRY_ENV`.

## Webcms / analytics service

- `WEBCMS_API`, `WEBCMS_SECRET_KEY`.
- `ANALYTICS_HOST`, `ANALYTICS_PORT` — Internal analytics service.

## GitHub Token

- `GITHUB_TOKEN` — Release checks / pull config.

## Adding a new integration

1. Create `lib/landing_page/<integration>/` with client + context.
2. Declare new env keys in `config/env_config.exs` and update [Environment](./environment.md).
3. For background work add a worker in `lib/workers/<name>_worker.ex` (Oban) and register its queue.
4. Always set timeouts + retries (HTTPoison `recv_timeout`, Oban `max_attempts`).
5. Add an integration test stub (bypass HTTP server or Mox).
