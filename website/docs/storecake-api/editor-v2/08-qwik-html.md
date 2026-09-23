---
sidebar_position: 9
title: "08 — QwikV2: dựng HTML"
---

# 08 — QwikV2: dựng HTML

> **Cho BA:** Trang mà chủ shop kéo thả trong editor được lưu thành một danh sách "khối" (node): khối chữ, khối ảnh, khối danh sách sản phẩm… `QwikV2` là bộ máy phía server **đọc danh sách khối đó và viết ra HTML** cho trình duyệt. Mỗi loại khối có một "thợ" riêng (module `html.ex`). Một số khối cần tương tác (tab, popup, slider, chọn biến thể) thì HTML được đánh dấu để JavaScript phía trình duyệt "đánh thức" sau. Khối nào cần dữ liệu cập nhật liên tục (giá, tồn kho, danh sách sản phẩm) thì lúc publish được **để trống một ô**, tới khi có khách xem mới điền.

Chương này đi qua `lib/qwik_v2/` phần sinh HTML. CSS ở [09](./09-qwik-css.md), JS phía trình duyệt ở [10](./10-render-v2-js.md), dữ liệu binding ở [05](./05-bindings.md), nơi gọi các hàm này ở [06](./06-publish.md) và [07](./07-render-request.md).

---

## 1. `%QwikV2{}` và ctx trong process dictionary

File: `lib/qwik_v2/qwik_v2.ex`

```elixir
@ctx_key :qwik_v2_ctx                                     # :4

defstruct site: nil, page: nil, nodes: %{}, root_id: "ROOT",
          style_data: %{}, currency: "VND", lang: "en",
          product: nil, category: nil, article: nil, blog: nil,
          refs: %{}, list_product: [], preview: false     # :6-19
```

| Field | Dùng làm gì |
|---|---|
| `nodes` | Map phẳng `id → node` (đúng format editor lưu: `node["data"]["type"]`, `["nodes"]` = id con, `["config"]`, `["specials"]`, `["style"]`, `["bindings"]`, `["events"]`). |
| `root_id` | Node bắt đầu đệ quy, thường `"ROOT"`. |
| `style_data` | Style global đang chọn (CSS dùng). |
| `product` / `category` / `article` / `blog` | Entity của **trang động** (từ URL) — binding "auto" (id không phải UUID) đọc ở đây. |
| `refs` | Entity đã query sẵn theo loại (xem [07 §4.3](./07-render-request.md)). |
| `preview` | `true` khi dựng draft. |
| `list_product` | Khai báo nhưng hiện không nơi nào trong `lib/qwik_v2` đọc (chưa xác minh nơi khác). |

### 1.1 Vì sao dùng process dictionary

```elixir
def build(%__MODULE__{} = ctx, opts \\ []) do          # :21
  Process.put(@ctx_key, ctx)                            # :22
  QwikV2.Data.Seed.reset()                              # :23
  QwikV2.WebImage.reset()                               # :24
  try do
    html = unless opts[:only_css], do: IO.iodata_to_binary(HTML.app())   # :27
    css  = unless opts[:only_html], do: CSS.app()                         # :28
    {html, css}
  after
    Process.delete(@ctx_key)                            # :31
  end
end

def ctx, do: Process.get(@ctx_key, %__MODULE__{})       # :45

def with_ctx(%__MODULE__{} = ctx, fun) do              # :47-56
  prev = Process.get(@ctx_key)
  Process.put(@ctx_key, ctx)
  try do fun.() after
    if prev, do: Process.put(@ctx_key, prev), else: Process.delete(@ctx_key)
  end
end
```

- Việc dựng HTML là **một lần duyệt cây**. Thay vì truyền `ctx` qua mọi hàm `build(id, node)`, mọi module gọi `QwikV2.ctx()` để lấy. Chữ ký `build/2` của các node vì thế đơn giản và giống nhau.
- `with_ctx` **khôi phục ctx cũ** khi xong → lồng được: `Compile.with_subtree` tạm mở rộng `ctx.nodes` rồi trả lại.
- `try/after` bảo đảm dọn ctx kể cả khi exception.

**Hệ quả cần nhớ:**

| Hệ quả | Chi tiết |
|---|---|
| Chỉ chạy trong **đúng process** đang dựng | Không được `Task.async` / `spawn` bên trong một node — process con không có ctx, `QwikV2.ctx()` trả struct rỗng (nodes `%{}`) → render ra rỗng mà không báo lỗi. |
| `ctx()` ngoài vòng dựng trả mặc định | `Process.get(@ctx_key, %__MODULE__{})` — không crash, dễ che lỗi. |
| Nhiều key process khác cùng cơ chế | `:qwik_v2_seed_pool` (Seed), `:qwik_v2_img_count`/`:qwik_v2_hero` (WebImage), `:qwik_v2_compile*` (Compile), các Scope. Các key này **không** tự xóa trong `build` — `reset()` gọi ở đầu mỗi lần dựng. `:qwik_v2_hero` cố ý còn lại sau `build` để `render_doc` đọc `hero_preload`. |
| An toàn giữa request | Mỗi request Phoenix là một process riêng → không rò rỉ giữa khách. Nhưng trong **một** process (vd `publish_site` publish nhiều page tuần tự) phải dựa vào `reset()`. |

`bundle/1` (`:35-43`) giống `build` nhưng chỉ gọi `CSS.bundle()` — dùng lúc publish ([06](./06-publish.md), [09](./09-qwik-css.md)).

---

## 2. `HTML.app` → đệ quy theo cây

File: `lib/qwik_v2/html.ex`

```elixir
def app, do: render(QwikV2.ctx().root_id)                    # :4

def render(id) do                                              # :6
  case Map.get(QwikV2.ctx().nodes, id) do
    nil -> ""                                                  # :8-9  id mồ côi → bỏ qua
    node ->
      type = get_in(node, ["data", "type"]) || "div"           # :12
      case Registry.html_mod(type) do
        nil -> QwikV2.Common.element("div", id, node, wrapper: true)   # :15 type lạ → <div> + render con
        mod -> mod.build(id, node)                             # :16
      end
  end
end
```

Đệ quy không nằm ở đây mà ở **module node**: container gọi `Common.children(data)` (`common.ex:54-56`) = `Enum.map(data["nodes"], &HTML.render/1)`.

```
HTML.app
 └─ render("ROOT") → RootCanvas.HTML.build
      └─ Common.children → render("sec-1") → FlexSection.HTML.build
           └─ Common.children → render("blk-1") → FlexBlock.HTML.build
                ├─ render("h-1")  → Heading.HTML.build   (lá)
                └─ render("ld-1") → ListDataset.HTML.build
                      └─ (mỗi item) DatasetBlock.HTML.build → children …
```

- Kết quả là **iodata** (list lồng nhau), chỉ nối thành binary một lần ở `QwikV2.build` (`:27`) — rẻ hơn nối chuỗi ở mỗi node.
- Type không có trong Registry vẫn render **con** của nó (fallback `div`). Ngược lại `Compile.fill` (khi điền slot) không có fallback — xem [07 §4.5](./07-render-request.md).

---

## 3. `Registry` — type ↔ module

File: `lib/qwik_v2/registry.ex`

```elixir
def html_mod(type),   do: mod(@html, type, "HTML")        # :71
def css_mod(type),    do: mod(@css, type, "CSS")          # :72
def static_mod(type), do: mod(@css, type, "StaticCSS")    # :73
def data_mod(type),   do: mod(@data, type, "Data")        # :74

defp mod(map, type, kind) do                               # :76-81
  case Map.get(map, type) do
    nil -> nil
    base -> Module.concat([QwikV2.Nodes, base, kind])     # "heading" → QwikV2.Nodes.Heading.HTML
  end
end
```

Quy ước thư mục: `lib/qwik_v2/nodes/<snake_type>/{html,css,static_css}.ex` định nghĩa `QwikV2.Nodes.<Base>.{HTML,CSS,StaticCSS}`. `Module.concat` **không kiểm tra module tồn tại** — gõ sai tên base chỉ lộ ra lúc runtime (`UndefinedFunctionError`).

### 3.1 Bảng đầy đủ

"Dựng lúc" — **publish** = HTML nướng sẵn vào skeleton; **request** = node bị `Compile.capture*` thành slot, dựng mỗi lượt xem (§5). "JS island" = tên module mà `x:init`/`x:now` gọi trong `assets/render_v2/nodes/*.js`.

| Type (`data.type`) | Base module | Trong `@html`? | Dựng lúc | JS island |
|---|---|---|---|---|
| `root` | `RootCanvas` | ✓ | publish | `Global` (`x:now`, luôn có) |
| `flex-section` | `FlexSection` | ✓ | publish | — |
| `flex-block` | `FlexBlock` | ✓ | publish | — |
| `text` | `Text` | ✓ | publish | — |
| `heading` | `Heading` | ✓ | publish | — |
| `button` | `Button` | ✓ | publish | — (chỉ event, §8) |
| `image` | `Image` | ✓ | publish | — |
| `icon` | `Icon` | ✓ | publish | — |
| `video` | `Video` | ✓ | publish | `Video` khi `videoType` hosting |
| `google-map` | `GoogleMap` | ✓ | publish | — |
| `breadcrumb` | `Breadcrumb` | ✓ | publish | — |
| `list` / `list-item` | `List` / `ListItem` | ✓ | publish | — |
| `accordion` / `accordion-content` | `Accordion` / `AccordionContent` | ✓ | publish | `Accordion` |
| `tab` / `tab-content` | `Tab` / `TabContent` | ✓ | publish | `Tab` |
| `text-marquee` / `text-marquee-item` | `TextMarquee` / `TextMarqueeItem` | ✓ | publish | `Marquee` |
| `image-comparison` | `ImageComparison` | ✓ | publish | `ImageComparison` |
| `popup` | `Popup` | ✓ | publish | `Popup` (`x:now`) |
| `text-dataset` | `TextDataset` | ✓ | **request** (`capture`) | `TextDataset` khi mô tả rút gọn có nút "xem thêm" |
| `pricing-dataset` | `PricingDataset` | ✓ | **request** (`capture`) | `PricingDataset` (có điều kiện) |
| `quantity-dataset` | `QuantityDataset` | ✓ | **request** (`capture`) | `QuantityDataset` |
| `product-variants` | `ProductVariants` | ✓ | **request** (`capture_children`) | qua con `ProductVariantOption` |
| `product-variant-label` | `ProductVariantLabel` | ✓ | theo cha | — |
| `product-variant-option` | `ProductVariantOption` | ✗ (chỉ `@css`) | theo cha | `ProductVariantOption` |
| `media-dataset` | `MediaDataset` | ✓ | **request** (`capture_children`) | qua con |
| `product-image-feature` | `ProductImageFeature` | ✗ (chỉ `@css`) | theo cha | `ProductImageFeature` |
| `product-image-list` | `ProductImageList` | ✗ (chỉ `@css`) | theo cha | `ProductImageList` |
| `dataset-block` | `DatasetBlock` | ✓ | **request** (`capture_subtree`) | — |
| `list-dataset` | `ListDataset` | ✓ | **request** (`capture_subtree`) | `ListDataset` khi `layout = slide` hoặc có phân trang |

- 3 type ✗ không có trong `@html` vì **không bao giờ render độc lập**: cha (`ProductVariants`, `MediaDataset`) alias và gọi thẳng `Option.build`/`Feature.build`… (`nodes/product_variants/html.ex:5-6`, `nodes/media_dataset/html.ex:5-6`). Nếu editor lỡ đặt chúng ngoài cha → fallback `div` (§2).
- `@data` rỗng (`registry.ex:69`) → `data_mod/1` luôn `nil` → `XData.type_data` luôn `%{}`. Cơ chế "data per type" đã dựng khung nhưng **chưa có type nào dùng**.
- Nguồn danh sách JS island: grep `Common.x_init` / `x_now` trong `lib/qwik_v2/nodes`, đối chiếu `assets/render_v2/nodes/*.js`.

---

## 4. `Common` — viên gạch chung

File: `lib/qwik_v2/common.ex`

### 4.1 `element/4` (`:2-21`)

```elixir
def element(tag, id, node, opts \\ []) do
  data = node["data"] || %{}
  type = data["type"] || "div"
  classes = opts[:class] || ""
  attrs =
    ~s( class="#{esc_attr(classes)}" id="#{esc_attr(id)}" data-node-type="#{esc_attr(type)}") <>
      if(opts[:wrapper], do: " canvas-node-wrapper", else: "") <>
      if(opts[:flex], do: " canvas-flex", else: "") <>
      QwikV2.Events.attrs(node, tag) <>
      (opts[:attrs] || "")
  if opts[:void] do
    ["<#{tag}#{attrs} />"]
  else
    inner = Keyword.get(opts, :inner) || children(data)
    ["<#{tag}#{attrs}>", inner, "</#{tag}>"]
  end
end
```

| Phần | Vì sao |
|---|---|
| `id="<node id>"` | CSS sinh selector `#<id>` ([09](./09-qwik-css.md)); JS island tìm phần tử theo id; list-dataset gửi `$el.id` làm `node_id` khi phân trang. |
| `data-node-type` | Debug / CSS theo loại. |
| `canvas-node-wrapper`, `canvas-flex` | Attribute boolean giữ **convention DOM giống editor** (editor frontend cũng dùng) để CSS dùng chung. |
| `Events.attrs(node, tag)` | Gắn `href` hoặc `on:click=…` từ `data.events` (§8). |
| `opts[:attrs]` | Chỗ node chèn `x:init`, `x:props`, `data-*` riêng. |
| `inner` mặc định | Không truyền `:inner` → tự render con. |
| Trả **list** | Giữ iodata — quan trọng cho Compile (§5.3). |

### 4.2 Helper khác

| Hàm | Dòng | Ghi chú |
|---|---|---|
| `x_init(name)` | `:23` | ` x:init="Name"` + `Compile.mark_runtime()` — island được "đánh thức" lazy (khi cần). |
| `x_now(name)` | `:40` | ` x:now="Name"` — đánh thức ngay khi load. Dùng cho `Global`, `Popup`. |
| `x_props(map)` | `:25-29` | ` x:props='<json>'` — dấu `'` được thay `&#39;`. Map rỗng → `""`. |
| `x_ref(type, entity)` | `:31-38` | `x:props='{"ref":{"type":"product","id":…}}'` — cho island biết entity nào để tra trong seed. |
| `html_tag(specials, default)` | `:47-52` | Cho phép đổi tag (`h1`…`p`) qua `specials.htmlTag`; `sanitize_tag` chỉ nhận `[a-zA-Z][a-zA-Z0-9]*`, sai → `"div"`. |
| `text(data, specials)` | `:70-72` | `specials.text` → `config.text` → `""`. **Không escape** — đây là HTML rich-text từ editor (Tiptap). |
| `gs_class(data)` | `:74-79` | `config.textGlobalStyle = "h1"` → class `wk-gs-h1` (preset chữ global). |
| `bg_video(config, class)` | `:58-68` | `<video autoplay muted loop playsinline>` nền nếu có `backgroundVideoUrl`. |
| `esc_attr` / `esc_html` | `:85-98` | `esc_attr` chỉ thay `&` và `"` (đủ cho attribute bọc `"`); `esc_html` thay `& < >`. |

> ⚠️ `Common.text` in thẳng HTML người dùng soạn. Tin cậy dựa trên việc chỉ chủ shop (đã auth) sửa được nội dung. Nếu sau này có nguồn nội dung khác (import, AI) cần sanitize ở tầng lưu.

---

## 5. Compile mode — skeleton và slot

File: `lib/qwik_v2/compile.ex`. Gọi từ `Published.publish_page` ([06](./06-publish.md)).

### 5.1 `compile/1` (`:10-31`)

```elixir
QwikV2.with_ctx(ctx, fn ->
  Process.put(@flag, true)          # :qwik_v2_compile       → Compile.active?() = true
  Process.put(@nodes, %{})          # node động thu được
  Process.put(@refs, %{})           # id entity cứng thu được
  Process.put(@runtime, false)      # có node nào cần JS?
  try do
    %{
      skeleton: segments(HTML.app()),
      dynamic_nodes: Process.get(@nodes),
      refs: Map.new(Process.get(@refs), fn {type, set} -> {type, MapSet.to_list(set)} end),
      scripts: QwikV2.Scripts.tags(ctx.nodes)
    }
  after
    Process.delete(...)  # dọn 4 key
  end
end)
```

Thứ tự trong map literal được đánh giá từ trên xuống: `HTML.app()` chạy trước nên khi tới `Scripts.tags` cờ `@runtime` đã phản ánh đủ mọi `x_init`/`x_now`.

### 5.2 Node "động" tự khai báo mình

Node cần dữ liệu lúc request mở đầu `build/2` bằng:

```elixir
def build(id, node) do
  if Compile.active?() do
    Compile.capture(id, node)        # hoặc capture_children / capture_subtree
  else
    ... render thật ...
  end
end
```

| Hàm | Dòng | Lưu gì vào `dynamic_nodes[id]` | Dùng cho |
|---|---|---|---|
| `capture/2` | `:39-48` | node nguyên trạng; nếu binding đầu có UUID → `add_ref(type, id)` | lá: text/pricing/quantity-dataset |
| `capture_children/2` | `:58-62` | node + `data._children_nodes` = list node con **trực tiếp** | product-variants, media-dataset |
| `capture_subtree/2` | `:64-78` | node + `data._subtree` = map **mọi hậu duệ** (đệ quy `collect_subtree`) | dataset-block, list-dataset |

Cả ba trả `%{"slot" => id}` — một map nằm **giữa** iodata HTML.

Lúc request (không có full `ctx.nodes`), node đọc lại con qua:

- `Compile.children(data, child_ids)` (`:91-96`): ưu tiên `_children_nodes`, không có thì tra `ctx.nodes` (chế độ draft).
- `Compile.with_subtree(node, fun)` (`:80-89`): merge `_subtree` vào `ctx.nodes` trong thời gian chạy `fun` (qua `with_ctx`), để `Common.children` / `HTML.render` bên trong tìm thấy con.

### 5.3 `segments/1` — biến iodata thành skeleton (`:125-139`)

```elixir
iodata |> List.wrap() |> List.flatten() |> coalesce()
# coalesce: chunk_by "là slot hay không"
#   nhóm slot   → giữ nguyên từng %{"slot" => id}
#   nhóm chuỗi  → IO.iodata_to_binary thành 1 chuỗi
```

Ví dụ: `["<div…>", ["<h2…>", "Hi", "</h2>"], %{"slot"=>"ld-1"}, "</div>"]` → `["<div…><h2…>Hi</h2>", %{"slot"=>"ld-1"}, "</div>"]`.

> ⚠️ **Luật bắt buộc khi viết node container:** giữ con dưới dạng **iodata list**, không `<>` / `IO.iodata_to_binary` phần con. Nếu nối chuỗi, lúc compile một con là map `%{"slot"=>…}` → `ArgumentError`. Các container tĩnh hiện tại (`flex_section`, `flex_block`, `popup`, `root_canvas`, `text_marquee`, `accordion`, `tab`…) đều tuân thủ. `DatasetBlock` và `ListDataset` có nối binary nhưng **chỉ ở nhánh render thật** (sau khi đã qua `Compile.active?()`).

### 5.4 Khi nào một node **nên** là động

Node đọc từ `ctx.product` / `ctx.refs` / Scope → phải capture. Nếu không, giá trị lúc publish (ctx không có entity) bị nướng vào skeleton. Ví dụ hiện có: `Breadcrumb` hard-code `Home / Product detail` (`nodes/breadcrumb/html.ex:16-19`) — **chưa nối** dữ liệu thật và không capture.

---

## 6. Ví dụ 1 — node đơn giản: `heading` / `text`

File: `lib/qwik_v2/nodes/heading/html.ex`

```elixir
def build(id, node) do
  data = node["data"] || %{}                               # :5
  specials = data["specials"] || %{}                       # :6
  tag = Common.html_tag(specials, "h2")                    # :7  mặc định h2, chủ shop đổi được h1..h6/p
  Common.element(tag, id, node,                            # :9
    class: String.trim("wk-heading #{Common.gs_class(data)}"),   # :10 + preset chữ global
    wrapper: true,                                         # :11
    inner: Common.text(data, specials)                     # :12 HTML rich-text
  )
end
```

Input:

```json
"h-1": {"data": {"type": "heading", "specials": {"text": "Xin <b>chào</b>", "htmlTag": "h1"},
                 "config": {"textGlobalStyle": "h1"}, "nodes": []}}
```

Output:

```html
<h1 class="wk-heading wk-gs-h1" id="h-1" data-node-type="heading" canvas-node-wrapper>Xin <b>chào</b></h1>
```

`text/html.ex` giống hệt, khác class `wk-text` và tag mặc định `p`. Style (màu, font, responsive) **không** nằm trong HTML — nằm ở CSS theo `#h-1` ([09](./09-qwik-css.md)).

---

## 7. Ví dụ 2 — node phức tạp: `list-dataset`

File: `lib/qwik_v2/nodes/list_dataset/html.ex` (+ `source.ex`). List lặp một "mẫu item" (`dataset-block` con đầu tiên) cho N sản phẩm / danh mục / bài viết.

### 7.1 Cấu trúc node

```
list-dataset (ld-1)
  data.bindings[0].target.type  "product" | "category" | "post"   → Source.kind
  data.config.collectionType / collectionId                        → key nguồn
  data.specials.quantity                                           → page_size (mặc định 4)
  data.config.loadMode         "pagination" | "show_more" | "infinite_scroll" | khác
  data.style.layout            "grid" | "slide"
  data.nodes = ["db-1"]
     └─ dataset-block (db-1)   ← mẫu item, render lại cho từng entity
          └─ text-dataset, pricing-dataset, image…
```

### 7.2 `Source` (`source.ex`)

| Hàm | Dòng | Logic |
|---|---|---|
| `kind/1` | `:7-15` | theo `target.type` binding đầu: `"category"` → `:category`, `"post"` → `:post`, còn lại → `:product`. |
| `collection_key/1` | `:17-22` | `collectionType == "collection"` → `collectionId` (hoặc `"all_products"`); khác → `"all_products"`. |
| `post_list_key/1` | `:24-29` | `"custom_posts_list"` → `collectionId`; khác → `"all_posts"`. |
| `quantity/1` | `:37-41` | `specials.quantity` → int, mặc định 4. Base-only: server render 1 lần nên không có số per-breakpoint. |
| `load_mode/1` | `:45-52` | chỉ nhận 3 mode hợp lệ, còn lại `"none"`. |
| `paged?/1` | `:54-56` | `layout != "slide"` **và** `load_mode != "none"`. |
| `page_size/1` | `:60` | `max(quantity, 1)`. |

### 7.3 `build/2` → `render/2` (`:9-58`)

```
build(id, node)
  Compile.active? → capture_subtree(id, node)        (publish: thành slot + lưu mọi hậu duệ)
  không           → render(id, node)                  (request / draft)

render(id, node)
  ① {kind, items, total} = source(data, config)        :21   dữ liệu từ ctx.refs (§7.4)
  ② items_per_row = max(config.itemsPerRow || 4, 1)    :23
     layout = style.layout || "grid"                    :24
  ③ inner =
       SlotScope.with_columns(columns_by_bp(node), fn →      :27  cột theo breakpoint → WebImage tính "sizes"
         Compile.with_subtree(node, fn →                      :28  đưa _subtree vào ctx.nodes
           child = ctx.nodes[first(data.nodes)]               :29-30
           nil      → ""
           "slide"  → slide(items, kind, items_per_row, …)    :34
           khác     → grid(items, kind, …)                    :35
  ④ paged? = Source.paged?(data); mode = paged? ? load_mode : "none"   :40-41
  ⑤ attrs = (slide hoặc paged?) ? x_init("ListDataset") <> paging_attrs : ""   :43-46
       paging_attrs → data-total, data-page-size, data-page="1"            :62-64
  ⑥ class "wk-list-dataset wk-list-dataset--<layout>[ wk-list-dataset--<mode>]"  :48-50
  ⑦ Common.element("div", …, inner: inner <> load_mode_ui(mode, total, length(items), data))  :52-57
```

### 7.4 `source/2` — lấy item từ `ctx.refs` (`:316-360`)

Node **không tự query DB**. Controller đã gom nhu cầu của mọi list-dataset và query trước ([07 §4.3](./07-render-request.md)):

| kind | Đọc | total |
|---|---|---|
| `:product` | `refs["collection"][collection_key]` → `take(count)` | `refs["collection_total"][key]` hoặc độ dài list |
| `:post` | `refs["post_list"][post_list_key]` | `refs["post_list_total"][key]` |
| `:category` + `custom_collections` | map `refs["category"]` theo `collectionIds` (bỏ id không tìm thấy) | số danh mục tìm thấy |
| `:category` khác | `refs["all_collections"]` | độ dài list |

### 7.5 Render từng item — Scope (`:235-245`)

```elixir
defp render_items(items, kind, child_id, child_node) do
  Enum.map_join(items, "", fn entity ->
    with_item(kind, entity, fn ->
      DatasetBlock.HTML.build(child_id, child_node) |> IO.iodata_to_binary()
    end)
  end)
end
defp with_item(:category, e, f), do: CategoryScope.with_category(e, f)
defp with_item(:post, e, f),     do: PostScope.with_post(e, f)
defp with_item(_product, e, f),  do: ProductScope.with_product(e, f)
```

Cùng **một** node mẫu `db-1` được build N lần; mỗi lần Scope đặt "entity hiện tại" khác nhau. Bên trong, `text-dataset` có binding auto (không UUID) gọi `Binding.entity` → `context_entity` → đọc Scope trước `ctx.product` ([05](./05-bindings.md)). Hệ quả: N item có **cùng id HTML** (`id="db-1"`, id các con cũng trùng) — CSS `#db-1` áp đều cho mọi item, đúng ý đồ; nhưng JS không được giả định id là duy nhất.

### 7.6 Layout

- **grid** (`:195-199`): `<div class="wk-list-dataset__grid">` + items. Số cột do CSS.
- **slide** (`:201-233`): `chunk_every(items_per_row)` thành hàng; hàng 0 có `is-active`; mỗi hàng có `x:class='{"is-active":"isActive.<i>"}'` để island bật/tắt. Nút điều hướng trong/ngoài (`listNavPosition`), chấm phân trang khi `paginationItemWidth/Height > 0`. Slide **không** phân trang server.

### 7.7 Load mode UI (`:66-172`)

| Mode | Hàm | HTML |
|---|---|---|
| `pagination` | `pager/2` | Chỉ khi > 1 trang. 7 ô số cố định (`page_slots/2` `:106-113`, **cùng luật với JS** `list-dataset.js`): < 8 trang liệt kê hết; ≥ 8 luôn giữ trang đầu/cuối + nút `•••`. Ô ẩn = số 0 + `is-hidden`. Mỗi nút có `x:text="slotLabel.<i>"`, `x:class`, `on:click='[{"call":"ListDataset#goSlot","props":{"s":i}}]'`. |
| `show_more` | `show_more/3` | Chỉ khi `total > shown`. Nút "Show more" (**hard-code tiếng Anh**) + icon, `on:click → ListDataset#loadMore`. |
| `infinite_scroll` | `sentinel/2` | `<div x:ref="sentinel">` — island quan sát bằng IntersectionObserver. |

SSR chỉ dựng **trang 1** (`data-page="1"`). Trang sau: `POST /view/list_dataset_page` → `page_items/2` (`:179-193`) — giống bước ③ nhưng trả **chỉ các item** (không wrapper, không pager) để JS chèn vào `.wk-list-dataset__grid`. Luồng đầy đủ: [07 §7](./07-render-request.md).

---

## 8. Events — `data.events` → attribute

File: `lib/qwik_v2/events.ex`, `lib/qwik_v2/events/*.ex`

```elixir
@actions %{"go_to_url" => GoToUrl, "popup" => Popup, "open_page" => OpenPage,
           "open_cart" => OpenCart, "go_to_checkout" => GoToCheckout}          # :4-10
@dom_events %{"click" => "click", "hover" => "mouseenter", "dblclick" => "dblclick"}   # :12
@anchor_types ["button"]                                                       # :14
```

Event trong node: `%{"name" => "go_to_url", "trigger" => "click", "target" => %{"url" => …, "openInNewTab" => true}}`. `events/1` (`:86-89`) chỉ giữ event có `trigger` hợp lệ.

`attrs(node, tag)` (`:16-29`): mỗi event → action module `.attrs(event, tag)` trả **chuỗi** (attribute thô) hoặc **map handler** (`Events.on/4`). Handler gom theo DOM event và in thành:

```html
on:click="[{&quot;call&quot;:&quot;NavigationEvent#goToUrl&quot;,&quot;props&quot;:{…}}]" on:click.stop
```

| Action | Output | Cần JS? (`runtime?`) |
|---|---|---|
| `go_to_url` trên `<a>` + click | ` href="…"` (+ `target="_blank" rel="noopener"`) | **Không** — link HTML thuần |
| `go_to_url` khác | `NavigationEvent#goToUrl {url, newTab}` + `.stop` | Có |
| `popup` | `PopupEvent#openPopup {id}` | Có |
| `open_page` | `NavigationEvent#openPage {linkType, id, label}` | Có |
| `open_cart` | `CartEvent#openCart` | Có |
| `go_to_checkout` | `CartEvent#goToCheckout` | Có |

`html_tag(node)` (`:91-97`): chỉ type `button` được đổi tag — có `go_to_url` click với url → `<a>`, không thì `<button>`. Mọi type khác coi là `div` khi tính event.

`used_dom_events(nodes)` (`:51-68`) → danh sách DOM event mà runtime phải lắng nghe (in vào `window.xevents`, [07 §6.3](./07-render-request.md)) — nhờ đó Loader chỉ gắn listener cần thiết. Lưu ý: tính theo `runtime?` chứ không kiểm tra `attrs` có thực sự in ra không (vd `go_to_url` url rỗng vẫn đăng ký `click`) — vô hại.

`xdata(node)` (`:72-81`): gộp `mod.data(event)` — hiện mọi action trả `%{}`.

---

## 9. `XData` và `Satellite`

**`XData`** (`lib/qwik_v2/x_data.ex`): `tag(nodes)` → `<script type="x/json">{"<id>": {...}}</script>` gộp `Registry.data_mod(type).data(id, node)` + `Events.xdata(node)`. Vì `@data` rỗng và `Events.xdata` luôn `%{}`, **hiện luôn trả `""`**. Đây là kênh dự phòng để đẩy data per-node cho JS.

**`Satellite`** (`lib/qwik_v2/satellite.ex`) — thực chất là helper **CSS**, không sinh HTML: một node có thể trỏ `config[key] = "<id node khác>"` để mượn style của node "vệ tinh" (vd style chữ của nút phân trang). `render(id, node, spec)` sinh rule CSS `"#<id> <spec.sel>"` từ node vệ tinh theo preset renderer (`:text`, `:box`, `:text_box`, `:size`, `:icon`). Chi tiết: [09](./09-qwik-css.md).

---

## 10. Scope — "entity hiện tại" cho cây con

File: `lib/qwik_v2/scope.ex`, `lib/qwik_v2/scope/*.ex`

```elixir
def enter(key, value, fun) do          # scope.ex:4-13
  prev = Process.get(key)
  Process.put(key, value)
  try do fun.() after
    if prev == nil, do: Process.delete(key), else: Process.put(key, prev)
  end
end
```

Server render là **một lần duyệt cây, không truyền props** → cha "đặt" giá trị, con "đọc". Khôi phục giá trị cũ khi ra → lồng nhau an toàn (list sản phẩm trong list danh mục).

| Scope | Key | Ai đặt | Ai đọc |
|---|---|---|---|
| `ProductScope` | `:qwik_v2_product_scope` | list-dataset (kind product), dataset-block | `Binding.context_entity("product")` trước `ctx.product` |
| `CategoryScope` | `:qwik_v2_category_scope` | list-dataset (kind category), dataset-block | `Binding.context_entity("category")` |
| `PostScope` | `:qwik_v2_post_scope` | list-dataset (kind post), dataset-block | binding post |
| `VariantScope` | `:qwik_v2_variant_scope` | `ProductVariants` — mỗi thuộc tính một lần (`product_variants/html.ex:33-45`): `%{attr, product, display_type, selected}` | `ProductVariantLabel`, `ProductVariantOption` |
| `MediaScope` | `:qwik_v2_media_scope` | `MediaDataset`: `%{images, alt, layout, active, product}` | `ProductImageFeature`, `ProductImageList` — vắng scope thì render rỗng |
| `SlotScope` | `:qwik_v2_slot_scope` | list-dataset: `%{bp => số cột}` | `WebImage.viewport_sizes` tính `sizes="(…) 25vw, …"` |

`DatasetBlock.with_entity_scope` (`nodes/dataset_block/html.ex:37-57`): nếu block có binding → `Binding.bound_entity(data) || <Scope>.current()` rồi mở scope cho con. Nghĩa là block có id cứng sẽ **ghi đè** entity của list cha.

---

## 11. `WebImage` — ảnh responsive + hero

File: `lib/qwik_v2/web_image.ex`, `lib/qwik_v2/helpers/image.ex`

| Hàm | Dòng | Việc |
|---|---|---|
| `reset/0` | `:16-19` | counter = 0, xóa hero. Gọi đầu mỗi `build`/`assemble`/`list_dataset_page`. |
| `img_attrs(src, node)` | `:71` | `img_boxes(node)` → `img_attrs_for`. |
| `img_boxes/1` | `:66-69` | Mỗi breakpoint: `--node-width-custom`/`--node-height-custom` → `{w,h}` px; đơn vị `% vw vh` → `nil` (không biết px). `rem` × 16. |
| `img_attrs_for/2` | `:73-85` | Có box ở breakpoint gốc → `sized_attrs` (src resize đúng box + `srcset` các box + `sizes` theo media query). Không → `viewport_attrs` (srcset theo `@device_widths` 640…3840, src 1200, `sizes` theo `SlotScope` hoặc `100vw`). |
| `perf_attrs(:hero_candidate)` | `:152-159` | Ảnh **thứ 0** trong lần dựng → `fetchpriority="high"` và lưu vào `:qwik_v2_hero`; các ảnh sau `loading="lazy"`. |
| `img_attrs_fixed/3` | `:87-98` | Kích thước cố định (thumbnail) → density srcset, luôn lazy. |
| `hero_preload/0` | `:21-26` | Dựng `<link rel="preload" as="image" imagesrcset=… imagesizes=… fetchpriority="high">` từ ảnh hero — `render_doc` chèn vào `<head>`. |
| `dim_attrs/1` | `:143-148` | `width`/`height` intrinsic đọc từ URL (`Image.intrinsic`) để chống layout shift. |

Mọi `<img>` có marker ` data-wk-img` (`:14`) — JS `core/image-reveal.js` dùng ([10](./10-render-v2-js.md)).

> ⚠️ Xem [07 §6.1](./07-render-request.md): ở trang published, ảnh tĩnh đã dựng lúc publish, nên "ảnh thứ 0" lúc request là ảnh **động** đầu tiên.

---

## 12. Icons, helpers, Seed

- **`Icons`** (`lib/qwik_v2/icons.ex`): đọc `priv/qwik_v2/icon_manifest.json` một lần, cache `:persistent_term`. `svg(name, size:, color:)` → `<svg viewBox="0 0 24 24">body</svg>`; tên không có → `""`. Đổi manifest trên server đang chạy **không** có hiệu lực tới khi restart (persistent_term không tự xóa).
- **`Helpers.Field.get(config, specials, key, default)`**: `config[key]` → `specials[key]` → default (bỏ `nil`/`""`). Mirror `resolveFieldValue` của SPA, không có cascade cha.
- **`Helpers.Cast`**: `to_int`, `to_num`, `truthy` (chấp nhận `"true"`/`"false"` dạng chuỗi — editor lưu lẫn cả hai), `parse_dimension("12rem") → {12.0, "rem"}`.
- **`Helpers.Ratio`**: `"custom"` → `"w / h"`, `auto` → không set `aspect-ratio`.
- **`Helpers.DateFormat.long/2`**: format ngày bài viết theo lang.
- **`Data.Seed`** (`lib/qwik_v2/data/seed.ex`): pool `type → id → projection` trong process. `reset/0` seed sẵn `ctx.product`; node gọi `Seed.put("product", p)` (vd `ProductVariants` `:24`). Chỉ `"product"` có projector (`ProductSeed.project`: id, slug, image, `variations{id, fields, giá, giá text, tồn, ảnh}`). Template in `<script type="x/seed">`; JS store product đọc để đổi giá/ảnh khi chọn biến thể.

---

## 13. `Scripts.tags` — nối HTML với JS

Đã phân tích ở [07 §6.3](./07-render-request.md). Tóm tắt điều kiện "có JS": có `x/json` **hoặc** DOM event cần runtime **hoặc** `Compile.needs_runtime?()` (có `x_init`/`x_now`) **hoặc** dev. Vì `root` luôn `x_now("Global")`, thực tế mọi trang đều nạp `Loader.js`.

> ⚠️ `mark_runtime` ghi `:qwik_v2_compile_runtime` kể cả khi **không** compile (draft). `compile/1` mới xóa key này; ở `serve_draft` giá trị còn lại trong process sau `build` và được `Scripts.tags` đọc ngay sau — đúng ý, nhưng phụ thuộc vào thứ tự gọi.

---

## 14. Thêm một node HTML mới (tóm tắt)

1. Tạo `lib/qwik_v2/nodes/<snake>/html.ex` → `defmodule QwikV2.Nodes.<Base>.HTML`, `def build(id, node)` trả **iodata**, dùng `Common.element`.
2. Thêm `"<type>" => "<Base>"` vào `@html` (và `@css` nếu có CSS) trong `registry.ex`.
3. Cần dữ liệu entity? Mở đầu bằng `if Compile.active?(), do: Compile.capture…(id, node)`, chọn `capture` / `capture_children` / `capture_subtree` theo việc node có đọc con hay không. Nếu cần query mới → bổ sung `build_refs`/`draft_refs` ([07 §4.3](./07-render-request.md), [05](./05-bindings.md)).
4. Cần JS? `Common.x_init("Name")` + tạo `assets/render_v2/nodes/<name>.js` ([10](./10-render-v2-js.md)).
5. Container: giữ con ở dạng list (§5.3).

---

## 15. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Node không hiện, chỉ ra `<div … canvas-node-wrapper>` trống | `data.type` có trong `@html` của `registry.ex` không; tên base đúng module không. |
| `UndefinedFunctionError QwikV2.Nodes.X.HTML.build/2` | Registry trỏ tới base chưa có file `html.ex` (Module.concat không kiểm tra). |
| `ArgumentError` lúc publish | Container nối chuỗi con (`<>`/`iodata_to_binary`) → gặp `%{"slot"=>…}` (§5.3). |
| Dữ liệu SP/danh mục "đóng băng" theo lúc publish | Node không `Compile.capture*` (§5.4). |
| Item trong list-dataset trống | `ctx.refs["collection"][key]` có dữ liệu không (`build_refs`); node mẫu là con **đầu tiên** của list; binding con dùng id auto để đọc Scope. |
| Mọi item list giống nhau | Binding trong item dùng UUID cứng → `bound_entity` ghi đè Scope. |
| Chọn biến thể / ảnh gallery không render | Chỉ render được bên trong cha (`VariantScope`/`MediaScope`); vắng scope → rỗng. |
| Tab/accordion/slider không tương tác | HTML có `x:init="…"`? `window.xbase` + `Loader.js` tải được? ([10](./10-render-v2-js.md)). |
| Nút link mở tab mới không đúng | `event.target.openInNewTab`; chỉ type `button` mới thành `<a href>`, type khác đi qua JS `NavigationEvent#goToUrl`. |
| Ảnh LCP chậm | `<link rel="preload" as="image">` trong head trỏ đúng ảnh chưa; ảnh có box px (`--node-width-custom`) để có `srcset` chuẩn. |
| Icon không hiện | Tên icon có trong `priv/qwik_v2/icon_manifest.json`; server đã restart sau khi đổi manifest. |
| Breadcrumb luôn "Home / Product detail" | Chưa nối dữ liệu (§5.4). |
| `QwikV2.ctx()` trả nodes rỗng trong code mới | Code chạy ngoài process dựng (Task/spawn) hoặc ngoài `with_ctx`. |
