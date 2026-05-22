---
sidebar_position: 6
title: Runbook
---

# Runbook

Các thao tác vận hành thường gặp cho **builderx_api**. Mỗi block dưới đây mặc định chạy trong IEx shell bên trong container (`make bash` → `iex -S mix`), trừ khi có ghi chú khác.

## Tài khoản

Tạo tài khoản mới:

```elixir
BuilderxApi.Accounts.create_account(%{email: "example@gmail.com"})
```

Sinh link đăng nhập một lần (one-time login link):

```elixir
BuilderxApi.Run.get_login_link("example@gmail.com")
```

## Index sản phẩm vào Elasticsearch

1. Bật các service hỗ trợ từ `webcms`:

   ```bash
   cd webcms && make beam
   ```

2. Khởi động RabbitMQ consumer dùng cho indexer:

   ```elixir
   BuilderxApi.DynamicApp.start_rabbit()
   Rabbit.IndexingConsumer.start_link()
   Rabbit.TaskPoolConsumer.start_link()
   ```

3. Chạy hàm index:

   - Reindex toàn bộ sản phẩm:

     ```elixir
     Elastic.re_setup_product_index()
     ```

   - Xóa index cũ sau khi reindex thành công:

     ```elixir
     Elastic.confirm_re_setup_product_index()
     ```

## Cache sản phẩm (ETS in-memory)

Warm cache sản phẩm cho một site:

```elixir
# site_id là UUID, ví dụ "16952bde-3812-4373-8e9d-8c7c56857312"
BuilderxApi.Run.ets_cache_product_site(site_id)
```

Warm cache variation của site đó:

```elixir
BuilderxApi.Run.ets_cache_agg_variations_by_site(site_id)
```

## Cache danh mục

Warm cache danh mục cho một site:

```elixir
BuilderxApi.Run.cache_category_has_many_products(site_id)
```

Xóa cache danh mục của một site:

```elixir
BuilderxApi.Run.remove_cache_category_by_site(site_id)
```

Warm toàn bộ site:

```elixir
BuilderxApi.Run.cache_category_all()
```

Xóa cache của toàn bộ site:

```elixir
BuilderxApi.Run.remove_cache_category_all()
```

## Import dữ liệu địa chỉ Việt Nam (mới)

```elixir
BuilderxApi.Geo.ImportGeo.import_new_vietnam_addresses()
```

## Import dữ liệu địa chỉ Việt Nam (cũ — 3 cấp)

Địa chỉ cũ gồm ba cấp hành chính: tỉnh → huyện → xã.

Import cả ba cấp cho Việt Nam (country code `84`) trong một lệnh:

```elixir
BuilderxApi.Geo.ImportGeo.import_country_addresses(84, [is_new: false, delete_old: true])
```

Hoặc chạy riêng từng cấp:

```elixir
BuilderxApi.Geo.ImportGeo.import_vn_provinces()
BuilderxApi.Geo.ImportGeo.import_vn_districts()
BuilderxApi.Geo.ImportGeo.import_vn_commune()
```
