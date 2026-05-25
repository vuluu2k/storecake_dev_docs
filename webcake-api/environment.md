# Environment variables

`landing_page_backend` đọc cấu hình runtime ở `config/env_config.exs`. File mẫu local: `.dev.env` (đã commit).

## Quy tắc

* Khi chạy Docker: ENV được nạp qua `env_file` trong `docker-compose.yml`.
* Khi chạy native: `set -a; source .env; set +a` rồi `mix phx.server`.
* **Không** commit secret prod. `.dev.env` chỉ chứa key dev nội bộ.

## Bảng biến

### Core

| Key             | Mô tả                                                            |
| --------------- | ---------------------------------------------------------------- |
| `MIX_ENV`       | `dev` / `prod` / `test`.                                         |
| `NODE_ENV`      | Build assets FE (`development` / `production`).                  |
| `JWT_KEY`       | Secret ký JWT.                                                   |
| `SECRET_KEY_BASE` | Phoenix endpoint secret (prod set qua secret).                  |
| `BUILDER_HOST`  | Hostname builder (`localhost` khi dev).                          |
| `PHX_HOST`      | Hostname Phoenix endpoint (prod).                                |
| `PORT`          | Port HTTP (default 4000).                                        |

### Database

| Key                    | Mô tả                              |
| ---------------------- | ---------------------------------- |
| `DATABASE_URL`         | Postgres URL chính.                |
| `REPLICA_DATABASE_URL` | Postgres URL replica (nếu enable). |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis. |
| `ELASTIC_HOST` / `ELASTIC_PORT` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Elastic. |
| `QUESTDB_HOST` / `QUESTDB_HTTP_PORT` / `QUESTDB_ILP_PORT` | QuestDB. |

### RabbitMQ

| Key                | Mô tả                |
| ------------------ | -------------------- |
| `R_HOST`           | Hostname Rabbit.     |
| `R_PORT`           | Port AMQP (5672).    |
| `R_USERNAME`       | User.                |
| `R_PASSWORD`       | Password.            |

### Kafka

| Key             | Mô tả                    |
| --------------- | ------------------------ |
| `KAFKA1_HOST`   | Host broker 1.           |
| `KAFKA1_PORT`   | Port broker 1.           |
| `KAFKA2_HOST`   | Host broker 2 (cluster). |
| `KAFKA2_PORT`   | Port broker 2.           |

### AWS S3

| Key                       | Mô tả                |
| ------------------------- | -------------------- |
| `AWS_ACCESS_KEY_ID`       | Access key.          |
| `AWS_SECRET_ACCESS_KEY`   | Secret.              |
| `AWS_REGION`              | Region.              |
| `S3_BUCKET_PUBLIC`        | Bucket public.       |
| `S3_BUCKET_PRIVATE`       | Bucket private.      |

### Pancake & OAuth

| Key                          | Mô tả                                              |
| ---------------------------- | -------------------------------------------------- |
| `PANCAKEID_CLIENT_ID` / `_SECRET` | OAuth Pancake ID.                               |
| `PANCAKE_SECRET_KEY`         | Secret nội bộ.                                     |
| `AUTH_URL`                   | URL Pancake auth.                                  |
| `GOOGLE_CLIENT_ID` / `_SECRET_KEY` / `_API_KEY` | Google API.                     |
| `FACEBOOK_APP_ID` / `_SECRET_KEY` | Facebook (nếu dùng).                          |

### Bridge nội bộ

| Key                          | Mô tả                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `WEBCMS_API`                 | Endpoint webcms (`webcms_app:4000`).                  |
| `WEBCMS_SECRET_KEY`          | Ký RPC với webcms.                                     |
| `STORECAKE_SECRET_KEY`       | Ký request sang `builderx_api`.                        |
| `WEBCAKE_SECRET_KEY`         | Secret nội bộ Webcake.                                 |
| `SUSA_SECRET_KEY`            | Sync Susa.                                             |
| `POS_SECRET_KEY`             | Secret POS.                                            |
| `SERVICE_SECRET_KEY`         | Secret service generic.                                |
| `CRM_SECRET_KEY`             | Secret CRM.                                            |
| `HOST_PKE`                   | URL shortener / pke service.                           |
| `ANALYTICS_HOST` / `_PORT`   | Analytics service nội bộ.                              |

### Stripe / Paypal

| Key                          | Mô tả                                     |
| ---------------------------- | ----------------------------------------- |
| `STRIPE_SK`                  | Stripe secret key.                        |
| `PAYPAL_CLIENT_ID`           | Paypal client.                            |
| `PAYPAL_SECRET_ID`           | Paypal secret.                            |
| `PAYPAL_HOST`                | Paypal endpoint (sandbox / prod).         |

### Ecom platform

| Key                          | Mô tả              |
| ---------------------------- | ------------------ |
| `SAPO_CLIENT_ID` / `_SECRET` | Sapo OAuth.        |
| `SHOPIFY_CLIENT_ID` / `_SECRET` | Shopify OAuth.  |
| `HARAVAN_CLIENT_ID` / `_SECRET` | Haravan OAuth.  |

### AI

| Key                          | Mô tả                          |
| ---------------------------- | ------------------------------ |
| `DEEPINFRA_API_KEY`          | DeepInfra text.                |
| `DEEPINFRA_API_KEY_IMAGE`    | DeepInfra image.               |
| `GEMINI_API_KEY`             | Google Gemini.                 |

### Alerting / Notification

| Key                          | Mô tả                       |
| ---------------------------- | --------------------------- |
| `TELEBOT_ALERT_TOKEN`        | Bot Telegram alert.         |
| `TELEGROUP_ALERT`            | Group id Telegram.          |
| `SLACK_CLIENT_ID` / `_SECRET_ID` | Slack notification.     |
| `BOTCAKE_SECRET_KEY`         | Bridge Botcake.             |

### Asset / Tool

| Key                          | Mô tả                                       |
| ---------------------------- | ------------------------------------------- |
| `CLIPPING_MAGIC_ID`          | Clipping Magic id.                          |
| `CLIPPING_MAGIC_KEY`         | Clipping Magic key.                         |
| `CLIPPING_MAGIC_TEST`        | `true` = dùng môi trường test.              |
| `B2C_TOKEN_GHTK`             | GHTK B2C token.                             |
| `GITHUB_TOKEN`               | Token GitHub (CI/check release).            |

### Email

| Key                | Mô tả                       |
| ------------------ | --------------------------- |
| `EMAIL_USERNAME`   | SMTP user.                  |
| `EMAIL_PASSWORD`   | SMTP password/app password. |
| `SMTP_HOST` / `SMTP_PORT` | SMTP host/port (nếu cần override). |

### Sentry

| Key             | Mô tả                |
| --------------- | -------------------- |
| `SENTRY_DSN`    | DSN project Sentry.  |
| `SENTRY_ENV`    | `dev` / `staging` / `prod`. |

## Tips

* Kiểm tra ENV trong iex: `System.get_env("R_HOST")`.
* Khi đổi `.env`: restart container.
* Khi thiếu ENV bắt buộc → boot fail; đọc log container, xem key nào missing.
* Trong prod, secret được inject qua Ansible vault, không qua `.env`.

## Khi thêm biến

1. Cập nhật `config/env_config.exs`.
2. Cập nhật `.dev.env` (placeholder/non-secret).
3. Cập nhật bảng này.
4. Phối hợp ops bổ sung vào Ansible secret.
