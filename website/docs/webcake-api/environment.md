---
sidebar_position: 9
title: Biến môi trường
---

# Biến môi trường

`landing_page_backend` đọc cấu hình runtime ở `config/env_config.exs`. Tệp mẫu cho local là `.dev.env`.

## Quy ước

- Docker: env được nạp qua `env_file` trong `docker-compose.yml`.
- Native: `set -a; source .env; set +a` trước khi `mix phx.server`.
- **Không** commit secret prod. `.dev.env` chỉ chứa giá trị dev nội bộ.

## Bảng tham chiếu

### Lõi

| Khoá | Mục đích |
| --- | --- |
| `MIX_ENV` | `dev` / `prod` / `test`. |
| `NODE_ENV` | Build asset FE (`development` / `production`). |
| `JWT_KEY` | Secret ký JWT. |
| `SECRET_KEY_BASE` | Secret cho Phoenix endpoint (prod inject qua vault). |
| `BUILDER_HOST` | Host của builder (`localhost` khi dev). |
| `PHX_HOST` | Host Phoenix endpoint (prod). |
| `PORT` | Port HTTP (mặc định 4000). |

### Database

| Khoá | Mục đích |
| --- | --- |
| `DATABASE_URL` | Postgres URL chính. |
| `REPLICA_DATABASE_URL` | URL replica (khi bật). |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis. |
| `ELASTIC_HOST` / `ELASTIC_PORT` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Elasticsearch. |
| `QUESTDB_HOST` / `QUESTDB_HTTP_PORT` / `QUESTDB_ILP_PORT` | QuestDB. |

### RabbitMQ

| Khoá | Mục đích |
| --- | --- |
| `R_HOST` | Host. |
| `R_PORT` | Cổng AMQP. |
| `R_USERNAME` | User. |
| `R_PASSWORD` | Password. |

### Kafka

| Khoá | Mục đích |
| --- | --- |
| `KAFKA1_HOST` | Host broker 1. |
| `KAFKA1_PORT` | Cổng broker 1. |
| `KAFKA2_HOST` | Host broker 2 (cluster). |
| `KAFKA2_PORT` | Cổng broker 2. |

### AWS S3

| Khoá | Mục đích |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Access key. |
| `AWS_SECRET_ACCESS_KEY` | Secret. |
| `AWS_REGION` | Region. |
| `S3_BUCKET_PUBLIC` | Bucket công khai. |
| `S3_BUCKET_PRIVATE` | Bucket private. |

### Pancake và OAuth

| Khoá | Mục đích |
| --- | --- |
| `PANCAKEID_CLIENT_ID` / `_SECRET` | OAuth Pancake ID. |
| `PANCAKE_SECRET_KEY` | Khoá ký nội bộ Pancake. |
| `AUTH_URL` | URL Pancake auth. |
| `GOOGLE_CLIENT_ID` / `_SECRET_KEY` / `_API_KEY` | Google API. |
| `FACEBOOK_APP_ID` / `_SECRET_KEY` | Facebook (khi dùng). |

### Cầu nối nội bộ

| Khoá | Mục đích |
| --- | --- |
| `WEBCMS_API` | Endpoint WebCMS (`webcms_app:4000`). |
| `WEBCMS_SECRET_KEY` | Secret RPC WebCMS. |
| `STORECAKE_SECRET_KEY` | Ký request sang `builderx_api`. |
| `WEBCAKE_SECRET_KEY` | Secret nội bộ của Webcake. |
| `SUSA_SECRET_KEY` | Đồng bộ Susa. |
| `POS_SECRET_KEY` | Secret POS. |
| `SERVICE_SECRET_KEY` | Secret service tổng quát. |
| `CRM_SECRET_KEY` | Secret CRM. |
| `HOST_PKE` | URL dịch vụ rút gọn / PKE. |
| `ANALYTICS_HOST` / `_PORT` | Dịch vụ analytics nội bộ. |

### Stripe / Paypal

| Khoá | Mục đích |
| --- | --- |
| `STRIPE_SK` | Stripe secret key. |
| `PAYPAL_CLIENT_ID` | Paypal client. |
| `PAYPAL_SECRET_ID` | Paypal secret. |
| `PAYPAL_HOST` | Endpoint Paypal (sandbox / prod). |

### Nền tảng eCommerce

| Khoá | Mục đích |
| --- | --- |
| `SAPO_CLIENT_ID` / `_SECRET` | Sapo OAuth. |
| `SHOPIFY_CLIENT_ID` / `_SECRET` | Shopify OAuth. |
| `HARAVAN_CLIENT_ID` / `_SECRET` | Haravan OAuth. |

### AI

| Khoá | Mục đích |
| --- | --- |
| `DEEPINFRA_API_KEY` | DeepInfra text. |
| `DEEPINFRA_API_KEY_IMAGE` | DeepInfra image. |
| `GEMINI_API_KEY` | Google Gemini. |

### Cảnh báo và thông báo

| Khoá | Mục đích |
| --- | --- |
| `TELEBOT_ALERT_TOKEN` | Bot Telegram cảnh báo. |
| `TELEGROUP_ALERT` | ID group Telegram. |
| `SLACK_CLIENT_ID` / `_SECRET_ID` | Slack. |
| `BOTCAKE_SECRET_KEY` | Cầu nối Botcake. |

### Asset và công cụ

| Khoá | Mục đích |
| --- | --- |
| `CLIPPING_MAGIC_ID` | ID Clipping Magic. |
| `CLIPPING_MAGIC_KEY` | Key Clipping Magic. |
| `CLIPPING_MAGIC_TEST` | `true` khi dùng môi trường test. |
| `B2C_TOKEN_GHTK` | Token GHTK B2C. |
| `GITHUB_TOKEN` | GitHub token (CI / kiểm tra release). |

### Email

| Khoá | Mục đích |
| --- | --- |
| `EMAIL_USERNAME` | User SMTP. |
| `EMAIL_PASSWORD` | Password / app password SMTP. |
| `SMTP_HOST` / `SMTP_PORT` | Override host / port SMTP nếu cần. |

### Sentry

| Khoá | Mục đích |
| --- | --- |
| `SENTRY_DSN` | DSN dự án. |
| `SENTRY_ENV` | `dev` / `staging` / `prod`. |

## Mẹo

- Trong IEx: `System.get_env("R_HOST")`.
- Đổi `.env` cần restart container.
- Thiếu biến bắt buộc → service crash khi boot; log sẽ chỉ rõ khoá nào thiếu.
- Secret prod nạp qua Ansible vault, không qua `.env`.

## Thêm biến mới

1. Đọc trong `config/env_config.exs`.
2. Thêm placeholder vào `.dev.env`.
3. Ghi nhận tại đây.
4. Phối hợp ops cập nhật Ansible vault.
