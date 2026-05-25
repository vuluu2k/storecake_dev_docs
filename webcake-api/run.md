# Run book

Các lệnh thường dùng khi vận hành / debug `landing_page_backend`. Trừ khi nói khác, lệnh `elixir` chạy trong iex (`make bash` → `iex -S mix phx.server`).

## Accounts

```elixir
LandingPage.Accounts.create_account %{email: "you@pancake.vn"}
LandingPage.Run.get_login_link "you@pancake.vn"
```

## Migration

```bash
make migrate
# hoặc trực tiếp
docker compose exec landing-page mix ecto.migrate
```

```bash
docker compose exec landing-page mix ecto.setup     # create + migrate + seed
docker compose exec landing-page mix ecto.reset
```

## Logical replication

```bash
# Toàn bộ flow lần đầu
make migrate-all

# Step riêng lẻ
make upgrade-data
make update-primary-config
make init-primary
make init-data-repica
make init-replica

# Add table mới vào publication
make add-table-replica table=form_data
```

## Oban (job nền)

```elixir
# Đếm job theo queue
import Ecto.Query
from(j in Oban.Job, group_by: j.state, select: {j.state, count(j.id)})
|> LandingPage.Repo.all()

# Trạng thái queue
Oban.check_queue(:default)
Oban.check_queue(:email)

# Retry job
Oban.retry_job(123456)

# Cancel job pending
Oban.cancel_job(123456)
```

## Index Elastic

```elixir
LandingPage.ElasticIndex.reindex_pages()
LandingPage.ElasticIndex.reindex_form_data()
```

(Thay tên function theo module thực tế nếu khác.)

## Cache / Redis

```elixir
Redis.get("landing:page:#{page_id}:render")
Redis.del("landing:page:#{page_id}:render")
LandingPage.Cache.invalidate(:page, page_id)
```

## Geo / địa chỉ Việt Nam

```elixir
# Import địa chỉ mới (chuẩn 2025)
LandingPage.Geo.import_new_vietnam_addresses()

# Import địa chỉ cũ (tỉnh – huyện – xã)
LandingPage.Geo.import_country_addresses(84, is_new: false, delete_old: true)

LandingPage.Geo.import_vn_provinces()
LandingPage.Geo.import_vn_districts()
LandingPage.Geo.import_vn_commune()
```

(Tên module có thể khác `BuilderxApi.Geo.ImportGeo` – tra cứu trong code thực tế.)

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
# Khởi tạo lại consumer (dev only)
LandingPage.Rabbit.Supervisor.restart_consumers()
LandingPage.EventStreaming.Supervisor.restart_consumers()
```

## Tools / verify nhanh

```elixir
LandingPage.Repo.aggregate("pages", :count)
LandingPagWeb.Endpoint.config(:url)
Process.list() |> length()
:erlang.memory()
```

## Domain verify

```elixir
LandingPage.Domains.verify_txt("yourdomain.com")
LandingPage.Domains.issue_certificate("yourdomain.com")
```

(Tham chiếu module thực tế: `lib/landing_page/domains/`.)

## Reset (dev only)

```bash
docker compose exec landing-page mix ecto.reset
```

> Đảm bảo bạn đang trên container **dev**, không phải staging/prod.

## Tham chiếu

* [Architecture](architecture.md)
* [Database & replica](database.md)
* [Workers & Queue](workers.md)
* [Environment](environment.md)
