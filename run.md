# Run book

Tổng hợp các lệnh hay dùng khi vận hành / debug `builderx_api`. Trừ khi nói khác, lệnh `elixir` chạy trong iex (`make bash` → `iex -S mix phx.server` hoặc `iex --remsh app@<node>` trên prod).

## Accounts

```elixir
# Tạo account dev
BuilderxApi.Accounts.create_account %{email: "example@gmail.com"}

# Tạo link login (passwordless)
BuilderxApi.Run.get_login_link "example@gmail.com"
```

## Index product → Elastic

1. Trong repo `webcms`, bật service:

   ```bash
   cd webcms && make beam
   ```

2. Trong iex `builderx_api`, start consumer thủ công:

   ```elixir
   BuilderxApi.DynamicApp.start_rabbit
   Rabbit.IndexingConsumer.start_link
   Rabbit.TaskPoolConsumer.start_link
   ```

3. Reindex / dựng lại index:

   ```elixir
   # Reindex toàn bộ product
   Elastic.re_setup_product_index

   # Confirm và xoá index cũ
   Elastic.confirm_re_setup_product_index
   ```

> Production: chạy theo từng batch, tránh dội Elastic cluster.

## Cache product (ETS)

```elixir
# site_id ví dụ: 16952bde-3812-4373-8e9d-8c7c56857312
BuilderxApi.Run.ets_cache_product_site(site_id)

# Cache variations (biến thể)
BuilderxApi.Run.ets_cache_agg_variations_by_site(site_id)
```

## Cache category

```elixir
# Theo site
BuilderxApi.Run.cache_category_has_many_products(site_id)
BuilderxApi.Run.remove_cache_category_by_site(site_id)

# Toàn bộ
BuilderxApi.Run.cache_category_all
BuilderxApi.Run.remove_cache_category_all
```

## Import địa chỉ Việt Nam

### Địa chỉ mới (chuẩn 2025)

```elixir
BuilderxApi.Geo.ImportGeo.import_new_vietnam_addresses()
```

### Địa chỉ cũ (Tỉnh – Huyện – Xã)

```elixir
# Import full (province + district + commune) cho VN
BuilderxApi.Geo.ImportGeo.import_country_addresses(84, is_new: false, delete_old: true)

# Hoặc chạy từng bước
BuilderxApi.Geo.ImportGeo.import_vn_provinces()
BuilderxApi.Geo.ImportGeo.import_vn_districts()
BuilderxApi.Geo.ImportGeo.import_vn_commune()
```

## Migrations

```bash
# Citus
make migrate
# hoặc trực tiếp
docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Citus

# Repo thường
docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Repo

# Setup từ đầu
docker compose exec builderx_api mix ecto.setup
docker compose exec builderx_api mix ecto.reset
```

## Mongo

```elixir
# Đếm document
Mongo.count(:mongo, "form_data", %{})

# Xoá theo điều kiện (cẩn thận trên prod)
Mongo.delete_many(:mongo, "form_data", %{site_id: site_id})
```

## Redis

```elixir
Redis.get("storecake:product:#{product_id}:detail")
Redis.del("storecake:product:#{product_id}:detail")
Redis.publish("site:#{site_id}", %{type: :ping})
```

## Quantum (cronjobs)

```elixir
Quantum.Job.all(BuilderxApi.Scheduler)
BuilderxApi.Scheduler.deactivate_job(:reindex_products)
BuilderxApi.Scheduler.activate_job(:reindex_products)
```

## Health & inspect

```elixir
# Số liệu Repo
BuilderxApi.Repo.aggregate("sites", :count)

# Phoenix Endpoint info
BuilderxApiWeb.Endpoint.config(:url)

# Quá trình live
Process.list() |> length()
```

## Tham chiếu nhanh

* [Architecture](storecake-api/architecture.md)
* [Database](storecake-api/database.md)
* [Cronjobs](storecake-api/cronjobs.md)
* [Integrations](storecake-api/integrations.md)
* [Error catalogue](error.md)
