---
sidebar_position: 6
title: 05 — Bindings (dữ liệu động)
---

# 05 — Bindings (dữ liệu động)

> **Cho BA:** "Binding" là việc một element trên trang **lấy nội dung từ dữ liệu thật của shop** thay vì chữ gõ tay: tên / giá / ảnh sản phẩm, tên danh mục, tiêu đề bài viết… Khi chủ shop sửa giá sản phẩm, trang tự hiện giá mới **mà không cần publish lại**.
> Có hai cách gắn: **chọn cụ thể** (element luôn hiện sản phẩm A) hoặc **tự động theo ngữ cảnh** (trên trang chi tiết sản phẩm, element hiện sản phẩm mà khách đang xem).
> Backend làm hai việc: (1) cho editor API để **chọn** dữ liệu, (2) lúc render trang, **gom mọi id cần dùng rồi đọc DB một lượt** và điền vào HTML.

Chương này đi theo thứ tự: shape binding trong node → API cho editor → cách render gom refs → cách node đọc dữ liệu ra → Seed xuống client.

---

## 1. Shape binding trong `node.data`

Editor lưu binding trong mảng `bindings` của node. Server **chỉ đọc phần tử đầu tiên**.

```json
{
  "type": "text-dataset",
  "bindings": [
    { "target": { "type": "product", "kind": "title", "id": "7c1e…-uuid" } }
  ],
  "config":   { … },
  "specials": { "text": "Tên sản phẩm" }
}
```

| Trường | Ý nghĩa | Giá trị gặp trong code |
|---|---|---|
| `target.type` | Loại entity | `product`, `category`, `post`, `blog` |
| `target.kind` | Field nào của entity | `title`, `price`, `compare_price`, `description`, `quantity`, `vendor`, `summary`, `content`, `date`, `tag`, `category`, `author`, `name`, `media`… |
| `target.id` | Id entity **nếu chọn cụ thể** | UUID → "explicit". Không phải UUID (rỗng, `"auto"`, …) → "theo ngữ cảnh" |

### 1.1 `Binding.first/1` — lấy binding đầu

`lib/qwik_v2/data/binding.ex:64`

```elixir
def first(data) when is_map(data) do
  list = data["bindings"] || get_in(data, ["config", "bindings"]) || []
  List.first(list) || %{}
end
```

- Đọc `data["bindings"]`, nếu không có thì thử `data["config"]["bindings"]` (shape cũ còn sót).
- Trả `%{}` thay vì `nil` → mọi chỗ gọi `get_in(Binding.first(data), ["target", "type"])` không cần check nil.

### 1.2 `uuid?/1` và `explicit_ref/1` — phân biệt "chọn cụ thể" vs "theo ngữ cảnh"

`lib/qwik_v2/data/binding.ex:51,71-77`

```elixir
@uuid ~r/\A[0-9a-fA-F]{8}-…-[0-9a-fA-F]{12}\z/

def uuid?(id) when is_binary(id), do: Regex.match?(@uuid, id)

def explicit_ref(%{"target" => %{"type" => type, "id" => id}}) when is_binary(type),
  do: if(uuid?(id), do: {type, id}, else: nil)
```

- **Quy ước quan trọng nhất của cả hệ binding:** id là UUID hợp lệ ⇒ binding "explicit", cần đi DB lấy entity đó. Mọi thứ khác ⇒ "context", lấy entity từ ngữ cảnh render.
- `explicit_ref` trả `{type, id}` — đây là đơn vị mà bước gom refs (mục 3) dùng.

### 1.3 `entity/3` — chuỗi ưu tiên khi tìm entity

`lib/qwik_v2/data/binding.ex:79-83, 195-199`

```elixir
def entity(type, id, ctx) do
  if uuid?(id),
    do: get_in(ctx.refs || %{}, [type, id]),
    else: context_entity(type, ctx)
end

defp context_entity("product", ctx),  do: QwikV2.Scope.ProductScope.current()  || ctx.product
defp context_entity("category", ctx), do: QwikV2.Scope.CategoryScope.current() || ctx.category
defp context_entity("post", ctx),     do: QwikV2.Scope.PostScope.current()     || ctx.article
defp context_entity("blog", ctx),     do: ctx.blog
```

Thứ tự ưu tiên:

```
id là UUID?
 ├─ có  → ctx.refs[type][id]                 (đã fetch trước, xem mục 3)
 │         không có trong refs → nil → node render fallback (text gõ tay / rỗng)
 └─ không → Scope hiện tại (item đang lặp trong list-dataset / dataset-block)
             └─ không có scope → entity của trang động
                   product  → ctx.product   (trang /products/:slug)
                   category → ctx.category  (trang /collections/:slug)
                   post     → ctx.article   (trang /blogs/…/:slug)
                   blog     → ctx.blog      (không có scope cho blog)
```

- **Scope** (`lib/qwik_v2/scope.ex`) là một stack trong process dictionary: `Scope.enter(key, value, fun)` đặt giá trị, chạy `fun`, rồi **khôi phục giá trị cũ** trong `after` → lồng nhau vẫn đúng. Server render là một lần đi cây, không truyền props, nên dùng process dict thay cho "props".
- `ctx.product/category/article/blog` được `RenderController` nhét vào struct `%QwikV2{}` bằng `struct(%QwikV2{...}, entity)` (xem [07](./07-render-request.md)).

### 1.4 `value/3` — từ entity ra chuỗi hiển thị

`lib/qwik_v2/data/binding.ex:4-47` khai báo bảng `@specs`: `type → kind → field`.

| type | kind | field đọc | Ghi chú xử lý (`field_value/2`, dòng 105-147) |
|---|---|---|---|
| product | title | `name` | |
| product | vendor | `vendor` | join tên của `suppliers` |
| product | description | `description` | |
| product | price | `retail_price` | lấy variation **đầu tiên**, format tiền theo `ctx.currency` |
| product | compare_price | `original_price` | như trên |
| product | quantity | `remain_quantity` | **tổng** `remain_quantity` mọi variation |
| category | name / title | `name` | |
| category | description | `category_description` | `description`, rỗng thì `multi_description[0].description` |
| post | title | `name` | |
| post | summary / description | `summary` | |
| post | content | `content` | |
| post | date | `post_date` | `render_inserted_at || inserted_at`, format theo `ctx.lang` |
| post | tag | `tag_articles` | join tên |
| post | category | `article_categories` | join `category.name` |
| post | author | `creator` | `first_name last_name` |
| blog | name / title / description | như category | |

Chi tiết đáng nhớ:

- `money/1` (dòng 170-177): `nil`, `""`, `0`, `"0"` đều trả `""` → **giá 0 hiển thị trống**, không phải "0 ₫".
- `get/2` (dòng 201-206) đọc key string trước, không có thì thử atom key (`String.to_existing_atom`). Vì vậy code render dùng được cho cả map string-key (refs sau JSON) lẫn struct/map atom-key (`%Product{}` của trang sản phẩm).
- `resolve/2` (dòng 55-62) trả `{value, init_token}`. `init_token` (dòng 179-193) sinh chuỗi kiểu `"ProductBinding#bind_ProductName"` cho JS; hiện `TextDataset.HTML` bỏ qua phần này (`{value, _init}`).

---

## 2. API bindings cho editor

Editor cần danh sách để người dùng **chọn** entity và cần "hydrate" lại các entity đã chọn khi mở trang.

Route: `lib/builderx_api_web/router/router.ex` trong scope `/api/v1/editor_v2/sites/:site_id/bindings`, pipeline `[:api, :auth, :account, :site, :openapi_spec]`.

| Method | Path | Controller#action | Gọi xuống |
|---|---|---|---|
| GET | `/products` | `ProductController.index` | `Products.get_products_by_site_id` (v1) |
| GET | `/products/by_ids?ids[]=` | `ProductController.by_ids` | `ProductBindings.list_products_by_ids` |
| GET | `/products/:id` | `ProductController.show` | `Products.get_product_by_id` + `PriceContacts.check_price_contact` |
| GET | `/products/by_category/:category_id` | `ProductController.by_category` | `Products.get_products_by_category_id` |
| GET | `/categories` | `CategoryController.index` | `Categories.get_all_category_by_site_id` |
| GET | `/categories/by_ids` | `CategoryController.by_ids` | `CategoryBindings.list_categories_by_ids` |
| GET | `/categories/:id` | `CategoryController.show` | `Categories.get_category_by_id` |
| GET | `/blogs`, `/blogs/by_ids`, `/blogs/:id` | `BlogController` | `BlogCategories.*`, `BlogBindings.list_blogs_by_ids` |
| GET | `/posts`, `/posts/by_ids`, `/posts/:id`, `/posts/by_category/:category_id` | `PostController` | `Articles.*`, `PostBindings.list_posts_by_ids` |

Điểm chung của 4 controller (`lib/builderx_api_web/controllers/v1/editor_v2/bindings/*.ex`):

```elixir
plug OpenApiSpex.Plug.CastAndValidate,
  replace_params: false,
  render_error: BuilderxApiWeb.V1.EditorV2.ValidationError
```

- Query param được validate theo `operation ...` khai báo ngay trên action (spec xem ở `/api/v1/swaggerui`). Sai kiểu → `ValidationError` trả 400.
- `replace_params: false` → action vẫn nhận `params` dạng string-map như Phoenix thường, không phải map đã cast.
- Site lấy từ `conn.assigns.site` (plug `:site` đã kiểm quyền sở hữu) → **mọi query đều lọc `site_id`**.

Một số chi tiết từng controller:

- `ProductController.index` (`product_controller.ex:30-50`): `is_published` là tri-state qua `Params.bool/1` — `true` chỉ SP đang hiện, `false` chỉ SP ẩn, bỏ trống = tất cả. Luôn bật `show_ribbon/categories/rating/brand/suppliers` để editor có đủ dữ liệu vẽ card.
- `ProductController.by_ids` (`:83-89`) nhận thêm `lang` → giá và bản dịch theo ngôn ngữ.
- `CategoryController.index` (`category_controller.ex:34-52`): `tree=true` gọi clause `/2` (trả cây lồng nhau có `total_product_visible`), ngược lại gọi clause `/3` với `:all` (list phẳng). Gắn `show_combo_as_product` từ site vào params.
- `BlogController.show` (`blog_controller.ex:64-71`): `[data] = … |> List.wrap() |> load_tag_categories(...)` — pattern match 1 phần tử; nếu hàm load trả khác 1 phần tử sẽ raise `MatchError` (chưa xác minh có xảy ra thực tế).

---

## 3. Các module `*Bindings` — đọc DB cho render

Thư mục `lib/builderx_api/editor_v2/bindings/`. Mỗi module có cặp hàm:

| Hàm | Trả về | Dùng ở |
|---|---|---|
| `list_*_by_ids(site, ids)` | **list**, giữ đúng thứ tự `ids` | API `by_ids` cho editor |
| `get_*_by_ids(site, ids)` | **map** `%{id => entity}` | `ctx.refs[type]` lúc render |
| `sample_*(site, ids)` | 1 entity | Preview draft trang template |

### 3.1 `ProductBindings` — nặng nhất

`lib/builderx_api/editor_v2/bindings/product_bindings.ex`

```
load_products(site, ids, opts)                              (:59)
 ├─ ① SELECT các cột cần thiết từ products (id in ids, site_id)      (:70-100)
 │     lưu ý: cột product_attributes được alias thành "products_attributes"
 ├─ ② Task.await_many 5 task song song                        (:102-132)
 │     ribbons · rating (mỗi SP 1 task con) · product_category
 │     brand · suppliers       — mỗi task tắt được qua opts show_*
 ├─ ③ SELECT variations chưa xoá, chưa ẩn, sort theo sort_variation_attributes (:134-142)
 ├─ ④ Ghép từng product: variations, ribbons, rating/rating_count,
 │     brand (object), suppliers (object), product_category     (:144-174)
 ├─ ⑤ Sort lại theo thứ tự ids ban đầu                         (:175)
 └─ ⑥ enrich/3                                                 (:179-193)
       ProductMeasurements → PromotionAdvances (coupon) →
       convert_price_to_lang(variations) → load_product_translation (nếu có lang) →
       map_custom_slug → check_price_contact → check_personal_product_design
```

- Tại sao không dùng thẳng `Products.get_products_by_site_id`? Vì hàm v1 là **list có filter/sort/phân trang**; ở đây chỉ cần "đúng các id này", nhưng vẫn phải **giàu dữ liệu như v1** (giá khuyến mãi, bản dịch, liên hệ giá…) để khớp storefront cũ.
- `product_categories/3` (:195-222) join `CategoryTranslation` khi có `lang` để tên danh mục theo ngôn ngữ; gom bằng `jsonb_agg` theo từng product.
- **Không lọc `is_published`** ở bước ①: SP đã ẩn mà vẫn được bind cụ thể thì vẫn render. (Hành vi thực tế, ghi lại để BA biết.)

`sample_product/3` (:43-48): ưu tiên các id page được gán (assignment), không có thì lấy SP **đang bán mới nhất** (`is_published and not removed`, order `inserted_at desc`).

### 3.2 `CategoryBindings`

`lib/builderx_api/editor_v2/bindings/category_bindings.ex`

- `list_categories_by_ids/2` (:14-21): **không sort lại theo ids** (khác Product/Post/Blog). Không sao cho render vì dùng map `get_categories_by_ids`, nhưng API `by_ids` trả thứ tự DB.
- `list_all_collections/1` (:24-38): mọi collection không xoá, không ẩn, sort "default trước → position → mới nhất", **giới hạn 500** (`@all_collections_limit`). Lỗi DB → log + `[]`.
- `list_all_collections_page/3` (:40-63): như trên nhưng có `offset/limit` + đếm tổng, dùng cho phân trang list-dataset loại category.
- `get_products_by_collection_keys(site, %{key => limit})` (:81-88): **mỗi key chạy một `Task.async`**, timeout 30s. `key` là `category_id` hoặc `"all_products"`.
- `get_collection_page/5` (:90-113): gọi `Products.get_products_by_site_id(category_id: key, …)` rồi `normalize_page` để luôn ra `{products, total}` dù hàm v1 trả shape nào.

### 3.3 `PostBindings`

`lib/builderx_api/editor_v2/bindings/post_bindings.ex`

- `list_posts_by_ids/2` (:19-28) → `load_posts/2` (:61-68): preload `article_categories` (kèm category chưa xoá) + `creator`, rồi `project/1` cắt còn `@fields` và `Articles.load_tag_article`.
- `get_post_by_slug/2` (:32-40): dùng cho trang bài viết (`RenderController.render_post_page`).
- `list_posts_page/4` (:86-102): **dùng lại reader v1** `Articles.get_articles_by_site_id` để tôn trọng `sort_type` của blog category; rồi `narrow/1` gom `creator` bằng một query batch (bảng `accounts` là reference table của Citus nên query theo id là đủ).
- `sample_post/2`: id được gán, không có thì bài mới nhất đang hiện (`render_inserted_at <= now`).

### 3.4 `BlogBindings`

`lib/builderx_api/editor_v2/bindings/blog_bindings.ex` — đơn giản nhất: select các cột của `blog_categories` (`name, slug, description, multi_description, image, meta_tags, is_default`). `sample_blog` lấy theo `is_default asc, inserted_at asc` — tức **category không-default được ưu tiên trước** (`false < true`). Chưa xác minh đây là chủ ý.

---

## 4. Gom refs — đọc DB **một lần** cho cả trang

Nếu mỗi node tự query DB thì trang có 30 text-dataset sẽ tốn 30 query. Thay vào đó server **gom tất cả id** trước, fetch theo lô, đặt vào `ctx.refs`, rồi node chỉ tra map.

Shape `ctx.refs` sau khi build:

```elixir
%{
  "product"          => %{uuid => product},            # explicit product bindings
  "category"         => %{uuid => category},           # explicit + custom_collections
  "post"             => %{uuid => post},
  "blog"             => %{uuid => blog},
  "collection"       => %{key => [product, …]},        # list-dataset loại product
  "collection_total" => %{key => integer},
  "post_list"        => %{key => [post, …]},           # list-dataset loại post
  "post_list_total"  => %{key => integer},
  "all_collections"  => [category, …]                  # list-dataset "all_collections"
}
```

### 4.1 Hai nguồn id: published vs draft

```
Trang PUBLISHED  (serve_published_artifact)            Trang DRAFT / preview (serve_draft)
───────────────────────────────────────────            ─────────────────────────────────
Renders.build_refs(conn, p, artifact)   renders.ex:18   Renders.draft_refs(conn, tree)  renders.ex:33
 ├─ artifact["refs"]  ← gom sẵn lúc publish              ├─ quét MỌI node trong tree
 │   (Compile.capture → add_ref, xem ch.06)              │   Binding.explicit_ref(Binding.first(data))
 └─ artifact["dynamic_nodes"]                            │   group_by type
     → list-dataset: collection/post_list/categories     └─ + list-dataset trong mọi node
               │                                                   │
               └──────────────► build_refs_map(conn, ids_by_type) ◄┘   renders.ex:169
```

- **Published** không phải quét lại tree: lúc publish, `Compile.capture/2` (`lib/qwik_v2/compile.ex:39-48`) đã gọi `add_ref(type, id)` cho mỗi node động có explicit binding và lưu vào `source["refs"]`.
- **Draft** không có artifact nên quét toàn bộ `tree["nodes"]`.

> ⚠️ **Khác biệt tiềm ẩn (chưa xác minh bằng test):** `Compile.capture` chỉ lấy binding **của chính node được capture**. Với `dataset-block` / `list-dataset` (capture cả subtree), binding explicit của **node con bên trong** không được `add_ref`. Tương tự, `build_refs` chỉ xét list-dataset nằm ở **cấp capture** (`Map.values(artifact["dynamic_nodes"])`), không xét list-dataset lồng trong `_subtree`. Draft thì quét mọi node nên không bị. Hệ quả có thể: preview hiện dữ liệu nhưng trang published render rỗng cho các node con đó.

### 4.2 `build_refs_map/2` từng dòng

`lib/builderx_api_web/controllers/v1/editor_v2/renders.ex:169-204`

```elixir
%{}
|> put_ref("product",  ids[:product],  &ProductBindings.get_products_by_ids(site, &1, lang: lang))
|> put_ref("category", ids[:category], &CategoryBindings.get_categories_by_ids(site, &1))
|> put_ref("post",     ids[:post],     &PostBindings.get_posts_by_ids(site, &1))
|> put_ref("blog",     ids[:blog],     &BlogBindings.get_blogs_by_ids(site, &1))
|> put_paged_ref("collection", ids[:collection], &CategoryBindings.get_products_by_collection_keys(site, &1, lang: lang))
|> put_paged_ref("post_list",  ids[:post_list],  &PostBindings.get_posts_by_list_keys(site, &1))
|> put_ref("all_collections", ids[:all_collections], fn _ -> CategoryBindings.list_all_collections(site) end)
```

- `put_ref/4` (:193-194): danh sách rỗng / `nil` / `false` / `%{}` ⇒ **bỏ qua, không query**. Trang không có binding nào ⇒ 0 query.
- `put_paged_ref/4` (:196-204): hàm fetch trả `%{key => {items, total}}`; tách thành 2 key `type` và `type <> "_total"` để node vừa có item vừa biết tổng (phục vụ phân trang).
- `all_collections` là **boolean** (`lists_all_collections?`), hàm fetch bỏ qua tham số.
- Các lượt fetch này chạy **tuần tự** giữa các type; song song chỉ xảy ra bên trong `get_products_by_collection_keys` / `get_posts_by_list_keys` / `ProductBindings.load_products`.

### 4.3 List-dataset: key + số lượng

`lib/qwik_v2/nodes/list_dataset/source.ex`

| Hàm | Dòng | Làm gì |
|---|---|---|
| `kind/1` | 7-15 | `bindings[0].target.type`: `category` → `:category`, `post` → `:post`, còn lại → `:product` |
| `collection_key/1` | 17-22 | `config.collectionType == "collection"` → `collectionId` (fallback `"all_products"`) |
| `post_list_key/1` | 24-29 | `collectionType == "custom_posts_list"` → `collectionId` (fallback `"all_posts"`) |
| `quantity/1` | 37-39 | `specials.quantity`, mặc định **4**. Base-only, không theo breakpoint |
| `load_mode/1` | 45-50 | `pagination` / `show_more` / `infinite_scroll`, còn lại `"none"` |
| `paged?/1` | 54-56 | layout ≠ `slide` **và** load_mode ≠ `none` |
| `page_size/1` | 60 | `max(quantity, 1)` |

`Renders.list_quantities/3` (:120-129): nhiều list-dataset dùng **cùng key** ⇒ gộp, lấy **quantity lớn nhất** → fetch một lần, mỗi node tự `Enum.take(count)`.

`picked_collection_ids/1` (:131-145): list-dataset loại category với `collectionListType == "custom_collections"` ⇒ id trong `specials.collectionIds` (hoặc `config.collectionIds`) được **gộp vào ref `"category"`**, lọc chỉ giữ UUID.

`QwikV2.Helpers.Field.get/4` (`lib/qwik_v2/helpers/field.ex:4-9`) — cascade `config → specials → default`, coi `""` như không có. Server **không có cascade theo parent** như SPA.

---

## 5. Node đọc dữ liệu ra như thế nào

| Node | File | Đọc bằng |
|---|---|---|
| `text-dataset` | `nodes/text_dataset/html.ex:16-19` | `Binding.resolve(binding, ctx)` → giá trị rỗng thì fallback `Common.text(data, specials)` (chữ gõ tay) |
| `pricing-dataset` | `nodes/pricing_dataset/html.ex:20-28` | `Binding.bound_entity(data)` + `ProductData.price/compare_price` |
| `quantity-dataset` | `nodes/quantity_dataset/html.ex:19` | `Binding.bound_entity(data)` |
| `product-variants` | `nodes/product_variants/html.ex:17` | `bound_entity` + `ProductData.attributes/variation_image_for` |
| `media-dataset` | `nodes/media_dataset/html.ex:40,55,81` | `bound_entity` cho category / post / product; category dùng `CategoryMedia` |
| `dataset-block` | `nodes/dataset_block/html.ex:37-57` | `bound_entity(data) || XScope.current()` rồi **mở Scope** cho con |
| `list-dataset` | `nodes/list_dataset/html.ex:316-361` (`source/2`, `collections/3`) | đọc thẳng `ctx.refs["collection"/"post_list"/"category"/"all_collections"]`, mỗi item mở Scope |

### 5.1 `bound_entity/2`

`lib/qwik_v2/data/binding.ex:85-94` — lấy `bindings[0].target`, nếu có `type` thì gọi `entity(type, id, ctx)` (mục 1.3). Không có type ⇒ `nil`.

### 5.2 Scope trong list-dataset — vì sao một node con render N lần

`lib/qwik_v2/nodes/list_dataset/html.ex:235-245`

```elixir
defp render_items(items, kind, child_id, child_node) do
  Enum.map_join(items, "", fn entity ->
    with_item(kind, entity, fn ->
      DatasetBlock.HTML.build(child_id, child_node) |> IO.iodata_to_binary()
    end)
  end)
end

defp with_item(:category, entity, fun), do: CategoryScope.with_category(entity, fun)
defp with_item(:post, entity, fun),     do: PostScope.with_post(entity, fun)
defp with_item(_product, entity, fun),  do: ProductScope.with_product(entity, fun)
```

- List-dataset chỉ có **một** node con (thường là `dataset-block`) làm "khuôn".
- Với mỗi entity, mở Scope rồi render khuôn đó. Node con dùng binding **context** (id không phải UUID) ⇒ `context_entity` trả entity của Scope ⇒ mỗi lượt ra dữ liệu khác nhau.
- Hệ quả: nếu node con bị bind **explicit** (UUID) thì mọi item đều hiện cùng một entity — đây là lỗi cấu hình phía editor, không phải bug server.

### 5.3 `ProductData` và `CategoryMedia`

- `ProductData` (`lib/qwik_v2/data/product_data.ex`): các phép đọc "dạng tập hợp" — `images/1` (gộp ảnh mọi variation, bỏ trùng, fallback `image`), `attributes/1` (đọc `products_attributes` **hoặc** `product_attributes` — vì refs alias tên cột còn `ctx.product` là `%Product{}` giữ tên gốc, xem comment :22-23), `price/1`, `compare_price/1`, `remain_quantity/1`, `variation_image_for/3`.
- `CategoryMedia` (`lib/qwik_v2/data/category_media.ex`): ảnh bìa collection theo breakpoint. `cover_src/3` lấy `breakpoint_images.desktop` (hoặc legacy `bp1`) → `image` → placeholder. `picture/5` sinh `<picture>` với `<source>` cho mobile ≤360px / tablet ≤768px / laptop ≤1440px nếu breakpoint đó có ảnh riêng.

> Lưu ý: `ctx.product` trên trang chi tiết SP lấy từ `Products.get_product_by_site_id_slug` (v1) — **không** đi qua `ProductBindings.enrich`. Còn product trong `ctx.refs` thì đã enrich (khuyến mãi coupon, đổi giá theo lang, price contact…). Hai nguồn có thể lệch nhau về giá hiển thị trong một số cấu hình (chưa xác minh case cụ thể).

---

## 6. Preview draft: `sample_*`

`RenderController.preview_entity/2` (`lib/builderx_api_web/controllers/v1/editor_v2/render_controller.ex:136-157`)

```
page.type == product → ProductBindings.sample_product(site, target_ids(page, product))
page.type == post    → PostBindings.sample_post(site, target_ids(page, post))
page.type == blog    → BlogBindings.sample_blog(site, target_ids(page, blog))
còn lại              → []   (trang thường / category KHÔNG có sample)
```

- Template trang sản phẩm chưa có URL thật ⇒ "mượn" một SP để binding context có dữ liệu thay vì render rỗng.
- `target_ids/2` (:159-164) đọc assignment của page (`PageAssignments.get/1`), chỉ lấy khi `target_type` khớp. Chi tiết assignment: [04](./04-page-assignment.md).
- **Trang category template không có sample** ⇒ preview template collection sẽ rỗng phần bind theo ngữ cảnh.

---

## 7. Seed — dữ liệu cho JS phía client

Một số node cần tương tác sau khi trang tải (đổi variant → đổi giá, đổi ảnh, kiểm tồn kho). Thay vì JS gọi API lại, server **nhúng sẵn** dữ liệu tối thiểu vào HTML.

### 7.1 Vòng đời trong server

`lib/qwik_v2/data/seed.ex`

```
QwikV2.build / Compile.assemble / render_list_dataset_page
 └─ Seed.reset()                                      :12-15
     ├─ pool = %{}
     └─ put("product", ctx.product)   ← trang SP luôn có seed của SP chính
Node render (pricing / quantity / product-variants / media-dataset)
 └─ Seed.put("product", product)                      :17-30
     ├─ không có id string → bỏ qua
     ├─ đã có trong pool → bỏ qua (không project lại)
     └─ ProductSeed.project(product) → pool["product"][id]
RenderController
 └─ render_doc(..., seed: Seed.data())
render_v2.html.eex:20
 └─ <script type="x/seed">{"product":{"<id>":{…}}}</script>
```

- Pool nằm trong **process dictionary** → mỗi request riêng biệt, không rò giữa request.
- `@projectors` hiện chỉ có `"product"` ⇒ `put("category", …)` sẽ lưu `nil` (project trả nil). Hiện không có node nào gọi với type khác.

### 7.2 `ProductSeed.project/1` — cắt gọn product

`lib/qwik_v2/data/product_seed.ex` — chỉ giữ `id, slug, image` và mỗi variation: `id, fields[{name,value}], retail_price, retail_price_text, original_price, original_price_text, remain_quantity, images`. Giá đã được **format sẵn bằng server** (`Binding.money`) để JS không phải biết định dạng tiền tệ.

### 7.3 Phía client

- `assets/render_v2/core/loader.js:18-20` đọc `script[type="x/seed"]` vào `window.xSeed`.
- Node emit `x:props='{"ref":{"type":"product","id":"…"}}'` qua `Common.x_ref/2` (`lib/qwik_v2/common.ex:31-38`).
- `assets/render_v2/stores/seed.js` `seedFromProps(props)` tra `window.xSeed[ref.type][ref.id]` và `store.seed(entity)` vào product store.
- Trang list-dataset tải thêm (`POST /list_dataset_page`) trả kèm `seed` mới; `nodes/list-dataset.js:133` gọi `window.WK2.seed(data.seed)` để merge.

Chi tiết runtime JS: [10](./10-render-v2-js.md).

---

## 8. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Element bind hiện chữ mẫu thay vì dữ liệu thật | `target.id` có đúng UUID không (`Binding.uuid?`)? Với explicit: id có trong `ctx.refs[type]` không (SP đã xoá / khác site)? Với context: trang có entity không (trang thường không có `ctx.product`) |
| Preview có dữ liệu, trang published rỗng | Node bind nằm **bên trong** dataset-block/list-dataset với id explicit → không vào `artifact["refs"]` (mục 4.1). Hoặc chưa publish lại sau khi đổi binding |
| Giá hiện trống | `Binding.money` trả `""` cho 0/nil; variation đầu tiên không có `retail_price` |
| Giá sai tiền tệ | `Renders.currency/1` ← `Tools.get_currency_by_lang(site, lang)`; lỗi thì fallback `"VND"` |
| List-dataset hiện ít item hơn cấu hình | `specials.quantity` (mặc định 4); `collectionId` sai → rơi về `all_products`; collection có SP ẩn |
| Mọi item trong list-dataset giống nhau | Node con bind explicit UUID thay vì context |
| "All collections" thiếu collection | Giới hạn 500 (`@all_collections_limit`); collection `is_hidden` bị loại |
| Chọn variant không đổi giá/ảnh | Không có `<script type="x/seed">` hoặc thiếu `x:props` ref; kiểm `Seed.put` có được gọi trong node đó |
| Editor gọi `/bindings/...` bị 400 | Query sai spec OpenAPI — xem `/api/v1/swaggerui`, `ValidationError` |
| Preview template collection rỗng | Chưa có `sample_*` cho category (mục 6) |
