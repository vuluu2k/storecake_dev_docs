---
sidebar_position: 2
title: "01 — Mô hình dữ liệu"
---

# 01 — Mô hình dữ liệu

Chương này mô tả **mọi bảng, schema Ecto và định dạng JSON** mà Editor V2 dùng ở backend `builderx_api`: trang lưu ở đâu, bản nháp khác bản publish thế nào, header/footer dùng chung được tách ra sao.

> **Cho BA:**
> - Mỗi site có một cờ "thế hệ editor": site cũ là **v1**, site tạo bằng editor mới là **v2**. Hai thế hệ dùng chung bảng trang, phân biệt bằng cột `version`.
> - Một trang có 3 "bản": **bản nháp** (đang sửa, lưu liên tục), **các bản lưu lịch sử** (người dùng bấm "lưu phiên bản" để quay lại sau), và **bản đã publish** (khách truy cập thấy). Sửa nháp không làm thay đổi bản khách đang xem cho tới khi bấm Publish.
> - Header/footer và một số khối (menu, popup, giỏ hàng…) là **khối dùng chung**: sửa một lần, mọi trang đều đổi theo.
> - Trang sản phẩm / danh mục / bài viết / blog là **trang mẫu**: một trang mẫu có thể được **gán** cho tất cả, cho một số danh mục, hoặc cho từng sản phẩm cụ thể.
> - Kiểu chữ, màu toàn site (**global styling**) lưu riêng, mỗi site một bản đang dùng.

Snapshot: branch `feat-builder-v2`, commit `3e3eeacb5` (2026-09-23). Đường dẫn file tính từ root `builderx_api`.

---

## 1. Bức tranh tổng

```
                        sites (version: 1 = v1, 2 = v2)
                          │ 1
     ┌────────────────────┼──────────────────────────┬───────────────────────────┐
     │ n                  │ n                        │ 1 (is_removed=false)      │ n
   pages (version=2)   editor_v2_global_sections  editor_v2_style_globals   editor_v2_global_nodes
     │  │  │  │           (header/footer/custom)                              (menu/filter_set/popup/cart)
     │  │  │  │                  ▲                                                   ▲
     │  │  │  └─ n ── editor_v2_page_global_refs ──┘ (page ↔ global section)         │
     │  │  └──── n ── editor_v2_page_global_node_refs ───────────────────────────────┘ (page ↔ global node)
     │  └─────── n ── editor_v2_page_assignments (page → product/collection/post/blog)
     │
     ├─ 1 ── page_sources     (BẢN NHÁP: node tree dạng "ref tree", gzip)
     ├─ n ── page_versions    (LỊCH SỬ: snapshot {label, source})
     └─ 1 ── published_pages  (BẢN PUBLISH: skeleton + dynamic_nodes + refs + scripts, gzip)
```

Các bảng đều là bảng **distributed** trên Citus và khoá chính luôn có `site_id` (riêng `page_versions` được distribute lại theo `page_id`, xem mục 5), nên mọi truy vấn trong context đều lọc `site_id` trước.

| Bảng | Schema Ecto | Vai trò | Dùng chung với v1? |
|---|---|---|---|
| `sites` | `BuilderxApi.Sites.Site` | cờ `version` | Có |
| `pages` | `BuilderxApi.EditorV2.Pages.Page` | metadata trang | Có (lọc `version == 2`) |
| `page_sources` | `...Pages.PageSource` | node tree nháp | Có |
| `page_versions` | `...Pages.PageVersion` | lịch sử snapshot | Có |
| `published_pages` | `...Pages.PublishedPage` | artifact đã publish | Có |
| `editor_v2_style_globals` | `...StyleGlobals.StyleGlobal` | global styling | Không |
| `editor_v2_global_sections` | `...GlobalSections.GlobalSection` | header/footer/custom dùng chung | Không |
| `editor_v2_page_global_refs` | `...GlobalSections.PageGlobalRef` | trang nào dùng section nào | Không |
| `editor_v2_global_nodes` | `...GlobalNodes.GlobalNode` | node dùng chung (menu, popup…) | Không |
| `editor_v2_page_global_node_refs` | `...GlobalNodes.PageGlobalNodeRef` | trang nào dùng global node nào | Không |
| `editor_v2_page_assignments` | `...Pages.PageAssignment` | gán trang mẫu cho entity | Không |

---

## 2. Cờ thế hệ editor — `sites.version`

`lib/builderx_api/sites/site.ex:25-26`

```elixir
# Editor generation: 1 = editor v1 (default), 2 = editor_v2.
field :version, :integer, default: 1
```

- Tên cột là **`version`**, không phải `editor_version`. Tên `editor_version` chỉ xuất hiện trong tên hàm backfill `BuilderxApi.Run.backfill_editor_version/2`.
- Default ở schema = `1`: site tạo bằng code cũ tự là v1. Site v2 được tạo với `version: 2` tường minh (vd `SiteBundles.create_site/3`, `lib/builderx_api/editor_v2/site_bundles.ex:97`).
- Cờ này quyết định luồng render public: `page_controller.ex` (v1) kiểm `v2_site?` rồi `throw({:render_editor_v2, ...})` sang `EditorV2.RenderController` — xem chương render.

### 2.1 Migration thêm cột — `20260618000000_add_editor_v2_columns_to_shared_tables.exs`

```elixir
alter table(:sites)           do add_if_not_exists :version, :integer end   # dòng 7-9
alter table(:pages)           do add_if_not_exists :version, :integer end   # 11-13
alter table(:page_sources)    do add_if_not_exists :version, :integer end   # 15-17
alter table(:page_versions)   do add_if_not_exists :version, :integer end   # 19-21
alter table(:published_pages) do add_if_not_exists :version, :integer end   # 23-25
```

- Dòng 4-5 (comment): v2 **tái dùng bảng trang của v1**, chỉ thêm cột đánh dấu `version`.
- Dòng 32-36: các `UPDATE ... SET version = 1` bị **comment** vì UPDATE trên bảng distributed lớn trong transaction migration quá nặng. Thay vào đó chạy tay:

```elixir
# lib/builderx_api/run.ex:4448
BuilderxApi.Run.backfill_editor_version(batch_size \\ 100, sleep_ms \\ 200)
```

  Hàm lặp qua 5 schema (`Site`, `Page`, `PageSource`, `PageVersion`, `PublishedPage`), mỗi vòng lấy 100 id có `version IS NULL`, `update_all(set: [version: 1])`, ngủ 200ms, đệ quy tới khi hết.

- Dòng 38-54: tạo bảng `editor_v2_style_globals` **bản đầu** (có `name`, `presets`, `is_selected`). Bảng này **bị drop và tạo lại** ở migration 20260803 (mục 7).

> ⚠️ Trước khi backfill xong, row v1 có `version = NULL`. Truy vấn v2 dùng `p.version == 2` nên không bị lẫn; nhưng code nào lọc `version == 1` sẽ bỏ sót row v1 chưa backfill.

---

## 3. `pages` — metadata trang

`lib/builderx_api/editor_v2/pages/page.ex`

```elixir
schema "pages" do                                        # :15
  field :name, :string
  field :slug, :string
  field :version, :integer, default: 2                   # :18  v2 luôn = 2
  field :is_homepage, :boolean, default: false
  field :type, :integer, default: Enum.PageType.value(:main)   # :20  = 1
  field :order, :integer
  field :settings, :string                               # :22  JSON dạng chuỗi
  field :created_by, :binary_id
  field :is_deleted, :boolean, default: false            # xoá mềm
  field :is_default, :boolean, default: false            # trang mẫu mặc định của type
  field :apply_type, :string                             # :27  "all" | "category" | "custom" | nil
  belongs_to :site, Site, type: Ecto.UUID, primary_key: true
  has_one  :source,   PageSource,  foreign_key: :page_id
  has_many :versions, PageVersion, foreign_key: :page_id
```

Giải thích từng điểm:

- **`@derived_fields [:version]` (:11) + `changeset/2` (:36-37)**: `fields = __schema__(:fields) -- (@non_required_fields ++ @derived_fields)` → client **không thể** ghi `version` qua params. Row mới lấy default `2` của struct.
- **`type`** là số nguyên theo `Enum.PageType` (`lib/builderx_api/enum.ex:220`):

  | Giá trị | key | | Giá trị | key |
  |---|---|---|---|---|
  | 1 | main | | 8 | product |
  | 2 | store | | 9 | category |
  | 3 | member | | 10 | post |
  | 4 | blog | | 11 | search |
  | 5 | custom | | 12 | cart |
  | 6 | error | | 13 | checkout |
  | 7 | maintain | | 14 | complete |

  `validate_inclusion(:type, Enum.PageType.values())` (:42) → gửi `type: 0` sẽ bị 422.
- **`apply_type`** (:26-27, `validate_inclusion` :43 với `Enum.PageApplyType` = `all|category|custom`). `nil` được đọc như `"all"`. Chi tiết ở [04 — Page assignment](./04-page-assignment.md).
- **Ràng buộc unique** (:44-52):
  - `page_slug_index` trên `(site_id, slug) WHERE is_deleted = false` (migration `20241214043830…`) → trùng slug trả lỗi `"Name page has already"`.
  - `pages_site_id_type_default_index` (migration `20260731081500_published_pages_add_is_default.exs`) → mỗi `(site_id, type)` chỉ **một** trang `is_default` — lỗi `"Default template for this page type has already"`.
- **`meta_json/1`** (:55-59): lấy mọi field schema + `settings` được `Doc.decode` thành map. Đây là shape "page meta" trả về cho editor.
- **`tree_json/1`** (:64-67): meta + `source` (chuỗi JSON thô của `page_sources`). Controller hiện dùng `Pages.composed_tree_json/1` thay vì hàm này (xem chương 02).

---

## 4. `page_sources` — bản nháp (node tree)

`lib/builderx_api/editor_v2/pages/page_source.ex`

```elixir
schema "page_sources" do
  field :source, CompressedText        # :11  chuỗi JSON, gzip khi ghi DB
  field :version, :integer, default: 2
  belongs_to :site, Site, type: Ecto.UUID, primary_key: true
  belongs_to :page, Page, type: Ecto.UUID
```

- Quan hệ **1–1** với `pages`, unique `page_sources_site_id_page_id_index` (:24).
- `CompressedText` (`lib/builderx_api/types/compressed_text.ex`): `dump` = `:zlib.gzip`, `load` = `:zlib.gunzip`, kiểu DB `:binary`. Trong Elixir `source` luôn là **chuỗi JSON đã giải nén**; trong DB là bytes gzip — không `SELECT` đọc trực tiếp được.
- `changeset` (:20-25) **không cast `version`** → luôn là default `2`.

### 4.1 Các hàm biến đổi

```elixir
def doc(%__MODULE__{source: s}), do: Doc.decode(s)     # :27  chuỗi → map
def tree(source), do: source |> doc() |> normalize()   # :30  map chuẩn hoá

def build_source(%{"source" => s}) when is_binary(s), do: s              # :32
def build_source(payload) when is_map(payload), do: payload |> normalize() |> Doc.encode()  # :33

def build_tree(%{"source" => s}) when is_binary(s), do: s |> Doc.decode() |> normalize()   # :35
def build_tree(payload) when is_map(payload), do: normalize(payload)                        # :36

defp normalize(map) do                                   # :41-47
  %{"schema_version" => Map.get(map, "schema_version") || 1,
    "root_node_id"   => Map.get(map, "root_node_id")   || "ROOT",
    "nodes"          => Map.get(map, "nodes")          || %{}}
end
```

- `build_tree/1` chấp nhận **2 dạng payload** từ client: `{"source": "<chuỗi JSON>"}` hoặc `{"nodes": {...}, "root_node_id": ..., "schema_version": ...}` trực tiếp. Controller truyền nguyên `params` vào nên cả `site_id`, `id` cũng nằm trong map — `normalize` chỉ lấy 3 key nên chúng bị bỏ.
- `normalize` **vứt mọi key khác** ngoài 3 key trên. Nếu editor thêm key top-level mới vào tree, backend sẽ không lưu.

### 4.2 Shape của source (node tree)

```json
{
  "schema_version": 1,
  "root_node_id": "ROOT",
  "nodes": {
    "ROOT": {
      "id": "ROOT",
      "data": {
        "type": "root-canvas",
        "parent": null,
        "nodes": ["hdr-ref", "sec1", "ftr-ref"],
        "isCanvas": true, "hidden": false,
        "style": {}, "config": {}, "specials": {}, "states": {}, "responsive": {}
      }
    },
    "sec1": { "id": "sec1", "data": { "type": "flex-section", "parent": "ROOT", "nodes": ["h1"], ... } },
    "h1":   { "id": "h1",   "data": { "type": "heading", "parent": "sec1", "nodes": [], ... } },
    "hdr-ref": { "id": "hdr-ref", "data": { "type": "flex-section", "parent": "ROOT", "nodes": [],
                 "specials": { "globalRef": "<global_section_id>", "globalKind": "header" } } }
  }
}
```

Quy tắc (khớp frontend, xem `storecake-builder/editor-v2/01-architecture.md`):

1. **Map phẳng** `nodes: {id → node}`. Quan hệ cha–con nằm ở `data.parent` (id cha) và `data.nodes` (mảng id con, có thứ tự).
2. `root_node_id` mặc định `"ROOT"`.
3. `data.type` là tên element (`heading`, `flex-section`, `list-dataset`…) — backend tra vào `QwikV2.Registry` khi render.
4. Các khoá `data.style`, `data.responsive`, `data.states`, `data.config`, `data.specials`, `data.bindings` backend không validate, chỉ đọc khi render.

### 4.3 "Ref tree" vs "composed tree"

Trong DB, `page_sources.source` **không** chứa nội dung header/footer và global node — chỉ chứa **node tham chiếu**:

| Loại | Node tham chiếu trong ref tree | Sau khi compose (trả cho editor / đem render) |
|---|---|---|
| Global section | `specials.globalRef = <id>`, `specials.globalKind` — chỉ là **con trực tiếp của ROOT** | Node ref bị thay bằng cây của section; root section được đóng dấu `specials.globalId / globalKind / globalRev` |
| Global node | `specials.globalNodeRef = <id>` — **ở bất kỳ đâu** trong tree | Thay bằng cây của global node, id được namespace `"<ref_id>-gn-<id gốc>"`; root đóng dấu `globalNodeId / globalNodeType / globalNodeRev` |

Compose/decompose chi tiết: [03 — Global sections & global nodes](./03-global-sections-nodes.md).

---

## 5. `page_versions` — lịch sử snapshot

`lib/builderx_api/editor_v2/pages/page_version.ex`

```elixir
schema "page_versions" do
  field :source, :string                # :11  KHÔNG nén (khác page_sources)
  field :version, :integer, default: 2
  belongs_to :site,  Site,    type: Ecto.UUID, primary_key: true
  belongs_to :page,  Page,    type: Ecto.UUID
  belongs_to :owner, Account, type: Ecto.UUID    # người tạo snapshot
```

`source` là một **JSON bọc 2 lớp**:

```elixir
def build_source(page_source, label) do                       # :27-29
  Doc.encode(%{"label" => label, "source" => page_source})
end
```

```json
{ "label": "Trước khi đổi banner", "source": "{\"schema_version\":1,\"root_node_id\":\"ROOT\",\"nodes\":{...}}" }
```

- `source` bên trong là **chuỗi** (chính xác chuỗi `page_sources.source` lúc chụp) — tức là **ref tree**, không chứa nội dung global section/global node.
- `meta_json/1` (:36-45): `id, label, page_id, site_id, owner_id, inserted_at` — dùng cho danh sách.
- `tree_json/1` (:50-52): meta + `source` (chuỗi ref tree) — dùng khi xem một version.
- Ghi chú: bảng `page_versions` đã được distribute lại theo `page_id` (migration `20230929044244_change_shard_and_index_page_version.exs`) khác các bảng khác (theo `site_id`) — trạng thái shard hiện tại trên production **chưa xác minh**.

> ⚠️ Vì version chỉ lưu ref tree, **restore một version không khôi phục nội dung header/footer/global node** — chúng luôn lấy bản hiện tại.

---

## 6. `published_pages` — bản publish

`lib/builderx_api/editor_v2/pages/published_page.ex`

```elixir
schema "published_pages" do
  field :source, CompressedText                         # :11  artifact đã compile (gzip)
  field :version, :integer, default: 2
  field :slug, :string                                  # copy từ pages lúc publish
  field :is_homepage, :boolean, default: false
  field :type, :integer, default: Enum.PageType.value(:main)
  field :is_default, :boolean, default: false
  field :app, :string                                   # không được v2 ghi (còn từ v1)
  field :app_css, :string                               # <link> tới CSS bundle, hoặc <style> inline fallback
  field :js_version, :string                            # phiên bản runtime render_v2 lúc publish
  field :created_by, :binary_id
  belongs_to :site, Site, ...; belongs_to :page, Page, ...
```

- Unique `(site_id, page_id)` (:44) → mỗi trang **một** bản publish; publish lại là `insert_or_update` đè lên.
- `slug / is_homepage / type / is_default` được **chép** từ `pages` lúc publish → render public tra theo các cột này, không join `pages`. Đổi slug trang mà chưa publish lại thì URL public vẫn là slug cũ.

### 6.1 Shape của `published_pages.source`

```elixir
def build_source(attrs) when is_map(attrs) do          # :47-57
  Doc.encode(%{
    "name"           => attrs["name"] || attrs[:name],
    "schema_version" => ... || 1,
    "root_node_id"   => ... || "ROOT",
    "skeleton"       => ... || [],
    "dynamic_nodes"  => ... || %{},
    "refs"           => ... || %{},
    "scripts"        => ... || ""
  })
end
```

```json
{
  "name": "Trang chủ",
  "schema_version": 1,
  "root_node_id": "ROOT",
  "skeleton": ["<div class=\"...\">…HTML tĩnh…", {"slot": "node_abc"}, "…HTML tĩnh…</div>"],
  "dynamic_nodes": { "node_abc": { "id": "node_abc", "data": { "type": "list-dataset", ... } } },
  "refs": { "product": ["uuid1", "uuid2"], "category": ["uuid3"] },
  "scripts": "<script …x-data/config…></script>\n<script type=\"module\" src=\"<base>/Loader.js\"></script>"
}
```

| Key | Nghĩa |
|---|---|
| `skeleton` | Mảng đoạn HTML đã render sẵn, xen kẽ `{"slot": id}` ở chỗ node **phụ thuộc dữ liệu động** (sản phẩm, giá, danh sách…). Các đoạn HTML liền nhau được gộp thành một chuỗi. |
| `dynamic_nodes` | Node JSON của từng slot (kèm `_children_nodes` / `_subtree` khi cần), để lúc request render lại với dữ liệu mới nhất. |
| `refs` | Id entity bind tường minh, gom theo loại — lúc request fetch một lượt. |
| `scripts` | Chuỗi thẻ `<script>` do `QwikV2.Scripts.tags/1` sinh: dữ liệu x-data + config sự kiện DOM + `<script type="module">` nạp `Loader.js` của runtime render_v2. Chuỗi **rỗng** nếu trang không có node nào cần JS. |

`name/1` (:59) đọc `name` từ source — dùng làm `<title>`. `json/1` (:61-75) trả meta (không có skeleton). Chi tiết compile/assemble: [06 — Publish](./06-publish.md).

---

## 7. `editor_v2_style_globals` — global styling

`lib/builderx_api/editor_v2/style_globals/style_global.ex` + migration `20260803043933_recreate_style_global_table.exs`

```elixir
schema "editor_v2_style_globals" do
  field :color_schemes, {:array, :map}   # bảng màu
  field :elements, :map                  # style mặc định theo loại element
  field :style_data, :map                # dữ liệu style mà renderer QwikV2 đọc (ctx.style_data)
  field :is_removed, :boolean, default: false   # xoá mềm
  belongs_to :site, Site, type: Ecto.UUID, primary_key: true
```

Migration 20260803 **drop và tạo lại** bảng:

- Bỏ `name`, `presets`, `is_selected` của bản 20260618; thêm `color_schemes`, `elements` (default `[]`/`%{}`).
- `unique_index [:site_id] WHERE is_removed = false` (dòng 20-24) → **mỗi site tối đa một style đang sống**. Khái niệm "nhiều style, chọn một" của bản đầu đã bỏ.
- `create_distributed_table('editor_v2_style_globals', 'site_id')` (dòng 26-31) **không có** `colocate_with => 'sites'`, khác mọi bảng editor_v2 khác. Module migration tên `BuilderxApi.CitusCoord.Migrations…` (các file khác là `BuilderxApi.Citus.Migrations…`).

> ⚠️ **Code chưa theo kịp schema mới** (chi tiết ở chương 02, mục 7):
> - `SiteBundles.export_styles/1` (`site_bundles.ex:67-78`) đọc `&1.name`, `&1.presets`, `&1.is_selected` — các field không còn trong struct → `KeyError` khi site có style.
> - Changeset không khai `unique_constraint` cho index trên → tạo style thứ hai cho cùng site sẽ **raise `Ecto.ConstraintError` (500)** thay vì trả 422.
> - Hàm `StyleGlobals.get_selected/1` chỉ lấy "row đầu tiên chưa xoá" — tên còn từ mô hình cũ.

---

## 8. Global sections, global nodes và bảng ref

### 8.1 `editor_v2_global_sections` — migration `20260819000001`

`lib/builderx_api/editor_v2/global_sections/global_section.ex`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id`, `site_id` | uuid | PK kép |
| `name` | string | |
| `kind` | string, not null | `header` \| `footer` \| `custom` (`@kinds` :9) |
| `source` | binary (`CompressedText`) | cây node riêng của section, cùng shape mục 4.2 |
| `rev` | bigint, default 0 | tăng mỗi lần lưu — chống ghi đè bản cũ (optimistic lock) |
| `updated_by` | uuid | |
| `is_deleted` | bool | xoá mềm |

- `empty?/1` (:44-50): section coi là rỗng khi thiếu `root_node_id`, thiếu `nodes`, hoặc root không có trong `nodes`. Section rỗng bị **bỏ khỏi trang** khi compose.
- Index `(site_id, kind)`. Mặc định mỗi site có `header` + `footer` (`GlobalSections.ensure_defaults/1`).

### 8.2 `editor_v2_global_nodes` — migration `20260822000001` + `20260915000000`

`lib/builderx_api/editor_v2/global_nodes/global_node.ex`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `type` | integer, not null | `Enum.GlobalNodeType`: 1 menu, 2 filter_set, 3 popup, 4 cart |
| `name`, `source`, `rev`, `updated_by`, `is_deleted` | | như global section |
| `metadata` | map | thêm ở 20260915, vd `snapshotUrl` (ảnh preview editor chụp) |

- `validate_metadata/1` (:38-43): nếu client gửi `metadata: null` thì đổi thành `%{}`.
- Migration 20260915 thêm cột **không có default** → row tạo trước đó có `metadata = NULL` trong DB (schema Ecto default `%{}` chỉ áp khi insert qua Ecto). Đọc ra Elixir sẽ là `nil`.
- `empty?/1` (:51-57): rỗng khi `source` nil, `nodes` rỗng, hoặc không có root.

### 8.3 Bảng ref (quan hệ n–n trang ↔ khối dùng chung)

| Bảng | PK | Ghi bởi |
|---|---|---|
| `editor_v2_page_global_refs` | `(site_id, page_id, global_id)` | `GlobalSections.sync_page_refs/3` |
| `editor_v2_page_global_node_refs` | `(site_id, page_id, global_node_id)` | `GlobalNodes.sync_page_refs/3` |

Cả hai đều theo kiểu **xoá hết ref của trang rồi insert lại** (`on_conflict: :nothing`). Chỉ phục vụ endpoint `usage` ("khối này đang dùng ở trang nào") — render **không** đọc bảng này.

---

## 9. `editor_v2_page_assignments` — migration `20260824000001`

`lib/builderx_api/editor_v2/pages/page_assignment.ex`

```elixir
@primary_key false
schema "editor_v2_page_assignments" do
  field :site_id,     :binary_id, primary_key: true
  field :page_id,     :binary_id, primary_key: true
  field :target_type, :string,    primary_key: true   # product | collection | post | blog
  field :target_id,   :binary_id, primary_key: true
  field :position,    :integer, default: 0            # giữ thứ tự merchant chọn
```

- Migration cũng thêm `pages.apply_type` (dòng 5-7).
- Index ngược `(site_id, target_type, target_id)` (dòng 22): "cho 1 sản phẩm, trang nào render nó" trong một lookup.
- `target_type` validate theo `Enum.PageTargetType` = `product | collection | post | blog`.

Luật resolve (custom → category → all → default): [04 — Page assignment](./04-page-assignment.md).

---

## 10. Helper dùng chung

### 10.1 `Doc` — `lib/builderx_api/editor_v2/doc.ex`

```elixir
def decode(s) when is_binary(s) do          # :4
  case Jason.decode(s) do
    {:ok, map} when is_map(map) -> map        # chỉ nhận object JSON
    _ -> %{}                                  # hỏng / mảng / số → map rỗng, KHÔNG raise
  end
end
def decode(_), do: %{}                      # nil → %{}
def encode(map) when is_map(map), do: Jason.encode!(map)   # :13  raise nếu map chứa giá trị không encode được
```

Hệ quả: source hỏng không làm crash mà **âm thầm thành trang rỗng** (sau `normalize` là `ROOT` không có node). Khi trang "tự nhiên trắng", kiểm tra JSON trong DB trước.

### 10.2 `Params` — `lib/builderx_api/editor_v2/params.ex`

| Hàm | Vào → ra | Dùng khi |
|---|---|---|
| `flag/1` (:19-20) | `nil/false/"false"/"0"/""` → `nil`, còn lại → `true` | công tắc bật/tắt; không biểu diễn được `false` |
| `bool/1` (:22-24) | `nil/""` → `nil`; `false/"false"/"0"` → `false`; còn lại `true` | filter 3 trạng thái (vd `is_published`) |
| `paging/2` (:26-31) | `%{page, limit}`, default 1 / 20 | danh sách phân trang |
| `int/2` (:33-42) | số nguyên dương, sai → default | |

Lưu ý `int/2` với chuỗi dùng `Integer.parse` và **bỏ qua phần đuôi**: `"12abc"` → `12`.

---

## 11. Vòng đời dữ liệu: draft → version → published

```
Editor bấm Save (POST /pages/:id)
 └─ Pages.save_tree
      ├─ decompose: tách global section ra khỏi tree  → ghi editor_v2_global_sections (rev+1)
      ├─ sync bảng ref
      └─ upsert page_sources.source = ref tree          ← BẢN NHÁP

Editor bấm "Lưu phiên bản" (POST /pages/:id/versions)
 └─ PageVersions.create_version
      └─ insert page_versions.source = {label, source: <chuỗi page_sources.source>}   ← LỊCH SỬ

Editor bấm Restore (POST /versions/:vid/restore)
 └─ upsert page_sources.source = source của version     (bản nháp bị ghi đè)

Editor bấm Publish (POST /sites/:site_id/publish)
 └─ Published.publish_site → mỗi trang:
      compose global sections + resolve global nodes → QwikV2.Compile
      → upsert published_pages (skeleton, dynamic_nodes, refs, scripts, app_css, js_version)  ← BẢN PUBLISH
```

- Nháp **không bao giờ** được đọc khi render public (trừ dev config `:render_v2_draft_in_dev`).
- Publish là **cả site** — không có publish từng trang qua API editor.
- Global section/global node **không có lịch sử version**; sửa là ghi đè, chỉ có `rev` để chống lưu đè bản cũ.

---

## 12. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Trang v1 lẫn vào danh sách trang v2 (hoặc ngược lại) | `pages.version`; đã chạy `Run.backfill_editor_version/0` chưa; truy vấn có dùng `Pages.editor_v2/1` không |
| Trang mở ra trắng, không lỗi | JSON trong `page_sources.source` hỏng → `Doc.decode` trả `%{}` |
| Header/footer biến mất khỏi trang | section `is_deleted` hoặc `empty?` → compose xoá node ref (`GlobalSection.empty?/1`) |
| Restore version nhưng header vẫn là bản mới | Đúng thiết kế: version chỉ lưu ref tree (mục 5) |
| Đổi slug nhưng URL public vẫn slug cũ | `published_pages.slug` chỉ cập nhật khi publish lại |
| Tạo trang lỗi "Default template for this page type has already" | Đã có trang `is_default` cùng `type` (`pages_site_id_type_default_index`) |
| Tạo global styling lần 2 bị 500 | Unique index `site_id WHERE is_removed = false`, changeset không khai `unique_constraint` |
| Export / duplicate site bị 500 `KeyError :name` | `SiteBundles.export_styles/1` đọc field của schema cũ |
| Không `SELECT` đọc được `source` | Cột gzip (`CompressedText`) — giải nén bằng `:zlib.gunzip` trong `iex` |
| `metadata` của global node là `nil` | Row tạo trước migration 20260915 (cột không default) |

---

## 13. Điểm bất thường đã phát hiện

1. Cột cờ thế hệ tên `version` (không phải `editor_version`) trên 5 bảng; backfill v1 phải chạy tay.
2. Migration 20260803 không `colocate_with => 'sites'` và dùng namespace module `CitusCoord`, khác các migration editor_v2 khác.
3. `StyleGlobal` đã sang schema mới nhưng `SiteBundles` (export/clone) và `@body` doc của `StyleGlobalController` vẫn dùng `name/presets/is_selected`.
4. `editor_v2_style_globals` thiếu `unique_constraint` trong changeset tương ứng với unique index.
5. `editor_v2_global_nodes.metadata` thêm không default → row cũ `NULL`.
6. `published_pages.app` không được v2 ghi (còn từ v1).
7. `lib/builderx_api/editor_v2/published.ex:119-130`: hai `@doc` liền nhau trước `get_assigned/4`; `@doc` đầu (mô tả "template mặc định của loại trang") mồ côi — nó thuộc về `get_template/2` nhưng bị đẩy lên, Elixir sẽ cảnh báo `redefining @doc`.
8. Moduledoc của `Nodes` (`nodes.ex:3`) nói "`nodes` JSONB map" nhưng `page_sources.source` là **binary gzip**, không phải JSONB; patch node là decode–sửa–encode cả tree.
