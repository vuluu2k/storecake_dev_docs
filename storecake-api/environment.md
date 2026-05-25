# Environment variables

`builderx_api` đọc cấu hình runtime ở `config/env_config.exs` (qua `System.get_env/1`). File mẫu để dev local: `.dev.env` (đã commit, không chứa secret prod).

Khi chạy bằng Docker, các biến này được nạp qua `env_file` trong `docker-compose.yml`. Khi chạy native, copy `.dev.env` → `.env` và load thủ công (`set -a; source .env; set +a`).

## Quy tắc chung

* **Không** commit secret prod. `.dev.env` chỉ chứa key dùng cho stack local nội bộ.
* Khi thêm biến mới, cập nhật:
  1. `config/env_config.exs`.
  2. Bảng dưới đây.
  3. Ansible group vars (do ops team quản lý).

## Bảng biến

### Core

| Key             | Mô tả                                         |
| --------------- | --------------------------------------------- |
| `MIX_ENV`       | `dev` / `prod` / `test`.                      |
| `JWT_KEY`       | Secret ký JWT user/admin.                      |
| `SECRET_KEY_BASE` | Phoenix endpoint secret (prod set qua secret).|
| `PHX_HOST`      | Host Phoenix endpoint (prod).                 |
| `PORT`          | Port HTTP (prod, default 4000).               |

### Database

| Key                          | Mô tả                                  |
| ---------------------------- | -------------------------------------- |
| `DATABASE_URL`               | Postgres URL cho `BuilderxApi.Repo`.   |
| `CITUS_DATABASE_URL`         | Postgres URL cho `BuilderxApi.Citus`.  |
| `MONGO_URI`                  | URI MongoDB.                           |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Cấu hình Redis.    |
| `ELASTIC_HOST` / `ELASTIC_PORT` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Elastic. |
| `QUESTDB_HOST` / `QUESTDB_HTTP_PORT` / `QUESTDB_ILP_PORT` | QuestDB.          |

### RabbitMQ

| Key                | Mô tả                              |
| ------------------ | ---------------------------------- |
| `R_HOST`           | Hostname Rabbit.                   |
| `R_PORT`           | Port AMQP (5672).                  |
| `R_USERNAME`       | User.                              |
| `R_PASSWORD`       | Password.                          |
| `R_VIRTUAL_HOST`   | vhost (vd `v1`).                   |

### Kafka

| Key             | Mô tả                          |
| --------------- | ------------------------------ |
| `KAFKA1_HOST`   | Host broker 1.                 |
| `KAFKA1_PORT`   | Port broker 1.                 |
| (`KAFKA2_*` …)  | Broker khác nếu cluster lớn.    |

### AWS S3

| Key                     | Mô tả                               |
| ----------------------- | ----------------------------------- |
| `AWS_ACCESS_KEY_ID`     | Access key.                         |
| `AWS_SECRET_ACCESS_KEY` | Secret.                             |
| `AWS_REGION`            | Region.                             |
| `S3_BUCKET_PUBLIC`      | Bucket public asset.                |
| `S3_BUCKET_PRIVATE`     | Bucket private (hoá đơn, CMS file). |

### Pancake & OAuth

| Key                          | Mô tả                                              |
| ---------------------------- | -------------------------------------------------- |
| `PANCAKEID_CLIENT_ID`        | OAuth client Pancake ID.                           |
| `PANCAKEID_CLIENT_SECRET`    | Secret OAuth Pancake ID.                           |
| `PANCAKE_SECRET_KEY`         | Secret nội bộ (sign payload Pancake).              |
| `AUTH_URL`                   | URL Pancake auth (`https://account.pancake.vn`).    |
| `GG_CLIENT_ID` / `GG_SECRET_KEY` / `GG_CALLBACK_URL` | OAuth Google (login).             |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET_KEY` / `GOOGLE_API_KEY` | Google API (Drive,…). |
| `FACEBOOK_APP_ID` / `FACEBOOK_SECRET_KEY` | Facebook login + catalog.                   |
| `BOTCAKE_*`                  | Tích hợp Botcake.                                  |
| `INSTAGRAM_CLIENT_ID` / `_SECRET_KEY` | Instagram graph.                          |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | Dropbox.                                |
| `DRIBBBLE_CLIENT_ID` / `DRIBBBLE_CLIENT_SECRET_KEY` | Dribbble.                  |
| `VIMEO_CLIENT_ID` / `VIMEO_CLIENT_SECRET_KEY` | Vimeo.                            |
| `DEVIANT_ART_CLIENT_ID` / `DEVIANT_ART_CLIENT_SECRET_KEY` | DeviantArt.            |
| `SLACK_CLIENT_ID` / `SLACK_SECRET_ID` | Slack notification.                       |
| `FLATICON_API_KEY`           | Flaticon icon picker.                              |
| `RAPID_API_KEY`              | RapidAPI (provider tổng hợp).                       |
| `STORECAKE_SECRET_KEY`       | Secret nội bộ Storecake (sign URL).                |
| `CAPTCHA_SECRET_KEY`         | reCAPTCHA secret.                                  |

### Stripe

| Key                          | Mô tả                                       |
| ---------------------------- | ------------------------------------------- |
| `STRIPE_SK`                  | Secret key (server).                        |
| `STRIPE_WEBHOOK_SECRET_KEY`  | Verify webhook.                             |

### Google Ads

| Key                          | Mô tả                                |
| ---------------------------- | ------------------------------------ |
| `DEVELOPER_TOKEN`            | Google Ads developer token.          |
| `GOOGLE_ADS_MANAGE_ACCOUNT`  | Manager account id (MCC).            |
| `MERCHANT_ID`                | Google Merchant id.                  |

### Vận chuyển / B2C

| Key                          | Mô tả                          |
| ---------------------------- | ------------------------------ |
| `B2C_TOKEN_GHTK`             | Token GHTK B2C.                |

### Email

| Key                | Mô tả                                       |
| ------------------ | ------------------------------------------- |
| `EMAIL_USERNAME`   | Tài khoản SMTP.                              |
| `EMAIL_PASSWORD`   | Mật khẩu/app password SMTP.                 |
| `SMTP_HOST` / `SMTP_PORT` | (nếu khác mặc định) Cấu hình SMTP.   |

### WebCMS / liên kết landing_page_backend

| Key                          | Mô tả                                  |
| ---------------------------- | -------------------------------------- |
| `WEBCMS_API`                 | Endpoint webcms (`webcms_app:4000`).   |
| `WEBCMS_SECRET_KEY`          | Secret RPC với webcms.                 |
| `BUILDERX_SPA_URL`           | URL `builderx_spa` (CORS, redirect).   |

### Misc

| Key                          | Mô tả                                       |
| ---------------------------- | ------------------------------------------- |
| `WDS_SOCKET_HOST` / `WDS_SOCKET_PORT` | Phoenix LiveReload socket.         |
| `SENTRY_DSN` / `SENTRY_ENV`  | Sentry.                                     |

## Tips

* Trong iex có thể đọc nhanh ENV: `System.get_env("REDIS_HOST")`.
* Khi đổi `.env`, **restart** container (vì `Application` chỉ đọc lúc start).
* Với secret thật (prod): không log, không in ra console; dùng `Application.fetch_env!(:builderx_api, :stripe_sk)` để fail-fast nếu thiếu.

## Kiểm tra nhanh

```bash
make bash
# trong container
echo $JWT_KEY
echo $R_HOST
```

Nếu thiếu biến → service sẽ crash khi start (Sentry, Stripe…). Đọc log container để biết key nào missing.
