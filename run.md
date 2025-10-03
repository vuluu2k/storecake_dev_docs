# Run

### Accounts

1. Create account In the terminal, run the following command:

```elixir
BuilderxApi.Accounts.create_account %{email: "example@gmail.com"}
```

2. Get account In the terminal, run the following command:

```elixir
BuilderxApi.Run.get_login_link "example@gmail.com"
```

### Index product to elasticsearch

1. Run services from webcms

```bash
cd webcms && make beam
```

2. Run services from handle index

```elixir
BuilderxApi.DynamicApp.start_rabbit
Rabbit.IndexingConsumer.start_link
Rabbit.TaskPoolConsumer.start_link
```

3. Run function index product

* Reindex all product

```elixir
Elastic.re_setup_product_index
```

* Delete old index

```elixir
Elastic.confirm_re_setup_product_index
```

### Run cache product (ets memory cache)

1. Run cache product

```elixir
#site_id -> uuid example: 16952bde-3812-4373-8e9d-8c7c56857312
BuilderxApi.Run.ets_cache_product_site(site_id)
```

2. Run cache variations of product

```elixir
#site-id -> uuid example: 16952bde-3812-4373-8e9d-8c7c56857312
BuilderxApi.Run.ets_cache_agg_variations_by_site(site_id)
```

### Run cache category

1. Run cache by site\_id

```elixir
BuilderxApi.Run.cache_category_has_many_products(site_id)
```

2. Remove cache by site\_id

```elixir
BuilderxApi.Run.remove_cache_category_by_site(site_id)
```

3. Run all cache&#x20;

```elixir
BuilderxApi.Run.cache_category_all
```

4. Remove all cache

```elixir
BuilderxApi.Run.remove_cache_category_all
```

### Run import new address vietnamese

```elixir
BuilderxApi.Geo.ImportGeo.import_new_vietnam_addresses()
```
