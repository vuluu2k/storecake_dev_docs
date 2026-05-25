---
sidebar_position: 7
title: Tích hợp
---

# Tích hợp

Các dịch vụ ngoài và hạ tầng mà `builderx_api` phụ thuộc. Mỗi mục chỉ rõ vị trí code, cách bật/tắt và những điểm cần lưu khi phát triển.

## Elasticsearch

- Thư viện: `:erlastic_search` + helper trong `lib/search/`.
- Mỗi domain có mapping / index riêng (`lib/builderx_api/<domain>/elastic.ex`).
- Luồng index:
  1. Domain ghi DB.
  2. Outbox phát event.
  3. `Rabbit.IndexingConsumer` consume và cập nhật Elastic.
- Reindex thủ công trong IEx:

  ```elixir
  Elastic.re_setup_product_index
  Elastic.confirm_re_setup_product_index    # xoá index cũ
  ```

- Biến môi trường: `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`.

## RabbitMQ

- Thư viện: `:amqp` + module `lib/rabbit/`.
- Biến môi trường kết nối: `R_HOST`, `R_PORT`, `R_USERNAME`, `R_PASSWORD`, `R_VIRTUAL_HOST`.
- Consumer chính:
  - `Rabbit.IndexingConsumer` — event index Elastic.
  - `Rabbit.TaskPoolConsumer` — task batch (cache, sync,…).
- Khi dev có thể khởi động consumer thủ công trong IEx:

  ```elixir
  BuilderxApi.DynamicApp.start_rabbit
  Rabbit.IndexingConsumer.start_link
  Rabbit.TaskPoolConsumer.start_link
  ```

- Tên queue gắn prefix theo môi trường để tránh consume nhầm nhau.

## Kafka

- Thư viện: `:brod`, cấu hình trong `lib/kafka/`.
- Biến môi trường: `KAFKA1_HOST`, `KAFKA1_PORT`, …
- Dùng cho event throughput cao: analytic, conversion, pixel.
- Consumer chạy trong supervisor riêng; tên consumer-group theo service (`storecake.indexing`, `storecake.analytics`).

## Redis

- Thư viện: `:redix`, module `lib/redis/` + `lib/redlock.ex`.
- Biến môi trường: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- Trường hợp dùng:
  - Cache sản phẩm / danh mục theo site (xem [Runbook](./run.md)).
  - Cầu nối PubSub vào Phoenix PubSub.
  - Distributed lock (chống double-charge / double-publish).

## MongoDB

- Thư viện: `:mongodb_driver`.
- Biến môi trường: `MONGO_URI`.
- Tránh transaction trải nhiều document khi không thực sự cần.
- Bulk insert dùng `Mongo.insert_many` thay vì loop.

## Email (SMTP)

- Thư viện: `:bamboo` + `:bamboo_smtp`; ở test dùng `bamboo_test_adapter`.
- Module: `lib/email.ex`, `lib/builderx_api/mailer.ex`.
- Template chữ ở `priv/gettext/`, HTML ở `lib/builderx_api_web/templates/email/`.
- Biến môi trường: `EMAIL_USERNAME`, `EMAIL_PASSWORD`, SMTP host/port.

## Google APIs

- `google_api_drive`, `google_api_sheets` (dùng chung với `landing_page_backend`).
- Biến môi trường: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`, `GOOGLE_API_KEY`, `GG_CALLBACK_URL`.
- Trường hợp dùng: đồng bộ danh mục từ Sheets, Drive picker, OAuth login.

## Pancake ID / Pancake CRM

- OAuth client: `PANCAKEID_CLIENT_ID`, `PANCAKEID_CLIENT_SECRET`.
- Endpoint: `AUTH_URL` (`https://account.pancake.vn`).
- Controller riêng: `pancake_controller.ex`, `crm_pancake_controller.ex`.

## Stripe

- Gọi qua HTTPoison.
- Biến môi trường: `STRIPE_SK`, `STRIPE_WEBHOOK_SECRET_KEY`.
- Hỗ trợ gói cước Storecake và thanh toán Stripe của cửa hàng.

## Facebook / Botcake

- `FACEBOOK_APP_ID`, `FACEBOOK_SECRET_KEY` — Login + Catalog.
- `BOTCAKE_*` — Tích hợp Botcake (chatbot).
- `FACEBOOK_APP_ID_LG`, `FACEBOOK_SECRET_KEY_LG` — Môi trường LG riêng.

## Slack

- Biến môi trường: `SLACK_CLIENT_ID`, `SLACK_SECRET_ID`.
- Dùng cho thông báo của các luồng automation.

## Dropbox / Instagram / Dribbble / Vimeo / DeviantArt

- Picker tài nguyên (cho Editor / CMS file).
- Mỗi dịch vụ có client id / secret riêng (`DROPBOX_APP_KEY`, `INSTAGRAM_CLIENT_ID`,…).

## Google Ads

- `DEVELOPER_TOKEN`, `GOOGLE_ADS_MANAGE_ACCOUNT`.
- Pull / push campaign cho từng cửa hàng.

## reCAPTCHA

- `CAPTCHA_SECRET_KEY`.
- Verify cho các form công khai (đăng ký, contact).

## GHTK (B2C)

- `B2C_TOKEN_GHTK` — tích hợp vận chuyển GHTK.

## Cầu nối Webcake

- `WEBCMS_API`, `WEBCMS_SECRET_KEY` — endpoint của `webcms`.
- Module cầu nối: `lib/landingpage/`, `lib/builderx_api/webcake/`.
- Publish landing page sẽ gọi RPC sang `landing_page_backend`.

## RapidAPI

- `RAPID_API_KEY` — API tổng hợp của bên thứ ba (ví dụ địa danh quốc tế).

## Sentry

- Thư viện: `:sentry ~> 10.2`.
- Biến môi trường: `SENTRY_DSN`, `SENTRY_ENV`.
- Helper: `BuilderxApi.ErrorTracker.capture/2`.
- Ở dev nên để `SENTRY_DSN` rỗng để không bắn event.

## QuestDB

- Biến môi trường: `QUESTDB_HOST`, `QUESTDB_HTTP_PORT`, `QUESTDB_ILP_PORT`.
- Sender đẩy point qua ILP (TCP).

## Hạ tầng nội bộ khác

- **WebCMS** (`webcms`) — Cần thiết cho luồng indexing; chạy `make beam` trong `webcms` (xem [Runbook](./run.md)).
- **landing_page_backend** — Deploy độc lập nhưng dùng chung một số queue; giữ cụm Rabbit đồng bộ.

## Thêm tích hợp mới

1. Tạo `lib/builderx_api/<integration>/` chứa client và context.
2. Khai báo biến môi trường mới ở `config/env_config.exs` và cập nhật [Biến môi trường](./environment.md).
3. Tích hợp chạy dài (consumer) thì thêm GenServer và đăng ký vào supervisor.
4. Luôn đặt timeout và retry rõ ràng (HTTPoison `recv_timeout`, Brod producer retry).
5. Bổ sung test stub trong `test/`.
