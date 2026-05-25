# Integrations

Tài liệu mô tả các tích hợp / hạ tầng bên ngoài mà `builderx_api` phụ thuộc. Mỗi mục nêu rõ vị trí code, cách bật/tắt, và những điểm cần chú ý khi dev.

## ElasticSearch

* Lib: `:erlastic_search` + helper ở `lib/search/`.
* Mapping/index riêng cho từng domain (`lib/builderx_api/<domain>/elastic.ex`).
* Workflow index:
  1. Domain ghi DB.
  2. Outbox publish event.
  3. Rabbit consumer `Rabbit.IndexingConsumer` consume → cập nhật Elastic.
* Reindex thủ công (iex):

  ```elixir
  Elastic.re_setup_product_index
  Elastic.confirm_re_setup_product_index   # xoá index cũ
  ```

* ENV: `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`.

## RabbitMQ

* Lib: `:amqp` + module `lib/rabbit/`.
* Connection cấu hình bằng env `R_HOST`, `R_PORT`, `R_USERNAME`, `R_PASSWORD`, `R_VIRTUAL_HOST`.
* Consumer chính:
  * `Rabbit.IndexingConsumer` – nhận event index Elastic.
  * `Rabbit.TaskPoolConsumer` – batch task (cập nhật cache, sync,...).
* Khi dev có thể start thủ công trong iex:

  ```elixir
  BuilderxApi.DynamicApp.start_rabbit
  Rabbit.IndexingConsumer.start_link
  Rabbit.TaskPoolConsumer.start_link
  ```

* Queue chia theo prefix env (vd staging vs prod) để tránh consume nhầm.

## Kafka

* Lib: `:brod` cấu hình ở `lib/kafka/`.
* ENV: `KAFKA1_HOST`, `KAFKA1_PORT`, …
* Producer dùng cho analytic / conversion / pixel.
* Consumer chạy under supervisor; mỗi consumer group được đặt theo service (`storecake.indexing`, `storecake.analytics`).

## Redis

* Lib: `:redix`, module `lib/redis/` + `lib/redlock.ex`.
* ENV: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
* Use cases:
  * Cache product/category theo site (xem `ets_cache_product_site` trong [Run book](../run.md)).
  * PubSub realtime (kết hợp Phoenix.PubSub).
  * Distributed lock (chống double-charge, double-publish).

## MongoDB

* Lib: `:mongodb_driver`.
* ENV: `MONGO_URI`.
* Tránh transaction cross-document khi không thực sự cần.
* Khi đẩy bulk lớn, dùng `Mongo.insert_many` thay vì loop.

## SMTP / Email

* Lib: `:bamboo` + `:bamboo_smtp` (production); `bamboo_test_adapter` ở test.
* Module `lib/email.ex`, mailer ở `lib/builderx_api/mailer.ex`.
* Template chữ ở `priv/gettext/`, HTML ở `lib/builderx_api_web/templates/email/`.
* ENV: `EMAIL_USERNAME`, `EMAIL_PASSWORD`, SMTP host/port.

## Google APIs

* `google_api_drive`, `google_api_sheets` (chia sẻ giữa repo).
* ENV: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_KEY`, `GOOGLE_API_KEY`, `GG_CALLBACK_URL`.
* Dùng cho: sync sheet danh mục, Drive picker, OAuth login.

## Pancake ID / Pancake CRM

* OAuth client: `PANCAKEID_CLIENT_ID`, `PANCAKEID_CLIENT_SECRET`.
* Endpoint: `AUTH_URL` (`https://account.pancake.vn`).
* Controller riêng: `pancake_controller.ex`, `crm_pancake_controller.ex`.

## Stripe

* SDK gọi qua HTTP (HTTPoison).
* ENV: `STRIPE_SK`, `STRIPE_WEBHOOK_SECRET_KEY`.
* Tính năng: subscription cho gói Storecake, payment intent cho store sử dụng Stripe.

## Facebook / Botcake

* `FACEBOOK_APP_ID`, `FACEBOOK_SECRET_KEY` – Login & Catalog.
* `BOTCAKE_*` – Tích hợp Botcake (chatbot).
* `FACEBOOK_APP_ID_LG`, `FACEBOOK_SECRET_KEY_LG` – LG environment riêng.

## Slack

* ENV: `SLACK_CLIENT_ID`, `SLACK_SECRET_ID`.
* Dùng cho notification automation.

## Dropbox / Instagram / Dribbble / Vimeo / DeviantArt

* Tích hợp asset picker (cho Editor / CMS file).
* Mỗi service có client id/secret riêng (`DROPBOX_APP_KEY`, `INSTAGRAM_CLIENT_ID`, ...).

## Google Ads

* `DEVELOPER_TOKEN`, `GOOGLE_ADS_MANAGE_ACCOUNT`.
* Dùng để pull/push campaign cho store.

## Captcha (reCAPTCHA)

* `CAPTCHA_SECRET_KEY`.
* Verify ở các form public (đăng ký, contact).

## GHTK (B2C)

* `B2C_TOKEN_GHTK` – Tích hợp dịch vụ vận chuyển GHTK.

## Webcake (landing_page_backend) bridge

* `WEBCMS_API`, `WEBCMS_SECRET_KEY` – Endpoint `webcms` (service phụ trợ).
* Module bridge: `lib/landingpage/` + `lib/builderx_api/webcake/`.
* Một số luồng publish landing page sẽ gọi RPC sang `landing_page_backend`.

## RapidAPI

* `RAPID_API_KEY` – Truy cập API bên thứ ba (vd địa danh quốc tế).

## Sentry

* Lib: `:sentry ~> 10.2`.
* ENV: `SENTRY_DSN`, `SENTRY_ENV`.
* `lib/error_tracker.ex` chứa helper `BuilderxApi.ErrorTracker.capture/2`.
* Trong dev đặt `SENTRY_DSN=` rỗng để khỏi gửi.

## QuestDB

* ENV: `QUESTDB_HOST`, `QUESTDB_HTTP_PORT`, `QUESTDB_ILP_PORT`.
* Sender đẩy point qua ILP (TCP).

## Hạ tầng nội bộ khác

* **WebCMS** (`webcms` repo): chạy `make beam` trong `webcms` để thực hiện một số lệnh index. Xem [Run book](../run.md).
* **landing_page_backend**: tách deploy nhưng share một số queue – đảm bảo Rabbit cluster đồng nhất.

## Khi thêm integration mới

1. Thêm folder `lib/builderx_api/<integration>/` chứa client + context.
2. Khai báo ENV mới ở `config/env_config.exs` + cập nhật [Environment](environment.md).
3. Nếu integration là long-running (consumer): thêm GenServer + đăng ký supervisor.
4. Đảm bảo có **timeout** và **retry** rõ ràng (HTTPoison `recv_timeout`, Brod producer retry).
5. Bổ sung integration test stub trong `test/` (nếu khả thi).
