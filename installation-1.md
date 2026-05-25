# Installation

Hướng dẫn cài đặt `builderx_api` (Storecake API). Đảm bảo đã đọc [Setup](setup.md) trước.

## 1. Clone repo

```bash
git clone git@github.com:pancake-vn/builderx_api.git
cd builderx_api
```

Repo này thường được clone cạnh `builderx_spa`:

```
~/web_cake/
├── builderx_spa/
└── builderx_api/   <-- bạn ở đây
```

## 2. Cấu hình `.env`

```bash
cp .dev.env .env
```

Mở `.env` chỉnh lại:

* OAuth client (Pancake, Google, FB…) cho phù hợp môi trường (mặc định trong `.dev.env` dùng cluster nội bộ).
* `JWT_KEY` – giữ giá trị nội bộ cho team đồng bộ token.
* Service phụ trợ (Rabbit, Kafka, Redis, Mongo, Elastic) khớp với hostname trong `docker-compose-service.yml` (mặc định `web-rabbitmq`, `redis`, `elasticsearch`,…).

Xem chi tiết các biến tại [Environment variables](storecake-api/environment.md).

## 3. Build Docker image

```bash
make build
```

Lệnh ngầm: `docker-compose build builderx_api`. Image bao gồm Elixir 1.12.2, Erlang/OTP 24, Node.js (cho assets), libvips (Vix), Mongo CLI.

## 4. Chạy service phụ trợ

```bash
make services
```

Sẽ start các container ở `docker-compose-service.yml`:

* Postgres + Citus
* MongoDB
* Redis
* RabbitMQ
* ElasticSearch
* QuestDB (nếu bật)

> Dừng service phụ trợ: `make stop-services`.

## 5. Chạy app dev

```bash
make dev
```

Tương đương:

```bash
docker rm builderx_api   # xoá container cũ
make app                 # docker-compose run --service-ports builderx_api
```

Mặc định Phoenix lắng nghe `http://localhost:24679`. Đây là URL `VITE_BUILDERX_API_URL` ở phía `builderx_spa`.

## 6. Setup DB & cài deps Elixir

Vào shell container:

```bash
make bash
```

Trong container:

```bash
mix deps.get
mix ecto.setup           # create + migrate + seed (BuilderxApi.Repo)
mix ecto.migrate -r BuilderxApi.Citus
```

> Lần đầu chạy, `ecto.setup` có thể mất vài phút vì seed nhiều dữ liệu mặc định (theme, geo, ngôn ngữ).

## 7. Cài deps frontend nội bộ

Repo có folder `assets/` (Vue 3 + Webpack 4) phục vụ vài trang admin server-side:

```bash
cd assets
npm install
cd ..
```

Khi sửa asset, chạy `npm run watch` trong `assets/` (Phoenix sẽ tự reload qua live_reload trong dev).

## 8. Tài khoản dev

Trong iex container (`make bash` → `iex -S mix phx.server`):

```elixir
BuilderxApi.Accounts.create_account %{email: "you@pancake.vn"}
BuilderxApi.Run.get_login_link "you@pancake.vn"
```

Mở link đó trên `builderx_spa` để login.

## 9. Lệnh thường dùng

| Lệnh                           | Mục đích                                            |
| ------------------------------ | --------------------------------------------------- |
| `make services`                | Start service phụ trợ.                              |
| `make stop-services`           | Dừng service phụ trợ.                               |
| `make build`                   | Build image.                                        |
| `make app`                     | Run app (alias chạy service + app).                 |
| `make dev`                     | Run app dev (hot reload).                           |
| `make bash`                    | Vào bash container.                                 |
| `make postgres`                | Mở `psql` trong container.                          |
| `make migrate`                 | Migrate Citus.                                      |
| `make install`                 | `mix deps.get` trong container.                     |
| `make sync` / `make app-sync`  | Bật docker-sync (mac hiệu năng cao).                |
| `make deploy*`                 | Deploy production/staging (chỉ ops dùng).           |

## 10. Verify

* `curl http://localhost:24679/healthz` → 200.
* Mở `builderx_spa` (port 5173) → login.
* `make bash` → `iex` → `BuilderxApi.Repo.aggregate("sites", :count)` trả về số.
* Rabbit UI: `http://localhost:15672` (user/password theo `.dev.env`).
* Elastic: `curl http://localhost:9200/_cluster/health`.

Nếu lỗi xem [Error catalogue](error.md) và [Run book](run.md).
