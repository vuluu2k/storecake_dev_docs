# 07 — Luồng render một request

> **Cho BA:** Khi khách mở một trang của shop dùng Editor V2, server **không dựng lại trang từ đầu**. Lúc chủ shop bấm *Publish*, phần "tĩnh" của trang (chữ, ảnh, khung bố cục) đã được dựng sẵn thành HTML và cất vào DB. Mỗi lượt xem, server chỉ lấy khung đó ra và **điền phần "động"** (giá, tên sản phẩm, danh sách sản phẩm, bài viết…) bằng dữ liệu mới nhất. Vì vậy: sửa giá sản phẩm → khách thấy ngay; sửa chữ trong editor → phải **Publish** lại khách mới thấy. Nút *Preview* trong editor thì khác: nó dựng toàn bộ bản nháp (draft) mỗi lần bấm.

Chương này đi từ lúc trình duyệt gõ `https://shop.vn/abc` tới lúc HTML được trả về. Chi tiết publish (tạo "khung") ở [06](./06-publish.md), cách chọn template cho trang sản phẩm/danh mục ở [04](./04-page-assignment.md), cách lấy dữ liệu sản phẩm ở [05](./05-bindings.md), cách từng node sinh HTML ở [08](./08-qwik-html.md), CSS ở [09](./09-qwik-css.md), JS phía trình duyệt ở [10](./10-render-v2-js.md).

---

## 1. Bức tranh toàn cảnh

```
Trình duyệt  GET https://shop.vn/<path>
  │
  ▼
Router (host-based)  scope "/:site_id"  pipe [:end_user, :customer]
  │   get "/"        → PageController.render_page
  │   get "/blog"    → PageController.render_blog_page
  │   get "/*path"   → PageController.new_render_page   (chuỗi fallback v1)
  ▼
V1 PageController (lib/builderx_api_web/controllers/v1/pages/page_controller.ex)
  │   render_xxx_page: if v2_site?(site) → throw {:render_editor_v2, conn, params}
  │   catch {:render_editor_v2, …} → EditorV2Render.render_xxx_page(conn, params)
  ▼
EditorV2.RenderController (lib/builderx_api_web/controllers/v1/editor_v2/render_controller.ex)
  │   ① tìm PublishedPage phù hợp (theo slug / home / assignment)
  │   ② serve_published
  │        ├─ draft_in_dev? = true  → serve_draft      (chỉ dev)
  │        └─ ngược lại            → serve_published_artifact
  ▼
serve_published_artifact
  │   ③ SkeletonCache.get_or_load  (Redis "qv2:skeleton:<site>:<page>")
  │   ④ build_refs  → query sản phẩm/danh mục/bài viết cần cho node động
  │   ⑤ Compile.assemble(skeleton, ctx)  → điền slot động
  │   ⑥ render_doc → template render_v2.html.eex
  ▼
HTML 200  (head: preload hero + font + css bundle | body: html + seed + scripts)
  │
  ▼
Trình duyệt tải Loader.js (render_v2) → hydrate các "island" JS   (xem chương 10)
```

---

## 2. Cửa vào: V1 PageController chuyển hướng sang V2

Router public của storefront vẫn là của v1 (`lib/builderx_api_web/router/router.ex`, scope `"/:site_id"` với `pipe_through [:end_user, :customer]`). Không có route riêng cho v2 — v2 "cắm" vào **đầu** các hàm render của v1.

```elixir
# page_controller.ex:766
defp v2_site?(%{version: v}), do: v in [2, "2"]
defp v2_site?(_), do: false

# page_controller.ex:769
def render_page(conn, params) do
  if v2_site?(conn.assigns[:site]), do: throw({:render_editor_v2, conn, params})
  ...
```

- `site.version` là cột trong `sites` (`lib/builderx_api/sites/site.ex:25-26`): `1` = editor v1 (mặc định), `2` = editor v2.
- Dùng `throw` thay vì `if/else` để **không phải bọc lại** hàm v1 dài hàng trăm dòng; `catch` ở cuối mỗi hàm bắt lại và gọi sang v2:

| Hàm v1 (dòng throw) | catch gọi sang |
|---|---|
| `render_page` (`:770`) | `EditorV2Render.render_page` (`:1308`) |
| `render_product_page` (`:1430`) | `EditorV2Render.render_product_page` (`:3007`) |
| `render_category_page` (`:3024`) | `EditorV2Render.render_category_page` (`:3394`) |
| `render_blog_page` (`:5067`) | `EditorV2Render.render_blog_page` (`:5444`) |
| `render_post_page` (`:5448`) | `EditorV2Render.render_post_page` (`:5876`) |

Với URL `/*path`, v1 chạy **chuỗi thử lần lượt** `new_render_page/3` (`page_controller.ex:232-565`): `:product → :product_combo → :category → :article → :search → :reset_password → :page → :article_category → :order → :short_link`. Mỗi bước gọi hàm render tương ứng với `"handle_error" => true`; nếu hàm trả `{:error, :not_found}` thì thử bước kế. Vì các trang động của v2 (`serve_dynamic`, xem §3.2) trả đúng `{:error, :not_found}` khi không có template, chuỗi fallback v1 vẫn chạy tiếp được. Chi tiết chọn template ở [04](./04-page-assignment.md).

> ⚠️ **Bất thường (chưa xác minh bằng test):**
> - `render_page` v2 đọc `params["path"]` **thô** (`render_controller.ex:26`), không dùng `params["page_slug"]` mà bước `:page` của v1 đã tính (`page_controller.ex:462-488`, đã bỏ tiền tố ngôn ngữ và custom page slug). Với URL có tiền tố ngôn ngữ (vd `/en/about`) slug tra DB sẽ là `"en/about"`.
> - `render_page` v2 không bao giờ trả `{:error, :not_found}` — không có page thì `serve_404` luôn (`:177`). Hệ quả: với site v2, bước `:page` là **điểm dừng**, các bước sau (`:article_category`, `:order`, `:short_link`) không bao giờ được thử.
> - Lệnh `throw` chạy **trước** đoạn v1 `assign(:lang, …)` (vd `page_controller.ex:1254`), nên trong v2 `conn.assigns[:lang]` thường là `nil` → ctx dùng `"en"`, `<html lang="en">`, tiền tệ lấy theo `"en"`. `params["lang"]` có sẵn nhưng các hàm render v2 (trừ `list_dataset_page`) không đọc.

---

## 3. `RenderController` — chọn trang đã publish

File: `lib/builderx_api_web/controllers/v1/editor_v2/render_controller.ex`

Mọi hàm public đều mở đầu bằng `assign_render_context(conn)` (`renders.ex:14-16`): parse `site.settings` (JSON string) thành map, gán vào `conn.assigns.site_settings` — sau này dùng để sinh thẻ font (§6.2).

### 3.1 Trang tĩnh — `render_page/2` (`:23-32`)

```elixir
slug = params["path"] |> List.wrap() |> Enum.reject(&(&1 in [nil, ""])) |> Enum.join("/")
page = if slug == "", do: Published.get_home(site_id), else: Published.get_by_slug(site_id, slug)
serve_published(conn, page)
```

| Dòng | Ý nghĩa |
|---|---|
| `:26` | `path` là list segment (`["gioi-thieu"]`) → ghép `"gioi-thieu"`. `List.wrap` để chịu cả `nil` (route `/`). |
| `:29` | Rỗng → trang chủ: `Published.get_home` lấy bản có `is_homepage = true`, **không có thì lấy bản publish sớm nhất** (`published.ex:109-117`). Có slug → `get_by_slug` (`published.ex:102-107`, `limit(1)`). |
| `:31` | Không tìm thấy (`nil`) → khớp clause `serve_published(conn, _, _)` → 404 (`:177`). |

### 3.2 Trang động — product / category / post / blog

Cùng một khuôn: **tìm entity theo slug → tìm template được gán → `serve_dynamic`**.

```
render_product_page (:47-61)
  Products.get_product_by_site_id_slug(site, slug)
    ├─ {:ok, product}
    │    category_ids = PageAssignments.category_ids_of_product(site_id, product.id)
    │    Published.get_assigned(site_id, @product, product.id, category_ids)
    │    |> serve_dynamic(conn, product: product)
    └─ _ → serve_404

render_category_page (:63-75)   Categories.get_category_by_site_id_slug
                                 get_assigned(@collection, category.id, [category.id])
render_post_page     (:77-89)   PostBindings.get_post_by_slug → get_assigned(@post, article.id)
render_blog_page     (:93-113)  3 clause:
                                 • không có key "slug"  → render_page(path=["blog"])  (trang danh sách blog)
                                 • slug nil/""          → render_page(path=["blog"])
                                 • có slug              → BlogCategories.get_category_by_slug → get_assigned(@blog, …)
```

- `Published.get_assigned` (`published.ex:131-139`): tra bảng assignment (custom → category → all), không khớp thì rơi về **template mặc định** của loại trang (`is_default = true`, rồi bản publish sớm nhất cùng `type`). Xem [04](./04-page-assignment.md).
- `serve_dynamic` (`:116-117`) — điểm khác biệt quan trọng với trang tĩnh:

```elixir
defp serve_dynamic(%PublishedPage{} = page, conn, entity), do: serve_published(conn, page, entity)
defp serve_dynamic(_page, _conn, _entity), do: {:error, :not_found}
```

Không có template → trả tuple `{:error, :not_found}` (không phải 404) để chuỗi fallback v1 (§2) thử bước kế. `entity` là keyword list (`[product: product]`) — sau này được `struct/2` đổ thẳng vào field `product`/`category`/`article`/`blog` của `%QwikV2{}`.

### 3.3 `serve_published/3` — rẽ nhánh draft hay artifact (`:166-177`)

```elixir
defp serve_published(conn, %PublishedPage{} = p, entity) do
  with true <- draft_in_dev?(),
    %Page{} = page <- Pages.get_page(p.site_id, p.page_id) do
    serve_draft(conn, page, p.site_id, entity)
  else
    _ -> serve_published_artifact(conn, p, entity)
  end
end
```

- `draft_in_dev?/0` (`:235`) đọc `config :builderx_api, :render_v2_draft_in_dev` — chỉ bật trong `config/dev.exs:145`. Dev sửa editor → reload storefront thấy ngay, khỏi publish.
- Lưu ý: kể cả ở dev, trang vẫn **phải có bản `PublishedPage`** thì mới tới được đây (bước tìm trang ở §3.1/3.2 tra bảng published). Trang chưa publish lần nào → vẫn 404.

---

## 4. `serve_published_artifact/3` — đường chính trên production

File: `render_controller.ex:179-202`

```elixir
artifact =
  QwikV2.SkeletonCache.get_or_load(p.site_id, p.page_id, fn ->
    BuilderxApi.EditorV2.Doc.decode(p.source)
  end)

ctx =
  struct(
    %QwikV2{lang: conn.assigns[:lang] || "en", currency: currency(conn), refs: build_refs(conn, p, artifact)},
    entity
  )
html = QwikV2.Compile.assemble(artifact, ctx)

render_doc(conn,
  title: PublishedPage.name(p),
  site_id: p.site_id, page_id: p.page_id,
  body: html,
  css: p.app_css || "",
  scripts: artifact["scripts"] || artifact[:scripts] || "",
  seed: QwikV2.Data.Seed.data()
)
```

### 4.1 Artifact là gì

`published_pages.source` (kiểu `CompressedText`, nén khi ghi) chứa JSON do `PublishedPage.build_source/1` tạo (`published_page.ex:47-57`):

```json
{
  "name": "Trang chủ",
  "schema_version": 1,
  "root_node_id": "ROOT",
  "skeleton": ["<div class=\"main\" …>…", {"slot": "node-abc"}, "…</div>", …],
  "dynamic_nodes": { "node-abc": { …node JSON đầy đủ… } },
  "refs": { "product": ["<uuid>"], "category": [ … ] },
  "scripts": "<script type=\"x/json\">…</script><script>window.xbase=…</script>…"
}
```

- `skeleton`: danh sách **xen kẽ** chuỗi HTML đã dựng sẵn và ô trống `{"slot": id}`.
- `dynamic_nodes`: node nào cần dữ liệu lúc request (dataset, list-dataset…) thì node JSON được giữ lại nguyên để dựng lúc request.
- `refs`: id entity được bind cứng (UUID) trong các node động — để biết cần query gì.
- `scripts`: thẻ `<script>` đã tính **lúc publish** (xem §6.3) — nghĩa là phiên bản JS runtime bị "đóng băng" theo lần publish.

Cách sinh ra artifact: [06](./06-publish.md) và [08 §5](./08-qwik-html.md).

### 4.2 `SkeletonCache` — cache Redis

File: `lib/qwik_v2/skeleton_cache.ex`

| Dòng | Hành vi |
|---|---|
| `:4` | TTL `86_400` giây (1 ngày). |
| `:6` | Key `"qv2:skeleton:#{site_id}:#{page_id}"`. |
| `:8-16` | `Redis.get` → có chuỗi JSON thì `decode`; `decode` trả `nil` (JSON hỏng hoặc thiếu key `"skeleton"`) thì `reload`. Redis lỗi/miss → `reload`. |
| `:25-29` | `reload`: gọi `loader` (= `Doc.decode(p.source)`), ghi lại Redis, rồi `normalize` = encode→decode JSON để **mọi key thành string** — giống hệt bản đọc từ Redis, nhờ vậy code phía sau chỉ cần xử lý key string. |
| `:23` | `invalidate/2` được `Published.publish_page` gọi sau khi ghi DB (`published.ex:83`). |

> ⚠️ **Lưu ý hiệu năng / độ bền (quan sát từ code):**
> - Row `PublishedPage` đã được Ecto load kèm cột `source` (giải nén) **trước** khi chạm cache, và `PublishedPage.name(p)` (`published_page.ex:59`) lại `Doc.decode` toàn bộ source lần nữa chỉ để lấy `name`. Cache Redis vì thế tiết kiệm rất ít so với tên gọi của nó.
> - Nếu `source` hỏng → `Doc.decode` trả `%{}` → được ghi vào Redis → `Compile.assemble/2` không khớp clause nào (cần key `"skeleton"`) → **crash 500** (`FunctionClauseError`). Lần sau `decode` thấy thiếu `"skeleton"` nên reload lại, vẫn crash.

### 4.3 `build_refs` — query dữ liệu cho node động

File: `lib/builderx_api_web/controllers/v1/editor_v2/renders.ex:18-31`, `:169-204`

```
build_refs(conn, p, artifact)
  refs          = artifact["refs"]              (id cứng thu lúc compile)
  dynamic_nodes = values(artifact["dynamic_nodes"])
  build_refs_map(conn,
    product:        refs.product
    category:       refs.category ++ picked_collection_ids(dynamic_nodes)   ← list-dataset "custom_collections"
    post, blog:     refs.post, refs.blog
    collection:     collection_quantities(dynamic_nodes)   %{collection_key => qty lớn nhất}
    post_list:      post_list_quantities(dynamic_nodes)    %{post_list_key  => qty lớn nhất}
    all_collections: lists_all_collections?(dynamic_nodes) true/false
  )
```

`build_refs_map` (`:169-191`) gọi đúng một hàm Bindings cho mỗi loại, **bỏ qua loại rỗng** (`put_ref` `:193-194` khớp `nil/false/[]/%{}`):

| Key trong `ctx.refs` | Hàm gọi | Dạng dữ liệu |
|---|---|---|
| `"product"` | `ProductBindings.get_products_by_ids(site, ids, lang:)` | map `id → product` |
| `"category"` | `CategoryBindings.get_categories_by_ids` | map `id → category` |
| `"post"` / `"blog"` | `PostBindings.get_posts_by_ids` / `BlogBindings.get_blogs_by_ids` | map |
| `"collection"` + `"collection_total"` | `CategoryBindings.get_products_by_collection_keys(site, quantities, lang:)` | `put_paged_ref` (`:198-204`) tách `{items, total}` thành 2 map |
| `"post_list"` + `"post_list_total"` | `PostBindings.get_posts_by_list_keys` | như trên |
| `"all_collections"` | `CategoryBindings.list_all_collections(site)` | list |

- `list_quantities` (`:120-129`) gộp các list-dataset cùng nguồn, lấy **số lượng lớn nhất** — hai list cùng "All products" (4 và 8 item) chỉ tốn một query 8 item.
- Mọi request đều chạy các query này (không cache ở tầng này). Chi tiết từng hàm: [05](./05-bindings.md).

### 4.4 `ctx` — `%QwikV2{}`

`struct(%QwikV2{lang:, currency:, refs:}, entity)` — `entity` (vd `[product: p]`) đổ vào field cùng tên. Các field còn lại giữ mặc định (`lib/qwik_v2/qwik_v2.ex:6-19`): `nodes: %{}`, `root_id: "ROOT"`, `style_data: %{}`, `preview: false`. Ở chế độ artifact **không cần** `nodes` toàn trang vì phần tĩnh đã có sẵn trong skeleton; node động tự mang subtree của nó (xem [08 §5](./08-qwik-html.md)).

`currency/1` (`renders.ex:206-212`): `Tools.get_currency_by_lang(site, lang)`, lỗi/thiếu → `"VND"`.

### 4.5 `Compile.assemble` — điền slot

File: `lib/qwik_v2/compile.ex:98-123`

```elixir
def assemble(skeleton, nodes, %QwikV2{} = ctx) when is_list(skeleton) and is_map(nodes) do
  QwikV2.with_ctx(ctx, fn ->
    QwikV2.Data.Seed.reset()
    QwikV2.WebImage.reset()
    skeleton
    |> Enum.map(fn
      bin when is_binary(bin) -> bin
      %{"slot" => id} -> fill(nodes, id)
    end)
    |> IO.iodata_to_binary()
  end)
end

defp fill(nodes, id) do
  case Map.get(nodes, id) do
    nil -> ""
    node -> Registry.html_mod(get_in(node, ["data", "type"])).build(id, node)
  end
end
```

| Bước | Giải thích |
|---|---|
| `with_ctx` | Đặt ctx vào process dictionary (xem [08 §1](./08-qwik-html.md)); mọi module node đọc `QwikV2.ctx()`. |
| `Seed.reset()` | Xóa pool seed và **seed luôn `ctx.product`** (trang sản phẩm) — JS island cần dữ liệu product kể cả khi không node nào gọi `Seed.put`. |
| `WebImage.reset()` | Đếm ảnh về 0, xóa hero đã nhớ. |
| map skeleton | Chuỗi giữ nguyên; `{"slot" => id}` → dựng node động **ngay bây giờ** với dữ liệu thật (lúc này `Compile.active?()` = false nên node render thật thay vì capture). |
| `fill` nil | Slot không có node → chuỗi rỗng. |

> ⚠️ `fill` gọi thẳng `Registry.html_mod(type).build` — nếu `type` không có trong `@html` của Registry thì là `nil.build(...)` → **crash**. Trên thực tế chỉ các type có `Compile.capture*` mới vào `dynamic_nodes` (đều có trong Registry), nên hiện chưa xảy ra.

---

## 5. `serve_draft/4` — Preview và dev

File: `render_controller.ex:204-233`

```elixir
tree = Doc.decode(Pages.composed_source(page))
ctx = struct(%QwikV2{
        nodes: tree["nodes"], root_id: tree["root_node_id"],
        style_data: selected_style_data(site_id),
        page: page, site: site_id, currency: currency(conn),
        refs: draft_refs(conn, tree), preview: true}, entity)
{body, css} = QwikV2.build(ctx)
render_doc(conn, …, body: body, css: "<style>#{css}</style>",
           scripts: QwikV2.Scripts.tags(tree["nodes"] || %{}), seed: QwikV2.Data.Seed.data())
```

| Khác với artifact | Chi tiết |
|---|---|
| Nguồn | `Pages.composed_source(page)` — bản nháp **đã ghép** global section/global node (xem [03](./03-global-sections-nodes.md)). |
| Dựng | `QwikV2.build/2` dựng **toàn bộ** cây HTML + CSS mỗi request. |
| Refs | `draft_refs/2` (`renders.ex:33-51`) quét **mọi** node lấy binding UUID (`Binding.explicit_ref(Binding.first(data))`), không chỉ node động. |
| CSS | Nhúng inline `<style>` (không upload bundle). |
| Scripts | `Scripts.tags` tính tại chỗ theo phiên bản runtime hiện tại. |
| Style global | `selected_style_data(site_id)` (`renders.ex:214-219`) — bộ style global đang chọn. |
| `lang` | Không set → mặc định `"en"` của struct. |

### 5.1 `preview/2` (`:125-132`) — endpoint cho editor

Route: `GET /api/v1/editor_v2/sites/:site_id/pages/:id/preview` (router `:409`), nằm trong `pipe_through [:api, :auth, :account]` + `:site` → **cần JWT** và quyền trên site.

```
preview(conn, %{"site_id", "id"})
  Pages.get_page(site_id, page_id)
    ├─ %Page{} → serve_draft(conn, page, site_id, preview_entity(conn, page))
    └─ _       → serve_404
```

`preview_entity/2` (`:136-157`): trang template **chưa có entity thật** → mượn một mẫu để binding "auto" có dữ liệu:

| `page.type` | Mẫu lấy từ | Ưu tiên |
|---|---|---|
| product | `ProductBindings.sample_product(site, ids)` | SP đã gán cho page (`target_ids(page, @product)`) |
| post | `PostBindings.sample_post` | bài đã gán |
| blog | `BlogBindings.sample_blog` | blog đã gán |
| khác | `[]` | — |

`target_ids/2` (`:159-164`) đọc `PageAssignments.get(page)`; chỉ lấy `target_ids` khi `target_type` khớp.

---

## 6. `render_doc/2` và template `render_v2.html.eex`

### 6.1 `render_doc` (`renders.ex:221-233`)

```elixir
fonts_head = SiteSettings.fonts_head(conn.assigns[:site_settings] || %{})
assigns = assigns
  |> Keyword.put_new(:fonts_head, fonts_head)
  |> Keyword.put_new(:preload, QwikV2.WebImage.hero_preload())
conn |> put_layout(false) |> put_view(BuilderxApiWeb.V1.PageView) |> render("render_v2.html", assigns)
```

- `hero_preload/0` đọc key `:qwik_v2_hero` trong process dictionary — được ghi khi ảnh **đầu tiên** đi qua `WebImage.img_attrs_for` trong lúc dựng (chi tiết [08 §7](./08-qwik-html.md)). Vì đọc **sau** `assemble`/`build`, giá trị còn trong process.
- `put_layout(false)`: không dùng layout chung của v1 — v2 có template HTML riêng hoàn toàn.
- Phoenix `render/3` gộp `conn.assigns` vào assigns → template đọc được `assigns[:lang]` nếu conn có.

> ⚠️ Ở chế độ artifact, ảnh tĩnh đã được dựng **lúc publish** (không qua `img_attrs_for` ở request). Nên `hero_preload` chỉ phản ánh **ảnh động đầu tiên** (vd ảnh sản phẩm trong list-dataset), không phải ảnh hero thật đầu trang; và ảnh động đó được gắn `fetchpriority="high"` vì bộ đếm reset về 0 trong `assemble`. Chưa xác minh tác động thực tế.

### 6.2 `SiteSettings.fonts_head/1` (`lib/builderx_api/editor_v2/site_settings.ex:26-47`)

```
font = settings["fontGeneral"] (chuỗi khác rỗng) || "Inter"
[ preconnect fonts.googleapis.com,
  preconnect fonts.gstatic.com (crossorigin),
  google_fonts_link(font)          ← chỉ khi font nằm trong Qwik.GoogleFonts.fonts()
                                     href = css?family=<Font+Name>:300,400,500,600,700&display=swap
  <style>body{font-family:'<font>',sans-serif}</style> ]
|> bỏ phần rỗng |> join "\n"
```

Font không thuộc danh sách Google Fonts → chỉ có `<style>` gán family, không tải file font.

### 6.3 Template — từng dòng

File: `lib/builderx_api_web/templates/v1/page/render_v2.html.eex`

| Dòng | Nội dung | Ý nghĩa |
|---|---|---|
| `2` | `<html lang=… x:id="<site_id>" x:page="<page_id>">` | JS runtime đọc `x:id`/`x:page` để gọi API (vd `assets/render_v2/api/client.js` `siteId()`/`pageId()`). |
| `4-6` | meta charset, viewport | `viewport-fit=cover` cho tai thỏ iOS. |
| `7` | `<title>` | `PublishedPage.name(p)` hoặc `page.name`. |
| `8` | `raw(preload)` | `<link rel="preload" as="image" …>` của hero (§6.1). |
| `9` | `raw(fonts_head)` | §6.2. |
| `10-12` | `meta_tags` | **Chưa nối**: `render_doc` không truyền `:meta_tags` → không có meta SEO (description, og:…). |
| `13-15` | `runtime_css` | **Chưa nối**: không nơi nào truyền `:runtime_css`. |
| `16` | `raw(css)` | Artifact: `p.app_css` — thẻ `<link>` tới bundle CSS đã upload, hoặc `<style>` inline nếu upload lỗi lúc publish (`published.ex:87-94`). Draft: `<style>` inline. |
| `19` | `raw(body)` | HTML trang. |
| `20` | `QwikV2.Data.Seed.tag(seed)` | `<script type="x/seed">{json}</script>` — dữ liệu product đã "chiếu" (`ProductSeed.project`) cho island JS; pool rỗng → `""`. |
| `21` | `raw(scripts)` | Output `QwikV2.Scripts.tags/1` — xem dưới. |

**`QwikV2.Scripts.tags/1`** (`lib/qwik_v2/scripts.ex`):

```
xdata      = XData.tag(nodes)               <script type="x/json">{id: data}</script> hoặc ""
dom_events = Events.used_dom_events(nodes)  vd ["click","mouseenter"]
dev        = config :qwik_v2_vite_dev

nếu không có xdata, không dom event, không node nào mark_runtime, và không dev → ""  (trang thuần tĩnh, 0 JS)
ngược lại:
  base   = Runtime.base_path()                 ← URL gốc asset JS (xem chương 10)
  loader = dev ? "core/loader.js" : "Loader.js"
  <script type="x/json">…</script>
  <script>window.xbase="<base>";window.xevents=["click",…]</script>
  [dev] <script type="module" src="<base>@vite/client"></script>
  <script type="module" src="<base><loader>"></script>
  [dev] <script>window.xhmr="/wk2/hmr"</script><script type="module" src="<base>dev/hmr.js"></script>
```

- Nhánh "0 JS" hiện gần như không bao giờ xảy ra: node `root` luôn gắn `x:now="Global"` (`nodes/root_canvas/html.ex:7`) → `Compile.mark_runtime()` → luôn cần runtime.
- Ở artifact, `scripts` tính lúc publish → `base` (phiên bản JS) cố định tới lần publish sau. Cột `published_pages.js_version` lưu phiên bản đó.

---

## 7. Phân trang list-dataset — `POST /view/list_dataset_page`

Khi list-dataset bật `loadMode` (`pagination` / `show_more` / `infinite_scroll`), trang đầu được SSR; các trang sau tải bằng AJAX.

Route: `router.ex:947`, trong scope `"/view"` sau `pipe_through [:api]` → **public, không auth**.

```
Trình duyệt (assets/render_v2/nodes/list-dataset.js:113-146  fetchPage)
  │ POST /view/list_dataset_page  {site_id, page_id, node_id: $el.id, page, lang: <html lang>}
  │      (assets/render_v2/api/dataset.js)
  ▼
RenderController.list_dataset_page (:34-45)
  │ page = Cast.to_int(params["page"], 1)
  │ Sites.get_site_by_id(site_id)
  │ Published.get_by_page(site_id, page_id)        ← luôn bản PUBLISHED, kể cả đang xem preview
  │ render_list_dataset_page(site, published, node_id, page, lang:)
  ▼
Renders.render_list_dataset_page (renders.ex:53-78)
  │ artifact = SkeletonCache.get_or_load(...)
  │ node = artifact.dynamic_nodes[node_id]  phải có data.type == "list-dataset"
  │ Source.paged?(data)                     phải true (layout != "slide" và loadMode hợp lệ)
  │ page  = max(page, 1); limit = Source.page_size(data)   (= specials.quantity, mặc định 4)
  │ {entities, total} = fetch_dataset_page(site, data, page, limit, lang)
  │     :post     → PostBindings.list_posts_page(site, post_list_key, page, limit)
  │     :category → collection_list_page
  │                   "custom_collections" → {[], số id đã chọn}     ⚠️ xem dưới
  │                   khác                  → CategoryBindings.list_all_collections_page
  │     :product  → CategoryBindings.get_collection_page(site, collection_key, page, limit, lang:)
  │ ctx = %QwikV2{lang: lang || "en", currency: site_currency(site, lang)}
  │ html = with_ctx(ctx) { Seed.reset; WebImage.reset; ListDatasetHTML.page_items(node, entities) }
  ▼
{:success, :with_data, %{html, total, page, limit, seed}}   → JSON {success: true, data: …}
  ▼
Trình duyệt: WK2.seed(data.seed) → thay/append HTML vào .wk-list-dataset__grid
            → cập nhật page/total → WK2.mount(grid) (hydrate island trong item mới)
```

Lỗi bất kỳ bước nào → `{:failed, :with_reason, "list_dataset_page_not_found"}`.

`ListDatasetHTML.page_items/2` (`nodes/list_dataset/html.ex:179-193`) chỉ render **các item** (không bọc grid, không pager) — xem [08 §6](./08-qwik-html.md).

> ⚠️ **Bất thường:**
> - `collection_list_page` với `"custom_collections"` trả `{[], n}` (`renders.ex:101-102`) → trang 2 trở đi của list danh mục tự chọn luôn **rỗng**.
> - Endpoint đọc bản published, nên trong Preview (draft) bấm sang trang 2 sẽ thấy dữ liệu theo cấu hình **bản đã publish** (hoặc lỗi nếu page chưa publish).
> - Nhãn nút "Show more" hard-code tiếng Anh (`html.ex:155`).

---

## 8. So sánh 3 chế độ

| | Published (artifact) | Draft ở dev (`render_v2_draft_in_dev`) | Preview (editor) |
|---|---|---|---|
| Kích hoạt | Mặc định production | `config/dev.exs:145` | `GET …/pages/:id/preview` |
| Auth | Public | Public | JWT + quyền site |
| Nguồn node | `published_pages.source` (skeleton) | `Pages.composed_source` | `Pages.composed_source` |
| Cần đã publish? | Có | **Có** (để tìm được trang) | Không |
| Dựng HTML | Chỉ node động (`assemble`) | Toàn trang (`QwikV2.build`) | Toàn trang |
| CSS | `p.app_css` (link bundle) | `<style>` inline | `<style>` inline |
| Refs | `build_refs` (refs + node động) | `draft_refs` (quét mọi node) | `draft_refs` |
| Entity | Entity thật từ URL | Entity thật từ URL | Mẫu `preview_entity` |
| Scripts | Đóng băng lúc publish | Tính tại chỗ | Tính tại chỗ |
| Cache | Redis `qv2:skeleton:*` | Không | Không |

---

## 9. Timeline một request trang sản phẩm (production)

```
t0  GET /san-pham/ao-thun                         (host shop.vn → site_id qua :end_user)
t1  new_render_page/2 → :product → PageService.check_match(path, custom_product_slug)
t2  render_product_page (v1) → v2_site? → throw → catch → EditorV2Render.render_product_page
t3  assign_render_context                         parse site.settings
t4  Products.get_product_by_site_id_slug          DB
t5  PageAssignments.category_ids_of_product       DB
t6  Published.get_assigned → resolve_page_id / fallback_template   DB (+ load source)
t7  SkeletonCache.get_or_load                     Redis GET (miss → decode + SET)
t8  build_refs                                     0..6 query Bindings
t9  Compile.assemble                               dựng node động, Seed/WebImage
t10 render_doc → render_v2.html.eex                fonts_head, hero_preload
t11 200 HTML → browser tải CSS bundle + Loader.js → hydrate island
```

---

## 10. Test liên quan

- `test/builderx_api/editor_v2/published_test.exs`
- `test/builderx_api/editor_v2/render_product_page_test.exs`
- `test/builderx_api/editor_v2/render_post_page_test.exs`

---

## 11. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Site v2 nhưng vẫn ra giao diện v1 | `sites.version` phải là `2` (`page_controller.ex:766`). Route có đi qua hàm v1 có `throw` không (vd `/pages/:slug` → `render_webcake_page` **không** có nhánh v2). |
| 404 dù đã tạo page trong editor | Đã **Publish** chưa (bảng `published_pages`)? Slug trong `published_pages.slug` có khớp `path` thô không (kể cả tiền tố ngôn ngữ, §2). |
| Trang chủ ra sai trang | Không có bản nào `is_homepage = true` → lấy bản publish sớm nhất (`published.ex:116`). |
| Sửa trong editor mà storefront không đổi | Chưa publish lại; hoặc Redis còn cache cũ — publish gọi `invalidate`, xóa tay key `qv2:skeleton:<site>:<page>`. |
| Giá/tên SP cũ | Node đó có thật là node động (`dynamic_nodes`) không? Node tĩnh bị "nướng" lúc publish. |
| Trang sản phẩm ra template sai | [04](./04-page-assignment.md): assignment custom → category → all → `is_default` → bản sớm nhất. |
| Trang sản phẩm rơi về giao diện v1 / trang khác | `serve_dynamic` trả `{:error, :not_found}` (không có template product nào được publish) → chuỗi fallback v1 chạy tiếp. |
| 500 trên trang đã publish | `published_pages.source` hỏng (thiếu `skeleton`) → `Compile.assemble` FunctionClauseError (§4.2). |
| Sai tiền tệ / `lang="en"` | `conn.assigns[:lang]` nil trong nhánh v2 (§2); `Tools.get_currency_by_lang`. |
| Font không đúng | `site.settings.fontGeneral`; font có trong `Qwik.GoogleFonts.fonts()` không. |
| Không có meta SEO / og | Chưa nối — `render_doc` không truyền `:meta_tags`. |
| Trang 2 list-dataset rỗng / lỗi | Node có trong `dynamic_nodes` bản published không; `layout` ≠ `slide`; `loadMode`; custom collections luôn rỗng (§7). |
| JS không chạy (tab, popup, list…) | Xem `window.xbase` trong HTML và file `Loader.js` tại `base` có tồn tại không; artifact cũ trỏ phiên bản JS cũ → publish lại. Chương [10](./10-render-v2-js.md). |
| Preview trả 401/403 | Endpoint preview cần JWT + plug `:site`. |
