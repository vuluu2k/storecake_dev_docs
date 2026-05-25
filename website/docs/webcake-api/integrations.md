---
sidebar_position: 8
title: Tích hợp
---

# Tích hợp

Dịch vụ ngoài và hạ tầng mà `landing_page_backend` phụ thuộc.

## RabbitMQ

- Biến môi trường: `R_HOST`, `R_PORT`, `R_USERNAME`, `R_PASSWORD`.
- Consumer ở `lib/rabbit/`; topology trong `Rabbit.Topology`.
- Mang event publish landing và đồng bộ với `builderx_api` (qua `webcms`).

## Kafka

- Biến môi trường: `KAFKA1_HOST`, `KAFKA1_PORT`, `KAFKA2_HOST`, `KAFKA2_PORT`.
- Producer / consumer trong `lib/event_streaming/`.
- Topic: pixel tracking, analytics, conversion.

## Redis

- Biến môi trường: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- Module: `lib/redis.ex`, `redis_pubsub.ex`, `redlock.ex`.
- Cache trang đã render, pub/sub event, distributed lock cho publish.

## Elasticsearch

- Index page và form data.
- Biến môi trường: `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`.
- Reindex thủ công qua IEx (`LandingPage.ElasticIndex.reindex_pages/0`).

## S3 (AWS)

- Biến môi trường: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region.
- `lib/aws_s3.ex` cung cấp upload + presigned URL.
- Bucket public cho CSS/JS đã render; bucket private cho file CMS.

## QuestDB

- Time-series cho analytics.
- Biến môi trường: `QUESTDB_HOST`, `QUESTDB_HTTP_PORT`, `QUESTDB_ILP_PORT`.

## Google APIs

- `google_api_drive`, `google_api_sheets`, `google_gax`.
- Biến môi trường: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`, `GOOGLE_API_KEY`.
- Trường hợp dùng: đồng bộ sheet danh sách lead, Drive picker, OAuth login.

## Pancake ID

- Biến môi trường: `PANCAKEID_CLIENT_ID`, `PANCAKEID_CLIENT_SECRET`, `AUTH_URL`.
- OAuth login và lấy thông tin user.

## Cầu nối Pancake / Webcake / Storecake

- `WEBCMS_API`, `WEBCMS_SECRET_KEY` — RPC sang `webcms` (publish, indexing).
- `STORECAKE_SECRET_KEY` — Ký request gửi sang `builderx_api`.
- `WEBCAKE_SECRET_KEY` — Khoá ký nội bộ.

## Stripe / Paypal

- `STRIPE_SK` — Stripe.
- `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET_ID`, `PAYPAL_HOST` — Paypal sandbox / prod.

## Sapo / Haravan / Shopify

- `SAPO_CLIENT_ID`, `SAPO_CLIENT_SECRET`.
- `HARAVAN_CLIENT_ID`, `HARAVAN_CLIENT_SECRET`.
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.
- Adapter ở `lib/landing_page/shopify/`, `sapo/`, `haravan/`.

## Slack

- `SLACK_CLIENT_ID`, `SLACK_SECRET_ID` — Thông báo automation.

## Botcake

- `BOTCAKE_SECRET_KEY` — Tích hợp chatbot.

## Susa

- `SUSA_SECRET_KEY` — Đồng bộ với hệ Susa.

## Cảnh báo Telegram

- `TELEBOT_ALERT_TOKEN`, `TELEGROUP_ALERT` — Bắn alert vào group Telegram.

## Clipping Magic

- `CLIPPING_MAGIC_ID`, `CLIPPING_MAGIC_KEY`, `CLIPPING_MAGIC_TEST` — Xoá nền ảnh (`remove_bacgrounds/`).

## GHTK

- `B2C_TOKEN_GHTK` — Tích hợp vận chuyển GHTK.

## CRM

- `CRM_SECRET_KEY` — Đồng bộ CRM Pancake.

## AI provider

- `DEEPINFRA_API_KEY`, `DEEPINFRA_API_KEY_IMAGE` — DeepInfra text / image.
- `GEMINI_API_KEY` — Google Gemini.

## SMTP

- `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `SMTP_HOST`, `SMTP_PORT` — Email transactional.

## Sentry

- `SENTRY_DSN`, `SENTRY_ENV`.

## Webcms / dịch vụ analytics

- `WEBCMS_API`, `WEBCMS_SECRET_KEY` — RPC sang webcms.
- `ANALYTICS_HOST`, `ANALYTICS_PORT` — Dịch vụ analytics nội bộ.

## GitHub Token

- `GITHUB_TOKEN` — Kiểm tra release / pull config.

## Thêm tích hợp mới

1. Tạo `lib/landing_page/<integration>/` chứa client + context.
2. Khai báo biến mới ở `config/env_config.exs` và cập nhật [Biến môi trường](./environment.md).
3. Cần job nền: thêm worker tại `lib/workers/<name>_worker.ex` (Oban) và đăng ký queue.
4. Luôn đặt timeout + retry (Tesla / HTTPoison `recv_timeout`, Oban `max_attempts`).
5. Bổ sung stub integration test (bypass HTTP server hoặc Mox).
