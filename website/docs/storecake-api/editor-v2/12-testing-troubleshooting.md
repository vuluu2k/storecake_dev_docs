---
sidebar_position: 13
title: "12 — Test, debug & troubleshooting"
---

# 12 — Test, debug & troubleshooting

> **Cho BA:** Chương này giúp trả lời nhanh câu "sao trang của khách hiển thị sai?". Ba điều cần nhớ: (1) trang khách xem là **bản đã publish**, không phải bản đang sửa — sửa xong phải bấm Publish; (2) publish là **publish cả site**, mọi trang cùng lúc; (3) CSS và "khung" HTML được **đóng băng lúc publish**, còn dữ liệu sản phẩm/bài viết (giá, tên, tồn kho) được lấy **mới mỗi lần khách vào trang**. Bảng ở §5 liệt kê triệu chứng → nguyên nhân → chỗ dev cần kiểm.

---

## 1. Bản đồ test

```
test/
├─ builderx_api/editor_v2/
│   ├─ published_test.exs              publish_page + chọn template mặc định
│   ├─ render_product_page_test.exs    trang sản phẩm: ctx.product → binding auto
│   └─ render_post_page_test.exs       trang bài viết / blog: ctx.article, ctx.blog
├─ builderx_api_web/api_spec_test.exs  OpenAPI của mọi route /editor_v2 build được
└─ qwik_v2/
    ├─ scripts_test.exs                khi nào nhúng Loader.js, prefix version JS
    ├─ data/ctx_product_test.exs       binding auto đọc ctx.product, ProductScope thắng
    ├─ nodes/list_dataset_post_test.exs list-dataset nguồn post: Source, draft, assemble
    └─ style/hidden_test.exs           ẩn theo breakpoint → media query không chồng nhau
```

### 1.1 Lệnh chạy

```bash
# Toàn bộ phần editor_v2 + render
mix test test/builderx_api/editor_v2 test/qwik_v2 test/builderx_api_web/api_spec_test.exs

# Một file / một test
mix test test/qwik_v2/scripts_test.exs
mix test test/builderx_api/editor_v2/render_product_page_test.exs:198
```

Điều kiện môi trường:

- Các test dùng `BuilderxApi.DataCase` (3 file `test/builderx_api/editor_v2/*`) cần DB Citus test chạy được.
- `render_product_page_test.exs:143-157` và `render_post_page_test.exs:94-106` **cố tình** trỏ Minio về `127.0.0.1:9` (cổng chết) để `publish_css` upload thất bại và rơi về `<style>` inline (`lib/builderx_api/editor_v2/published.ex:87-93`). Nhờ vậy test không upload thật.
- `scripts_test.exs:51-63` gọi `QwikV2.Runtime.base_path/0` → có thể **gọi HTTP thật** tới `current.json` trên Minio (`lib/qwik_v2/runtime.ex:51-62`). Test chấp nhận cả hai kết quả (có mạng → URL version; không → `/render_v2/`), nên không fail khi offline, nhưng chậm tối đa ~5s timeout.
- `scripts_test.exs` là `async: false` vì dùng `Application.put_env` và cờ process `Compile.mark_runtime`.

### 1.2 Mỗi test kiểm gì

**`test/builderx_api/editor_v2/published_test.exs`**

| Dòng | Test | Khẳng định |
|---|---|---|
| `:20` | publish_page giữ type, is_default | Row `published_pages` copy `type`, `is_default` từ page (`published.ex:54-60`) |
| `:30` | get_template trả page default đã publish | Chưa publish → `nil`; publish rồi → đúng page |
| `:42` | get_template nil khi khác type | Template category không bị dùng cho product |
| `:50` | ưu tiên `is_default` | `default_template/2` trước `first_template/2` (`published.ex:148-165`) |
| `:62` | fallback bản publish đầu | Không page nào default → `inserted_at` sớm nhất |
| `:71` | 1 default mỗi type mỗi site | `Pages.update_page` trả lỗi `"Default template for this page type has already"` |

**`test/builderx_api/editor_v2/render_product_page_test.exs`** (issue #5238)

| Dòng | Test | Khẳng định |
|---|---|---|
| `:164` | get product theo slug | `Products.get_product_by_site_id_slug/2` trả `{:ok, product}` kèm `variations` |
| `:172` | slug sai | `{:error, :not_found}` → controller trả 404 (`render_controller.ex:58-59`) |
| `:176` | assemble với `ctx.product` | Template `apply_type=all` được `get_assigned` chọn; binding không id → lấy `ctx.product`; product vào `Seed` |
| `:198` | section product-information | Dựng lại cây giống SPA (`dataset-block` → gallery/title/price/variants/quantity/description). Mọi node con bắt product của trang — kiểm tên, giá format, mô tả, ảnh variation, thuộc tính "Màu"/"Đen", có `quantity-dataset` |
| `:230` | không có `ctx.product` | Binding auto render rỗng (không lấy nhầm SP nào) |

**`test/builderx_api/editor_v2/render_post_page_test.exs`**

| Dòng | Test | Khẳng định |
|---|---|---|
| `:113` | `get_post_by_slug` đủ shape | Preload `creator`, `tag_articles`, `article_categories.category` |
| `:124` | slug không có / nil | trả `nil` |
| `:129` | assemble với `ctx.article` | 6 kind `title summary date tag category author` đều ra dữ liệu |
| `:165` | không `ctx.article` | render rỗng |
| `:175` | assemble với `ctx.blog` | `name`, `description` của blog category |
| `:207`, `:220` | `sample_post` | Preview lấy bài mới nhất; nếu page đã gán bài thì ưu tiên bài đó (`render_controller.ex:143-148`) |
| `:232` | `sample_blog` | Bỏ qua chuyên mục `is_default` ("All") |
| `:247` | site trống / `nil` | `sample_*` trả `nil`, không nổ |

**`test/builderx_api_web/api_spec_test.exs`** — guard cho `GET /api/v1/openapi` và `/api/v1/swaggerui` (`lib/builderx_api_web/router/router.ex:95-99`):

- `:19` spec build được; `:23` **mọi** action của route chứa `/editor_v2` phải khai `operation(...)` — thiếu một cái là `Paths.from_routes/1` raise và **cả Swagger sập**.
- `:34` mọi route có mặt trong `paths`; `:46` mỗi operation có response 200; `:57` response 200 có schema JSON hoặc `text/html`; `:74` encode JSON được; `:81` components có đủ `Product Category BlogCategory Article Page PageVersion StyleGlobal Error`.
- → Thêm endpoint editor_v2 mới mà quên `operation` thì test này đỏ. Xem cách khai ở [chương 02](./02-editor-api.md).

**`test/qwik_v2/scripts_test.exs`**

| Dòng | Khẳng định |
|---|---|
| `:16` | Không event, không xdata, không runtime → `Scripts.tags/1` trả `""` (không nhúng JS) |
| `:21` | Đã `mark_runtime` → vẫn nhúng loader dù không có event |
| `:29` | `window.xbase` và `src` của `Loader.js` cùng prefix; có `window.xevents=["click"]`; **không** có `window.xmodules` (module lazy theo `x:init`) |
| `:40` | Config `:qwik_v2_asset_base` ghi đè prefix |
| `:52`, `:58` | `Runtime.base_path/0` kết thúc `/`, là `.../js/editor_v2/<ver>/` hoặc `/render_v2/` |
| `:67` | Trang chỉ có accordion (không event) vẫn có loader qua `compile/1` |

**`test/qwik_v2/data/ctx_product_test.exs`**: `:21` binding không id đọc `ctx.product`; `:27` không có thì rỗng; `:33` `ctx.product` luôn được seed cho JS (vì `Seed.reset/0` tự `put`, `lib/qwik_v2/data/seed.ex:12-15`); `:45` `ProductScope.current()` thắng `ctx.product` trong container lặp.

**`test/qwik_v2/nodes/list_dataset_post_test.exs`**: `Source.kind/1`, `post_list_key/1`, `collection_key/1` (`:59-97`); draft lặp template theo feed và cắt theo quantity (`:100-130`); `:134` con của item vẫn render khi `ctx.nodes` rỗng (tức sau publish); `:144` feed post **không** bị bake vào skeleton; `PostScope` (`:155-180`).

**`test/qwik_v2/style/hidden_test.exs`**: `config.hidden` là **non-cascading** — ẩn ở desktop không kéo theo ẩn ở mobile (`:29`); mỗi bp một range media query loại trừ nhau (`:35`); ẩn cả 4 bp gộp về rule base (`:58`); chấp nhận chuỗi `"true"` (`:68`). Code: `lib/qwik_v2/style/hidden.ex:8-32`, range: `lib/qwik_v2/style/responsive.ex:13-18`.

### 1.3 Lỗ hổng test hiện tại

Chưa có test cho: `Published.publish_site/2`, global section/global node compose, `PageAssignments.resolve_page_id/4` nhánh custom/category, `RenderController.render_page/2` (slug/home), `list_dataset_page`, `SkeletonCache`, và phía JS `assets/render_v2` (không thấy test runner JS cho thư mục này).

---

## 2. Công cụ debug

### 2.1 Preview draft (không cần publish)

```
GET /api/v1/editor_v2/sites/:site_id/pages/:id/preview
```

`lib/builderx_api_web/controllers/v1/editor_v2/render_controller.ex:125-132` → `serve_draft/4` (`:204-233`).

- Đi qua pipeline `[:api, :auth, :account, :site]` như các API editor khác (`router.ex:332-346`) → cần token hợp lệ và quyền trên site.
- Render từ **draft** (`Pages.composed_source/1`, `lib/builderx_api/editor_v2/pages.ex:109`), CSS **inline** `<style>`, scripts tính lại mỗi lần. Không qua `SkeletonCache`, không cần publish.
- Trang product/post/blog: tự mượn một entity mẫu (`preview_entity/2`, `:136-157`) để binding auto có dữ liệu.
- Khác bản published: ctx draft **không set `lang`** (`:207-219` không có `lang:`) → mặc định `"en"` từ struct (`lib/qwik_v2/qwik_v2.ex:12`). Published thì dùng `conn.assigns[:lang] || "en"` (`:188`).

So sánh nhanh: preview đúng mà trang thật sai ⇒ lỗi nằm ở **publish/compile/assemble/cache**; preview cũng sai ⇒ lỗi ở **node HTML/CSS hoặc dữ liệu draft**.

### 2.2 Dev: public URL render luôn draft

`config/dev.exs:145`

```elixir
config :builderx_api, :render_v2_draft_in_dev, true
```

`render_controller.ex:168-175`: khi cờ bật và page draft còn tồn tại, `serve_published/3` **bỏ qua bản publish** và gọi `serve_draft`. Hệ quả ở máy dev:

- Sửa trong editor, F5 trang public là thấy ngay — **không phản ánh** hành vi production.
- Muốn tái hiện lỗi "publish xong không đổi" / cache / artifact ở local: đặt cờ `false` (hoặc xoá dòng) rồi restart.
- Endpoint `list_dataset_page` **luôn** đọc artifact published (`lib/builderx_api_web/controllers/v1/editor_v2/renders.ex:53-59`), kể cả ở dev → phân trang ở dev có thể lệch với HTML draft đang hiển thị.

Các cờ dev liên quan (`config/dev.exs:53-60,141-145`): `:qwik_v2_asset_base = "http://localhost:39990/render_v2/"` (JS lấy từ Vite dev server), `:qwik_v2_vite_dev = true` (nhúng `@vite/client` + `dev/hmr.js`, `lib/qwik_v2/scripts.ex:13-15`).

### 2.3 Swagger

```
GET /api/v1/swaggerui    # UI, không cần auth để mở
GET /api/v1/openapi      # JSON spec
```

`router.ex:92-99`. Bấm "Authorize" để gửi JWT khi thử các endpoint cần auth.

### 2.4 Snippet IEx (`iex -S mix`)

Tất cả dựa trên hàm có thật trong code.

```elixir
alias BuilderxApi.EditorV2.{Pages, Published, PageAssignments, Doc}

site_id = "..."; page_id = "..."

# Draft
page = Pages.get_page(site_id, page_id)                         # pages.ex:39
tree = Doc.decode(Pages.composed_source(page))                  # đã ghép global section/node
map_size(tree["nodes"])

# Bản publish
p = Published.get_by_page(site_id, page_id)                     # published.ex:96
p.js_version                                                    # version JS đã pin lúc publish
art = Doc.decode(p.source)
Map.keys(art)            # name schema_version root_node_id skeleton dynamic_nodes refs scripts
Map.keys(art["dynamic_nodes"])                                  # node được render lúc request
art["refs"]                                                     # UUID sẽ prefetch
p.app_css                                                       # <link> Minio hoặc <style> fallback

# Trang chủ / slug nào đang phục vụ
Published.get_home(site_id)                                     # published.ex:109
Published.get_by_slug(site_id, "gioi-thieu")                    # published.ex:102

# Template nào được chọn cho 1 sản phẩm (target_type product = Enum.PageTargetType.value(:product))
t = Enum.PageTargetType.value(:product)
PageAssignments.resolve_page_id(site_id, t, product_id, category_ids)   # page_assignments.ex:126
Published.get_assigned(site_id, t, product_id, category_ids)            # published.ex:131

# Render lại draft ra HTML/CSS
{html, css} = QwikV2.build(%QwikV2{nodes: tree["nodes"], root_id: tree["root_node_id"],
                                   page: page, site: site_id, preview: true})

# Assemble lại bản publish (không có refs → binding UUID sẽ rỗng)
QwikV2.Compile.assemble(art, %QwikV2{lang: "vi", currency: "VND", refs: %{}})

# Publish lại 1 trang (style_data lấy như Published làm; %{} = default global style)
Published.publish_page(page, nil, %{})                          # published.ex:34

# Cache & runtime JS
QwikV2.SkeletonCache.invalidate(site_id, page_id)               # skeleton_cache.ex:23
QwikV2.Runtime.current_version()                                # runtime.ex:7 (persistent_term)
QwikV2.Runtime.reload()                                         # runtime.ex:41 — đọc lại current.json
QwikV2.Runtime.base_path()
```

Lưu ý khi dùng `publish_page/4` trong IEx: tham số thứ 3 là `style_data`; truyền `%{}` sẽ publish với **global style mặc định** (`lib/qwik_v2/style/global.ex:3-13`) chứ không phải style site đang chọn. Muốn đúng như nút Publish, gọi `Published.publish_site(site_id, account_id)` (`published.ex:18-32`) — nhưng hàm này publish **mọi** trang của site.

### 2.5 Mix task liên quan JS runtime

```bash
cd assets && npm run deploy:render_v2        # vite build → $TMPDIR/builderx_render_v2_build
mix qwik_v2.upload_assets                     # upload js/editor_v2/<hash>/*.js + manifest.json + current.json
mix qwik_v2.repin_assets [--site ID] [--to VERSION]   # sửa prefix JS trong source các trang đã publish
```

- `lib/mix/tasks/qwik_v2_upload_assets.ex:15-53`: version = hash nội dung bundle; `current.json` ghi `no-cache`, file JS `immutable`.
- `lib/mix/tasks/qwik_v2_repin_assets.ex:10-72`: regex thay prefix trong `source.scripts`, cập nhật `js_version`, **invalidate SkeletonCache** từng trang. Trang publish trước khi có trường `scripts` bị bỏ qua (`:65-69`).

Chi tiết build/deploy: [chương 10](./10-render-v2-js.md).

---

## 3. Migration & backfill

Migration editor_v2 trong `priv/citus/migrations/`:

| File | Nội dung (theo tên) |
|---|---|
| `20260618000000_add_editor_v2_columns_to_shared_tables.exs` | Thêm cột editor v2 (gồm `version`) vào bảng dùng chung |
| `20260803043933_recreate_style_global_table.exs` | Tạo lại bảng style global |
| `20260819000001_create_editor_v2_global_sections.exs` | Global section |
| `20260822000001_create_editor_v2_global_nodes.exs` | Global node |
| `20260824000001_create_editor_v2_page_assignments.exs` | Gán template cho product/category/post/blog |
| `20260915000000_add_metadata_to_editor_v2_global_nodes.exs` | Metadata global node |

Schema chi tiết: [chương 01](./01-data-model.md).

### 3.1 `BuilderxApi.Run.backfill_editor_version/2`

`lib/builderx_api/run.ex:4444-4485` (hàm ở `:4448`, helper `:4464`)

```elixir
# Backfill `version = 1` cho các row editor v1 (version IS NULL), thay cho các
# execute UPDATE đã comment trong migration AddEditorV2ColumnsToSharedTables.
def backfill_editor_version(batch_size \\ 100, sleep_ms \\ 200) do
  [Site, Page, PageSource, PageVersion, PublishedPage]           # :4450-4455
  |> Enum.each(fn schema -> backfill_version_by_schema(schema, batch_size, sleep_ms, 0) ... end)
end
```

- Tại sao: migration thêm cột `version` nhưng **không** UPDATE dữ liệu cũ (đã comment trong migration, tránh khoá bảng lớn trên Citus). Task này chạy tay sau deploy.
- `backfill_version_by_schema/4` (`:4464-4484`): lấy `batch_size` id có `version IS NULL` → `update_all set version: 1` → ngủ `sleep_ms` → đệ quy tới khi hết.
- Chạy: `BuilderxApi.Run.backfill_editor_version()` trong remote console.
- Liên quan tới routing: `v2_site?/1` chỉ nhận `version in [2, "2"]` (`lib/builderx_api_web/controllers/v1/pages/page_controller.ex:766-767`). Site `version` NULL/1 đi đường v1 — backfill không đổi hành vi render, chỉ làm dữ liệu nhất quán. `Site.version` default 1 (`lib/builderx_api/sites/site.ex:25-26`).
- `repin_assets` lọc `p.version == 2` (`qwik_v2_repin_assets.ex:35,44`) → row published v2 phải có `version = 2`.

---

## 4. Luồng để khoanh vùng lỗi

```
Khách mở URL
 ├─ Site.version == 2 ?  (page_controller.ex:766)          không → đường v1, không phải editor_v2
 ├─ Route nào?  render_page / product / category / post / blog  (render_controller.ex:23-113)
 ├─ Có PublishedPage?                                      không → 404 (trang tĩnh) | {:error,:not_found} (trang động → v1 fallback)
 ├─ dev + render_v2_draft_in_dev?                          có → serve_draft (bỏ qua publish)
 ├─ SkeletonCache Redis "qv2:skeleton:<site>:<page>"       TTL 24h (skeleton_cache.ex:4-6)
 ├─ build_refs: prefetch product/category/post/blog/collection theo refs + dynamic_nodes
 ├─ Compile.assemble: ghép skeleton + render dynamic_nodes
 └─ render_v2.html.eex: css = p.app_css (đã bake), scripts = artifact["scripts"] (đã pin version)
```

---

## 5. Bảng troubleshooting

| # | Triệu chứng | Nguyên nhân có căn cứ | Kiểm ở đâu |
|---|---|---|---|
| 1 | Site v2 nhưng vẫn ra giao diện v1 | `sites.version` ≠ 2 → không throw sang v2 | `page_controller.ex:766-770` |
| 2 | Trang tĩnh 404 dù đã tạo trong editor | Trang chưa được publish (render chỉ đọc bảng `published_pages` — schema `PublishedPage`), hoặc slug khác | `render_controller.ex:23-32`, `published.ex:102-107` |
| 3 | Trang chủ ra một trang lạ | Không có page `is_homepage` đã publish → lấy bản publish **cũ nhất** | `published.ex:109-117,174-180` |
| 4 | Trang 404 sơ sài `<h1>404 Not Found</h1>` | `serve_404/1` của v2 (không dùng template 404 của v1) | `render_controller.ex:237-241` |
| 5 | Sửa editor xong, trang thật không đổi | Chưa bấm Publish — public chỉ đọc bản publish | `published.ex:1-6` (moduledoc) |
| 6 | Local sửa draft đã thấy, production không | Dev bật `render_v2_draft_in_dev` → public render draft | `config/dev.exs:145`, `render_controller.ex:168-175` |
| 7 | Publish xong vẫn thấy bản cũ (ghi thẳng DB/ script) | `SkeletonCache` Redis TTL 24h; chỉ `publish_page` và `repin_assets` invalidate | `skeleton_cache.ex:4,23`, `published.ex:83` |
| 8 | Đổi global style (font size heading…) không ăn | Global CSS bake vào `app_css` lúc publish → cần publish lại | `published.ex:19,52`, `lib/qwik_v2/css.ex:31` |
| 9 | Global style về mặc định 48/36/28px… | `style_data["all"]` rỗng → `@default_css` | `lib/qwik_v2/style/global.ex:15-20` |
| 10 | Sửa global section, trang dùng nó chưa đổi | Global section được **ghép vào lúc publish** (`Compose.compose`) → publish lại | `published.ex:36-38` |
| 11 | Giá/tên SP trên trang thật là giá cũ | Node dữ liệu thiếu nhánh `Compile.active?()` nên bị bake (node tự viết). Node chuẩn thì lấy mới mỗi request | `lib/qwik_v2/compile.ex:39-48`, [chương 11 §7.2](./11-add-element.md) |
| 12 | Sau publish, node con trong dataset biến mất (preview vẫn có) | Node dùng `capture/2` thay vì `capture_children/subtree`; artifact không lưu `nodes` | `compile.ex:58-96`, `render_controller.ex:186-190` |
| 13 | Product page không dùng template đã gán | Page gán **chưa publish** → `get_by_page` nil → rơi về template mặc định | `published.ex:131-139` |
| 14 | Product page dùng sai template | Thứ tự `custom → category (kể cả category cha) → all`; trong cùng mức lấy `order` rồi `inserted_at` nhỏ nhất | `page_assignments.ex:126-166` |
| 15 | Product page ra giao diện v1 / trang lỗi v1 | Không có template nào (assignment lẫn default) → `{:error, :not_found}` để v1 chạy tiếp chuỗi fallback | `render_controller.ex:115-117`, `page_controller.ex:2998-3007` |
| 16 | Product page 404 | Slug không khớp hoặc SP không thuộc site | `render_controller.ex:50-59` |
| 17 | `/blog` ra 404 | `/blog` không slug được coi là trang **tĩnh** path `"blog"` → cần page slug `blog` đã publish | `render_controller.ex:91-99` |
| 18 | Binding auto rỗng trên trang product/post | Không có `ctx.product/article` (render qua đường tĩnh, hoặc preview site chưa có SP/bài) | `binding.ex:79-83`, `render_controller.ex:136-157` |
| 19 | Node bind SP cụ thể ra rỗng | `target.id` không phải UUID hợp lệ → đi nhánh auto; hoặc id không có trong `refs` (SP bị xoá/ẩn) | `binding.ex:50,71-83`, `renders.ex:18-31` |
| 20 | List dataset không có phân trang | `layout = "slide"` hoặc load mode `"none"` → `paged?` false | `lib/qwik_v2/nodes/list_dataset/source.ex:54-56` |
| 21 | Bấm trang 2 của list dataset lỗi `list_dataset_page_not_found` | Node không có trong `dynamic_nodes` của bản **publish** (mới thêm, chưa publish), hoặc không `paged?` | `render_controller.ex:34-45`, `renders.ex:53-78` |
| 22 | List collection "custom" phân trang sai | Nhánh `custom_collections` trả `{[], length(ids)}` — không lấy item theo trang | `renders.ex:97-107` |
| 23 | CSS vỡ toàn trang, chỉ có style inline | Upload Minio lỗi lúc publish → fallback `<style>` inline (vẫn đúng); nếu `app_css` là `<link>` mà Minio chết → mất CSS | `published.ex:87-93`, `lib/qwik_v2/assets.ex:8-36` |
| 24 | Chỉnh mobile nhưng điện thoại 390px không ăn | Media query mobile là `(max-width: 360px)`; 361–768px nhận style **tablet** | `lib/qwik_v2/style/responsive.ex:4-18` |
| 25 | Ẩn ở desktop nhưng mobile cũng ẩn / ngược lại | `hidden` non-cascading, mỗi bp một range riêng — phải bật/tắt đúng bp | `style/hidden.ex:8-32`, `test/qwik_v2/style/hidden_test.exs:29` |
| 26 | Chỉnh style trong editor không ra trang thật | Renderer của type không có atom tương ứng (atom lạ → `%{}`) | `style/renderers.ex:128`, `nodes/<type>/css.ex` |
| 27 | Element hiện thành `<div>` rỗng | Type chưa có trong `Registry @html` | `lib/qwik_v2/registry.ex:2-32`, `lib/qwik_v2/html.ex:15` |
| 28 | Toàn bộ tương tác (tab, accordion, popup…) chết | `Loader.js` không tải: sai `xbase`, Minio chết, hoặc version JS đã pin không còn file | `lib/qwik_v2/scripts.ex:12-21`, `lib/qwik_v2/runtime.ex:24-37` |
| 29 | Upload JS mới rồi, trang publish mới vẫn dùng JS cũ | `Runtime.current_version` cache trong `persistent_term` tới khi restart hoặc `Runtime.reload()` | `runtime.ex:7-22,41-44` |
| 30 | Trang cũ vẫn dùng JS cũ sau deploy JS | `scripts` + `js_version` pin lúc publish → chạy `mix qwik_v2.repin_assets` hoặc publish lại | `published.ex:62,72`, `qwik_v2_repin_assets.ex` |
| 31 | Một element JS không chạy, console không báo | Tên `WK2.register` ≠ tên `x_init` → promise pending mãi | `assets/render_v2/core/loader.js:30-56,126-137` |
| 32 | Console `[wk2] load X lỗi` | File JS không có trong bundle/manifest của version đang dùng | `loader.js:111-116`, `assets/vite.render_v2.config.mjs:26-35` |
| 33 | Hover/dblclick event không chạy | Loader chỉ lắng nghe event trong `window.xevents` (mặc định chỉ click) | `loader.js:208`, `lib/qwik_v2/events.ex:51-68` |
| 34 | Nút có link lại render thành `<button>` | Chỉ `<a>` khi có event `go_to_url` + trigger `click` + url khác rỗng | `events.ex:91-106` |
| 35 | Ảnh có nền xám nhấp nháy mãi | Class `is-loaded` do JS gắn (`revealImages`); loader không chạy → shimmer không tắt | `lib/qwik_v2/style/static_css.ex:52-70`, `assets/render_v2/core/image-reveal.js` |
| 36 | Font body sai | Chỉ `settings.fontGeneral` được nạp Google Fonts (mặc định `Inter`), và chỉ khi nằm trong `Qwik.GoogleFonts.fonts()` | `lib/builderx_api/editor_v2/site_settings.ex:4,19-46` |
| 37 | Font riêng của từng text không hiện | Không tìm thấy code nạp font theo `--text-font-family` của node phía render (grep `GoogleFonts` trong `lib/qwik_v2` không ra) — chưa xác minh có cơ chế khác | `site_settings.ex:26-37` |
| 38 | Toast/modal hiện tiếng Anh trên site VN | Locale JS theo `<html lang>` = `assigns[:lang] || "en"`; chưa xác minh `conn.assigns[:lang]` được set ở đâu | `render_v2.html.eex:2`, `assets/render_v2/nodes/global.js:6` |
| 39 | Tiền tệ hiển thị VND sai site | `currency/1` lỗi hoặc không tìm được → fallback `"VND"` | `renders.ex:206-212` |
| 40 | Swagger `/api/v1/swaggerui` sập | Một action editor_v2 thiếu `operation` | `test/builderx_api_web/api_spec_test.exs:23` |
| 41 | Publish trả lỗi 500 | `publish_page` pattern-match cứng `{:ok, ref_tree} = Compose.compose(...)` → compose lỗi là raise | `published.ex:36` |

---

## 6. Những chỗ code chưa nối / bất thường (ghi nhận khi viết chương này)

- `QwikV2.Registry @data %{}` rỗng → cơ chế `Nodes.<X>.Data` trong `XData` chưa được dùng (`registry.ex:69`, `x_data.ex:21-28`).
- `window.xi18n` được đọc ở JS nhưng không có chỗ Elixir set (`assets/render_v2/services/i18n.js:1`).
- `serve_draft` không đặt `lang` cho ctx (`render_controller.ex:207-219`) → preview luôn `"en"` về mặt ctx.
- `Published.get_assigned/4` có **hai** `@doc` liền nhau; `@doc` đầu (nói về template mặc định) thực ra thuộc `get_template/2` và bị ghi đè (`published.ex:119-130`) — chỉ ảnh hưởng tài liệu.
- Nhánh `custom_collections` của `list_dataset_page` không trả item (`renders.ex:101-102`).
