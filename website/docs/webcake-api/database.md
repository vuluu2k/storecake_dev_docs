---
sidebar_position: 6
title: Cơ sở dữ liệu và Replica
---

# Database & Replica

`landing_page_backend` dùng Postgres làm DB chính, có cấu hình **logical replication** sang Postgres replica để tách read-heavy (analytics, statistics).

## Repos

* `LandingPage.Repo` – Repo Postgres chính.
* (Tùy môi trường) `LandingPage.ReplicaRepo` – nếu dự án bật read replica trong code, đăng ký trong `application.ex`.

## Migration

Migration ở `priv/repo/migrations/`. Lệnh:

```bash
# Trong container
docker compose exec landing-page mix ecto.migrate
# hoặc
make migrate
```

Aliases trong `mix.exs`:

```elixir
"ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
"ecto.reset": ["ecto.drop", "ecto.setup"]
```

> Khác với `builderx_api`, repo này **không** dùng Citus. Bảng lớn (form_data, analytics) phụ thuộc index tốt + partition + offload sang replica.

## Logical replication setup

Folder `replica/` chứa script. Makefile có target hỗ trợ:

| Target                       | Mục đích                                              |
| ---------------------------- | ----------------------------------------------------- |
| `make upgrade-data`          | Chạy `replica/pg_upgrade.sh` – nâng version Postgres.|
| `make update-primary-config` | Cập nhật `postgresql.conf` cho primary (wal_level, max_wal_senders, …). |
| `make init-primary`          | Tạo publication trên primary (`init_pub.sh`).         |
| `make init-data-repica`      | Sync dữ liệu sang replica lần đầu (`init_data_replica.sh`). |
| `make init-replica`          | Tạo subscription trên replica (`init_sub.sh`).        |
| `make add-table-replica`     | Thêm bảng vào publication: `make add-table-replica table=form_data`. |
| `make migrate-all`           | Chạy toàn bộ flow upgrade + replication step-by-step. |

> Lưu ý: trước khi chạy `migrate-all` trên môi trường thật, **backup** trước. Lệnh `pg_upgrade` thay đổi data directory.

## Seed dữ liệu

`priv/repo/seeds.exs` insert dữ liệu base (geo, default page template, sample organization). Chạy:

```bash
docker compose exec landing-page mix run priv/repo/seeds.exs
```

`country_data.json` ở root được dùng cho luồng import quốc gia.

## Redis

* Module `lib/redis.ex`, `lib/redis_pubsub.ex`, `lib/redlock.ex`.
* Sử dụng:
  * Cache page/render (`page:<id>:render`).
  * Pub/sub realtime (`landing:<account>:event`).
  * Distributed lock cho publish flow.

## Kafka

* Module `lib/event_streaming/`.
* Topic chính: analytic event, conversion event, lead event.
* Producer + consumer chạy under supervisor; consumer group đặt theo service (`webcake.analytics`).

## RabbitMQ

* Module `lib/rabbit/` + `:gen_rmq`.
* Queue dùng cho integration partner, sync với `builderx_api` (qua webcms / WEBCMS_API).

## ElasticSearch

* `lib/elastic.ex`, `lib/elastic_index.ex` cấu hình index cho landing page, form data.
* Reindex thủ công qua iex (`LandingPage.ElasticIndex.reindex_pages/0`,…).

## S3

* Bucket asset & file CMS.
* Cấu hình env `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region.

## QuestDB

* `lib/questdb/` push metric realtime (pixel view, click).

## Backup / DR

* Postgres primary backup hằng ngày.
* Replica có thể dùng cho read-only analytic; **không** dùng để recovery thay backup.
* Mongo (nếu có) backup theo `mongodump` lịch ops.

## Quy ước migration

* Tránh thay đổi schema bảng lớn (form_data, analytics) trong giờ peak.
* Khi thêm cột vào bảng lớn: tạo migration `add_column ... null: true`, **không** set default ngay, sau đó backfill bằng job.
* Migration cần `down` đầy đủ nếu có thể rollback; nếu không, ghi rõ `def down do: raise/0`.

## Pitfalls

* Replication có thể chậm khi DDL large – tránh add column rộng trong giờ peak.
* Một số table chứa JSONB lớn → index GIN, không index full text.
* Khi rename bảng được publish: phải remove khỏi publication, rename, rồi add lại bằng `make add-table-replica`.

## Tham chiếu

* [Architecture](architecture.md)
* [Workers & Queue](workers.md)
* [Integrations](integrations.md)
* [Environment](environment.md)
