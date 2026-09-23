# 03 — Global Sections & Global Nodes

> **Cho BA:**
> Có những phần xuất hiện ở nhiều trang: header, footer, menu, popup, giỏ hàng... Thay vì copy vào từng trang, editor_v2 lưu chúng **một lần** ở bảng riêng, còn trang chỉ giữ một "con trỏ" (ref) tới bản gốc.
> Sửa bản gốc → mọi trang dùng nó đều thấy bản mới (**sau khi publish lại**).
> Có hai loại: **Global Section** = cả một dải ngang cấp cao nhất (header/footer/custom); **Global Node** = một khối nhỏ đặt ở bất kỳ đâu (menu, bộ lọc, popup, giỏ hàng).

Chương này đi từng dòng qua: bảng dữ liệu → cách trang tham chiếu → hàm "nở" ref thành cây đầy đủ (`compose` / `resolve`) → hàm "gập" cây về ref khi lưu (`decompose`) → API quản lý → những chỗ code chưa nối.

Code ở `builderx_api`, branch `feat-builder-v2`, commit `3e3eeacb5`.

---

## 1. So sánh nhanh hai loại

| | Global Section | Global Node |
|---|---|---|
| Bảng | `editor_v2_global_sections` | `editor_v2_global_nodes` |
| Bảng ref page↔global | `editor_v2_page_global_refs` | `editor_v2_page_global_node_refs` |
| Phân loại | `kind`: `header` / `footer` / `custom` (string) | `type`: `menu=1`, `filter_set=2`, `popup=3`, `cart=4` (integer, `Enum.GlobalNodeType`) |
| Vị trí được phép trong trang | **Chỉ là con trực tiếp của ROOT** | **Bất kỳ đâu** trong cây |
| Key ref trong `data.specials` của node | `globalRef` | `globalNodeRef` |
| Dấu "đã nở" (stamp) sau compose | `globalId`, `globalKind`, `globalRev` | `globalNodeId`, `globalNodeType`, `globalNodeRev` |
| Id node sau khi nở | Giữ nguyên id trong bản gốc | Đổi thành `"<ref_id>-gn-<id gốc>"` (tránh trùng khi một global node xuất hiện 2 lần) |
| Nở ở đâu | `GlobalSections.Compose.compose/2` | `GlobalNodes.Compose.resolve/2` |
| Gập lại khi lưu page | **Backend** tự gập (`Compose.decompose/1`) | **Client** tự gập (xem `builderx_spa/src/stores/editor_v2/globalNode.js`), backend không gập |
| Tự tạo mặc định | Có: `header` + `footer` | Không |
| Có `metadata` | Không | Có (vd. `snapshotUrl` ảnh preview) |
| Có API xoá | **Không** (hàm `delete/1` có nhưng không có route) | Có, xoá mềm |

---

## 2. Bảng dữ liệu (migrations)

### 2.1 `editor_v2_global_sections` + `editor_v2_page_global_refs`

File: `priv/citus/migrations/20260819000001_create_editor_v2_global_sections.exs`

```
editor_v2_global_sections
 ├─ id          binary_id  PK
 ├─ site_id     binary_id  PK   ← khoá phân tán Citus, colocate với `sites`
 ├─ name        string
 ├─ kind        string  NOT NULL        header | footer | custom
 ├─ source      binary                  cây node đã nén (CompressedText)
 ├─ rev         bigint  NOT NULL DEFAULT 0   số phiên bản, tăng mỗi lần ghi
 ├─ updated_by  binary_id               account id người ghi cuối
 ├─ is_deleted  boolean DEFAULT false   xoá mềm
 └─ timestamps
    index (site_id, kind)

editor_v2_page_global_refs          ← "trang nào đang dùng section nào"
 ├─ site_id, page_id, global_id     cả 3 là PK
 └─ timestamps
    index (site_id, global_id)      ← tra ngược "section này dùng ở trang nào"
```

### 2.2 `editor_v2_global_nodes` + `editor_v2_page_global_node_refs`

File: `priv/citus/migrations/20260822000001_create_editor_v2_global_nodes.exs`, cộng `20260915000000_add_metadata_to_editor_v2_global_nodes.exs` (thêm cột `metadata :map`).

Cấu trúc giống hệt 2.1, chỉ khác: `type integer NOT NULL` thay cho `kind`, bảng ref có cột `global_node_id`, index `(site_id, type)`.

> Vì mọi bảng đều phân tán theo `site_id`, **mọi query đều phải có `site_id`** trong `where`. Các hàm context bên dưới đều tuân thủ điều này.

### 2.3 Schema Ecto

`lib/builderx_api/editor_v2/global_sections/global_section.ex`

```elixir
@kinds ~w(header footer custom)                                   # :9
field :source, CompressedText                                     # :16  nén khi ghi, giải nén khi đọc
field :rev, :integer, default: 0                                  # :17
belongs_to :site, Site, type: Ecto.UUID, primary_key: true        # :21  site_id là 1 phần PK
```

- `changeset/2` (`:28`) cast mọi field, bắt buộc `site_id` + `kind`, `kind` phải thuộc `@kinds`.
- `rename_changeset/2` (`:35`) **chỉ** cast `name` — `kind` không đổi được sau khi tạo (kind là "dải" mà section được phép nằm).
- `tree/1` (`:41`) = `Doc.decode(source)` → map `%{"root_node_id", "nodes", "schema_version"}`.
- `empty?/1` (`:44-50`): coi là rỗng khi thiếu `root_node_id`, `nodes` không phải map, hoặc node root không tồn tại. Section rỗng sẽ bị **bỏ khỏi trang** lúc compose (xem mục 4).
- `meta_json/1` (`:54`) trả metadata không kèm `source`; `json/1` (`:61`) = meta + `source` (chuỗi đã encode).

`lib/builderx_api/editor_v2/global_nodes/global_node.ex`

- `types/0` (`:26`) = `Enum.GlobalNodeType.values()` → `[1, 2, 3, 4]` (định nghĩa ở `lib/builderx_api/enum.ex:475`).
- `changeset/2` (`:28-34`) thêm `validate_metadata/1` (`:38-43`): nếu client gửi `metadata: nil` thì ép về `%{}` để cột không bao giờ null.
- `empty?/1` (`:51-57`): `source: nil` → rỗng; ngược lại cần `nodes` là map không rỗng **và** có key `root_node_id`.

Bảng ref: `global_sections/page_global_ref.ex`, `global_nodes/page_global_node_ref.ex` — schema 3 cột PK, `changeset` chỉ validate required.

---

## 3. Trang tham chiếu global như thế nào (ref node)

Trong `page_sources.source` (cây node của trang — xem [01 — Data model](./01-data-model.md)), global **không** được lưu nội dung, chỉ lưu một **node giả** mang con trỏ.

### 3.1 Ref của Global Section

Tạo bởi `ref_node/4` — `lib/builderx_api/editor_v2/global_sections/compose.ex:328-347`:

```elixir
%{
  "id" => ref_id,                      # "gsref-" + 16 ký tự đầu của uuid bỏ dấu "-"
  "data" => %{
    "type" => "flex-section",          # giả làm 1 section rỗng
    "parent" => root_id,               # luôn là con của ROOT
    "nodes" => [],                     # không có con
    "specials" => %{"globalRef" => global_id, "globalKind" => kind},
    ...                                 # các field rỗng còn lại (style, config, bindings...)
  }
}
```

`ref_node_id/1` (`:324-326`): `"gsref-" <> (uuid bỏ "-" lấy 16 ký tự)`. Nghĩa là **một trang chỉ có thể tham chiếu một section một lần** (cùng section → cùng id).

### 3.2 Ref của Global Node

Backend **không tạo** ref node cho global node — client tạo (`builderx_spa/src/composable/editor_v2/globalNode.js`, hàm `buildRefNode`, id dạng `gnref-...`). Backend chỉ nhận ra ref qua `data.specials.globalNodeRef`.

---

## 4. `GlobalSections.Compose.compose/2` — nở section, từng dòng

File: `lib/builderx_api/editor_v2/global_sections/compose.ex`

```elixir
7  def compose(tree, globals_by_id) when is_map(tree) and is_map(globals_by_id) do
8    with {:ok, root_id, root, nodes} <- unpack(tree) do
9      {child_ids, nodes} =
10       root
11       |> child_ids()
12       |> Enum.reduce({[], nodes}, fn child_id, {ids, acc} ->
13         case ref_target(acc[child_id], globals_by_id) do
14           nil ->
15             {ids ++ [child_id], acc}
16
17           :missing ->
18             {ids, Map.delete(acc, child_id)}
19
20           {:ok, global} ->
21             {g_root_id, g_nodes} = expand(global, root_id)
22             {ids ++ [g_root_id], acc |> Map.delete(child_id) |> Map.merge(g_nodes)}
23         end
24       end)
25
26     {:ok, put_children(tree, nodes, root_id, child_ids)}
27   else
28     :error -> {:ok, tree}
29   end
30 end
```

| Dòng | Làm gì | Tại sao |
|---|---|---|
| 8 | `unpack/1` (`:251-260`) lấy `root_node_id` (mặc định `"ROOT"`), `nodes`, và node root. Thiếu root → `:error` → dòng 28 trả nguyên cây. | Cây hỏng thì không đụng vào, tránh crash lúc render. |
| 10-11 | Chỉ duyệt **con trực tiếp của ROOT** (`data.nodes` của root). | Section chỉ được nằm ở tầng cao nhất; ref ở tầng sâu hơn **bị bỏ qua** (không nở, vẫn là flex-section rỗng). |
| 13 | `ref_target/2` (`:34-47`): node không có `specials.globalRef` → `nil`; có ref nhưng section không tồn tại / đã xoá mềm / rỗng → `:missing`; còn lại → `{:ok, section}`. | Map `globals_by_id` được tạo từ `GlobalSections.map_by_id/1` — đã lọc `is_deleted == false`, nên section bị xoá tự thành `:missing`. |
| 15 | Node thường: giữ nguyên thứ tự. | |
| 18 | Ref hỏng: **xoá node ref khỏi map và khỏi danh sách con**. | Trang không hiển thị một khối trống. |
| 21 | `expand/2` (`:49-69`) lấy cây của section, sửa node gốc của nó: `parent = root_id`, bỏ `globalRef`, thêm stamp `globalId/globalKind/globalRev`. | Stamp để editor biết khối này là global (hiện viền, khoá...) và để `decompose` gập lại khi lưu. |
| 22 | Thay id ref bằng id gốc của section trong danh sách con; xoá node ref; merge **toàn bộ node** của section vào map. | Id node của section được giữ nguyên, không namespace. |
| 26 | `put_children/4` (`:315-322`) ghi lại `ROOT.data.nodes`, đảm bảo có `root_node_id` và `schema_version`. | |

> Hệ quả của dòng 22: nếu hai section khác nhau (do copy) có trùng id node bên trong, node sau sẽ đè node trước trong map. Thực tế id do client sinh ngẫu nhiên nên hiếm gặp — **chưa xác minh** có chỗ nào chặn.

---

## 5. `GlobalNodes.Compose.resolve/2` — nở global node, từng dòng

File: `lib/builderx_api/editor_v2/global_nodes/compose.ex`

```elixir
7  def resolve(tree, global_nodes_by_id) when is_map(tree) and is_map(global_nodes_by_id) do
8    nodes = tree["nodes"]
10   unless is_map(nodes) do
11     tree
12   else
13     resolved =
14       Enum.reduce(nodes, nodes, fn {id, node}, acc ->
15         case ref_target(node, global_nodes_by_id) do
16           nil -> acc
19           :missing ->
20             parent_id = get_in(node, ["data", "parent"])
21             acc |> remove_from_parent(parent_id, id) |> Map.delete(id)
23           {:ok, global_node} ->
24             parent_id = get_in(node, ["data", "parent"])
25             {g_root_id, g_nodes} = expand(global_node, parent_id, id)
27             acc
28             |> update_parent_children(parent_id, id, g_root_id)
29             |> Map.delete(id)
30             |> Map.merge(g_nodes)
31         end
32       end)
34     Map.put(tree, "nodes", resolved)
35   end
36 end
```

| Dòng | Làm gì | Tại sao |
|---|---|---|
| 14 | Duyệt **mọi node** (không chỉ con của ROOT). Duyệt trên `nodes` gốc, ghi vào `acc`. | Global node được đặt ở bất kỳ đâu (menu trong header, popup ở cuối trang...). |
| 15 | `ref_target/2` (`:52-66`): cùng logic với section nhưng đọc `specials.globalNodeRef`, dùng `GlobalNode.empty?/1`. | |
| 20-21 | Ref hỏng: gỡ id khỏi `data.nodes` của cha (`remove_from_parent/3`, `:127-142`) rồi xoá node. | |
| 25 | `expand/3` (`:70-98`) — xem bảng bên dưới. | |
| 28 | `update_parent_children/4` (`:110-125`): trong mảng con của cha, thay id ref bằng id gốc mới — **giữ nguyên vị trí**. | Thứ tự hiển thị không đổi. |
| 29-30 | Xoá ref, merge các node đã remap. | |

`expand/3` (`:70-98`):

```elixir
75  id_map = Map.new(g_nodes, fn {old_id, _node} -> {old_id, namespaced_id(ref_id, old_id)} end)
76  new_root_id = Map.fetch!(id_map, g_root_id)
78  remapped_nodes = Map.new(g_nodes, fn {old_id, node} -> {Map.fetch!(id_map, old_id), remap_ids(node, id_map)} end)
83  stamped = remapped_nodes |> Map.fetch!(new_root_id)
86    |> put_in(["data", "parent"], parent_id)
87    |> update_in(["data", "specials"], ... drop "globalNodeRef", merge globalNodeId/Type/Rev)
```

- `:75` — mọi id trong global node được đổi thành `"#{ref_id}-gn-#{id gốc}"` (`namespaced_id/2`, `:100`). **Lý do** (comment `:68-69`): cùng một global node có thể xuất hiện ở hai chỗ trong trang; không namespace thì hai bản sẽ đè id lên nhau.
- `:78` + `remap_ids/2` (`:102-108`) — sửa `data.parent` và `data.nodes` của từng node theo id mới. **Chỉ** hai field này được remap; id nằm ở chỗ khác (vd trong `events`, `config`) **không** được đổi — **chưa xác minh** có element nào tham chiếu id nội bộ như vậy.
- `:86-94` — gắn node gốc vào cha của ref, stamp `globalNodeId` (id bản gốc, **không** namespace). Popup dùng stamp này làm khoá ổn định: `lib/qwik_v2/nodes/popup/html.ex:32` lấy `specials.globalNodeId || id`.

Giới hạn cần biết:

- **Chỉ một lượt.** Reduce duyệt `nodes` gốc, các node vừa merge từ global node không được duyệt lại → **global node lồng trong global node không được nở** (ref con giữ nguyên, render ra flex rỗng / type gốc).
- Global node **bên trong một global section** vẫn được nở, vì `resolve` luôn chạy **sau** `compose` (mục 7).

---

## 6. Gập lại khi lưu: `decompose/1`, `apply_writes/3`, `seed_refs/2`, `remap_refs/2`

### 6.1 `Compose.decompose/1` — chỉ cho Global Section

`lib/builderx_api/editor_v2/global_sections/compose.ex:71-95`. Editor tải trang đã compose (section đã nở), user sửa ngay trong trang, rồi gửi **cả cây** lên. Backend phải tách phần section ra lưu về bảng section, trang chỉ giữ ref.

```
decompose(tree)
 ├─ unpack; lấy danh sách con trực tiếp của ROOT                     :72-73
 ├─ với mỗi con:
 │    global_marker(node)                                            :97-106
 │      ├─ không có specials.globalId → giữ nguyên
 │      └─ có → {global_id, kind (mặc định "custom"), rev (ép int, lỗi → 0)}
 │           extract(...)                                            :119-144
 │             ├─ subtree_ids: gom node gốc + mọi hậu duệ theo data.parent  :146-158
 │             ├─ master_root: parent = nil, bỏ globalId/Kind/Rev    :123-127
 │             ├─ write = %{id, kind, rev, tree: %{schema_version: 1, root_node_id, nodes}}
 │             └─ trong cây trang: xoá cả subtree, chèn ref node gsref-...
 ├─ strip_deep_markers: node KHÔNG ở tầng đầu mà vẫn mang globalId
 │    (vd user kéo section vào trong khối khác) → xoá stamp, coi như node thường   :160-173
 └─ {:ok, ref_tree, writes}
```

`grow/2` (`:150-158`) lặp đến điểm cố định: mỗi vòng thêm các node có `parent` nằm trong tập — O(độ sâu × số node), đủ nhanh với trang cỡ vài nghìn node.

### 6.2 `GlobalSections.apply_writes/3` — hàng rào `rev`

`lib/builderx_api/editor_v2/global_sections.ex:101-125`. Với mỗi `write` từ `decompose`:

| Điều kiện | Kết quả | Ý nghĩa |
|---|---|---|
| Section không tồn tại (`get` trả nil) | bỏ qua, không trả gì | Section đã bị xoá |
| `GlobalSection.tree(section) == write.tree` (`:109`) | không ghi, trả rev hiện tại | Không đổi gì → không bump rev |
| `write.rev < section.rev` (`:112`) | **không ghi**, trả warning `reason: "stale_global"` | Tab khác / trang khác đã sửa section sau khi tab này tải → chặn ghi đè |
| Còn lại | `save_document/3` (`:71-79`): encode, `rev + 1`, `updated_by` | Ghi thành công |

Kết quả `{revs, warnings}` được `Pages.save_tree/3` trả về client dưới key `globals` / `warnings` (`lib/builderx_api/editor_v2/pages.ex:91-107`) để client cập nhật `globalRev` mới.

`GlobalNodes.apply_writes/3` (`global_nodes.ex:116-139`) viết y hệt với `reason: "stale_node"` nhưng **không có nơi nào gọi** (grep toàn repo) — global node được client lưu trực tiếp qua `POST /global_nodes/:id`, **không có hàng rào rev** (`save_document` bump vô điều kiện).

### 6.3 `seed_refs/2` — gắn header/footer cho trang mới

`compose.ex:175-206`. Gọi từ `Pages.build_create_tree/2` (`pages.ex:166-169`) khi tạo trang:

1. `ensure_root/1` (`:264-297`) — cây rỗng/hỏng → tạo ROOT mặc định (`type: "root"`, `isCanvas: true`).
2. Tính các `globalKind` đã có ở tầng đầu (`:179-184`).
3. Với mỗi section mặc định (`GlobalSections.default_sections/1`, luôn là `[header, footer]` theo thứ tự): chưa có kind đó thì `insert_ref/3` — **header chèn đầu**, các kind khác **chèn cuối** (`:203`).

### 6.4 `remap_refs/2` — dùng khi import site

`compose.ex:208-235`. Đổi `globalRef` cũ → id section mới theo `id_map`. Gọi từ `SiteBundles.clone_pages/3` (`lib/builderx_api/editor_v2/site_bundles.ex:135`).

### 6.5 `referenced_ids/1`

- Section (`compose.ex:237-249`): `globalRef` của **con trực tiếp ROOT**.
- Node (`global_nodes/compose.ex:40-50`): `globalNodeRef` của **mọi node**.

---

## 7. Ai gọi compose/resolve và sync refs

```
Editor mở trang      GET  /pages/:id      → Pages.composed_tree_json/1          pages.ex:116
                                              └─ composed_source/1                pages.ex:109-114
                                                   ├─ Compose.compose(tree, GlobalSections.map_by_id)
                                                   └─ GlobalNodes.Compose.resolve(…, GlobalNodes.map_by_id)
Khôi phục version    POST /versions/:v/restore → composed_tree_json               version_controller.ex:92
Preview draft        GET  /pages/:id/preview → Doc.decode(Pages.composed_source)  render_controller.ex:205
Lưu trang            POST /pages/:id      → Pages.save_tree/3                     pages.ex:91-107
                                              ├─ decompose → ref_tree + writes
                                              ├─ GlobalSections.apply_writes
                                              ├─ GlobalSections.sync_page_refs(ref_tree)
                                              └─ sync_global_node_page_refs(ref_tree)  pages.ex:171-174
                                                   (compose section trước, rồi mới quét globalNodeRef
                                                    → global node nằm trong header/footer cũng được tính)
Tạo trang            POST /pages          → Pages.create_from_params/3            pages.ex:129-153
                                              ├─ build_create_tree (decompose + seed_refs)
                                              └─ sync cả 2 loại ref
Publish              Published.publish_page/4                                    published.ex:34-85
                                              ├─ Compose.compose  (:36)
                                              ├─ GlobalNodes.Compose.resolve  (:38)
                                              ├─ … compile, lưu published page (xem chương 06)
                                              └─ GlobalNodes.sync_page_refs(page, ref_tree)  (:81)
Export site          SiteBundles.export_pages/1   compose section, KHÔNG resolve global node   site_bundles.ex:46-65
Import site          SiteBundles.clone_pages/3    decompose + clone_globals + remap_refs       site_bundles.ex:112-176
```

**Thứ tự luôn là `compose` (section) rồi `resolve` (node).** Đảo ngược thì global node nằm trong header sẽ không được nở.

### 7.1 `sync_page_refs` — cập nhật bảng "ai dùng ai"

- `GlobalSections.sync_page_refs/3` (`global_sections.ex:148-150`) → `set_page_refs/3` (`:127-146`): **xoá hết** ref của trang, rồi insert lại từng `global_id` (`on_conflict: :nothing`). Không bọc transaction.
- `GlobalNodes.sync_page_refs/3` (`global_nodes.ex:99-114`): cùng kiểu.

Bảng ref chỉ phục vụ **tra ngược** (`usage`, `list?page_id=`, invalidate cache). Render **không** đọc bảng ref — render đọc thẳng `globalRef` trong cây.

---

## 8. API quản lý

Tất cả nằm dưới `/api/v1/editor_v2/sites/:site_id` (pipeline `:api, :auth, :account, :site` — xem [02 — Editor API](./02-editor-api.md)). Response bọc theo `FallbackController`: `{:success, :with_data, x}` → 200 `{data: x}`, `{:failed, :with_reason, msg}` → 422.

### 8.1 Global Sections — `lib/builderx_api_web/controllers/v1/editor_v2/global_section_controller.ex`

| Method & path | Hàm | Hành vi |
|---|---|---|
| `GET /global_sections` | `index` `:23` | `ensure_defaults/1` (`global_sections.ex:81-91`) — **GET có tác dụng phụ**: tự tạo `header`/`footer` nếu chưa có — rồi trả list (kèm `source`). |
| `GET /global_sections/:id` | `show` `:33` | Không có → 422 `"Global section not found"`. |
| `POST /global_sections/:id` | `update` `:49` | `PageSource.build_tree(params)` → `save_document`. Bump `rev` **vô điều kiện**, không có hàng rào rev (hàng rào chỉ có ở đường lưu page). |
| `PATCH /global_sections/:id/rename` | `rename` `:71` | Chỉ nhận `name`. |
| `GET /global_sections/:id/usage` | `usage` `:88` | `page_ids_for/2` → danh sách `page_id`. |

Không có route tạo / xoá section. `GlobalSections.create/2` chỉ được gọi nội bộ (`ensure_defaults`, `SiteBundles.clone_globals`); `GlobalSections.delete/1` (`:65-69`) và `GlobalSections.for_page/2` (`:35-43`) **không có nơi gọi**.

### 8.2 Global Nodes — `lib/builderx_api_web/controllers/v1/editor_v2/global_node_controller.ex`

| Method & path | Hàm | Hành vi |
|---|---|---|
| `GET /global_nodes?type=&page_id=` | `index` `:31` | `type` nhận tên (`popup`) hoặc số (`3`/`"3"`) qua `Enum.GlobalNodeType.parse/1`; sai → 400. `page_id` phải là UUID; sai → 400. Có `page_id` thì inner join bảng ref (`global_nodes.ex:22-26`). |
| `GET /global_nodes/:id` | `show` `:62` | |
| `POST /global_nodes` | `create` `:78` | Chỉ lấy `type`, `name`. Source rỗng → node này `empty?` → nếu trang đã ref thì compose sẽ **bỏ** nó cho tới khi có nội dung. |
| `POST /global_nodes/:id` | `update` `:95` | Ghi cây + `metadata` (bỏ trống thì giữ bản cũ). Sau khi ghi gọi `invalidate_pages/2` (`global_nodes.ex:86-90`) xoá SkeletonCache của các trang dùng nó. |
| `PATCH /global_nodes/:id/rename` | `rename` `:119` | |
| `DELETE /global_nodes/:id` | `delete` `:138` | Xoá mềm + invalidate cache. Trang tham chiếu sẽ **mất** khối này ở lần compose/publish sau. |
| `GET /global_nodes/:id/usage` | `usage` `:156` | |

---

## 9. Điểm bất thường / chưa nối

1. **Sửa global chưa lên trang public cho tới khi publish lại.** Trang public đọc `published_pages.source`, trong đó section và global node đã được nở sẵn lúc publish (`published.ex:36-38`). Vì vậy `invalidate_pages` trong `GlobalNodes` chỉ xoá cache Redis — lần tải sau nạp lại **đúng bản publish cũ**, nội dung không đổi. `GlobalSections.save_document` thì không invalidate gì cả. BA cần nói rõ với merchant: "sửa header → bấm Publish".
2. **`GlobalNodes.apply_writes/3` không được dùng** → global node không có kiểm tra xung đột: hai tab cùng sửa một menu thì tab ghi sau thắng.
3. **Global node lồng global node không được nở** (resolve chỉ một lượt, mục 5).
4. **Export không mang theo global node.** `SiteBundles.export_pages/1` chỉ compose section; `globalNodeRef` vẫn trỏ id của site cũ, và import không tạo global node → trên site mới các ref này `:missing` và bị bỏ.
5. **Import gộp section trùng kind.** `SiteBundles.clone_globals/3` (`site_bundles.ex:152-176`): với `header`/`footer`, chỉ write **đầu tiên** được đổ vào section mặc định; write thứ hai cùng kind có `target = nil` (`:161`) → bị bỏ, và ref của nó không có trong `id_map` → trên site mới bị compose coi là `:missing`. Kind `custom` thì tạo section mới cho mỗi write.
6. **`GET /global_sections` ghi dữ liệu** (tạo header/footer mặc định).
7. `set_page_refs` / `sync_page_refs` xoá rồi insert không trong transaction — lỗi giữa chừng để bảng ref thiếu (chỉ ảnh hưởng `usage`, không ảnh hưởng render).

---

## 10. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Header/footer không hiện trên trang | Section có `is_deleted = true` hoặc `source` rỗng (`GlobalSection.empty?/1`) → compose xoá ref. Ref có nằm **đúng tầng con của ROOT** không (`compose.ex:10-11`). |
| Sửa header trong editor rồi lưu, trang khác vẫn header cũ | Response lưu có `warnings: [{reason: "stale_global"}]` không → tab đang giữ `globalRev` cũ (`global_sections.ex:112`). Nếu không có warning: đã publish lại chưa (mục 9.1). |
| Sửa menu/popup (global node) nhưng web thật không đổi | Chưa publish lại. Invalidate cache không đủ (mục 9.1). |
| Global node biến mất khỏi trang | Global node đã xoá mềm hoặc `source` rỗng → `resolve` gỡ khỏi cha (`global_nodes/compose.ex:19-21`). |
| Hai bản cùng menu trong một trang bị "dính" nhau | Kiểm tra id sau nở có dạng `<ref>-gn-<id>` không (`global_nodes/compose.ex:75,100`); ref id phía client có khác nhau không. |
| `usage` trả thiếu trang | Bảng ref chỉ sync khi lưu / tạo / publish trang; trang cũ chưa lưu lại từ khi có tính năng sẽ thiếu. Xem `sync_page_refs`. |
| `GET /global_nodes?type=abc` trả 400 | `Enum.GlobalNodeType.parse/1` chỉ nhận `menu|filter_set|popup|cart` hoặc `1..4` (`lib/builderx_api/enum.ex:475`). |
| Site import xong mất header thứ hai / mất menu | Mục 9.4, 9.5. |

Xem tiếp: [04 — Gán template & trang động](./04-page-assignment.md), [06 — Publish](./06-publish.md).
