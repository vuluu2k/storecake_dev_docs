---
sidebar_position: 6
title: Runbooks
---

# Runbooks

Common operational tasks for **builderx_api**. Each block is meant to be run from an IEx shell inside the container (`make bash` → `iex -S mix`) unless noted otherwise.

## Accounts

Create an account:

```elixir
BuilderxApi.Accounts.create_account(%{email: "example@gmail.com"})
```

Generate a one-time login link:

```elixir
BuilderxApi.Run.get_login_link("example@gmail.com")
```

## Indexing products into Elasticsearch

1. Start the supporting services from `webcms`:

   ```bash
   cd webcms && make beam
   ```

2. Boot the RabbitMQ consumers used by the indexer:

   ```elixir
   BuilderxApi.DynamicApp.start_rabbit()
   Rabbit.IndexingConsumer.start_link()
   Rabbit.TaskPoolConsumer.start_link()
   ```

3. Run the index functions:

   - Reindex every product:

     ```elixir
     Elastic.re_setup_product_index()
     ```

   - Delete the old index after a successful reindex:

     ```elixir
     Elastic.confirm_re_setup_product_index()
     ```

## Product cache (ETS in-memory)

Warm the product cache for a single site:

```elixir
# site_id is a UUID, e.g. "16952bde-3812-4373-8e9d-8c7c56857312"
BuilderxApi.Run.ets_cache_product_site(site_id)
```

Warm the variations cache for that site:

```elixir
BuilderxApi.Run.ets_cache_agg_variations_by_site(site_id)
```

## Category cache

Warm the category cache for a single site:

```elixir
BuilderxApi.Run.cache_category_has_many_products(site_id)
```

Remove the category cache for a single site:

```elixir
BuilderxApi.Run.remove_cache_category_by_site(site_id)
```

Warm every site:

```elixir
BuilderxApi.Run.cache_category_all()
```

Remove every site's cache:

```elixir
BuilderxApi.Run.remove_cache_category_all()
```

## Import the latest Vietnamese address data

```elixir
BuilderxApi.Geo.ImportGeo.import_new_vietnam_addresses()
```

## Import the legacy Vietnamese address data

Legacy Vietnamese addresses use three administrative levels: province → district → commune.

Import every level for Vietnam (country code `84`) in one call:

```elixir
BuilderxApi.Geo.ImportGeo.import_country_addresses(84, [is_new: false, delete_old: true])
```

Or run each level individually:

```elixir
BuilderxApi.Geo.ImportGeo.import_vn_provinces()
BuilderxApi.Geo.ImportGeo.import_vn_districts()
BuilderxApi.Geo.ImportGeo.import_vn_commune()
```
