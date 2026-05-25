# Integrations

Tài liệu mô tả các tích hợp / hạ tầng ngoài mà `landing_page_backend` phụ thuộc.

## RabbitMQ

* ENV: `R_HOST`, `R_PORT`, `R_USERNAME`, `R_PASSWORD`.
* Consumer chính ở `lib/rabbit/`; topology trong `Rabbit.Topology`.
* Dùng để bắt event publish landing, sync với `builderx_api` (qua `webcms`).

## Kafka

* ENV: `KAFKA1_HOST`, `KAFKA1_PORT`, `KAFKA2_HOST`, `KAFKA2_PORT`.
* Producer/consumer ở `lib/event_streaming/`.
* Sự kiện chính: pixel tracking, analytic, conversion.

## Redis

* ENV: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
* Module: `lib/redis.ex`, `redis_pubsub.ex`, `redlock.ex`.
* Use case: cache render landing, pubsub realtime, distributed lock publish flow.

## ElasticSearch

* Index landing page, form data.
* ENV: `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`.
* Reindex thủ công qua iex (`LandingPage.ElasticIndex.reindex_pages/0`).

## S3 (AWS)

* ENV: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region.
* Module `lib/aws_s3.ex` cung cấp upload + presigned URL.
* Bucket public (asset CSS/JS landing đã render) và private (file CMS).

## QuestDB

* Time-series cho analytic.
* ENV: `QUESTDB_HOST`, `QUESTDB_HTTP_PORT`, `QUESTDB_ILP_PORT`.

## Google APIs

* `google_api_drive`, `google_api_sheets`, `google_gax`.
* ENV: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`, `GOOGLE_API_KEY`.
* Use case: sync sheet danh sách lead, embed Drive picker, OAuth login.

## Pancake ID

* ENV: `PANCAKEID_CLIENT_ID`, `PANCAKEID_CLIENT_SECRET`, `AUTH_URL`.
* OAuth login & user info.

## Pancake / Webcake / Storecake bridge

* `WEBCMS_API`, `WEBCMS_SECRET_KEY` – RPC sang `webcms` (publish, indexing).
* `STORECAKE_SECRET_KEY` – Ký request gửi sang `builderx_api`.
* `WEBCAKE_SECRET_KEY` – Ký request nội bộ.

## Stripe / Paypal

* `STRIPE_SK` – Stripe.
* `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET_ID`, `PAYPAL_HOST` – Paypal sandbox/prod.

## Sapo / Haravan / Shopify

* `SAPO_CLIENT_ID`, `SAPO_CLIENT_SECRET`.
* `HARAVAN_CLIENT_ID`, `HARAVAN_CLIENT_SECRET`.
* `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.
* Adapter ở `lib/landing_page/shopify/`, `sapo/`, `haravan/`.

## Slack

* `SLACK_CLIENT_ID`, `SLACK_SECRET_ID` – Notification automation.

## Botcake

* `BOTCAKE_SECRET_KEY` – Tích hợp chatbot.

## Susa

* `SUSA_SECRET_KEY` – Sync với hệ Susa.

## Telebot (Telegram alert)

* `TELEBOT_ALERT_TOKEN`, `TELEGROUP_ALERT` – Bắn alert qua Telegram.

## Clipping Magic

* `CLIPPING_MAGIC_ID`, `CLIPPING_MAGIC_KEY`, `CLIPPING_MAGIC_TEST` – Xoá background ảnh (`remove_bacgrounds/`).

## GHTK

* `B2C_TOKEN_GHTK` – Tích hợp ship GHTK.

## CRM

* `CRM_SECRET_KEY` – Sync CRM Pancake.

## AI Providers

* `DEEPINFRA_API_KEY`, `DEEPINFRA_API_KEY_IMAGE` – DeepInfra text/image.
* `GEMINI_API_KEY` – Google Gemini.

## SMTP

* `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `SMTP_HOST`, `SMTP_PORT` – Gửi email transactional.

## Sentry

* `SENTRY_DSN`, `SENTRY_ENV`.

## Webcms / Analytics service

* `WEBCMS_API`, `WEBCMS_SECRET_KEY` – RPC sang webcms.
* `ANALYTICS_HOST`, `ANALYTICS_PORT` – Analytics service nội bộ.

## GitHub Token

* `GITHUB_TOKEN` – Cho luồng tự động kiểm tra release hoặc pull config.

## Cách thêm integration mới

1. Tạo folder `lib/landing_page/<integration>/` chứa client + context.
2. Khai báo ENV mới ở `config/env_config.exs` + cập nhật [Environment](environment.md).
3. Nếu có job nền: tạo worker trong `lib/workers/<name>_worker.ex` (Oban) và đăng ký queue.
4. Đảm bảo có timeout + retry (Tesla / HTTPoison `recv_timeout`, Oban `max_attempts`).
5. Bổ sung integration test stub (bypass HTTP server hoặc Mox).
