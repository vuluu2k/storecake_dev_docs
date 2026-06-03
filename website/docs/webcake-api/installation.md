---
sidebar_position: 5
title: Cài đặt
---

# Installation

Hướng dẫn cài đặt `landing_page_backend` (Webcake API). Đọc [Setup](../setup.md) trước.

## 1. Clone repo

```bash
git clone git@github.com:pancake-vn/landing_page_backend.git
cd landing_page_backend
```

Đặt cùng parent với 2 repo còn lại để tham chiếu:

```
~/web_cake/
├── builderx_spa/
├── builderx_api/
└── landing_page_backend/   <-- bạn ở đây
```

## 2. Cấu hình `.env`

```bash
cp .dev.env .env
```

Mở `.env` chỉnh:

* OAuth client + secret nội bộ (Pancake, Google, Sapo, Haravan, Shopify, Paypal, Stripe…).
* Service phụ trợ: `R_HOST`, `REDIS_HOST`, `ELASTIC_HOST`, … khớp `docker-compose-services.yml`.
* Bridge nội bộ: `WEBCMS_API`, `WEBCMS_SECRET_KEY`, `STORECAKE_SECRET_KEY`, `WEBCAKE_SECRET_KEY`.

Chi tiết: [Environment variables](environment.md).

## 3. Build Docker image

```bash
docker compose build landing-page
# hoặc
make build
```

Image gồm Elixir 1.12.2, Erlang/OTP 24+, Node.js, libvips, ffmpeg, Postgres client, Mongo client.

## 4. Chạy service phụ trợ

```bash
make services
```

Dùng `docker-compose-services.yml` để start:

* Postgres primary (+ replica nếu enable)
* Redis
* RabbitMQ
* Kafka 1 + 2
* ElasticSearch
* QuestDB (tuỳ cấu hình)

## 5. Chạy app dev

```bash
make app          # docker-compose run --service-ports landing-page
# hoặc hot reload
make dev          # rm container cũ + run lại
```

Mặc định Phoenix lắng nghe `http://landing-page:4000` (trong network docker) và mapping ra `http://localhost:5800` (theo `docker-compose.yml`).

> `BUILDER_HOST=localhost` trong `.dev.env` đảm bảo client builder local trỏ đúng.

## 6. Setup DB + cài assets

Vào container:

```bash
make bash
```

Trong container:

```bash
mix deps.get
mix ecto.setup           # create + migrate + seed
cd assets && npm install && cd ..
```

`mix ecto.setup` chạy luôn `priv/repo/seeds.exs` (insert geo, default email template, organization mặc định, country_data từ JSON).

## 7. Replica (tuỳ chọn)

Nếu cần test logical replication local:

```bash
make migrate-all
```

Lệnh này sẽ tuần tự: `upgrade-data`, `update-primary-config`, `init-primary`, `init-data-repica`, `init-replica`. Xem chi tiết tại [Database & replica](database.md).

## 8. Cài deps FE nội bộ tự động (CI mode)

```bash
make ci-assets
# ngầm: docker exec -it landing-page npm ci --prefix assets
```

Dùng trong CI để cài deps FE.

## 9. Tài khoản dev

Trong iex container (`make bash` → `iex -S mix phx.server`):

```elixir
LandingPage.Accounts.create_account %{email: "you@pancake.vn"}
LandingPage.Run.get_login_link "you@pancake.vn"
```

Mở link trên `builderx_spa` (chế độ landing builder).

## 10. Lệnh thường dùng

| Lệnh                            | Mục đích                                                |
| ------------------------------- | ------------------------------------------------------- |
| `make services`                 | Start service phụ trợ.                                  |
| `make build`                    | Build image.                                            |
| `make app`                      | Run app.                                                |
| `make dev`                      | Run app (hot reload).                                   |
| `make bash`                     | Vào bash container.                                     |
| `make migrate`                  | Migrate DB.                                             |
| `make ci-assets`                | Cài deps FE qua npm ci.                                 |
| `make upgrade-data`             | Upgrade data version (replica flow).                    |
| `make update-primary-config`    | Update postgresql.conf primary.                         |
| `make init-primary`             | Tạo publication.                                        |
| `make init-data-repica`         | Sync data sang replica.                                 |
| `make init-replica`             | Tạo subscription replica.                               |
| `make add-table-replica table=...` | Thêm bảng vào publication.                           |
| `make migrate-all`              | Chạy toàn bộ replica flow.                              |
| `make deploy-*`                 | Deploy theo role (xem [Deployment](deployment.md)).     |
| `make hotfix-status` / `head`   | Hotfix nhanh.                                           |

## 11. Verify

* `curl http://localhost:5800/healthz` → 200 (path tuỳ cấu hình).
* `mix run -e 'IO.inspect LandingPage.Repo.aggregate("pages", :count)'` trong container.
* Rabbit UI: `http://localhost:15672`.
* Builder UI (qua `builderx_spa`): mở 1 site landing và publish thử.
* Oban: `iex` → `Oban.check_queue(:default)`.

Nếu lỗi → xem log container + đối chiếu [Environment](environment.md).
