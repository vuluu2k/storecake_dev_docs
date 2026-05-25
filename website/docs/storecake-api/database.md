---
sidebar_position: 6
title: Cơ sở dữ liệu
---

# Cơ sở dữ liệu

`builderx_api` dùng nhiều hệ lưu trữ song song. Tài liệu này tập trung vào PostgreSQL + Citus (kho dữ liệu chính), kèm ghi chú nhanh cho Mongo / Redis / Elastic / QuestDB.

## Các hệ lưu trữ

| Hệ | Vai trò | Module Elixir |
| --- | --- | --- |
| Postgres | Bảng global (account, plan, geo, system) | `BuilderxApi.Repo` |
| Citus | Bảng shard theo `site_id` (sản phẩm, đơn hàng,…) | `BuilderxApi.Citus` |
| Mongo | Document có cấu trúc động (form data, log lớn) | `lib/db_collections/` + `:mongodb_driver` |
| Redis | Cache, lock, pubsub | `lib/redis/`, `:redix` |
| Elastic | Full-text + filter | `lib/search/`, `:erlastic_search` |
| QuestDB | Time-series (metric, conversion) | `lib/questdb/` |
| S3 | Tài nguyên, file CMS | `:ex_aws_s3` |

## Hai repo Ecto

- `BuilderxApi.Repo` — Postgres thường, cho bảng không cần shard.
- `BuilderxApi.Citus` — Postgres + extension Citus, cho bảng shard theo `site_id`.

Truyền `-r` để chọn repo:

```bash
mix ecto.migrate -r BuilderxApi.Repo
mix ecto.migrate -r BuilderxApi.Citus

# Trong container
make migrate    # đã trỏ Citus
```

> Đặt migration mới vào thư mục tương ứng với repo đích để tránh nhầm lẫn.

## Citus — shard theo `site_id`

- Bảng shard có cột `site_id` (UUID) làm distribution column.
- Index theo `(site_id, ...)` cho truy vấn nhanh trong cùng shard — tránh join cross-shard.
- Tạo bảng shard mới:

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

- Co-locate với bảng có sẵn (ví dụ `products`) bằng cách truyền `colocate_with => 'products'` cho `create_distributed_table`.

## Migration

```text
priv/repo/migrations/             # Migration cho Repo
priv/repo/citus_migrations/       # Migration cho Citus (khi tách)
priv/repo/seeds.exs               # Seed
```

Alias trong `mix.exs`:

```elixir
"ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
"ecto.reset": ["ecto.drop", "ecto.setup"]
```

Sử dụng:

```bash
mix ecto.setup
mix ecto.reset
```

## Pool kết nối

- Pool mặc định 30+ (mỗi env trong `config/dev.exs`, `prod.exs`).
- Với truy vấn chạy dài, ưu tiên `Repo.transaction(fn -> ... end, timeout: :infinity)` thay vì tăng pool size.

## MongoDB

- Schema trong `lib/db_collections/`.
- API: `Mongo.find/3`, `Mongo.insert_one/3`, `Mongo.delete_many/3`.
- Trường hợp dùng:
  - `form_data` cỡ lớn (lead, trường động).
  - Log import / scrape.
- Index quan trọng được định nghĩa trong script ở `mongo/`.

## Redis

- `lib/redis/` cung cấp `Redis.get/1`, `Redis.set/3`, `Redis.del/1`, `Redis.publish/2`.
- `lib/redlock.ex` — distributed lock giữa nhiều node.
- Quy ước key: `<prefix>:<entity>:<id>` (ví dụ `storecake:product:<uuid>:detail`).
- TTL cache phải truyền rõ (`expire_seconds`); chỉ bypass cache (`force: true`) khi thực sự cần.

## Elasticsearch

- Mỗi entity có index riêng (`products`, `orders`, `customers`, `pages`,…).
- Mapping định nghĩa trong `<domain>/elastic.ex`.
- Reindex chạy qua `Rabbit.IndexingConsumer` (xem [Runbook](./run.md)).
- Để dựng lại toàn bộ, gọi `Elastic.re_setup_product_index/0` trong IEx.

## QuestDB

- Metric realtime (conversion, pixel, view).
- Module sender ở `lib/questdb/` (ILP qua TCP).
- Truy vấn qua HTTP `questdb_host/exec?query=...`.

## S3

- Bucket cấu hình qua các biến `S3_*`.
- `BuilderxApi.AwsS3` cung cấp upload + presigned URL.
- Tách bucket public (asset) và private (CMS, hoá đơn).

## Sao lưu / phục hồi thảm hoạ

- Postgres + Citus snapshot hằng ngày (ops chịu trách nhiệm).
- Khi cần dữ liệu giống prod ở máy local, **clone từ staging**, không restore dump prod.
- Mongo backup theo lịch `mongodump` của ops.

## Best practice

- Tuyệt đối không `Repo.all/1` trên bảng shard mà không filter `site_id`.
- Cần join cross-shard thì denormalize sang Elastic thay vì cố join trong Citus.
- Migration dài nên chia batch (`Ecto.Migration.flush/0` + `mix run scripts/...`).
- Không bật `Logger.debug` SQL ở prod (đã tắt trong `prod.exs`).

## Xem thêm

- [Kiến trúc](./architecture.md)
- [Tích hợp](./integrations.md)
- [Cronjob](./cronjobs.md)
- [Runbook](./run.md)
