---
sidebar_position: 9
title: Biến môi trường
---

# Biến môi trường

`builderx_api` đọc cấu hình runtime ở `config/env_config.exs`. Tệp mẫu cho local là `.dev.env`.

## Quy ước

- Khi chạy Docker, biến được nạp qua `env_file` trong `docker-compose.yml`.
- Khi chạy native: `set -a; source .env; set +a` trước khi `mix phx.server`.
- **Không** commit secret prod. `.dev.env` chỉ chứa giá trị dev nội bộ.
- Khi thêm biến mới:
  1. Đọc trong `config/env_config.exs`.
  2. Bổ sung vào bảng dưới đây.
  3. Phối hợp với ops để cập nhật biến vào Ansible group vars.

## Bảng tham chiếu

### Lõi

| Khoá | Mục đích |
| --- | --- |
| `MIX_ENV` | `dev` / `prod` / `test`. |
| `JWT_KEY` | Secret ký JWT cho user / admin. |
| `SECRET_KEY_BASE` | Secret cho Phoenix endpoint (prod inject qua vault). |
| `PHX_HOST` | Host của Phoenix endpoint (prod). |
| `PORT` | Port HTTP (prod, mặc định 4000). |

### Database

| Khoá | Mục đích |
| --- | --- |
| `DATABASE_URL` | Postgres URL cho `BuilderxApi.Repo`. |
| `CITUS_DATABASE_URL` | Postgres URL cho `BuilderxApi.Citus`. |
| `MONGO_URI` | URI MongoDB. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis. |
| `ELASTIC_HOST` / `ELASTIC_PORT` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Elasticsearch. |
| `QUESTDB_HOST` / `QUESTDB_HTTP_PORT` / `QUESTDB_ILP_PORT` | QuestDB. |

### RabbitMQ

| Khoá | Mục đích |
| --- | --- |
| `R_HOST` | Host của Rabbit. |
| `R_PORT` | Cổng AMQP (5672). |
| `R_USERNAME` | User. |
| `R_PASSWORD` | Password. |
| `R_VIRTUAL_HOST` | vhost (ví dụ `v1`). |

### Kafka

| Khoá | Mục đích |
| --- | --- |
| `KAFKA1_HOST` | Host broker 1. |
| `KAFKA1_PORT` | Cổng broker 1. |
| `KAFKA2_*` | Broker bổ sung khi cluster lớn. |

### AWS S3

| Khoá | Mục đích |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Access key. |
| `AWS_SECRET_ACCESS_KEY` | Secret. |
| `AWS_REGION` | Region. |
| `S3_BUCKET_PUBLIC` | Bucket asset công khai. |
| `S3_BUCKET_PRIVATE` | Bucket private (CMS, hoá đơn). |

### Pancake và OAuth

| Khoá | Mục đích |
| --- | --- |
| `PANCAKEID_CLIENT_ID` | OAuth client của Pancake ID. |
| `PANCAKEID_CLIENT_SECRET` | Secret OAuth Pancake ID. |
| `PANCAKE_SECRET_KEY` | Secret nội bộ để ký payload Pancake. |
| `AUTH_URL` | URL Pancake auth (`https://account.pancake.vn`). |
| `GG_CLIENT_ID` / `GG_SECRET_KEY` / `GG_CALLBACK_URL` | OAuth Google (login). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET_KEY` / `GOOGLE_API_KEY` | Google API (Drive, Sheets,…). |
| `FACEBOOK_APP_ID` / `FACEBOOK_SECRET_KEY` | Facebook login + Catalog. |
| `BOTCAKE_*` | Tích hợp Botcake. |
| `INSTAGRAM_CLIENT_ID` / `_SECRET_KEY` | Instagram. |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | Dropbox. |
| `DRIBBBLE_CLIENT_ID` / `_SECRET_KEY` | Dribbble. |
| `VIMEO_CLIENT_ID` / `_SECRET_KEY` | Vimeo. |
| `DEVIANT_ART_CLIENT_ID` / `_SECRET_KEY` | DeviantArt. |
| `SLACK_CLIENT_ID` / `SLACK_SECRET_ID` | Slack. |
| `FLATICON_API_KEY` | Picker Flaticon. |
| `RAPID_API_KEY` | RapidAPI. |
| `STORECAKE_SECRET_KEY` | Secret nội bộ Storecake (ký URL). |
| `CAPTCHA_SECRET_KEY` | reCAPTCHA. |

### Stripe

| Khoá | Mục đích |
| --- | --- |
| `STRIPE_SK` | Stripe secret key. |
| `STRIPE_WEBHOOK_SECRET_KEY` | Verify webhook. |

### Google Ads

| Khoá | Mục đích |
| --- | --- |
| `DEVELOPER_TOKEN` | Google Ads developer token. |
| `GOOGLE_ADS_MANAGE_ACCOUNT` | ID manager account (MCC). |
| `MERCHANT_ID` | Google Merchant ID. |

### Vận chuyển

| Khoá | Mục đích |
| --- | --- |
| `B2C_TOKEN_GHTK` | Token GHTK. |

### Email

| Khoá | Mục đích |
| --- | --- |
| `EMAIL_USERNAME` | User SMTP. |
| `EMAIL_PASSWORD` | Password / app password SMTP. |
| `SMTP_HOST` / `SMTP_PORT` | Override host/port SMTP nếu cần. |

### Cầu nối WebCMS / landing_page_backend

| Khoá | Mục đích |
| --- | --- |
| `WEBCMS_API` | Endpoint của WebCMS (`webcms_app:4000`). |
| `WEBCMS_SECRET_KEY` | Secret RPC với WebCMS. |
| `BUILDERX_SPA_URL` | URL của `builderx_spa` (CORS, redirect). |

### Khác

| Khoá | Mục đích |
| --- | --- |
| `WDS_SOCKET_HOST` / `WDS_SOCKET_PORT` | Socket cho Phoenix LiveReload. |
| `SENTRY_DSN` / `SENTRY_ENV` | Sentry. |

## Mẹo

- Xem giá trị trong IEx: `System.get_env("REDIS_HOST")`.
- Đổi `.env` cần restart container — `Application` chỉ đọc lúc khởi động.
- Secret prod nên đọc bằng `Application.fetch_env!(:builderx_api, :stripe_sk)` để fail-fast khi thiếu.

## Kiểm tra nhanh

```bash
make bash
# bên trong container
echo $JWT_KEY
echo $R_HOST
```

Nếu thiếu biến bắt buộc, service sẽ crash khi boot (Sentry, Stripe,…). Đọc log để biết khoá nào thiếu.
