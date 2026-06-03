---
sidebar_position: 1
title: Công nghệ
---

# Technology

`landing_page_backend` (aka **Webcake API**) là backend Phoenix (Elixir) phục vụ Webcake / landing page builder: dựng page, publish, đo lường conversion, sync CRM/affiliate, tích hợp các nền tảng quảng cáo và CMS file. Backend này chạy độc lập, có DB riêng (Postgres + replica), và kết nối Kafka/RabbitMQ/Redis dùng chung với `builderx_api`.

## Stack

### Ngôn ngữ & Framework

* **Elixir** `~> 1.12.2`, **OTP** 24+.
* **Phoenix** 1.5.x.
* **Ecto** 3.x + Postgres.
* **Cowboy + Plug + Corsica** (HTTP/CORS).
* **Phoenix Channels** (realtime cho builder).

### Database & Storage

| Hệ                 | Vai trò                                                          |
| ------------------ | ---------------------------------------------------------------- |
| Postgres (primary) | Lưu page, landing, form data, organization,...                   |
| Postgres (replica) | Logical replication cho analytics + truy vấn nặng (xem `replica/`)|
| Redis              | Cache, pubsub, lock (`:redix`).                                  |
| Kafka              | Sự kiện high-volume (analytics, pixel, conversion) (`:brod`).     |
| RabbitMQ           | Queue domain event, integration (`:amqp` + `:gen_rmq`).           |
| S3                 | Asset, file CMS (`:ex_aws_s3`).                                   |
| ElasticSearch      | (qua module `elastic.ex`, dùng chia sẻ index public).             |
| Google Drive/Sheets| Sync sheet (`:google_api_drive`, `:google_api_sheets`).           |

### Background

* **Oban** `~> 2.10` – queue-based job runner (DB backed).
* **Quantum** `~> 3.0` – scheduler theo cron.
* **GenRMQ** – RabbitMQ consumer helper.
* **Poolboy** – worker pool.

### Auth & Bảo mật

* **JOSE** (JWT).
* **TLS certificate check**, **X509**.
* **Corsica** (CORS).
* **html_sanitize_ex** – sanitize.
* **credentials_obfuscation** – mask credential trong log.

### Communication

* **Bamboo + Bamboo SMTP** – email.
* **HTTPoison / Hackney** – HTTP client.
* **Slugger / Inflex / Domainatrex** – util.

### Khác

* **Sentry** `~> 8.0`.
* **Thumbnex / Vix / ExImageInfo** – ảnh.
* **Floki** – HTML parser.
* **Timex** – datetime.
* **Hashids** – encode id.
* **Recon** – introspection runtime.

## Yêu cầu hệ thống

* Elixir 1.12.2, Erlang/OTP 24+.
* Docker + Docker Compose v2.
* RAM khuyến nghị ≥ 6GB.
* Tách Postgres primary/replica nếu cần test logical replication (xem [Database](database.md)).

## Cấu trúc cao cấp

```
landing_page_backend/
├── lib/
│   ├── landing_page/             # ① Domain (pages, forms, payments, integrations,...)
│   ├── landing_page_web/         # ② Web layer (router, controllers, channels, plugs)
│   ├── workers/                  # Oban workers chuyên trách
│   ├── oban/                     # Oban config + custom queue
│   ├── queue/                    # Queue trừu tượng (RabbitMQ + Oban)
│   ├── rabbit/                   # AMQP producer/consumer
│   ├── event_streaming/          # Kafka producer/consumer
│   ├── changes_log/              # Log thay đổi dữ liệu (audit)
│   ├── outbox/                   # Outbox pattern
│   ├── passive/                  # Long-running supervised
│   ├── questdb/                  # Time-series
│   ├── dynamic_app.ex            # Dynamic supervisor
│   ├── prod_dynamic_app.ex       # Prod variant
│   ├── application.ex
│   └── …
├── assets/                       # FE nội bộ (Vue 3 + Webpack)
├── config/                       # Phoenix config (dev/prod/test/env)
├── priv/                         # Migrations, static, gettext
├── replica/                      # Script + config logical replication
├── data/                         # Dataset (geo, taxonomy,…)
├── ansible/                      # Playbook deploy
├── test/                         # Test
├── Dockerfile / docker-compose*.yml
├── Makefile
└── mix.exs / mix.lock
```

## Tham chiếu

* [Installation](installation.md)
* [Architecture](architecture.md)
* [Project structure](project-structure.md)
* [Database & replica](database.md)
* [Workers (Oban) & Queue](workers.md)
* [Integrations](integrations.md)
* [Environment variables](environment.md)
* [Deployment](deployment.md)
