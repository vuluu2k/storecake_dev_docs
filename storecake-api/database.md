# Database

`builderx_api` dùng nhiều hệ lưu trữ song song. Tài liệu này tập trung vào **PostgreSQL + Citus** (kho dữ liệu chính) và lưu ý quan trọng với MongoDB / Redis / Elastic / QuestDB.

## Stack lưu trữ

| Hệ          | Vai trò                                          | Module/Repo Elixir                            |
| ----------- | ------------------------------------------------ | --------------------------------------------- |
| Postgres    | Bảng global (account, plan, geo, system)         | `BuilderxApi.Repo`                            |
| Citus       | Bảng shard theo `site_id` (product, order,…)     | `BuilderxApi.Citus`                           |
| Mongo       | Document động (form data, log lớn)               | `lib/db_collections/` + `:mongodb_driver`     |
| Redis       | Cache, lock, pubsub                              | `lib/redis/`, `:redix`                        |
| Elastic     | Full-text search, filter                         | `lib/search/`, `:erlastic_search`             |
| QuestDB     | Time-series (metric, conversion)                 | `lib/questdb/`                                |
| S3          | Asset, file CMS                                  | `:ex_aws_s3`                                  |

## Ecto Repos

Project có **2 Repo Postgres**:

* `BuilderxApi.Repo` – Postgres thường, dùng cho bảng không cần shard.
* `BuilderxApi.Citus` – Postgres + extension Citus, cho bảng shard theo `site_id`.

Lệnh ecto cần truyền `-r` để chọn Repo khi cần:

```bash
mix ecto.migrate -r BuilderxApi.Repo
mix ecto.migrate -r BuilderxApi.Citus

# hoặc trong container:
make migrate    # đã chỉ Citus
```

> Khi tạo migration mới, đặt vào folder migration tương ứng để không lẫn.

## Citus – shard theo `site_id`

* Bảng shard có `site_id` (UUID) làm distribution column.
* Index khoá ngoài trong cùng shard mới dùng được hiệu quả – tránh JOIN giữa Repo Postgres thường và Citus.
* Khi tạo bảng shard mới:

  ```elixir
  create table(:my_table, primary_key: false) do
    add :id, :uuid, primary_key: true
    add :site_id, :uuid, null: false
    # các cột khác
    timestamps()
  end

  create index(:my_table, [:site_id])
  execute "SELECT create_distributed_table('my_table', 'site_id')"
  ```

* Nếu cần co-locate với bảng đã có (`products`), thêm `colocate_with => 'products'` trong `create_distributed_table`.

## Migrations

```
priv/repo/migrations/             # Migration cho Repo thường
priv/repo/citus_migrations/       # Migration cho Citus (nếu được tách)
priv/repo/seeds.exs               # Seed
```

Aliases tiện ích trong `mix.exs`:

```elixir
"ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
"ecto.reset": ["ecto.drop", "ecto.setup"]
```

Sử dụng:

```bash
mix ecto.setup
mix ecto.reset
```

## Connection pool

* Pool mặc định 30+ tuỳ env (`config/dev.exs`, `prod.exs`).
* Khi long-running query, dùng `Repo.transaction(fn -> ... end, timeout: :infinity)` thay vì tăng pool size.

## MongoDB

* Collection cấu hình tại `lib/db_collections/`.
* Sử dụng `Mongo.find/3`, `Mongo.insert_one/3`.
* Mongo dùng cho:
  * `form_data` lớn (lead, dynamic field).
  * Log import/scrape.
* Index quan trọng: định nghĩa trong script `mongo/`.

## Redis

* `lib/redis/` cung cấp `Redis.get/1`, `Redis.set/3`, `Redis.del/1`, `Redis.publish/2`.
* `lib/redlock.ex` – distributed lock (nhiều node cùng acquire).
* Quy ước key: `<prefix>:<entity>:<id>` (vd `storecake:product:<uuid>:detail`).
* Cache TTL phải truyền rõ (`expire_seconds`); cẩn thận khi bypass cache (`force: true`).

## ElasticSearch

* Index theo entity (`products`, `orders`, `customers`, `pages`,…).
* Mapping định nghĩa tại module domain tương ứng (`<domain>/elastic.ex`).
* Reindex chạy qua Rabbit consumer (`Rabbit.IndexingConsumer`) – xem [Run book](../run.md).
* Có module helper `Elastic.re_setup_product_index/0` (chạy ở iex) khi cần dựng lại index.

## QuestDB

* Lưu metric realtime (conversion, pixel, view).
* Module client ở `lib/questdb/` (sender qua UDP/TCP).
* Truy vấn qua HTTP API `questdb_host/exec?query=...`.

## S3

* Bucket cấu hình qua env `S3_*`.
* Module `BuilderxApi.AwsS3` (xem `lib/builderx_api/aws_s3.ex`) cung cấp upload, presigned URL.
* Có chia bucket public (asset) và private (file CMS, invoice).

## Backup / DR

* Postgres + Citus snapshot lưu hằng ngày (ops team quản lý).
* Khi đụng dữ liệu prod local, **clone từ staging** thay vì restore prod dump.
* Mongo backup theo `mongodump` định kỳ.

## Best practices

* **Không** dùng `Repo.all/1` không paginate cho bảng shard – luôn lọc `site_id`.
* Khi truy vấn join cross-shard, cân nhắc copy data vào Elastic hoặc denormalize.
* Long migration nên chạy theo batch (`Ecto.Migration.flush/0` + script `mix run`).
* Bật `Logger.debug` SQL khi cần debug, **không** để bật mặc định prod (đã off trong `prod.exs`).

## Tham chiếu

* [Architecture](architecture.md)
* [Integrations](integrations.md)
* [Cronjobs](cronjobs.md)
* [Run book](../run.md)
