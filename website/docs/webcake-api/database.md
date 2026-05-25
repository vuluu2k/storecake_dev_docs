---
sidebar_position: 6
title: Database & Replica
---

# Database & Replica

`landing_page_backend` runs Postgres as the primary store with a **logical replication** setup for analytics offload.

## Repos

- `LandingPage.Repo` — Primary Postgres repo.
- `LandingPage.ReplicaRepo` — Optional read replica registered in `application.ex` when needed.

## Migrations

Migrations live in `priv/repo/migrations/`. Commands:

```bash
# Inside the container
docker compose exec landing-page mix ecto.migrate
# Or
make migrate
```

Mix aliases:

```elixir
"ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
"ecto.reset": ["ecto.drop", "ecto.setup"]
```

> Unlike `builderx_api`, this repo does **not** use Citus. Large tables (form_data, analytics) rely on good indexes + partitioning + replica offload.

## Logical replication setup

The `replica/` folder bundles scripts; the Makefile drives them:

| Target | What it does |
| --- | --- |
| `make upgrade-data` | Runs `replica/pg_upgrade.sh` to upgrade Postgres data. |
| `make update-primary-config` | Tweaks `postgresql.conf` on the primary (`wal_level`, `max_wal_senders`,…). |
| `make init-primary` | Creates the publication on the primary (`init_pub.sh`). |
| `make init-data-repica` | Initial data copy to the replica (`init_data_replica.sh`). |
| `make init-replica` | Creates the subscription on the replica (`init_sub.sh`). |
| `make add-table-replica` | Add a table: `make add-table-replica table=form_data`. |
| `make migrate-all` | Run the full replication flow step by step. |

> Backup before `migrate-all` on a real environment — `pg_upgrade` rewrites the data directory.

## Seeding

`priv/repo/seeds.exs` inserts baseline data (geo, default templates, sample organization). Run with:

```bash
docker compose exec landing-page mix run priv/repo/seeds.exs
```

`country_data.json` at the repo root feeds the country import flow.

## Redis

- Modules: `lib/redis.ex`, `lib/redis_pubsub.ex`, `lib/redlock.ex`.
- Use cases:
  - Page-render cache (`page:<id>:render`).
  - Real-time pub/sub (`landing:<account>:event`).
  - Distributed locks during publish.

## Kafka

- Module: `lib/event_streaming/`.
- Main topics: analytics, conversion, lead events.
- Producer + consumer under a supervisor; consumer groups named per service (`webcake.analytics`).

## RabbitMQ

- Module: `lib/rabbit/` (`:gen_rmq`).
- Used to integrate partners and synchronize with `builderx_api` (via webcms).

## ElasticSearch

- `lib/elastic.ex`, `lib/elastic_index.ex` configure indexes for pages + form data.
- Manual reindex (IEx): `LandingPage.ElasticIndex.reindex_pages/0`.

## S3

- Asset / CMS file buckets.
- Env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region.

## QuestDB

- `lib/questdb/` pushes real-time metrics (pixel view, click).

## Backup / DR

- Daily backup of the primary.
- The replica is for analytics — do **not** treat it as a backup.
- Mongo (if used) is dumped via `mongodump` on the ops schedule.

## Migration guidelines

- Avoid schema changes on huge tables (form_data, analytics) during peak hours.
- Adding a column to a large table: `add_column ... null: true`, no default, then backfill via a job.
- Migrations need a sane `down/0` if reversible; otherwise `raise/0` clearly.

## Pitfalls

- Replication can lag on bulk DDL — schedule outside peak.
- Wide JSONB columns: use GIN indices, not full-text.
- When renaming a published table: drop from the publication, rename, re-add via `make add-table-replica`.

## See also

- [Architecture](./architecture.md)
- [Workers & Queue](./workers.md)
- [Integrations](./integrations.md)
- [Environment](./environment.md)
