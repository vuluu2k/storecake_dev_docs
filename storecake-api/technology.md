# Technology

`builderx_api` là **Storecake API** – backend Phoenix (Elixir) phục vụ toàn bộ domain thương mại điện tử của Storecake: account, site, product, order, customer, payment, integration… Cùng với `landing_page_backend`, nó là nền tảng dữ liệu cho `builderx_spa`.

## Stack

### Ngôn ngữ & Framework

* **Elixir** `~> 1.12.2`, **OTP** 24+.
* **Phoenix** 1.5.x – HTTP + Channels.
* **Phoenix LiveDashboard** (telemetry, monitoring nội bộ).
* **Ecto** 3.x – ORM + migrations.
* **Postgrex** – driver Postgres.
* **Cowboy** – HTTP server.
* **Plug** – middleware layer.

### Database & Storage

| Hệ                   | Vai trò                                                          |
| -------------------- | ---------------------------------------------------------------- |
| **PostgreSQL + Citus**| Shard ngang dữ liệu lớn (sản phẩm, đơn hàng, history, …).       |
| **MongoDB**          | Lưu dữ liệu document động (form, log lớn) – `:mongodb_driver`.    |
| **Redis**            | Cache & queue (`:redix`).                                        |
| **ElasticSearch**    | Full-text + filter sản phẩm/đơn (`:erlastic_search`).             |
| **QuestDB**          | Time-series (`lib/questdb/`).                                    |
| **S3 (AWS)**         | Asset, file CMS (`:ex_aws_s3`).                                  |
| **Google Drive**     | Sync sheets, một số integration (`:google_api_drive`).            |

### Messaging / Event

* **RabbitMQ** (`:amqp`) – queue domain event, indexing.
* **Kafka** (`:brod`) – sự kiện high-throughput (analytic, conversion).
* **Phoenix Channels** – realtime cho client (`builderx_spa`).
* **Outbox pattern** (`lib/outbox/`) – đảm bảo write-then-publish.

### Web & Frontend embedded

* `assets/` chứa frontend nội bộ (Vue 3 + Ant Design Vue + Webpack 4) phục vụ một số trang admin được Phoenix render.
* `phoenix_html`, `phoenix_live_reload` (chỉ dev).

### Auth & Bảo mật

* **Argon2** (`:argon2_elixir`) – hash password.
* **JOSE** (`:jose`) – JWT.
* **Corsica** – CORS.
* **TLS certificate check** (`:tls_certificate_check`).
* **html_sanitize_ex** – sanitize HTML user-supplied.

### Communication

* **Bamboo + Bamboo SMTP** – gửi email transactional.
* **HTTPoison / Hackney** – HTTP client.
* **Slugger / Inflex / Domainatrex** – util slug, pluralize, domain parse.
* **Quantum** – cronjob scheduler.

### Khác

* **Sentry** `~> 10.2` – error tracking.
* **Vix** – xử lý ảnh (libvips).
* **ExImageInfo / Mogrify** – metadata ảnh.
* **Floki** – parser HTML.
* **Saxy** – SAX XML.
* **Timex** – datetime.
* **Hashids** – encode id ngắn.
* **Crontab** – evaluate cron expression.
* **Flow** – pipeline xử lý song song (batch).

## Yêu cầu hệ thống dev

* Elixir 1.12.2, Erlang/OTP 24+.
* Docker + Docker Compose v2.
* RAM khuyến nghị ≥ 8GB (Citus + Elastic + Mongo + Rabbit cùng chạy).
* Disk SSD (workload heavy index/replay).

## Cấu trúc cao cấp

```
builderx_api/
├── lib/
│   ├── builderx_api/            # Business domain (account, product, order,...)
│   ├── builderx_api_web/        # Web layer (router, controller, channel, view)
│   ├── cronjob/                 # Quantum jobs
│   ├── rabbit/                  # RabbitMQ consumer / producer
│   ├── kafka/                   # Kafka producer / consumer
│   ├── ets/                     # In-memory ETS cache
│   ├── search/                  # Elastic helpers
│   ├── redis/                   # Redis helpers
│   ├── outbox/                  # Outbox pattern
│   ├── pool/                    # Worker pool (poolboy)
│   ├── passive/                 # Passive workers (long running)
│   ├── questdb/                 # QuestDB integration
│   ├── qwik/                    # AI / quick-action services
│   ├── landingpage/             # Bridge tới landing_page_backend (sync)
│   ├── dynamic_app.ex           # Bootstrap supervisor động
│   ├── application.ex
│   ├── email.ex
│   ├── error_tracker.ex
│   └── …
├── assets/                      # FE nội bộ (Vue 3 + Webpack)
├── config/                      # Phoenix config (config, dev, prod, test, env_config, prod.secret)
├── priv/                        # Migrations, static, gettext, repo
├── test/                        # Test code
├── ansible/                     # Playbook deploy
├── tools/                       # Tooling nội bộ (script Ruby/Elixir)
├── w_external_command/          # Worker thực thi external command
├── data/                        # Static data lớn (geo, taxonomy,…)
├── mongo/                       # Mongo schema/seed
├── Dockerfile / docker-compose*.yml
├── Makefile
└── mix.exs / mix.lock
```

Xem chi tiết tại [Project structure](project-structure.md), [Domains](domains.md).

## Tham chiếu

* [Installation](../installation-1.md)
* [Architecture](architecture.md)
* [Database & migrations (Citus)](database.md)
* [Integrations (Elastic, Redis, Rabbit, Kafka)](integrations.md)
* [Cronjobs](cronjobs.md)
* [Deployment](deployment.md)
* [Environment variables](environment.md)
* [Run book](../run.md)
* [Error catalogue](../error.md)
