---
sidebar_position: 12
title: "11 — Thêm một element mới (end-to-end phía API)"
---

# 11 — Thêm một element mới (end-to-end phía API)

> **Cho BA:** Mỗi "element" kéo thả trong editor (nút bấm, ảnh, tab…) cần **hai nửa**: nửa editor (Vue, repo `builderx_spa`) để người dùng chỉnh, và nửa render (repo `builderx_api`) để trang thật hiển thị giống hệt. Chương này là checklist nửa render. Nếu chỉ làm nửa editor, element vẫn hiện trong editor nhưng **trang publish sẽ ra một thẻ `<div>` rỗng** — không báo lỗi. Ước lượng: element tĩnh ~3 file Elixir; element có tương tác thêm 1 file JS; element bind dữ liệu sản phẩm thêm phần binding.

Nửa editor (meta.js / index.vue / trait): xem [Editor V2 — 05 Thêm element mới](../../storecake-builder/editor-v2/05-extending.md). Chương này giả định bạn đã có `type` phía editor, ví dụ `"countdown"`.

---

## 1. Bức tranh: một node đi qua những đâu

```
node JSON {"data": {"type": "countdown", "config":…, "style":…, "specials":…}}
 │
 ├─ HTML  QwikV2.HTML.render/1 ──► Registry.html_mod("countdown") ──► Nodes.Countdown.HTML.build/2
 │          (không có trong registry → <div> rỗng có class/id, KHÔNG báo lỗi)
 │
 ├─ CSS   QwikV2.CSS.node_fragments/1 ──► Registry.css_mod("countdown") ──► Nodes.Countdown.CSS.rule/2
 │        QwikV2.CSS.static_components/1 ─► Registry.static_mod("countdown") ► Nodes.Countdown.StaticCSS.css/0
 │
 ├─ Data  (nếu bind product/category/post/blog) QwikV2.Data.Binding + Compile.capture → dynamic node
 │
 └─ JS    (nếu cần tương tác) Common.x_init("Countdown") ─► loader.js lazy-import "Countdown.js"
                                                         ─► assets/render_v2/nodes/countdown.js
```

Ba lookup đều qua **một file**: `lib/qwik_v2/registry.ex`.

---

## 2. Bước 1 — Đăng ký type trong `Registry`

`lib/qwik_v2/registry.ex:2-81`

```elixir
@html %{ "root" => "RootCanvas", ..., "button" => "Button", ... }   # :2-32
@css  %{ "root" => "RootCanvas", ..., "button" => "Button", ... }   # :34-67
@data %{}                                                           # :69

def html_mod(type),   do: mod(@html, type, "HTML")                  # :71
def css_mod(type),    do: mod(@css, type, "CSS")                    # :72
def static_mod(type), do: mod(@css, type, "StaticCSS")              # :73
def data_mod(type),   do: mod(@data, type, "Data")                  # :74

defp mod(map, type, kind) do                                        # :76
  case Map.get(map, type) do
    nil -> nil
    base -> Module.concat([QwikV2.Nodes, base, kind])               # :79
  end
end
```

Giải thích từng dòng:

- **Key** là `data.type` của node — phải **trùng từng ký tự** với `meta.type` phía editor (kebab-case: `"image-comparison"`).
- **Value** là tên base module PascalCase. `Module.concat` ghép thành `QwikV2.Nodes.<Base>.HTML` / `.CSS` / `.StaticCSS`. Không có kiểm tra compile-time: gõ sai tên module → crash `UndefinedFunctionError` lúc render (không phải lúc compile).
- `@css` dùng chung cho **cả** `css_mod` và `static_mod` (`:72-73`) → type có trong `@css` thì **phải** có cả module `CSS` lẫn `StaticCSS`.
  - `static_mod` được gọi trong `QwikV2.CSS.present_static_modules/1` (`lib/qwik_v2/css.ex:77-84`), rồi gọi `.css()` không kiểm tra `function_exported?` → thiếu `StaticCSS` là crash.
- `@html` và `@css` **không trùng nhau hoàn toàn**. `product-variant-option`, `product-image-feature`, `product-image-list` chỉ có trong `@css` (`:60,62,63`) vì HTML của chúng do node cha tự gọi trực tiếp:
  - `lib/qwik_v2/nodes/product_variants/html.ex:5-6` alias `ProductVariantOption.HTML`
  - `lib/qwik_v2/nodes/media_dataset/html.ex:5-6` alias `ProductImageFeature.HTML`, `ProductImageList.HTML`
  → Element con "không tự đứng" thì chỉ đăng ký `@css`, HTML gọi từ cha.
- `@data %{}` (`:69`) **đang rỗng** — `QwikV2.XData.type_data/2` (`lib/qwik_v2/x_data.ex:21-28`) có đường cho module `Nodes.<X>.Data.data/2` nhưng hiện chưa type nào dùng. Island JSON (`<script type="x/json">`) hiện chỉ chứa dữ liệu event (`Events.xdata/1`). Đừng dựa vào `data_mod` trừ khi bạn chủ động nối.

> **Satellite không đăng ký.** `tab-item`, `accordion-item`, `quantity-button`, `quantity-input` (có trong catalog editor) **không** có trong registry. Chúng là node phụ, cha đọc id qua `config.<key>` (`QwikV2.Satellite.find/2`, `lib/qwik_v2/satellite.ex:46-51`) rồi tự sinh HTML + CSS (`Satellite.render/3`, `:25-30`). Ví dụ `lib/qwik_v2/nodes/accordion/html.ex:8`, `lib/qwik_v2/nodes/accordion/css.ex:9`.

> **Lệch catalog:** registry có `popup` (`:31,66`) nhưng catalog 35 element phía editor (chương 05 frontend) không liệt kê `popup`. Chưa xác minh popup được tạo từ đâu phía editor.

---

## 3. Bước 2 — `lib/qwik_v2/nodes/<type>/html.ex`

Thư mục dùng **snake_case** của base (`image_comparison/`), module dùng PascalCase (`QwikV2.Nodes.ImageComparison.HTML`). Hợp đồng duy nhất: `build(id, node) :: iodata`.

### 3.1 Mẫu tĩnh — `button`

`lib/qwik_v2/nodes/button/html.ex:1-27`

```elixir
def build(id, node) do
  data = node["data"] || %{}                                             # :5
  specials = data["specials"] || %{}                                     # :6
  label = ~s(<span class="wk-button__label">#{Common.text(data, specials)}</span>)   # :7
  tag = Events.html_tag(node)                                            # :8

  Common.element(tag, id, node,                                          # :10
    class: String.trim("wk-button #{Common.gs_class(data)}"),            # :11
    wrapper: true,                                                       # :12
    flex: true,                                                          # :13
    attrs: if(tag == "button", do: ~s( type="button"), else: ""),        # :14
    inner: with_icon(label, specials)                                    # :15
  )
end
```

| Dòng | Làm gì | Tại sao |
|---|---|---|
| `:5-6` | Luôn `|| %{}` | Node JSON do editor lưu, key có thể thiếu. Đừng pattern-match cứng. |
| `:7` | `Common.text/2` = `specials["text"] || config["text"] || ""` (`lib/qwik_v2/common.ex:70-72`) | Text inline (Tiptap) lưu ở `specials.text`, là **HTML** → không escape ở đây. |
| `:8` | `Events.html_tag/1` (`lib/qwik_v2/events.ex:91-97`) | Button có event `go_to_url` click + url → `<a>`; còn lại `<button>`; type khác `button` luôn `div`. |
| `:10` | `Common.element/4` (`lib/qwik_v2/common.ex:2-21`) | **Luôn dùng hàm này** để bọc: nó gắn `id`, `data-node-type`, `canvas-node-wrapper`, `canvas-flex`, và **attrs event** (`Events.attrs/2`, `:12`). Tự viết `<div id=…>` sẽ mất event và mất CSS theo `#id`. |
| `:11` | `Common.gs_class/1` → `wk-gs-<slug>` từ `config.textGlobalStyle` (`common.ex:74-79`) | Nối với Global style (`QwikV2.Style.Global`, chương 09). |
| `:12` | `wrapper: true` → attr `canvas-node-wrapper` | Static CSS chung (`lib/qwik_v2/style/static_css.ex:27+`) và renderer `:canvas_node_wrapper` target attr này. |
| `:13` | `flex: true` → attr `canvas-flex` | `[canvas-flex]{display:flex;min-width:0}` (`static_css.ex:22-25`). |

Các option khác của `Common.element`: `void: true` (thẻ tự đóng, vd `<img>`), `inner:` (bỏ qua thì render `data.nodes` con qua `Common.children/1` → `QwikV2.HTML.render/1`, `common.ex:54-56`).

Escape: dùng `Common.esc_attr/1` cho giá trị trong attribute, `Common.esc_html/1` cho text thuần (`common.ex:85-98`). Người dùng gõ gì vào config cũng vào đây.

### 3.2 Mẫu có JS — `image-comparison`

`lib/qwik_v2/nodes/image_comparison/html.ex:6-43` — điểm khác so với button:

```elixir
boxes = WebImage.img_boxes(node)                                   # :11
before_img = WebImage.img_attrs_for(config["beforeSrc"] || "", boxes)   # :12
...
attrs =
  Common.x_init("ImageComparison") <>                              # :39
    ~s( data-split="#{pct}" data-split-dir="#{Common.esc_attr(dir)}")   # :40
```

- `:11-13` Ảnh **luôn** đi qua `QwikV2.WebImage` (sinh `src/srcset/sizes` + marker `data-wk-img`, `lib/qwik_v2/web_image.ex:14`) để có shimmer placeholder và preload hero. Đừng tự in `<img src=…>`.
- `:18-27` HTML server **đã tính sẵn** trạng thái ban đầu (clip-path, vị trí handle). JS chỉ tiếp quản khi người dùng kéo → trang không nhảy layout khi JS tải chậm.
- `:39` `Common.x_init(name)` (`common.ex:23,42-45`) làm **hai việc**: in attr `x:init="ImageComparison"` và gọi `QwikV2.Compile.mark_runtime()` → báo `QwikV2.Scripts.tags/1` phải nhúng loader (xem §6).
- `:40` Truyền tham số cho JS qua `data-*`. Cách khác: `Common.x_props(map)` (`common.ex:25-29`) in `x:props='{…}'` JSON — module JS đọc qua `this.props`.

`x:init` vs `x:now` (`common.ex:23,40`): loader mount `x:now` **ngay** khi tải, `x:init` chỉ khi phần tử **vào viewport** (IntersectionObserver, `assets/render_v2/core/loader.js:74-78,210-216`). Chọn `x:now` chỉ khi phải chạy trước khi người dùng cuộn tới (vd `Popup`, `Global`).

---

## 4. Bước 3 — `css.ex` (CSS theo từng node)

Hợp đồng: `rule(id, node) :: [fragment]`. Fragment là tuple mà `QwikV2.CSS.bundle/0` gom lại (`lib/qwik_v2/css.ex:16-48`): `{:base, css}`, `{:state, css}`, `{:media, query, css}`. Không tự viết tuple — dùng helper trong `QwikV2.Style.*`.

### 4.1 Mẫu `button`

`lib/qwik_v2/nodes/button/css.ex:5-30`

```elixir
@renderers [:canvas_node_wrapper, :node_size, :padding_margin, :border, :corner,
            :shadow, :bg_color, :text_color, :text_style, :font_family, :font_size,
            :text_align, :line_height, :text_spacing, :text_transform]           # :5-21

@variants [%{value: "default"}, %{value: "hover", selector: ":hover"}]           # :23

def rule(id, node) do
  renderers = @renderers ++ [&flex_layout/2]                                     # :26
  States.state_css(id, node, renderers, @variants) ++                            # :28
    Responsive.node_css(id, node, renderers)                                     # :29
end
```

- `@renderers` là **danh sách atom** tra vào `QwikV2.Style.Renderers.apply_renderer/3` (`lib/qwik_v2/style/renderers.ex:15-128`). Mỗi atom đọc một nhóm key trong `data.style`/`data.config` và trả map CSS. Atom lạ → `%{}` (`:128`), **im lặng**.
  - Chọn atom khớp với nhóm trait bạn khai phía editor. Trait có mà renderer không có ⇒ chỉnh trong editor thấy đổi, trang thật không đổi.
- `:26` Renderer có thể là **hàm 2 tham số** `(res, bp) -> map` cho logic riêng. `flex_layout/2` (`:36-62`) tồn tại vì editor căn label bằng selector `[style*="--text-align"]` trên style inline, còn render đẩy biến vào stylesheet nên selector đó không khớp — xem comment `:32-35`. Đây là loại lệch editor/render bạn phải tự bù.
- `:28` `States.state_css/4` (`lib/qwik_v2/style/states.ex:29-40`) sinh rule cho từng variant có `selector` (`:hover`); variant `default` bị bỏ qua vì đã nằm trong base.
- `:29` `Responsive.node_css/3` (`lib/qwik_v2/style/responsive.ex:49-55`) chạy renderers cho **4 breakpoint** (`desktop 1920 / laptop 1440 / tablet 768 / mobile 360`, `:4`) sau khi `Cascade.merge/1` gộp `data.responsive.<bp>` rồi xuất fragment base + media.

Ẩn/hiện theo breakpoint (`config.hidden`) **không** cần khai: `QwikV2.CSS.node_fragments/1` tự nối `Hidden.fragments/2` cho mọi node (`css.ex:60`).

### 4.2 Rule cho phần tử con — `image-comparison`

`lib/qwik_v2/nodes/image_comparison/css.ex:15-20`

```elixir
Responsive.node_css(id, node, @renderers) ++
  Responsive.rules(sel <> " .wk-image-comparison__track", node, [&track_ratio/2])
```

`Responsive.rules/3` = `node_css` nhưng selector tuỳ ý → dùng khi style phải rơi vào **phần tử con** trong HTML của node.

---

## 5. Bước 4 — `static_css.ex` (CSS dùng chung cho mọi instance)

Hợp đồng: `css() :: String.t()`. Ví dụ `lib/qwik_v2/nodes/button/static_css.ex:2-42`.

- Chỉ được in **khi trang có ít nhất một node type đó** (`css.ex:66-84`) → không lo phình CSS.
- Viết theo class `.wk-<type>` + đọc biến CSS (`var(--text-color)`), **không** dùng `#id`. Giá trị theo từng node đến từ `css.ex` (§4) dưới dạng biến CSS.
- Chuỗi đi qua `QwikV2.CSS.Minify.run/1` (`css.ex:27`) — comment `/* */` được giữ trong source cho người đọc (vd `button/static_css.ex:32-37`).

---

## 6. Bước 5 (tuỳ chọn) — JS island `assets/render_v2/nodes/<type>.js`

### 6.1 Không có bước "đăng ký" trong loader

Loader **không** có danh sách module. Tên module được suy ra theo quy ước tên file:

`assets/vite.render_v2.config.mjs:6,26-35`

```js
const toPascal = s => s.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')
...
scanEntries(join(R, 'nodes'))          // nodes/image-comparison.js → entry "ImageComparison"
scanEntries(join(R, 'events'), 'Event')// events/popup/index.js     → entry "PopupEvent"
```

- Build (`npm run deploy:render_v2` = `vite build -c vite.render_v2.config.mjs`, `assets/package.json:7`) sinh `ImageComparison.js` + `manifest.json` (`:62-66`).
- Trùng tên entry → build **throw** (`:14`).

Chuỗi phải khớp **3 chỗ**:

| Chỗ | Ví dụ |
|---|---|
| Tên file | `assets/render_v2/nodes/image-comparison.js` → Pascal `ImageComparison` |
| Elixir `Common.x_init("…")` | `lib/qwik_v2/nodes/image_comparison/html.ex:39` |
| Cuối file JS `window.WK2.register('…', …)` | `assets/render_v2/nodes/image-comparison.js:58` (dòng cuối) |

Lệch bất kỳ chỗ nào: loader `import()` được file nhưng `register` sai tên → `pending[name]` không bao giờ được gọi (`assets/render_v2/core/loader.js:30-56,126-137`), **không lỗi console**. Sai tên file → console `[wk2] load X lỗi:` (`loader.js:115`).

### 6.2 Viết module bằng `defineModule`

`assets/render_v2/core/define.js:125-219` — API kiểu Vue Options:

```js
import { defineModule } from '../core/define'

const Countdown = defineModule({
  data() { return { left: 0 } },              // → this.state (reactive), truy cập this.left
  computed: { … },
  methods: { tick(props, ev, el, ctx) { … } },// gọi được từ on:click='[{"call":"Countdown#tick"}]'
  watch: { left(nv, ov) { … } },
  mounted() { this.$on(document, 'x', fn) },  // $on tự gỡ khi destroy
  beforeUnmount() { … },
})

window.WK2.register('Countdown', Countdown)
```

- `this.$el` = phần tử mang `x:init` (`define.js:128`); `this.props` = `window.xData[id]` merge `x:props` (`:130-134`).
- DOM directive được bind **sau** `mounted` (`:174-175`): `x:text`, `x:html`, `x:show`, `x:class='{"cls":"expr"}'`, `x:attr:<name>`, `x:model`, `x:for/x:as/x:key` (`:26-123`). Server có thể in sẵn các directive này trong HTML (vd `lib/qwik_v2/nodes/text_dataset/html.ex:48,71`).
- Directive **dừng ở biên island lồng** (`isNestedIsland`, `define.js:23-24`) — phần tử con có `x:init/x:now` riêng thì module cha không bind vào nó.
- Tiện ích: `$emit/$subscribe` (bus), `$vm(id,name)`, `$t(path)` (i18n), `$toast`, `$modal` (`:183-207`).

### 6.3 Server có nhúng loader không?

`lib/qwik_v2/scripts.ex:4-23`

```elixir
if xdata == "" and dom_events == [] and not Compile.needs_runtime?() and not dev do
  ""                                                        # không nhúng JS
else ... <script type="module" src="#{base}Loader.js"> ...
```

`needs_runtime?` bật khi bất kỳ node nào gọi `x_init/x_now`. Thực tế `RootCanvas` luôn gọi `Common.x_now("Global")` (`lib/qwik_v2/nodes/root_canvas/html.ex:7`) nên trang có root là có loader. Nếu bạn render subtree không qua root, nhớ `x_init` là thứ bật loader.

Bạn **không** cần sửa `Scripts` khi thêm element — module được lazy-load theo `x:init` (test khẳng định server không liệt kê module: `test/qwik_v2/scripts_test.exs:35-36`).

### 6.4 Event DOM tuỳ chỉnh

Loader chỉ nghe các DOM event trong `window.xevents` (mặc định `['click']`, `loader.js:208`). `on:click` luôn chạy. Nếu module in `on:mouseenter`/`on:dblclick` mà trang không có event nào của người dùng dùng trigger đó, loader **không** lắng nghe. `window.xevents` sinh từ `Events.used_dom_events/1` (`lib/qwik_v2/events.ex:51-68`) — chỉ quét `data.events` của người dùng, không quét HTML node của bạn. → Trong module, dùng `this.$on(el, 'mouseenter', …)` thay vì attr `on:mouseenter`.

---

## 7. Bước 6 (tuỳ chọn) — Element bind dữ liệu

Chỉ cần khi element hiển thị field của product/category/post/blog. Chi tiết binding: [chương 05](./05-bindings.md), dynamic node: [chương 06](./06-publish.md).

### 7.1 Đọc giá trị

Mẫu `lib/qwik_v2/nodes/text_dataset/html.ex:16-19`:

```elixir
binding = Binding.first(data)                          # data.bindings[0] (hoặc config.bindings[0])
kind = get_in(binding, ["target", "kind"])
{value, _init} = Binding.resolve(binding, QwikV2.ctx())
```

- `Binding.resolve/2` (`lib/qwik_v2/data/binding.ex:55-62`) → `entity/3` (`:79-83`): `target.id` là UUID ⇒ lấy từ `ctx.refs[type][id]` (đã prefetch); không phải UUID (auto) ⇒ `context_entity` (Scope hiện tại → `ctx.product/article/blog`).
- Field được map trong `@specs` (`binding.ex:4-47`). **Thêm kind mới = thêm dòng ở `@specs`**, không thì `value/3` trả rỗng.
- Cần cả entity (không chỉ một field): `Binding.bound_entity(data)` (`:85-94`), như `pricing_dataset/html.ex:20`.
- JS island cần dữ liệu product: gọi `QwikV2.Data.Seed.put("product", product)` (`pricing_dataset/html.ex:21`) và in `Common.x_ref("product", product)` (`:34`). Seed được in thành `<script type="x/seed">` (`lib/qwik_v2/data/seed.ex:34-36`), loader đọc vào `window.xSeed` (`loader.js:18-23`).

### 7.2 Bắt buộc: nhánh `Compile.active?()`

```elixir
def build(id, node) do
  if Compile.active?() do
    Compile.capture(id, node)          # lúc PUBLISH: không render, trả slot
  else
    ... render thật ...                # lúc REQUEST (assemble) và lúc preview draft
  end
end
```

(`text_dataset/html.ex:9-11`, `pricing_dataset/html.ex:11-12`, `quantity_dataset/html.ex:10-11`)

Tại sao: lúc publish, `QwikV2.Compile.compile/1` render **một lần** thành skeleton HTML tĩnh (`lib/qwik_v2/compile.ex:10-31`). Node dữ liệu mà render lúc đó sẽ **đóng băng giá trị lúc publish** (giá, tồn kho, tên sản phẩm cũ). `capture/2` (`:39-48`) lưu node vào `dynamic_nodes`, ghi ref UUID vào `refs` để request sau prefetch, và trả `%{"slot" => id}`. Lúc request, `assemble/3` (`:104-123`) gọi lại `html_mod(type).build(id, node)` cho từng slot — lúc này `active?()` = false nên nhánh render thật chạy.

Chọn biến thể:

| Hàm | Khi nào | Ví dụ |
|---|---|---|
| `capture/2` | Node lá | `text_dataset`, `pricing_dataset`, `quantity_dataset` |
| `capture_children/2` + `Compile.children/2` | Node có con **trực tiếp** cần khi assemble | `product_variants/html.ex:10,20`, `media_dataset/html.ex:15,87` |
| `capture_subtree/2` + `Compile.with_subtree/2` | Node container lặp, cần **toàn bộ** cây con | `dataset_block/html.ex:8,26`, `list_dataset/html.ex:11,28` |

Lý do phải mang con theo: artifact published **không lưu `nodes`**, chỉ lưu skeleton + dynamic_nodes (`lib/builderx_api/editor_v2/published.ex:65-73`); lúc assemble `ctx.nodes` rỗng (`lib/builderx_api_web/controllers/v1/editor_v2/render_controller.ex:186-190`). Quên mang con ⇒ con render `""` trên trang thật, preview draft vẫn đúng (vì draft có đủ `nodes`) — lỗi chỉ lộ sau publish. Test minh hoạ: `test/qwik_v2/nodes/list_dataset_post_test.exs:134` ("con của item vẫn render khi ctx.nodes rỗng").

### 7.3 Container lặp: dùng Scope

Container render N item (list/grid) phải bọc mỗi item bằng `QwikV2.Scope.ProductScope.with_product/2` (`lib/qwik_v2/scope/product_scope.ex:6`) để node con binding "auto" lấy đúng item. `QwikV2.Scope.enter/3` (`lib/qwik_v2/scope.ex:4-13`) khôi phục giá trị cũ khi thoát → lồng nhau an toàn. Các scope khác: `category_scope`, `post_scope`, `media_scope`, `variant_scope`, `slot_scope` trong `lib/qwik_v2/scope/`.

---

## 8. Bước 7 (tuỳ chọn) — i18n chuỗi trong JS

Chuỗi hiển thị do JS sinh (toast, modal): thêm key vào **cả 4** file `assets/render_v2/locales/{vi,en,th,es}.json`, gọi `this.$t('group.key', 'mặc định')`.

- Locale chọn theo `<html lang>` (`assets/render_v2/nodes/global.js:6` → `services/i18n-boot.js`), không hỗ trợ ⇒ `vi`.
- `<html lang>` lấy từ `assigns[:lang] || "en"` (`lib/builderx_api_web/templates/v1/page/render_v2.html.eex:2`).
- `window.xi18n` (override) được đọc trong `services/i18n.js:1` và `i18n-boot.js`, nhưng **không có chỗ nào phía Elixir set** (grep `xi18n` trong `lib/` không ra) — chưa nối.
- Chuỗi render phía server (Elixir) không đi qua các file JSON này.

---

## 9. Bước 8 — Test

Tối thiểu một test render, mẫu có sẵn:

```elixir
ctx = %QwikV2{root_id: "root1", nodes: %{
  "root1" => %{"data" => %{"type" => "root", "nodes" => ["c1"]}},
  "c1"    => %{"data" => %{"type" => "countdown", "config" => %{...}}}
}}

{html, css} = QwikV2.build(ctx)                 # đường draft/preview
artifact    = QwikV2.Compile.compile(ctx)        # đường publish
QwikV2.Compile.assemble(artifact, %QwikV2{})    # đường request sau publish
```

(`QwikV2.build/2`: `lib/qwik_v2/qwik_v2.ex:21-33`). Với node dữ liệu, **luôn test cả `compile → assemble`**, không chỉ `build` — xem `test/builderx_api/editor_v2/render_product_page_test.exs:198-228`. Danh sách test hiện có: [chương 12](./12-testing-troubleshooting.md).

---

## 10. Checklist tóm tắt

```
□ type trùng tuyệt đối với meta.type phía editor (kebab-case)
□ registry.ex: thêm vào @html (nếu tự render) và @css
□ nodes/<snake>/html.ex    build/2, dùng Common.element, esc_attr/esc_html, WebImage cho ảnh
□ nodes/<snake>/css.ex     rule/2, @renderers khớp nhóm trait editor, States nếu có hover…
□ nodes/<snake>/static_css.ex  css/0 (BẮT BUỘC nếu có trong @css, kể cả chuỗi rỗng)
□ (data)  nhánh Compile.active?() + capture/_children/_subtree; kind mới → Binding @specs
□ (JS)    assets/render_v2/nodes/<kebab>.js, register('<Pascal>') == x_init("<Pascal>")
□ (JS)    event ngoài click → this.$on, đừng dựa on:<event>
□ (i18n)  key ở cả 4 locales
□ test: build + compile→assemble
□ publish lại trang để thấy thay đổi (artifact đã bake — chương 06)
□ deploy JS: npm run deploy:render_v2 && mix qwik_v2.upload_assets (chương 10)
```

---

## 11. Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Chỗ kiểm |
|---|---|---|
| Trang thật ra `<div data-node-type="x">` rỗng | Type chưa có trong `@html` | `lib/qwik_v2/registry.ex:2-32`, fallback `lib/qwik_v2/html.ex:15` |
| `UndefinedFunctionError QwikV2.Nodes.X.StaticCSS.css/0` | Có trong `@css` nhưng thiếu `static_css.ex` | `lib/qwik_v2/css.ex:69-84` |
| Editor chỉnh style, trang thật không đổi | Thiếu atom trong `@renderers`, hoặc atom gõ sai (rơi `apply_renderer(_,_,_) -> %{}`) | `lib/qwik_v2/style/renderers.ex:128` |
| Preview đúng, sau publish giá/tên cũ | Node dữ liệu thiếu nhánh `Compile.active?()` → bị bake vào skeleton | `lib/qwik_v2/compile.ex:39-48` |
| Preview đúng, sau publish con biến mất | `capture/2` thay vì `capture_children/subtree` | `lib/qwik_v2/compile.ex:58-96` |
| JS không chạy, không lỗi console | Tên `register` ≠ tên `x_init` | `assets/render_v2/core/loader.js:30-56` |
| Console `[wk2] load X lỗi` | Tên file JS không ra đúng Pascal, hoặc chưa build/upload | `assets/vite.render_v2.config.mjs:6,26-35` |
| Module không bind vào phần tử con | Phần tử con là island khác (`x:init`) | `assets/render_v2/core/define.js:23-24` |
