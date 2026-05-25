---
sidebar_position: 11
title: Runbook
---

# Runbook

Các lệnh hay dùng khi vận hành / debug `landing_page_backend`. Đoạn `elixir` chạy trong IEx (`make bash` → `iex -S mix phx.server`).

## Tài khoản

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
# Luồng đầy đủ lần đầu
make migrate-all

# Từng bước
make upgrade-data
make update-primary-config
make init-primary
make init-data-repica
make init-replica

# Thêm bảng vào publication
make add-table-replica table=form_data
```

## Oban (job nền)

```elixir
import Ecto.Query

# Đếm job theo trạng thái
from(j in Oban.Job, group_by: j.state, select: {j.state, count(j.id)})
|> LandingPage.Repo.all()

# Trạng thái queue
Oban.check_queue(:default)
Oban.check_queue(:email)

# Retry / cancel
Oban.retry_job(123456)
Oban.cancel_job(123456)
```

## Reindex Elasticsearch

```elixir
LandingPage.ElasticIndex.reindex_pages()
LandingPage.ElasticIndex.reindex_form_data()
```

(Điều chỉnh tên hàm theo code thực tế nếu khác.)

## Cache / Redis

```elixir
Redis.get("landing:page:#{page_id}:render")
Redis.del("landing:page:#{page_id}:render")
LandingPage.Cache.invalidate(:page, page_id)
```

## Import địa chỉ Việt Nam

```elixir
# Chuẩn 2025
LandingPage.Geo.import_new_vietnam_addresses()

# Chuẩn cũ (tỉnh / huyện / xã)
LandingPage.Geo.import_country_addresses(84, is_new: false, delete_old: true)

LandingPage.Geo.import_vn_provinces()
LandingPage.Geo.import_vn_districts()
LandingPage.Geo.import_vn_commune()
```

(Đường dẫn module có thể khác — tra cứu code thực tế nếu cần.)

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
# Restart consumer (chỉ dev)
LandingPage.Rabbit.Supervisor.restart_consumers()
LandingPage.EventStreaming.Supervisor.restart_consumers()
```

## Kiểm tra nhanh

```elixir
LandingPage.Repo.aggregate("pages", :count)
LandingPageWeb.Endpoint.config(:url)
Process.list() |> length()
:erlang.memory()
```

## Verify domain

```elixir
LandingPage.Domains.verify_txt("yourdomain.com")
LandingPage.Domains.issue_certificate("yourdomain.com")
```

(Module thật ở `lib/landing_page/domains/`.)

## Reset (chỉ dev)

```bash
docker compose exec landing-page mix ecto.reset
```

> Đảm bảo bạn đang ở container **dev**, tuyệt đối không phải staging / prod.

## Xem thêm

- [Kiến trúc](./architecture.md)
- [Cơ sở dữ liệu và Replica](./database.md)
- [Worker và Queue](./workers.md)
- [Biến môi trường](./environment.md)
