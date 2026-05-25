---
sidebar_position: 11
title: Run book
---

# Run book

Common commands for operating / debugging `landing_page_backend`. `elixir` snippets run in IEx (`make bash` → `iex -S mix phx.server`).

## Accounts

```elixir
LandingPage.Accounts.create_account %{email: "you@pancake.vn"}
LandingPage.Run.get_login_link "you@pancake.vn"
```

## Migrations

```bash
make migrate
# or directly:
docker compose exec landing-page mix ecto.migrate
```

```bash
docker compose exec landing-page mix ecto.setup    # create + migrate + seed
docker compose exec landing-page mix ecto.reset
```

## Logical replication

```bash
# Full flow (first-time)
make migrate-all

# Individual steps
make upgrade-data
make update-primary-config
make init-primary
make init-data-repica
make init-replica

# Add a new published table
make add-table-replica table=form_data
```

## Oban (background jobs)

```elixir
import Ecto.Query

# Job counts by state
from(j in Oban.Job, group_by: j.state, select: {j.state, count(j.id)})
|> LandingPage.Repo.all()

# Queue status
Oban.check_queue(:default)
Oban.check_queue(:email)

# Retry / cancel
Oban.retry_job(123456)
Oban.cancel_job(123456)
```

## Elastic reindex

```elixir
LandingPage.ElasticIndex.reindex_pages()
LandingPage.ElasticIndex.reindex_form_data()
```

(Adjust the function name if the codebase differs.)

## Cache / Redis

```elixir
Redis.get("landing:page:#{page_id}:render")
Redis.del("landing:page:#{page_id}:render")
LandingPage.Cache.invalidate(:page, page_id)
```

## Vietnamese geo import

```elixir
# New address scheme (2025)
LandingPage.Geo.import_new_vietnam_addresses()

# Legacy (province / district / commune)
LandingPage.Geo.import_country_addresses(84, is_new: false, delete_old: true)

LandingPage.Geo.import_vn_provinces()
LandingPage.Geo.import_vn_districts()
LandingPage.Geo.import_vn_commune()
```

(Look up the actual module path if the names differ.)

## Outbox dispatcher

```elixir
LandingPage.Outbox.Dispatcher.status()
LandingPage.Outbox.Dispatcher.flush()
```

## Quantum (cron)

```elixir
Quantum.Job.all(LandingPage.Scheduler)
LandingPage.Scheduler.deactivate_job(:analytics_aggregate)
LandingPage.Scheduler.activate_job(:analytics_aggregate)
```

## Rabbit / Kafka

```elixir
# Restart consumers (dev only)
LandingPage.Rabbit.Supervisor.restart_consumers()
LandingPage.EventStreaming.Supervisor.restart_consumers()
```

## Health checks

```elixir
LandingPage.Repo.aggregate("pages", :count)
LandingPageWeb.Endpoint.config(:url)
Process.list() |> length()
:erlang.memory()
```

## Domain verify

```elixir
LandingPage.Domains.verify_txt("yourdomain.com")
LandingPage.Domains.issue_certificate("yourdomain.com")
```

(Real module under `lib/landing_page/domains/`.)

## Reset (dev only)

```bash
docker compose exec landing-page mix ecto.reset
```

> Make sure you are on the **dev** container, never staging / prod.

## See also

- [Architecture](./architecture.md)
- [Database & replica](./database.md)
- [Workers & Queue](./workers.md)
- [Environment](./environment.md)
