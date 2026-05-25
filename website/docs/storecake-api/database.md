---
sidebar_position: 6
title: Database
---

# Database

`builderx_api` uses several storage systems together. This page focuses on PostgreSQL + Citus (primary store) with quick notes on Mongo / Redis / Elastic / QuestDB.

## Storage stack

| System | Role | Elixir module |
| --- | --- | --- |
| Postgres | Global tables (account, plan, geo, system) | `BuilderxApi.Repo` |
| Citus | Tables sharded by `site_id` (product, order, …) | `BuilderxApi.Citus` |
| Mongo | Dynamic-shape documents (form data, large logs) | `lib/db_collections/` + `:mongodb_driver` |
| Redis | Cache, lock, pubsub | `lib/redis/`, `:redix` |
| Elastic | Full-text and filtering | `lib/search/`, `:erlastic_search` |
| QuestDB | Time-series (metrics, conversion) | `lib/questdb/` |
| S3 | Assets, CMS files | `:ex_aws_s3` |

## Two Ecto repos

- `BuilderxApi.Repo` — vanilla Postgres for non-sharded data.
- `BuilderxApi.Citus` — Postgres + Citus extension for shard-by-`site_id` data.

Use `-r` to target a repo:

```bash
mix ecto.migrate -r BuilderxApi.Repo
mix ecto.migrate -r BuilderxApi.Citus

# Inside the container:
make migrate    # already targets Citus
```

> Place new migrations in the folder that matches the target repo to keep them straight.

## Citus — sharding by `site_id`

- Sharded tables include a `site_id` UUID as the distribution column.
- Indexes on `(site_id, ...)` make per-tenant queries fast — avoid cross-shard joins.
- New shard table:

  ```elixir
  create table(:my_table, primary_key: false) do
    add :id, :uuid, primary_key: true
    add :site_id, :uuid, null: false
    # other columns
    timestamps()
  end

  create index(:my_table, [:site_id])
  execute "SELECT create_distributed_table('my_table', 'site_id')"
  ```

- Co-locate with an existing table (e.g. `products`) by passing `colocate_with => 'products'` to `create_distributed_table`.

## Migrations

```text
priv/repo/migrations/             # Repo migrations
priv/repo/citus_migrations/       # Citus migrations (when separated)
priv/repo/seeds.exs               # Seeds
```

Aliases in `mix.exs`:

```elixir
"ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
"ecto.reset": ["ecto.drop", "ecto.setup"]
```

Usage:

```bash
mix ecto.setup
mix ecto.reset
```

## Connection pool

- Pool size defaults to 30+ (per env in `config/dev.exs`, `prod.exs`).
- For long-running queries, prefer `Repo.transaction(fn -> ... end, timeout: :infinity)` over raising pool size.

## MongoDB

- Schemas in `lib/db_collections/`.
- API: `Mongo.find/3`, `Mongo.insert_one/3`, `Mongo.delete_many/3`.
- Use cases:
  - Large `form_data` (leads, dynamic fields).
  - Import / scrape logs.
- Indices defined in scripts under `mongo/`.

## Redis

- `lib/redis/` provides `Redis.get/1`, `Redis.set/3`, `Redis.del/1`, `Redis.publish/2`.
- `lib/redlock.ex` — distributed lock across nodes.
- Key convention: `<prefix>:<entity>:<id>` (e.g. `storecake:product:<uuid>:detail`).
- Cache TTL must be explicit (`expire_seconds`); pass `force: true` carefully to bypass cache.

## ElasticSearch

- Index per entity (`products`, `orders`, `customers`, `pages`,…).
- Mapping lives in `<domain>/elastic.ex`.
- Reindex runs through `Rabbit.IndexingConsumer` (see [Run book](./run.md)).
- For full rebuilds, call `Elastic.re_setup_product_index/0` from IEx.

## QuestDB

- Real-time metrics (conversion, pixel, view).
- Sender module in `lib/questdb/` (ILP / TCP).
- Queries via HTTP `questdb_host/exec?query=...`.

## S3

- Buckets configured via `S3_*` env vars.
- `BuilderxApi.AwsS3` provides upload + presigned URLs.
- Buckets are split into public (assets) and private (CMS, invoices).

## Backup / DR

- Postgres + Citus snapshots are taken daily (ops owns the schedule).
- When you need prod-like data locally, **clone from staging**, never restore prod dumps.
- Mongo backups via `mongodump` on the ops schedule.

## Best practices

- Never `Repo.all/1` on a shard table without filtering by `site_id`.
- For cross-shard joins, denormalize into Elastic instead of attempting Citus joins.
- Long migrations should batch (`Ecto.Migration.flush/0` + `mix run scripts/...`).
- Keep `Logger.debug` SQL off in prod (already off in `prod.exs`).

## See also

- [Architecture](./architecture.md)
- [Integrations](./integrations.md)
- [Cronjobs](./cronjobs.md)
- [Run book](./run.md)
