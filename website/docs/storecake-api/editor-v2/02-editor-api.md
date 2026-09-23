---
sidebar_position: 3
title: "02 — API cho Editor"
---

# 02 — API cho Editor

Chương này đi **từng endpoint** trong scope `/api/v1/editor_v2` mà editor (frontend `builderx_spa`) gọi: route → controller → context → DB, kèm request/response và lỗi trả về.

> **Cho BA:**
> - Editor nói chuyện với backend qua một nhóm API riêng `/api/v1/editor_v2`. Mọi thao tác đều cần đăng nhập và phải là người có quyền trên site.
> - Nhóm API gồm: **quản lý trang** (tạo, mở, lưu, đổi tên, xoá), **sửa lẻ một khối**, **lịch sử phiên bản** (lưu / xem / khôi phục), **publish / export / nhân bản / import site**, **global styling**, cùng các nhóm có chương riêng: khối dùng chung, gán trang mẫu, nguồn dữ liệu sản phẩm/bài viết.
> - "Lưu" chỉ cập nhật **bản nháp**. Khách chỉ thấy thay đổi sau khi **Publish** (publish cả site một lần).
> - Không xoá được **trang chủ** và **trang cuối cùng** của site.
> - Tài liệu API tương tác (Swagger) xem ở `/api/v1/swaggerui`.

Snapshot: branch `feat-builder-v2`, commit `3e3eeacb5` (2026-09-23). Đường dẫn file tính từ root `builderx_api`. Mô hình dữ liệu xem [01 — Mô hình dữ liệu](./01-data-model.md).

---

## 1. Route map

`lib/builderx_api_web/router/router.ex:324-425`

```
scope "/", BuilderxApiWeb                              (router.ex:249)
 └─ scope "/api/v1", V1                                (:324)
     ├─ (các route template/tags công khai …)
     ├─ pipe_through [:api, :auth, :account]           (:332)
     └─ scope "/editor_v2", EditorV2                   (:338)
         ├─ POST /import                               → SiteController.import        (không có :site)
         └─ scope "/sites/:site_id"  pipe_through [:site]
             ├─ GET  /pages                            → PageController.index
             ├─ POST /pages                            → PageController.create
             ├─ POST /pages/init_default_pages         → PageController.init_default_pages
             ├─ scope "/bindings"  pipe_through [:openapi_spec]   → chương 05
             ├─ POST /publish                          → SiteController.publish
             ├─ GET  /export                           → SiteController.export
             ├─ POST /duplicate                        → SiteController.duplicate
             ├─ /global_sections/…                     → chương 03
             ├─ /global_nodes/…                        → chương 03
             ├─ GET|POST|PUT|DELETE /style_globals     → StyleGlobalController
             └─ scope "/pages/:id"
                 ├─ GET    /                           → PageController.show
                 ├─ POST   /                           → PageController.update   (Save)
                 ├─ DELETE /                           → PageController.delete
                 ├─ PATCH  /rename                     → PageController.rename
                 ├─ PATCH  /meta                       → PageController.update_meta
                 ├─ GET|PUT /assignment                → chương 04
                 ├─ GET    /preview                    → RenderController.preview (HTML)
                 ├─ /versions  GET / · POST / · GET /:version_id · POST /:version_id/restore
                 └─ /nodes/:node_id  PATCH / · DELETE /
```

Ghi chú về thứ tự: `POST /pages/init_default_pages` khai **trước** `scope "/pages/:id"` nên không bị hiểu nhầm là `POST /pages/:id` với `id = "init_default_pages"`. Đừng đảo thứ tự khi sửa router.

### 1.1 Chuỗi plug mỗi request đi qua

| Plug | File | Làm gì | Lỗi |
|---|---|---|---|
| `:api` | router.ex:11 | `accepts ["json"]` | 406 |
| `:auth` → `AuthPlug` | `lib/builderx_api_web/plugs/auth_plug.ex` | đọc JWT từ header `Authorization: Bearer …` hoặc cookie `jwt`, verify bằng `JWT_KEY`, kiểm session | 401 |
| `:account` → `AccountPlug` | | gán `conn.assigns.account` | |
| `:site` → `SitePlug` | `lib/builderx_api_web/plugs/site_plug.ex` | `Sites.get_site_by_id(site_id, account.id)` + `SitePermissions.get_site_permission` → gán `assigns.site`, `assigns.site_permission` | **404** text thuần `"Site not found"` / `"Site permission not found"` |

Không có plug riêng cho page: controller tự load page bằng `PageLoader` (mục 2).

### 1.2 Envelope response — `FallbackController`

Mọi controller dùng `action_fallback BuilderxApiWeb.FallbackController` (`lib/builderx_api_web.ex:27`). Controller trả **tuple**, fallback đổi thành JSON:

| Tuple controller trả | HTTP | Body |
|---|---|---|
| `{:success, :with_data, data}` | 200 | `{"success": true, "data": …, "fallback": "with_data"}` |
| `{:success, :success_only}` | 200 | `{"success": true, "success_only": true}` |
| `{:failed, :with_reason, reason}` | **422** | `{"success": false, "reason": "…", "fallback": "with_reason"}` |
| `{:error, %Ecto.Changeset{}}` | 422 | `ChangesetView "error.json"` |
| `{:bad_request, :with_reason, r}` | 400 | như with_reason |

> ⚠️ **"Không tìm thấy" trả 422, không phải 404.** `PageLoader` trả `{:failed, :with_reason, "Page not found"}` → 422. Spec OpenAPI của nhiều operation ghi `404 => "Không tìm thấy"` nhưng thực tế client nhận **422**. Chỉ 404 thật đến từ `SitePlug` (và `preview`, trả HTML).

---

## 2. `PageLoader` — load page theo route

`lib/builderx_api_web/controllers/v1/editor_v2/page_loader.ex:11-16`

```elixir
def load(%{"site_id" => site_id, "id" => id}) do
  case Pages.get_page(site_id, id) do
    nil  -> {:failed, :with_reason, "Page not found"}
    page -> {:ok, page}
  end
end
```

`Pages.get_page/2` (`lib/builderx_api/editor_v2/pages.ex:39-45`):

```elixir
Page
|> editor_v2()                                   # where version == 2
|> where([p], p.id == ^id and p.site_id == ^site_id and p.is_deleted == false)
|> preload(:source)                              # kèm page_sources
|> Repo.one()
```

- Luôn lọc `site_id` từ route ⇒ không thể đọc trang của site khác dù biết `id` (site đã được `SitePlug` kiểm quyền).
- Trang v1 (`version != 2`) hoặc đã xoá mềm ⇒ "Page not found".
- `preload(:source)` ⇒ `page.source` có sẵn cho `Nodes` và `composed_source`.

---

## 3. Pages

### 3.1 `GET /sites/:site_id/pages` — danh sách

`PageController.index` (`page_controller.ex:25-27`) → `Pages.list_pages(site_id, params)` (`pages.ex:21-29`)

```elixir
Page
|> editor_v2()
|> where([p], p.site_id == ^site_id and p.is_deleted == false)
|> filter_by_int(:type, opts["type"])     # ?type=8 → chỉ trang product
|> filter_by_term(opts["term"])           # ?term=abc → ILIKE name hoặc slug
|> order_by([p], asc: p.order, asc: p.inserted_at)
```

- `filter_by_int` (:208-213) dùng `parse_int` **nghiêm ngặt** (`{int, ""}`) — `?type=8x` bị bỏ qua (không lọc), khác `Params.int` lỏng.
- `filter_by_term` (:215-220): trim, rỗng thì không lọc.
- Response: `data: [page meta]` — **không có source** (nhẹ, dùng cho sidebar danh sách trang).

### 3.2 `POST /sites/:site_id/pages` — tạo trang

Body: `name, slug, is_homepage, is_default, type, order, settings, source` (source tuỳ chọn: chuỗi `source` hoặc `nodes/root_node_id/schema_version`).

```
PageController.create                                         page_controller.ex:39
 └─ Pages.create_from_params(site_id, account.id, params)     pages.ex:129
      ├─ attrs = {site_id, name,
      │           slug:  ensure_slug(slug, name, type, site_id),
      │           type:  params["type"] || 1 (main),
      │           is_homepage, is_default, order,
      │           settings: encode_settings(settings),        map → chuỗi JSON
      │           created_by}
      ├─ tree = build_create_tree(site_id, params["source"])  pages.ex:166
      │    ├─ PageSource.build_tree(source) |> Compose.decompose()   bỏ writes (_writes)
      │    └─ Compose.seed_refs(ref_tree, GlobalSections.default_sections(site_id))
      ├─ create_page(attrs, tree)                              pages.ex:60  (transaction)
      │    ├─ insert_page(attrs)                               Page.changeset
      │    └─ seed_source(page, tree)                          insert page_sources
      └─ nếu ok:
           ├─ GlobalSections.sync_page_refs(site_id, page.id, tree)
           └─ sync_global_node_page_refs(site_id, page.id, tree)
```

Giải thích các bước đáng chú ý:

- **`ensure_slug/4`** (:184-189): slug trống → `derive_slug` gọi `BuilderxApi.Pages.generate_slug(name, site_id, type || 0)` (hàm của v1) để sinh slug không trùng. Tên cũng trống → `slug = nil`.
- **`build_create_tree/2`** (:166-169):
  - `Compose.decompose` chuyển tree client gửi về dạng ref tree nhưng **vứt bỏ `writes`** — tạo trang mới **không bao giờ ghi đè** nội dung header/footer dù payload có chứa.
  - `seed_refs` + `default_sections(site_id)`: đảm bảo site có section `header`, `footer` (tạo nếu thiếu — `GlobalSections.ensure_defaults/1`), rồi chèn node ref vào ROOT: header lên **đầu**, footer xuống **cuối**, bỏ qua kind nào tree đã có. ⇒ Mọi trang mới tự có header/footer.
- **`create_page/2`** (:60-69): một transaction; lỗi changeset ở bất kỳ bước nào → `Repo.rollback(changeset)` → trả `{:error, changeset}` → 422.
- Sync ref chạy **sau** transaction — nếu sync lỗi thì trang vẫn đã tạo.

Response: `data: page meta` (không có source).

Lỗi hay gặp: trùng slug (`"Name page has already"`), đã có trang mặc định cùng type (`"Default template for this page type has already"`), `type` ngoài `Enum.PageType`.

### 3.3 `POST /sites/:site_id/pages/init_default_pages` — tạo hàng loạt

Body: `{"pages": [ {…như create…}, … ]}` (`pages` bắt buộc là mảng — thiếu thì Phoenix raise `ActionClauseError` → 400).

`Pages.init_default_pages/3` (`pages.ex:155-164`):

```elixir
Repo.transaction(fn ->
  Enum.map(pages_list, fn page_params ->
    case create_from_params(site_id, created_by, page_params) do
      {:ok, page} -> page
      {:error, changeset} -> Repo.rollback(changeset)   # 1 trang lỗi → huỷ TẤT CẢ
    end
  end)
end)
```

- **Tất cả hoặc không**: một trang lỗi thì cả lô rollback.
- Editor gọi endpoint này khi mở site lần đầu để tạo các trang mặc định còn thiếu (xem frontend chương 12 — Vòng đời page).
- Lồng transaction: `create_page` bên trong cũng mở transaction — Ecto gộp vào transaction ngoài (savepoint không dùng), nên rollback ở trong làm hỏng cả transaction ngoài. Hành vi cuối vẫn là "huỷ tất cả".

### 3.4 `GET /sites/:site_id/pages/:id` — mở trang (full tree)

```
PageController.show                                  page_controller.ex:70
 ├─ PageLoader.load
 └─ Pages.composed_tree_json(page)                   pages.ex:116
      └─ meta_json(page) + source: composed_source(page)
           composed_source(page)                     pages.ex:109-114
            ├─ tree = PageSource.tree(page_source(page))            ref tree trong DB
            ├─ Compose.compose(tree, GlobalSections.map_by_id(site))  thay node globalRef = cây section
            ├─ GlobalNodes.Compose.resolve(composed, GlobalNodes.map_by_id(site))  thay node globalNodeRef
            └─ PageSource.encode(composed)                           trả về CHUỖI JSON
```

- Response `data.source` là **chuỗi JSON** của **composed tree** (đã bung header/footer/global node) — editor `JSON.parse` rồi `hydrate`.
- Node thuộc global section được đóng dấu `specials.globalId/globalKind/globalRev`; node thuộc global node có id dạng `"<ref_id>-gn-<id gốc>"` và root đóng dấu `globalNodeId/globalNodeType/globalNodeRev`. Editor dựa vào các dấu này để hiển thị "khối dùng chung" và gửi lại `rev` khi lưu.
- Section đã xoá / rỗng, global node không tồn tại ⇒ node ref **bị bỏ** khỏi composed tree.

### 3.5 `POST /sites/:site_id/pages/:id` — Save (replace toàn bộ tree)

Body: composed tree (`nodes, root_node_id, schema_version`) hoặc `{"source": "<chuỗi>"}`.

```
PageController.update                                   page_controller.ex:86
 ├─ PageLoader.load
 └─ Pages.save_tree(page, params, account.id)           pages.ex:91-107
      ├─ ① {:ok, ref_tree, writes} = params |> PageSource.build_tree() |> Compose.decompose()
      ├─ ② {revs, warnings} = GlobalSections.apply_writes(site_id, writes, actor)
      ├─ ③ GlobalSections.sync_page_refs(site_id, page.id, ref_tree)
      ├─ ④ sync_global_node_page_refs(site_id, page.id, ref_tree)
      └─ ⑤ upsert_source(page, %{source: PageSource.encode(ref_tree)})
 → data = page meta + globals: revs + warnings: warnings
```

Từng bước:

1. **Decompose** (`global_sections/compose.ex:71-93`): duyệt **con trực tiếp của ROOT**; con nào có `specials.globalId` ⇒ cắt cả subtree ra thành một `write = %{id, kind, rev, tree}` và thay bằng node ref `globalRef`. Dấu global nằm sâu hơn (không phải con của ROOT) bị `strip_deep_markers` xoá — chỉ cấp ROOT mới là global section.
2. **apply_writes** (`global_sections.ex:101-125`) với mỗi write:
   - section không tồn tại ⇒ bỏ qua;
   - nội dung giống hệt DB ⇒ không ghi, trả rev hiện tại;
   - `write.rev < section.rev` ⇒ **không ghi**, thêm warning `reason: "stale_global"` (người khác đã sửa header trong lúc bạn mở trang);
   - còn lại ⇒ `save_document` (tăng `rev`).
3. **sync_page_refs**: xoá rồi ghi lại `editor_v2_page_global_refs` theo các `globalRef` trong ref tree.
4. **sync_global_node_page_refs** (`pages.ex:171-174`): compose tạm ref tree với global sections rồi ghi `editor_v2_page_global_node_refs` theo các `globalNodeRef` — kể cả global node nằm **bên trong header/footer**.
5. **upsert** `page_sources` (`pages.ex:123-127`): có row thì update, chưa có thì insert.

Response: `data = page meta + globals: [%{id, rev}] + warnings: [%{global_id, name, reason}]`. Editor dùng `globals` để cập nhật `globalRev` cho lần lưu sau; `warnings` để báo "header đã bị người khác sửa".

> ⚠️ **Global node không được tách lại khi save.** `save_tree` chỉ decompose global **section**. `GlobalNodes.apply_writes/3` (`global_nodes.ex:116`) tồn tại nhưng **không có nơi gọi**. Nếu editor gửi lại tree mà global node vẫn ở dạng đã bung (id `…-gn-…`, `specials.globalNodeId`), backend sẽ lưu nguyên cây đó **inline** vào page source và mất `globalNodeRef` → trang tách khỏi global node. Editor có tự thu gọn global node về node `globalNodeRef` trước khi gửi hay không: **chưa xác minh** ở phía frontend. Sửa nội dung global node đi qua `POST /global_nodes/:id` (chương 03).

> ⚠️ Không có transaction bao các bước ①–⑤: header có thể đã được ghi dù upsert page source lỗi.

### 3.6 `PATCH /sites/:site_id/pages/:id/rename`

`Pages.rename_page/2` (`pages.ex:81-83`): `update_page(page, Map.take(attrs, ["name", "slug"]))`. Chỉ nhận `name`, `slug`; mọi key khác bị bỏ. Không tự sinh slug nếu gửi slug rỗng. Trả page meta.

### 3.7 `PATCH /sites/:site_id/pages/:id/meta` — cập nhật metadata (partial)

`Pages.update_meta/2` (`pages.ex:85-89`):

```elixir
@meta_fields ~w(name slug type order settings)
update_page(page, attrs |> put_encoded_settings() |> Map.take(@meta_fields))
```

- Whitelist: `name, slug, type, order, settings`. **Không** đổi được `is_homepage`, `is_default`, `apply_type` qua đây (`apply_type` đổi qua `PUT /assignment`, chương 04).
- `settings` là map (SEO, …) → `put_encoded_settings` encode thành chuỗi JSON. `settings` **ghi đè toàn bộ**, không merge.

### 3.8 `DELETE /sites/:site_id/pages/:id` — xoá mềm

```elixir
# page_controller.ex:143-153
with {:ok, page} <- PageLoader.load(params),
     :ok <- Pages.ensure_deletable(page),
     {:ok, _} <- Pages.delete_page(page) do
  {:success, :success_only}
else
  {:error, :home_page} -> conflict(conn, "Cannot delete the home page")      # 409
  {:error, :last_page} -> conflict(conn, "Cannot delete the site's only page")  # 409
  other -> other
end
```

- `ensure_deletable` (`pages.ex:176-182`): chặn trang `is_homepage` và khi site chỉ còn ≤ 1 trang.
- `delete_page` = `update is_deleted: true` — **không** xoá `page_sources`, `published_pages`, bảng ref, assignment.

> ⚠️ Vì `published_pages` không bị xoá, **trang đã publish vẫn truy cập được bằng slug cũ** cho tới khi… không có cơ chế nào gỡ: `Published.publish_site` chỉ duyệt các trang chưa xoá, không dọn bản publish của trang đã xoá. Hành vi này **chưa xác minh** là cố ý.

---

## 4. Nodes — sửa lẻ một node

Dùng cho autosave khi chỉ một node đổi (rẻ hơn gửi cả tree). Context: `lib/builderx_api/editor_v2/nodes.ex`.

### 4.1 `PATCH /sites/:site_id/pages/:id/nodes/:node_id`

Body: **phần `data` cần ghi đè** của node (vd `{"style": {...}, "responsive": {"md": {...}}}`).

```
NodeController.update                            node_controller.ex:17
 ├─ patch = Map.drop(params, ["site_id", "id", "node_id"])
 ├─ PageLoader.load
 └─ Nodes.patch_node(page, node_id, patch)       nodes.ex:11-27
      ├─ source = page.source (preload)          không có → :node_not_found
      ├─ doc = PageSource.doc(source); nodes = doc["nodes"]
      ├─ node không có trong nodes → :node_not_found
      ├─ new_data = merge_node_data(node.data, patch)
      └─ save_nodes(source, doc, nodes')         decode–sửa–encode CẢ tree, update page_sources
```

`merge_node_data/2` (:67-76):

```elixir
Enum.reduce(patch, data, fn
  {"responsive", value}, acc when is_map(value) ->
    Map.put(acc, "responsive", deep_merge_map(Map.get(acc, "responsive", %{}), value))
  {key, value}, acc ->
    Map.put(acc, key, value)          # mọi key khác: GHI ĐÈ nguyên giá trị
end)
```

- Chỉ `responsive` được merge sâu, và chỉ **2 tầng** (`deep_merge_map` :78-82: breakpoint → map thuộc tính được `Map.merge` nông). `style`, `config`, `specials`… bị **thay thế toàn bộ** — client phải gửi đủ object.
- Patch ghi vào **ref tree** trong `page_sources`. Node thuộc header/footer hoặc global node **không nằm** trong ref tree ⇒ trả `"Node not found"` (422). Muốn sửa chúng phải save cả trang (header/footer) hoặc qua API global node.
- `save_nodes` (:55-65) `put_new` `root_node_id`/`schema_version` phòng tree thiếu key.
- Không sync bảng ref: nếu patch thêm/bớt `globalNodeRef` trong `specials`, `editor_v2_page_global_node_refs` sẽ lệch tới lần save kế tiếp.

### 4.2 `DELETE /sites/:site_id/pages/:id/nodes/:node_id`

`Nodes.delete_node/2` (:29-49):

1. `collect_subtree_ids` (:84-95) — đệ quy theo `data.nodes` lấy node và mọi hậu duệ.
2. `Map.drop(subtree_ids)` — xoá khỏi map.
3. `detach_from_parent` (:97-114) — đọc `parent` từ **bản gốc**, bỏ `node_id` khỏi `parent.data.nodes`.
4. `save_nodes`.

Lỗi: `"Node not found"` (422). Xoá `ROOT` được phép về mặt code (không có guard) — trang sẽ thành rỗng sau `normalize`.

---

## 5. Versions — lịch sử snapshot

Context: `lib/builderx_api/editor_v2/page_versions.ex`. Controller: `version_controller.ex`.

| Endpoint | Controller | Context | Response |
|---|---|---|---|
| `GET /pages/:id/versions?page=&limit=` | `index` (:33) | `list_versions` + `count_versions` | `data: {data: [version meta], total, page, limit}` |
| `POST /pages/:id/versions` body `{label?}` | `create` (:54) | `create_version(page, account.id, label)` | `data: version meta` |
| `GET /pages/:id/versions/:version_id` | `show` (:71) | `get_version` | `data: version meta + source` hoặc 422 `"Version not found"` |
| `POST /pages/:id/versions/:version_id/restore` | `restore` (:89) | `restore_version` | `data: page meta + source (composed)` |

### 5.1 List

```elixir
# page_versions.ex:13-23
offset = (page_num - 1) * limit
PageVersion
|> where([v], v.site_id == ^page.site_id and v.page_id == ^page.id)
|> order_by([v], desc: v.inserted_at)      # mới nhất trước
|> offset(^offset) |> limit(^limit)
|> preload(:owner)                         # preload nhưng meta_json không trả owner, chỉ owner_id
```

`Params.paging/2` → default `page=1, limit=20`, giá trị ≤ 0 hoặc sai về default. Không có giới hạn `limit` tối đa.

Lưu ý envelope lồng 2 lớp: response là `{"success":true,"data":{"data":[…],"total":…,"page":…,"limit":…}}`.

### 5.2 Create

```elixir
# page_versions.ex:37-51
source = Pages.get_source(page)
source_string = (source && source.source) || PageSource.build_source(%{})   # trang chưa có source → tree rỗng
attrs = %{…, owner_id: owner_id, source: PageVersion.build_source(source_string, label)}
```

- Chụp **bản nháp đang lưu trong DB**, không phải thứ đang mở trên editor. Editor phải Save trước rồi mới tạo version, nếu không snapshot thiếu thay đổi chưa lưu.
- Chụp **ref tree** ⇒ không chứa nội dung header/footer/global node.

### 5.3 Restore

```elixir
# page_versions.ex:53-65
Pages.upsert_source(page, %{page_id: …, site_id: …, source: PageVersion.source_string(version)})
```

Controller sau đó `Pages.get_page` lại và trả `composed_tree_json` để editor `hydrate` ngay.

- Ghi đè bản nháp; **không** tự tạo version cho trạng thái trước khi restore — muốn "undo restore" phải tạo version trước.
- Không gọi `sync_page_refs` ⇒ bảng ref (`usage`) có thể lệch tới lần save kế tiếp.
- Header/footer/global node hiển thị theo **bản hiện tại**, không theo thời điểm snapshot.

---

## 6. Site actions — publish / export / duplicate / import

Controller: `site_controller.ex`. Context: `lib/builderx_api/editor_v2/site_bundles.ex`, `lib/builderx_api/editor_v2/published.ex`.

### 6.1 `POST /sites/:site_id/publish`

```elixir
# site_controller.ex:21-32
case Published.publish_site(site_id, account.id) do
  {:ok, results} ->
    ok = Enum.count(results, &match?({:ok, _}, &1))
    {:success, :with_data, %{published: ok, total: length(results)}}
  _ -> {:failed, :with_reason, "Publish failed"}
end
```

- Publish **mọi trang chưa xoá** của site, từng trang một, không transaction chung. Response `{published, total}` — `published < total` nghĩa là có trang lỗi; API không nói trang nào.
- `publish_site` luôn trả `{:ok, …}` ⇒ nhánh `"Publish failed"` thực tế không chạm tới trừ khi raise (khi đó là 500).
- Chi tiết compile skeleton/CSS/cache: [06 — Publish](./06-publish.md).

### 6.2 `GET /sites/:site_id/export`

`SiteBundles.export/1` (:15-21) trả:

```json
{ "version": 2,
  "pages": [ { "name", "slug", "is_homepage", "type", "order", "schema_version", "root_node_id", "nodes" } ],
  "style_globals": [ { "name", "presets", "style_data", "is_selected" } ] }
```

- `export_pages` (:46-65): mỗi trang `Compose.compose` với global sections ⇒ nội dung header/footer **được nhúng** vào tree export. Global **node** thì **không** resolve — tree vẫn giữ `globalNodeRef` trỏ id của site nguồn.
- Không export: `is_default`, `settings`, `apply_type`, assignment, global node, `published_pages`.

> ⚠️ **Bug:** `export_styles/1` (:67-78) đọc `&1.name`, `&1.presets`, `&1.is_selected` — `StyleGlobal` hiện chỉ có `color_schemes, elements, style_data, is_removed` (migration 20260803). Site có global styling ⇒ **`KeyError` → 500** cho cả `export` và `duplicate`. Site chưa có style thì chạy được.

### 6.3 `POST /sites/:site_id/duplicate` — body `{name (bắt buộc), slug?}`

`SiteBundles.duplicate/4` = `create_from_bundle(account_id, name, slug, export(site_id))` ⇒ mọi hạn chế của export áp dụng ở đây. Thiếu `name` ⇒ `ActionClauseError` (400).

### 6.4 `POST /editor_v2/import` — body `{name, slug?, bundle | file}`

Không qua `:site` (chưa có site). `SiteBundles.read_bundle/1` (:33-44):

- `bundle` là object JSON ⇒ dùng luôn;
- `file` là upload (`Plug.Upload`) ⇒ đọc file, `Jason.decode`; lỗi ⇒ `"Invalid import file"`;
- thiếu cả hai ⇒ `"Missing import bundle"`.

Không có kiểm `bundle["version"] == 2`.

### 6.5 `create_from_bundle/4` — chung cho duplicate & import

```
Repo.transaction                                           site_bundles.ex:80-90
 ├─ create_site(account_id, name, slug)                    :92-110
 │    ├─ slug = slug || Sites.get_new_slug_info(name)["slug"]
 │    ├─ Sites.create_site(%{name, version: 2, persona_or_team: 0, owner_id,
 │    │                      published_at: now, last_editor_id})
 │    ├─ Sites.create_site_slug · SitePermissions.create_full_site_permission
 │    └─ Folders.create_folder_root_of_hosting
 ├─ clone_pages(site.id, account_id, bundle["pages"])      :112-150
 │    ├─ mỗi trang: build_tree |> Compose.decompose()  → {attrs, ref_tree, writes}
 │    ├─ id_map = clone_globals(tất cả writes, …)          :152-176
 │    │    mỗi write (uniq theo id):
 │    │     ├─ kind có trong default (header/footer) và chưa được điền → ghi vào section mặc định của site mới
 │    │     ├─ kind có default nhưng đã điền rồi → bỏ (target = nil)
 │    │     └─ kind khác (custom) → GlobalSections.create rồi ghi
 │    │    → map id cũ → section mới
 │    └─ mỗi trang: create_page(attrs) · remap_refs(ref_tree, id_map) · upsert_source · sync_page_refs
 └─ clone_styles(site.id, bundle["style_globals"])         :178-192
```

Những điểm cần biết:

- **`type` default `0`** (:130): `type: page_attrs["type"] || 0` — `0` **không** thuộc `Enum.PageType` ⇒ bundle thiếu `type` làm `Page.changeset` fail ⇒ **cả import rollback**. Bundle do `export` sinh luôn có `type` nên duplicate không dính.
- `create_page(attrs)` gọi không truyền source ⇒ `seed_source` insert tree rỗng, rồi ngay sau đó `upsert_source` ghi tree thật (2 lần ghi).
- Chỉ header/footer **đầu tiên** gặp được giữ; nếu site nguồn có 2 section `header` khác nhau, trang dùng section thứ hai sẽ mất ref (`remap_refs` không tìm thấy id).
- Không gọi `sync_global_node_page_refs`, không clone global node ⇒ các `globalNodeRef` trỏ id site nguồn ⇒ khi render, `GlobalNodes.Compose.resolve` coi là `:missing` và **xoá node** (menu/popup/cart biến mất ở site mới).
- `clone_styles` truyền `name/presets/is_selected` — changeset chỉ cast `color_schemes, elements, style_data, is_removed, site_id` nên chỉ `style_data` được giữ. Bundle có ≥ 2 style ⇒ insert thứ hai vi phạm unique index `site_id WHERE is_removed = false` ⇒ `Ecto.ConstraintError` (500).
- `published_at: now` được set dù chưa publish trang nào.

---

## 7. Style globals — global styling

Controller: `style_global_controller.ex`. Context: `lib/builderx_api/editor_v2/style_globals.ex`. Mỗi site tối đa **một** row sống (`is_removed = false`, unique index — xem chương 01 mục 7).

| Endpoint | Action | Context | Ghi chú |
|---|---|---|---|
| `GET /style_globals` | `get_global_styling` (:43) | `get_global_styling(site_id)` | `data: style` hoặc `data: null` nếu chưa có |
| `POST /style_globals` | `create_global_styling` (:54) | `create_global_styling(attrs + site_id)` | Đã có row sống ⇒ **500** (`Ecto.ConstraintError`, changeset thiếu `unique_constraint`) |
| `PUT /style_globals` | `update_global_styling` (:69) | `upsert_global_styling(site_id, attrs)` | Có thì update, chưa có thì tạo — **endpoint nên dùng** |
| `DELETE /style_globals` | `delete_global_styling` (:83) | `update … is_removed: true` | Chưa có ⇒ 422 `"Style not found"` |

Body hợp lệ (theo schema thật): `color_schemes` (mảng object), `elements` (object), `style_data` (object). Doc `@body` (:11) còn ghi `name, presets, style_data, is_selected` — **đã lỗi thời**; `name/presets/is_selected` bị changeset bỏ qua âm thầm.

`style_data` là thứ renderer đọc: `Renders.selected_style_data/1` và `Published.selected_style_data/1` đều gọi `StyleGlobals.get_selected(site_id)` → đưa vào `%QwikV2{style_data: …}`. Đổi global styling chỉ hiện ra ở trang public **sau khi publish lại** (CSS được build lúc publish); preview draft thấy ngay.

> ⚠️ **Code chết:** controller còn các action `index`, `create`, `show_selected`, `update_selected`, `update`, `select`, `delete` (:20-169) có `operation` nhưng **không có route** nào trỏ tới. `StyleGlobals.select/2` (:86-91) chỉ `get` rồi trả về, không "chọn" gì. Đây là di sản của mô hình "nhiều style, chọn một" trước migration 20260803.

`get_global_styling/1` dùng `Repo.one` — nếu DB có >1 row sống (trước khi có unique index) sẽ raise `MultipleResultsError`.

---

## 8. `SiteSettings` — cài đặt site dùng khi render

`lib/builderx_api/editor_v2/site_settings.ex`. Không có endpoint riêng; đọc `sites.settings` (chuỗi JSON) khi render.

```elixir
def parse(%{settings: settings}), do: parse(settings)        # :7  nhận Site struct
def parse(settings) when is_map(settings), do: settings
def parse(settings) when is_binary(settings), do: Doc.decode(settings)
def parse(_), do: %{}

def font_general(settings)                                    # :19  "fontGeneral" hoặc "Inter"
def fonts_head(settings)                                      # :26
```

`fonts_head/1` sinh HTML chèn vào `<head>`:

1. 2 thẻ `preconnect` tới Google Fonts;
2. `<link rel="stylesheet">` Google Fonts với weight `300,400,500,600,700` — **chỉ khi** font nằm trong `Qwik.GoogleFonts.fonts()` (danh sách của v1); font tuỳ chỉnh không có link;
3. `<style>body{font-family:'<font>',sans-serif}</style>`.

Được gọi từ `Renders.assign_render_context/1` và `Renders.render_doc/2` (xem chương render).

---

## 9. OpenAPI / Swagger

| File | Vai trò |
|---|---|
| `lib/builderx_api_web/api_spec.ex` | Build spec: lấy **mọi route có `/editor_v2` trong path** (`Router.__routes__/0` — Phoenix 1.5), `Paths.from_routes/1`, tag order, security `bearer JWT` mặc định |
| `lib/builderx_api_web/controllers/v1/editor_v2/docs.ex` | Helper viết `operation` ngắn: `path/1`, `query/1`, `json_body/1`, `ok/1`, `list/1`, `paged/1`, `wrapped_list/1`, `success_only/0`, `resp/1` |
| `lib/builderx_api_web/controllers/v1/editor_v2/schemas.ex` | Schema OpenAPI: `Product, Category, BlogCategory, Article, Page, PageVersion, StyleGlobal, GlobalNode, GlobalSection, PageAssignment, Error` + `publish_result/0`, `site_bundle/0`, `site_ref/0` |
| `lib/builderx_api_web/controllers/v1/editor_v2/validation_error.ex` | `render_error` cho `OpenApiSpex.Plug.CastAndValidate` — đổi lỗi validate thành `400 {success:false, reason:"path: message; …", fallback:"with_reason"}` |
| `test/builderx_api_web/api_spec_test.exs` | Guard CI: mọi action của route `/editor_v2` phải có `operation` |

Truy cập (router.ex:92-100, pipeline `:openapi`, **không cần auth**):

- `GET /api/v1/openapi` — spec JSON
- `GET /api/v1/swaggerui` — giao diện; bấm **Authorize** dán JWT để gọi thử.

`Docs.resp/1` (`docs.ex:106-120`) — quy ước khai response:

```elixir
{code, {desc, :html}}               → text/html
{code, {desc, schema}}              → application/json + schema
{code, desc} when code >= 400       → application/json + Schemas.Error   (tự gắn)
{code, desc}                        → chỉ description
```

Hai điều cần nhớ:

- **Thêm route mới dưới `/editor_v2` mà quên `operation`** ⇒ `Paths.from_routes/1` raise ⇒ `/api/v1/openapi` và swaggerui **sập** (test trên bắt được ở CI).
- `CastAndValidate` + `ValidationError` hiện **chỉ** gắn ở 4 controller Bindings. Các controller Page/Node/Version/Site/StyleGlobal **không validate** body theo spec — spec chỉ để đọc.

---

## 10. Bảng tổng hợp lỗi

| Tình huống | HTTP | Body |
|---|---|---|
| Thiếu/sai JWT | 401 | text |
| Không có quyền site / site không tồn tại | 404 | text `"Site not found"` / `"Site permission not found"` |
| Page không tồn tại / v1 / đã xoá | 422 | `reason: "Page not found"` |
| Node không có trong page source | 422 | `reason: "Node not found"` |
| Version không tồn tại | 422 | `reason: "Version not found"` |
| Xoá trang chủ / trang cuối | 409 | `reason: "Cannot delete the home page"` / `"...only page"` |
| Lỗi changeset (slug trùng, type sai…) | 422 | `errors` từ `ChangesetView` |
| Thiếu param bắt buộc trong pattern (`pages`, `name`) | 400 | `Phoenix.ActionClauseError` |
| Validate Bindings sai | 400 | `reason: "<path>: <message>"` |
| Unique index không khai trong changeset (style global) | 500 | |

---

## 11. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Mọi request trả 404 text | `SitePlug`: account không sở hữu site / thiếu `site_permissions` |
| Client nhận 422 thay vì 404 khi page không có | Đúng hành vi: `PageLoader` trả `{:failed, :with_reason, …}` |
| Save xong mở lại mất header/footer | Header không phải con trực tiếp của ROOT → `strip_deep_markers` xoá dấu; hoặc section rỗng → compose bỏ |
| Save xong response có `warnings: stale_global` | Rev header trên editor cũ hơn DB → header **không** được ghi; reload trang |
| Menu/popup (global node) bị nhân bản thành nội dung thường sau khi save | Editor gửi global node dạng đã bung; backend không decompose global node (mục 3.5) |
| PATCH node trả "Node not found" dù node hiện trên canvas | Node thuộc header/footer/global node — không có trong ref tree |
| PATCH node làm mất style cũ | Chỉ `responsive` được merge; `style/config/specials` bị ghi đè nguyên object |
| Version tạo ra thiếu thay đổi vừa làm | Chưa Save trước khi tạo version — snapshot đọc từ DB |
| Export / duplicate 500 `KeyError` | `SiteBundles.export_styles/1` dùng field cũ |
| Import fail, không rõ lý do | Trang trong bundle thiếu `type` → default `0` không hợp lệ |
| Site nhân bản mất menu/popup | Global node không được clone (mục 6.5) |
| Tạo global styling lần 2 bị 500 | Dùng `PUT /style_globals` (upsert) thay vì `POST` |
| Đổi global styling không thấy ở trang public | Chưa publish lại |
| `/api/v1/swaggerui` trắng / 500 | Có route `/editor_v2` thiếu `operation` — chạy `mix test test/builderx_api_web/api_spec_test.exs` |
| Trang đã xoá vẫn mở được bằng URL public | `delete_page` không đụng `published_pages` (mục 3.8) |

---

## 12. Điểm bất thường đã phát hiện

1. Spec OpenAPI ghi `404` cho "không tìm thấy" nhưng thực tế trả **422** (mọi controller dùng `PageLoader`/`{:failed, :with_reason}`).
2. `GlobalNodes.apply_writes/3` không có nơi gọi; `save_tree` không decompose global node.
3. `save_tree` không chạy trong transaction; ghi global section trước rồi mới upsert page source.
4. `StyleGlobalController`: 7 action không có route (code chết); `@body` mô tả field đã bỏ; `StyleGlobals.select/2` không làm gì; `create_global_styling` 500 khi đã có row.
5. `SiteBundles.export_styles/1` / `clone_styles/2` dùng schema cũ (`name, presets, is_selected`) ⇒ export/duplicate 500 khi site có style; import nhiều style 500.
6. `SiteBundles.clone_pages/3`: default `type: 0` không hợp lệ; không clone global node / `is_default` / `settings` / assignment; ghi source 2 lần.
7. `delete_page` là xoá mềm và không gỡ `published_pages`.
8. `restore_version` và `patch_node` không sync bảng ref.
9. `Published.publish_site/2` luôn `{:ok, _}` nên nhánh `"Publish failed"` của controller gần như không chạm tới.
10. `published.ex:119-130`: hai `@doc` liền nhau, `@doc` đầu mồ côi (Elixir cảnh báo redefine `@doc`).
