---
sidebar_position: 6
title: Cơ sở dữ liệu và Replica
---

# Cơ sở dữ liệu và Replica

`landing_page_backend` dùng Postgres làm kho chính, kèm logical replication sang Postgres replica để giảm tải cho các workload analytic.

## Repos

- `LandingPage.Repo` — Repo Postgres chính.
- `LandingPage.ReplicaRepo` — Read replica, đăng ký trong `application.ex` khi bật.

## Migration

Migration ở `priv/repo/migrations/`. Lệnh:

```bash
# Trong container
docker compose exec landing-page mix ecto.migrate
# Hoặc
make migrate
```

Alias trong `mix.exs`:

```elixir
"ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
"ecto.reset": ["ecto.drop", "ecto.setup"]
```

> Khác với `builderx_api`, repo này **không** dùng Citus. Bảng lớn (form_data, analytics) phụ thuộc index tốt + partition + offload sang replica.

## Logical replication

Thư mục `replica/` chứa script; Makefile dẫn động:

| Target | Tác dụng |
| --- | --- |
| `make upgrade-data` | Chạy `replica/pg_upgrade.sh` để nâng version data. |
| `make update-primary-config` | Cập nhật `postgresql.conf` của primary (`wal_level`, `max_wal_senders`,…). |
| `make init-primary` | Tạo publication trên primary (`init_pub.sh`). |
| `make init-data-repica` | Sync data lần đầu sang replica (`init_data_replica.sh`). |
| `make init-replica` | Tạo subscription trên replica (`init_sub.sh`). |
| `make add-table-replica` | Thêm bảng: `make add-table-replica table=form_data`. |
| `make migrate-all` | Chạy toàn bộ luồng replication theo từng bước. |

> Sao lưu trước khi `migrate-all` trên môi trường thật — `pg_upgrade` ghi đè data directory.

## Seed dữ liệu

`priv/repo/seeds.exs` insert dữ liệu nền (geo, template mặc định, tổ chức mẫu). Chạy:

```bash
docker compose exec landing-page mix run priv/repo/seeds.exs
```

`country_data.json` ở thư mục gốc phục vụ luồng import quốc gia.

## Redis

- Module: `lib/redis.ex`, `lib/redis_pubsub.ex`, `lib/redlock.ex`.
- Trường hợp dùng:
  - Cache render trang (`page:<id>:render`).
  - Pub/sub realtime (`landing:<account>:event`).
  - Distributed lock khi publish.

## Kafka

- Module: `lib/event_streaming/`.
- Topic chính: analytics, conversion, lead event.
- Producer + consumer chạy trong supervisor; consumer group đặt theo service (`webcake.analytics`).

## RabbitMQ

- Module: `lib/rabbit/` (`:gen_rmq`).
- Dùng cho tích hợp đối tác và đồng bộ với `builderx_api` (qua webcms).

## Elasticsearch

- `lib/elastic.ex`, `lib/elastic_index.ex` cấu hình index cho page và form data.
- Reindex thủ công qua IEx (`LandingPage.ElasticIndex.reindex_pages/0`).

## S3

- Bucket asset / file CMS.
- Biến môi trường: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region.

## QuestDB

- `lib/questdb/` đẩy metric realtime (lượt xem pixel, click).

## Sao lưu / phục hồi thảm hoạ

- Backup primary hằng ngày.
- Replica chỉ dành cho analytic — **không** xem replica là bản backup.
- Mongo (nếu dùng) dump qua `mongodump` theo lịch ops.

## Quy ước migration

- Tránh đổi schema trên bảng lớn (form_data, analytics) trong giờ cao điểm.
- Thêm cột vào bảng lớn: `add_column ... null: true`, không default ngay, sau đó backfill bằng job.
- Migration cần có `down/0` hợp lý nếu có thể đảo ngược; nếu không, `raise/0` rõ ràng.

## Lưu ý

- Replication có thể bị lag khi DDL nặng — sắp lịch ngoài giờ cao điểm.
- Cột JSONB rộng: dùng index GIN, không full-text.
- Khi rename bảng đang được publish: drop khỏi publication, rename, sau đó add lại qua `make add-table-replica`.

## Xem thêm

- [Kiến trúc](./architecture.md)
- [Worker và Queue](./workers.md)
- [Tích hợp](./integrations.md)
- [Biến môi trường](./environment.md)
