---
sidebar_position: 7
title: "06 — Publish"
---

# 06 — Publish

> **Cho BA:** Khi chủ shop bấm **Xuất bản**, hệ thống chụp lại **toàn bộ các trang** của site ở trạng thái hiện tại và "đóng gói" sẵn thành HTML + CSS. Khách truy cập sẽ thấy bản đóng gói này; bản nháp trong editor vẫn sửa tiếp được mà không ảnh hưởng trang đang chạy.
> Phần **khung tĩnh** (chữ, ảnh, bố cục) được đóng băng lúc publish. Phần **dữ liệu động** (giá, tên sản phẩm, danh sách bài viết…) để trống chỗ và được điền **mỗi lần có khách vào** — nên đổi giá sản phẩm không cần publish lại, nhưng sửa chữ/bố cục thì phải publish lại.
> Publish luôn là **cả site**, không có publish từng trang qua API.

Luồng tổng:

```
POST /api/v1/editor_v2/sites/:site_id/publish
 └─ SiteController.publish                                  site_controller.ex:21
     └─ Published.publish_site(site_id, account_id)         published.ex:18
         ├─ style_data = global styling đang chọn
         ├─ globals    = mọi global section của site
         ├─ for page in Pages.list_pages(site_id):  publish_page(...)   ← tuần tự
         │    ├─ ① compose global sections + resolve global nodes → tree đầy đủ
         │    ├─ ② QwikV2.Compile.compile → skeleton + dynamic_nodes + refs + scripts
         │    ├─ ③ publish_css → upload CSS lên MinIO (fallback <style> inline)
         │    ├─ ④ insert_or_update published_pages
         │    ├─ ⑤ GlobalNodes.sync_page_refs
         │    └─ ⑥ SkeletonCache.invalidate (Redis)
         └─ Sites.update_site(published_at: now)
```

---

## 1. Controller — `SiteController.publish`

`lib/builderx_api_web/controllers/v1/editor_v2/site_controller.ex:21-32`

```elixir
def publish(conn, %{"site_id" => site_id}) do
  account = conn.assigns.account

  case Published.publish_site(site_id, account.id) do
    {:ok, results} ->
      ok = Enum.count(results, &match?({:ok, _}, &1))
      {:success, :with_data, %{published: ok, total: length(results)}}
    _ ->
      {:failed, :with_reason, "Publish failed"}
  end
end
```

- Route nằm trong scope `/sites/:site_id` có `pipe_through [:site]` ⇒ đã kiểm account sở hữu site.
- Response `{ published, total }`: **một trang lỗi không làm fail cả request**, chỉ làm `published < total`. FE nên so hai số này.
- `publish_site` hiện **luôn** trả `{:ok, results}` nên nhánh `_ -> "Publish failed"` thực tế chỉ xảy ra nếu hàm đổi trong tương lai. Nếu có **exception** (raise) trong lúc render một trang thì không có `rescue` nào → request trả 500 và các trang sau **không được publish** (các trang trước đó đã ghi DB rồi).

---

## 2. `Published.publish_site/2`

`lib/builderx_api/editor_v2/published.ex:18-32`

```elixir
def publish_site(site_id, account_id) do
  style_data = selected_style_data(site_id)        # (1)
  globals = GlobalSections.map_by_id(site_id)       # (2)

  results =
    site_id
    |> Pages.list_pages()                           # (3)
    |> Enum.map(&publish_page(&1, account_id, style_data, globals))

  with {:ok, site} <- Sites.get_site_by_id(site_id) do
    Sites.update_site(site, %{published_at: NaiveDateTime.utc_now()})   # (4)
  end

  {:ok, results}
end
```

1. `selected_style_data/1` (:182-187): global styling (màu, font, kiểu chữ preset) đang được chọn của site; không có thì `%{}`. Đọc **một lần** cho mọi trang.
2. `GlobalSections.map_by_id/1`: map `%{id => %GlobalSection{}}` — đọc một lần, truyền xuống để khỏi query lại mỗi trang.
3. `Pages.list_pages/1` (`lib/builderx_api/editor_v2/pages.ex:21-29`): chỉ trang **editor_v2, `is_deleted == false`**, sort `order, inserted_at`. Chạy **tuần tự** (`Enum.map`), không song song.
4. `published_at` chỉ được cập nhật **sau khi** `Enum.map` chạy xong. Trang lỗi dạng `{:error, changeset}` không chặn vòng lặp → `published_at` vẫn cập nhật dù trang đó chưa publish. Trang **raise** (không có `rescue`) → cả request 500, các trang trước đã ghi DB, các trang sau bị bỏ, `published_at` **không** cập nhật.

> ⚠️ **Trang đã xoá vẫn online.** `Pages.delete_page/1` chỉ set `is_deleted: true` (`pages.ex:77-79`); không chỗ nào xoá dòng `published_pages` tương ứng, và `publish_site` chỉ duyệt trang chưa xoá. ⇒ Dòng published cũ vẫn còn và **vẫn được serve** theo slug (`Published.get_by_slug`). Đã grep toàn bộ `lib/`, không thấy nơi dọn.

---

## 3. `Published.publish_page/4` — từng dòng

`lib/builderx_api/editor_v2/published.ex:34-85`

### 3.1 Dựng tree đầy đủ (dòng 35-41)

```elixir
globals = globals || GlobalSections.map_by_id(page.site_id)
{:ok, ref_tree} = Compose.compose(PageSource.tree(Pages.get_source(page)), globals)
global_node_map = GlobalNodes.map_by_id(page.site_id)
tree = GlobalNodes.Compose.resolve(ref_tree, global_node_map)
nodes = tree["nodes"]
root_id = tree["root_node_id"]
schema_version = tree["schema_version"]
```

| Dòng | Làm gì | Tại sao |
|---|---|---|
| 35 | Cho phép gọi `publish_page` lẻ (test gọi `publish_page(page, nil, %{})`) | Không có `globals` thì tự đọc |
| 36 | `Pages.get_source(page)` → `PageSource.tree/1` chuẩn hoá về `%{schema_version, root_node_id, nodes}`. Source `nil` ⇒ tree rỗng, không crash | Draft lưu ở bảng `page_sources` |
| 36 | `GlobalSections.Compose.compose/2`: con **trực tiếp của ROOT** có `specials.globalRef` ⇒ thay bằng cây của global section (header/footer dùng chung). Ref trỏ tới section không tồn tại / rỗng ⇒ **bỏ node đó** | Section chung sửa một chỗ, mọi trang dùng |
| 37-38 | `GlobalNodes.Compose.resolve/2`: node **ở bất kỳ độ sâu** có `specials.globalNodeRef` ⇒ thay bằng cây của global node; ref hỏng ⇒ gỡ khỏi parent | "Symbol" dùng chung ở cấp element |
| 39-41 | Lấy `nodes`, `root_id`, `schema_version` từ tree đã resolve | |

Lưu ý: biến `ref_tree` (**trước** resolve global node) được giữ lại để dùng ở bước ⑤. Chi tiết compose/resolve: [03](./03-global-sections-nodes.md).

**Kết quả quan trọng:** nội dung global section / global node bị **"đóng băng" vào bản published** tại thời điểm publish. Sửa global section sau đó ⇒ phải publish lại.

### 3.2 Build context và compile (dòng 43-52)

```elixir
qwik = %QwikV2{nodes: nodes, root_id: root_id, style_data: style_data, page: page, site: page.site_id}

artifact = QwikV2.Compile.compile(qwik)
css = publish_css(qwik)
```

- `%QwikV2{}` là struct context cho engine render (`lib/qwik_v2/qwik_v2.ex:6-19`). Lúc publish **không** có `lang`, `currency`, `refs`, `product`… (dùng default `"en"`, `"VND"`, `%{}`). Điều này an toàn vì mọi chỗ đọc `lang`/`currency` (`Binding` — `data/binding.ex:116,176`) chỉ chạy trong node động, mà node động **không render** lúc compile (mục 4).
- `compile` và `publish_css` là hai lượt đi độc lập trên cùng `qwik`: một cho HTML, một cho CSS.

### 3.3 Ghi DB (dòng 54-79)

```elixir
attrs = %{
  site_id:, page_id:, slug:, is_homepage:, type:,
  is_default: page.is_default == true,
  app_css: css,                                   # chuỗi <link …> hoặc <style>…</style>
  js_version: QwikV2.Runtime.current_version(),   # version bundle JS lúc publish
  created_by: account_id,
  source: PublishedPage.build_source(%{
    "name", "schema_version", "root_node_id",
    "skeleton", "dynamic_nodes", "refs", "scripts"
  })
}

(get_by_page(page.site_id, page.id) || %PublishedPage{})
|> PublishedPage.changeset(attrs)
|> Repo.insert_or_update()
```

- **Một trang ⇄ một dòng** `published_pages` (unique `site_id, page_id`). Publish lại ⇒ update dòng cũ, **không giữ lịch sử** published (lịch sử nằm ở `page_versions`, xem [01](./01-data-model.md)).
- `slug`, `is_homepage`, `type`, `is_default` được **copy** từ page ⇒ render public tra cứu thẳng bảng `published_pages`, không join `pages`. Hệ quả: đổi slug trong editor mà chưa publish ⇒ URL cũ vẫn chạy, URL mới 404.
- `is_default: page.is_default == true` ép `nil` thành `false`.
- `source` (`PublishedPage.build_source/1`, `published_page.ex:47-57`) là **JSON string** lưu kiểu `CompressedText` (nén trong DB). Mọi key thiếu đều có default (`skeleton: []`, `dynamic_nodes: %{}`, `refs: %{}`, `scripts: ""`, `root_node_id: "ROOT"`, `schema_version: 1`).
- Cột `app` của schema **không được ghi** ở đây (còn sót từ thiết kế cũ — chưa xác minh có nơi khác dùng).

### 3.4 Đồng bộ ref global node + xoá cache (dòng 81-84)

```elixir
GlobalNodes.sync_page_refs(page.site_id, page.id, ref_tree)
QwikV2.SkeletonCache.invalidate(page.site_id, page.id)
result
```

- `sync_page_refs/3` (`lib/builderx_api/editor_v2/global_nodes.ex:99-114`): xoá hết dòng `page_global_node_refs` của trang, rồi insert lại theo `Compose.referenced_ids(ref_tree)` (các `globalNodeRef` còn trong tree **trước khi resolve**). Bảng này trả lời câu hỏi "global node X đang được trang nào dùng" (API `/global_nodes/:id/usage`, và để invalidate cache).
- Lưu ý: `sync_page_refs` chạy **sau** `insert_or_update` và **bất kể** insert thành công hay không.
- `invalidate` xoá key Redis để request kế tiếp đọc bản mới (mục 6).

---

## 4. `QwikV2.Compile.compile/1` — tách tĩnh / động

`lib/qwik_v2/compile.ex:10-31`

### 4.1 Vì sao phải tách

Nếu lưu nguyên HTML đã render thì giá sản phẩm bị đóng băng. Nếu mỗi request render lại toàn bộ tree thì tốn CPU (trang vài trăm node, mỗi node tính style, escape, v.v.). Giải pháp:

- Node **tĩnh** (section, heading, text, image…) → render **một lần lúc publish** thành chuỗi.
- Node **động** (phụ thuộc dữ liệu shop) → **không render**, để lại một "lỗ" `%{"slot" => id}` và cất node JSON vào `dynamic_nodes`.
- Mỗi request chỉ lấp các lỗ (`Compile.assemble`, xem [07](./07-render-request.md)).

### 4.2 Code

```elixir
def compile(%QwikV2{} = ctx) do
  QwikV2.with_ctx(ctx, fn ->
    Process.put(@flag, true)          # bật "chế độ compile"
    Process.put(@nodes, %{})          # nơi cất node động
    Process.put(@refs, %{})           # nơi gom explicit ref
    Process.put(@runtime, false)      # có cần JS runtime không

    try do
      %{
        skeleton: segments(HTML.app()),
        dynamic_nodes: Process.get(@nodes),
        refs: Map.new(Process.get(@refs), fn {type, set} -> {type, MapSet.to_list(set)} end),
        scripts: QwikV2.Scripts.tags(ctx.nodes)
      }
    after
      # dọn cả 4 key process dict
    end
  end)
end
```

- Tất cả trạng thái compile nằm trong **process dictionary** (không truyền tham số xuyên qua mọi hàm render). `after` đảm bảo dọn dẹp kể cả khi raise.
- `HTML.app()` (`lib/qwik_v2/html.ex:4`) render từ `root_id` đệ quy. Kết quả là **iodata** (list lồng) — trong đó các node động trả về map `%{"slot" => id}` thay cho chuỗi.
- `refs`: `MapSet` → list để JSON được.
- `scripts` gọi **sau** `HTML.app()` trong cùng map literal: nó đọc cờ `@runtime` mà render vừa bật. `RootCanvas.HTML` luôn emit `x:now="Global"` (`nodes/root_canvas/html.ex`) ⇒ gọi `Common.x_now` ⇒ `Compile.mark_runtime()` (`common.ex:40-45`) ⇒ **thực tế mọi trang có ROOT đều nhúng loader JS**. Test: `test/qwik_v2/scripts_test.exs:66-80`.

### 4.3 Node nào bị capture?

`Compile.active?/0` = "đang compile". Mỗi node động kiểm tra cờ này ở đầu `build/2`:

| Node type | Gọi | Cất kèm | Vì sao cần kèm |
|---|---|---|---|
| `text-dataset` | `capture/2` | chỉ node | leaf |
| `pricing-dataset` | `capture/2` | chỉ node | leaf (xem ⚠️ bên dưới) |
| `quantity-dataset` | `capture/2` | chỉ node | leaf |
| `product-variants` | `capture_children/2` | `data._children_nodes` = list node con trực tiếp | render cần label + option con |
| `media-dataset` | `capture_children/2` | `data._children_nodes` | cần `product-image-feature` / `product-image-list` con |
| `dataset-block` | `capture_subtree/2` | `data._subtree` = map **mọi hậu duệ** | render lại cả cây con theo entity |
| `list-dataset` | `capture_subtree/2` | `data._subtree` | render khuôn con N lần |

(Tìm bằng `grep -rn "Compile.active?" lib/qwik_v2/nodes`.)

Vì sao phải cất node con? Lúc **assemble**, context chỉ có `lang/currency/refs/entity` — `ctx.nodes` **rỗng** (`render_controller.ex:186-190`). Node động phải tự mang đủ dữ liệu cây con của mình:

- `Compile.children/2` (`compile.ex:91-96`) đọc `_children_nodes` nếu có, không thì tra `ctx.nodes` (đường draft).
- `Compile.with_subtree/2` (`compile.ex:80-89`) merge `_subtree` vào `ctx.nodes` tạm thời trong lúc render node đó.

```elixir
def capture(id, node) do
  Process.put(@nodes, Map.put(Process.get(@nodes, %{}), id, node))       # cất node
  case Binding.explicit_ref(Binding.first(node["data"] || %{})) do
    nil -> :ok
    {type, ref_id} -> add_ref(type, ref_id)                              # gom ref
  end
  %{"slot" => to_string(id)}                                             # trả "lỗ"
end
```

`add_ref/2` (:50-56) bỏ qua id `nil`/`""`, gom theo type vào `MapSet` (tự khử trùng).

> ⚠️ **Nghi vấn (chưa xác minh bằng test):**
> 1. `pricing-dataset` dùng `capture/2` (không kèm con) nhưng khi **có node con** thì lúc render gọi `Common.children(data)` → `HTML.render(child_id)` tra `ctx.nodes` — rỗng khi assemble ⇒ **con biến mất trên trang published** (preview draft vẫn thấy). Không bị nếu pricing-dataset nằm trong dataset-block/list-dataset (vì `with_subtree` đã merge).
> 2. `capture/2` chỉ gom ref của **chính node**; binding explicit của hậu duệ trong `_subtree` / `_children_nodes` không vào `refs` (xem [05 §4.1](./05-bindings.md)).

### 4.4 `segments/1` và `coalesce/1` — làm phẳng iodata

`compile.ex:125-139`

```elixir
iodata |> List.wrap() |> List.flatten() |> coalesce()

defp coalesce(flat) do
  flat
  |> Enum.chunk_by(&match?(%{"slot" => _}, &1))
  |> Enum.flat_map(fn
    [%{"slot" => _} | _] = slots -> slots                 # giữ nguyên từng slot
    chunk -> [IO.iodata_to_binary(chunk)]                 # gộp chuỗi liền nhau thành 1
  end)
end
```

Kết quả: list xen kẽ **chuỗi HTML** và **map slot**, số phần tử tối thiểu.

### 4.5 Ví dụ

Tree (rút gọn):

```
ROOT (root)
 └─ sec1 (flex-section)
     ├─ h1 (heading, text "Áo thun")
     └─ td1 (text-dataset, bindings[0].target = {type: product, kind: price, id: "9f…uuid"})
```

Skeleton lưu trong `published_pages.source` (HTML rút gọn, bỏ bớt attribute):

```json
[
  "<div class=\"main\" id=\"ROOT\" data-node-type=\"root\" x:now=\"Global\"><section class=\"wk-flex-section-wrapper\" id=\"sec1\" data-node-type=\"flex-section\" canvas-node-wrapper><div class=\"wk-flex-section\" canvas-flex><h2 class=\"wk-heading\" id=\"h1\" data-node-type=\"heading\" canvas-node-wrapper>Áo thun</h2>",
  {"slot": "td1"},
  "</div></section></div>"
]
```

```json
"dynamic_nodes": { "td1": { "data": { "type": "text-dataset", "bindings": [ … ] , … } } },
"refs":          { "product": ["9f…uuid"] },
"scripts":       "<script>window.xbase=\"https://…/js/editor_v2/<ver>/\"</script>\n<script type=\"module\" src=\"…/Loader.js\"></script>"
```

Mỗi request: fetch product `9f…uuid` vào `ctx.refs`, gọi `TextDataset.HTML.build("td1", node)` ⇒ `<p …><span class="text">250.000 ₫</span></p>`, nối 3 phần lại ⇒ HTML hoàn chỉnh.

---

## 5. `publish_css/1` — CSS

`lib/builderx_api/editor_v2/published.ex:87-94`

```elixir
defp publish_css(%QwikV2{} = qwik) do
  bundle = QwikV2.bundle(qwik)
  case QwikV2.Assets.upload_bundle(bundle) do
    {:ok, links} -> links
    _ -> "<style>#{QwikV2.CSS.bundle_to_inline(bundle)}</style>"
  end
end
```

### 5.1 `QwikV2.bundle/1` → `QwikV2.CSS.bundle/0`

`lib/qwik_v2/css.ex:16-48` — **CSS được tính cho mọi node, kể cả node động** (đi `ctx.nodes` phẳng, không đi cây), nên CSS đầy đủ ngay lúc publish.

```
bundle()
 ├─ frags = node_fragments(ctx.nodes)              :50-62
 │     mỗi node: Registry.css_mod(type).rule(id, node)  + Hidden.fragments("#id", node)
 │     → list {:base, css} | {:state, css} | {:media, query, css}
 ├─ static = StaticCSS.app() + static_components(nodes)   → Minify
 │     static_components: chỉ CSS tĩnh của các type THỰC SỰ có trong trang  :69-84
 ├─ all    = Global.css(style_data) + bases + states      → Minify
 └─ media  = theo thứ tự Responsive.media_order(), mỗi query gộp css → Minify, bỏ rỗng
→ %{static: "...", all: "...", media: [{query, css}, …]}
```

Chi tiết CSS từng node / responsive: [09](./09-qwik-css.md).

### 5.2 `QwikV2.CSS.Minify.run/1`

`lib/qwik_v2/css/minify.ex` — minifier tự viết, **không** dùng lib ngoài:

- `tokenize/4` là state machine 3 trạng thái: `:normal`, `:comment`, `{:string, quote}`. Comment `/* */` bị bỏ; chuỗi trong `"…"`/`'…'` giữ **nguyên văn** (kể cả escape `\x`).
- `tighten/1` chỉ áp lên đoạn `:normal`: gộp whitespace, bỏ space quanh `{ } ; ,`, bỏ space sau `:`, `;}` → `}`.
- Giới hạn đã biết: `tighten` bỏ space sau **mọi** dấu `:` trong đoạn normal (kể cả selector như `a :hover` → `a:hover`, đổi nghĩa). Chưa xác minh CSS sinh ra có dạng này.

### 5.3 `QwikV2.Assets.upload_bundle/1`

`lib/qwik_v2/assets.ex:8-36`

```
upload_css(static, "static", "all")
upload_css(all, Responsive.default_bp(), "all")
upload_css(css, Responsive.bp_for_query(query), query)   cho mỗi media query
    │
    ├─ css == ""  → {:ok, ""}   (không upload file rỗng)
    └─ key = "css/editor_v2/<bp>-<hash9>.css"
         Minio.upload(key, css, "text/css", cache_control: "public, max-age=31536000, immutable")
         → <link rel="stylesheet" href="https://<host>/<bucket>/<key>" media="<query|all>" />
```

- **Tên file theo hash nội dung** (`Tools.get_hash` = 9 ký tự đầu của sha256) ⇒ CSS giống nhau giữa các trang/lần publish dùng chung một file; nhờ vậy cache `immutable` 1 năm an toàn.
- Mỗi breakpoint một file + thuộc tính `media` ⇒ trình duyệt vẫn tải nhưng **không chặn render** với file media không khớp.
- Một file lỗi ⇒ `with` dừng ⇒ fallback **toàn bộ** CSS inline `<style>` (`bundle_to_inline/1`, `css.ex:8-14`: `static`, `all`, rồi mỗi media bọc `@media query{…}`). Trang vẫn hiển thị đúng, chỉ nặng HTML hơn.
- Kết quả (`app_css`) là **chuỗi HTML** chèn thẳng vào `<head>` lúc render (`render_controller.ex:198`).

---

## 6. `js_version` và `QwikV2.Runtime`

`lib/qwik_v2/runtime.ex`

- `current_version/0` (:7-22): đọc `:persistent_term`; lần đầu thì HTTP GET `https://<minio>/<bucket>/js/editor_v2/current.json` (timeout 5s), lấy `{"current": "<ver>"}` và cache vĩnh viễn trong node BEAM. Fetch lỗi ⇒ `nil` và **không cache** (lần sau thử lại).
- `base_path/0` (:24-35): config `:qwik_v2_asset_base` (dev: Vite `http://localhost:39990/render_v2/`) ưu tiên; không có thì `…/js/editor_v2/<ver>/`; không có version thì `/render_v2/`.
- `reload/0` xoá cache — cần gọi sau khi upload bundle JS mới, nếu không node đang chạy vẫn dùng version cũ.

Ý nghĩa của `js_version` trong `published_pages`: `scripts` (chuỗi `<script src=…/<ver>/Loader.js>`) đã **ghim cứng URL version** lúc publish. Trang publish trước khi có bundle JS mới vẫn trỏ bundle cũ. Để chuyển hàng loạt sang version mới mà không bắt user publish lại: `mix qwik_v2.repin_assets [--site ID] [--to VER]` (`lib/mix/tasks/qwik_v2_repin_assets.ex`) — regex thay prefix URL trong `source["scripts"]`, cập nhật `js_version`, rồi `SkeletonCache.invalidate`. Chi tiết build/upload JS: [10](./10-render-v2-js.md).

---

## 7. `QwikV2.SkeletonCache` — cache Redis

`lib/qwik_v2/skeleton_cache.ex`

| Hàm | Dòng | Làm gì |
|---|---|---|
| `key/2` | 6 | `"qv2:skeleton:<site_id>:<page_id>"` |
| `get_or_load/3` | 8-16 | Redis hit + JSON hợp lệ có key `"skeleton"` ⇒ trả; miss/hỏng ⇒ `reload` |
| `reload/3` | 25-29 | gọi `loader` (decode `published_pages.source`), `SET` với TTL **86 400s (1 ngày)**, trả bản đã round-trip JSON |
| `invalidate/2` | 23 | `DEL` key |
| `put/3` | 18-21 | set thủ công (hiện không thấy nơi gọi) |

- Vì sao cache: `source` lưu `CompressedText` — mỗi request phải đọc DB + giải nén + `Jason.decode` một JSON lớn. Redis giữ JSON sẵn.
- `normalize/1` round-trip JSON để artifact từ DB và từ Redis **cùng shape** (key string) — `Compile.assemble` có clause cho cả atom lẫn string key nhưng giữ một shape cho chắc.
- Nơi invalidate: `Published.publish_page`, `GlobalNodes` khi lưu global node (`global_nodes.ex:86-90`, theo `page_global_node_refs`), `repin_assets`.

> Ghi chú: invalidate khi **lưu global node** chỉ xoá cache Redis; nội dung global node đã được resolve cứng vào `published_pages.source` lúc publish ⇒ lần tải sau vẫn ra **nội dung cũ** cho tới khi publish lại. Invalidate ở đây không gây hại nhưng cũng không làm trang cập nhật.

Lưu ý: `get_or_load` được gọi **bên trong** `RenderController.serve_published_artifact` *sau khi* đã đọc dòng `PublishedPage` (để biết `site_id/page_id`, `app_css`) — cache chỉ tiết kiệm bước decode `source`, không tiết kiệm query DB đó.

---

## 8. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Publish trả `published < total` | `insert_or_update` lỗi cho trang nào — changeset `published_pages` (thiếu `site_id/page_id`, trùng unique) |
| Publish trả 500, chỉ một phần trang được cập nhật | Exception khi render một trang (node HTML/CSS module raise). Không có rescue trong `publish_site` — xem log stacktrace, trang lỗi là trang kế tiếp sau trang cuối có `updated_at` mới |
| Sửa chữ/bố cục, khách chưa thấy | Chưa publish lại; hoặc cache Redis chưa xoá (`qv2:skeleton:<site>:<page>`) |
| Sửa giá sản phẩm, khách chưa thấy | Không phải do publish (giá lấy runtime). Xem [05](./05-bindings.md) |
| Sửa header (global section) mà trang không đổi | Global được đóng băng lúc publish ⇒ publish lại cả site |
| Đổi slug, URL mới 404 | `slug` trong `published_pages` chỉ cập nhật khi publish |
| Trang đã xoá vẫn truy cập được | Dòng `published_pages` không bị xoá (mục 2) |
| CSS inline `<style>` to thay vì `<link>` | `Minio.upload` lỗi ⇒ fallback. Kiểm config `:builderx_api, Minio` và kết nối MinIO |
| JS trang cũ trỏ bundle cũ / 404 | `scripts` ghim version lúc publish; chạy `mix qwik_v2.repin_assets` hoặc publish lại; kiểm `current.json` |
| Node trong pricing-dataset biến mất trên trang thật, preview vẫn thấy | Nghi vấn §4.3 — `capture/2` không cất node con |
| Element dataset trên trang thật trống mà preview có | Node không nằm trong danh sách capture (thêm type mới quên `Compile.active?`) ⇒ bị render tĩnh lúc publish với `ctx.refs` rỗng. Hoặc ref của node con không vào `refs` |
