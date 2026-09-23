---
sidebar_position: 10
title: "09 — QwikV2: dựng CSS"
---

# 09 — QwikV2: dựng CSS

> **Cho BA:** Mỗi element người dùng kéo vào editor mang theo một bộ "style" (màu chữ, cỡ chữ, padding, ẩn/hiện theo thiết bị…). Khi publish, server dịch bộ style đó thành CSS thật cho trình duyệt. CSS được chia thành 3 phần: **phần chung** cho mọi trang (reset, class mặc định), **phần riêng** cho từng element (`#id{...}`), và **phần theo màn hình** (desktop / laptop / tablet / mobile). Sau khi dựng xong, CSS được upload lên kho file (Minio) và trang chỉ cần gắn link tới file đó. Nếu upload lỗi, CSS được nhúng thẳng vào trang để trang vẫn hiển thị đúng.

Chương này đi qua toàn bộ đường đi **từ JSON style của node → chuỗi CSS → file `.css` trên Minio**. Phần HTML xem [08 — QwikV2: dựng HTML](./08-qwik-html.md); lúc nào CSS được gọi xem [06 — Publish](./06-publish.md) và [07 — Render request](./07-render-request.md).

> Snapshot: branch `feat-builder-v2`, commit `3e3eeacb5`. Mọi đường dẫn tính từ root repo `builderx_api`.

---

## 1. Bản đồ file

```
lib/qwik_v2/
├─ css.ex                  QwikV2.CSS        — điểm vào: app/0, bundle/0, bundle_to_inline/1
├─ css/minify.ex           QwikV2.CSS.Minify — minify tay (bỏ comment, gom khoảng trắng)
├─ assets.ex               QwikV2.Assets     — upload bundle lên Minio, trả <link> tags
├─ registry.ex             type → module CSS / StaticCSS
├─ satellite.ex            CSS cho "node vệ tinh" (item con được trỏ tới qua config)
└─ style/
   ├─ responsive.ex        breakpoint, merge style theo bp, sinh {:base | :media} fragment
   ├─ cascade.ex           gói kết quả merge vào node["data"]["responsive"]
   ├─ states.ex            hover/… : gộp state vào node rồi diff với base
   ├─ renderers.ex         "renderer" = hàm đổi style JSON → map khai báo CSS
   ├─ declaration.ex       map → "prop: value" (camelCase→kebab, tự thêm px)
   ├─ layout.ex            flex container + con "fill" (flex-grow/align-self)
   ├─ hidden.ex            config.hidden → display:none!important theo bp
   ├─ global.ex            CSS global style (.wk-gs-*) từ StyleGlobals
   └─ static_css.ex        reset CSS chung cho mọi trang
lib/qwik_v2/nodes/<type>/
   ├─ css.ex               QwikV2.Nodes.<Type>.CSS.rule(id, node)  → list fragment (riêng từng node)
   └─ static_css.ex        QwikV2.Nodes.<Type>.StaticCSS.css()     → chuỗi CSS (chung theo type)
```

Hai khái niệm phải nắm trước khi đọc tiếp:

| | `css.ex` (per-node) | `static_css.ex` (per-type) |
|---|---|---|
| Hàm | `rule(id, node)` | `css()` |
| Trả về | **list fragment** `{:base, css}` / `{:state, css}` / `{:media, query, css}` | **một chuỗi CSS** |
| Selector | `#<node_id>` (…và con cháu) | class chung, vd `.wk-heading` |
| Phụ thuộc dữ liệu node | Có — đọc `style`, `config`, `responsive`, `states` | Không — hằng số |
| Số lần xuất hiện trong trang | Mỗi node 1 lần | Mỗi **type có mặt** 1 lần |

Ví dụ thật: `lib/qwik_v2/nodes/heading/static_css.ex` chỉ có `.wk-heading{display:block;margin:0;line-height:1.3}`; còn `lib/qwik_v2/nodes/heading/css.ex` khai báo danh sách renderer và gọi `Responsive.node_css/3`.

---

## 2. Ba hàm điểm vào của `QwikV2.CSS`

File: `lib/qwik_v2/css.ex`

```elixir
6   def app, do: bundle() |> bundle_to_inline()
```

```
QwikV2.CSS
 ├─ bundle/0            → %{static: "...", all: "...", media: [{query, css}, ...]}
 │                         (dạng có cấu trúc — dùng khi PUBLISH để upload từng phần)
 ├─ bundle_to_inline/1  → một chuỗi CSS duy nhất: static + all + "@media q{css}"...
 │                         (dùng làm fallback khi upload lỗi, và cho draft/preview)
 └─ app/0               = bundle() |> bundle_to_inline()
                           (QwikV2.build/2 gọi — đường draft/preview)
```

Ai gọi cái nào:

| Nơi gọi | Hàm | Kết quả dùng làm gì |
|---|---|---|
| `QwikV2.build/2` (`lib/qwik_v2/qwik_v2.ex:28`) ← `serve_draft` trong `render_controller.ex:222` | `CSS.app/0` | Bọc `<style>…</style>` nhúng thẳng vào trang preview |
| `QwikV2.bundle/1` (`lib/qwik_v2/qwik_v2.ex:35-43`) ← `Published.publish_css/1` (`lib/builderx_api/editor_v2/published.ex:87-94`) | `CSS.bundle/0` | Đưa vào `Assets.upload_bundle/1` → chuỗi `<link>` lưu vào cột `app_css` |
| `Published.publish_css/1` nhánh lỗi (`published.ex:92`) | `CSS.bundle_to_inline/1` | Upload lỗi → lưu `<style>…</style>` vào `app_css` |

Cả ba đều đọc dữ liệu từ `QwikV2.ctx()` (process dictionary) — nên phải được gọi **bên trong** `QwikV2.build/bundle/with_ctx`, nơi đã `Process.put(:qwik_v2_ctx, ctx)`.

### 2.1 `bundle/0` từng dòng — `lib/qwik_v2/css.ex:16-48`

```elixir
16  def bundle do
17    ctx = QwikV2.ctx()
18    frags = node_fragments(ctx.nodes)
```
- `:17` lấy ctx hiện hành (nodes phẳng, `style_data` global…).
- `:18` duyệt **mọi node** trong map phẳng `ctx.nodes`, gọi CSS module của từng type → được một list fragment lẫn lộn 3 loại (xem §2.2).

```elixir
20    bases = for {:base, css} <- frags, css not in [nil, ""], do: css
21    states = for {:state, css} <- frags, css not in [nil, ""], do: css
```
- Tách fragment `:base` và `:state` ra 2 list riêng. **Lý do tách:** state (vd `:hover`) phải đứng **sau** base trong file CSS để thắng khi cùng specificity. Một node như Button trả `States.state_css ++ Responsive.node_css` (state đứng trước trong list, `lib/qwik_v2/nodes/button/css.ex:28-29`) — việc tách lại ở đây mới đảm bảo thứ tự đúng.

```elixir
23    static =
24      [StaticCSS.app(), static_components(ctx.nodes)]
25      |> Enum.reject(&(&1 in [nil, ""]))
26      |> Enum.join("\n")
27      |> Minify.run()
```
- `StaticCSS.app()` = reset chung (`box-sizing`, `[canvas-flex]{display:flex}`, map biến `--text-*` cho `h1..h6,p[canvas-node-wrapper]`, skeleton shimmer cho `img[data-wk-img]`) — `lib/qwik_v2/style/static_css.ex`.
- `static_components/1` (`:69-75`) chỉ lấy `StaticCSS` của **các type có mặt trong trang** (comment `:66-68`): trang không có Tab thì không kéo CSS của Tab.

```elixir
29    all =
30      [
31        Global.css(ctx.style_data || %{}),
32        Enum.join(bases, "\n"),
33        Enum.join(states, "\n")
34      ]
      ... |> Minify.run()
```
- Thứ tự trong `all`: **global style → base của mọi node → state của mọi node**. Global đứng đầu để rule `#id` của node luôn thắng class `.wk-gs-*`.

```elixir
39    media =
40      Responsive.media_order()
41      |> Enum.map(fn query ->
42        css = for({:media, ^query, css} <- frags, ...) |> Enum.join("")
43        {query, Minify.run(css)}
44      end)
45      |> Enum.reject(fn {_q, css} -> css == "" end)
```
- Gom fragment `:media` theo **đúng thứ tự** `Responsive.media_order/0` (laptop → tablet → mobile, rồi các range query). Thứ tự này quan trọng vì các query `max-width` lồng nhau: mobile phải đứng sau tablet để ghi đè.
- Query nào không có CSS thì bỏ.

```elixir
47    %{static: static, all: all, media: media}
```

### 2.2 `node_fragments/1` — `lib/qwik_v2/css.ex:50-62`

```elixir
51    Enum.flat_map(nodes, fn {id, node} ->
52      type = get_in(node, ["data", "type"]) || "div"
54      node_css =
55        case Registry.css_mod(type) do
56          nil -> []
57          mod -> mod.rule(id, node)
58        end
60      node_css ++ Hidden.fragments("#" <> id, node)
```
- `Registry.css_mod/1` (`lib/qwik_v2/registry.ex:72`) map `"heading"` → `QwikV2.Nodes.Heading.CSS`. Type không có trong `@css` → không sinh CSS (node vẫn render HTML nếu có trong `@html`).
- **Mọi node** đều được nối thêm `Hidden.fragments/2` — tức là tính năng "ẩn theo thiết bị" không phụ thuộc type, node module không cần tự xử lý.

> Lưu ý Registry: `product-variant-option`, `product-image-feature`, `product-image-list` có trong `@css` nhưng **không** có trong `@html` — HTML của chúng do node cha render, còn CSS vẫn sinh theo id của chính chúng.

### 2.3 `bundle_to_inline/1` — `lib/qwik_v2/css.ex:8-14`

```elixir
11    [static, all | Enum.map(media, fn {query, css} -> ~s(@media #{query}{#{css}}) end)]
12    |> Enum.reject(&(&1 in [nil, ""]))
13    |> Enum.join("\n")
```
Nối phẳng: static, all, rồi mỗi query thành một khối `@media`. Chú ý **query string không đi qua Minify** (được bọc sau khi minify), nên giữ nguyên dấu cách `(max-width: 768px)`.

---

## 3. Breakpoint & responsive — `lib/qwik_v2/style/responsive.ex`

### 3.1 Bảng hằng số

```elixir
4   @breakpoints [{"desktop", 1920}, {"laptop", 1440}, {"tablet", 768}, {"mobile", 360}]
5   @default_bp "desktop"
7   @specs [
8     {"laptop", "desktop", "(max-width: 1440px)"},
9     {"tablet", "laptop", "(max-width: 768px)"},
10    {"mobile", "tablet", "(max-width: 360px)"}
11  ]
13  @ranges [
14    {"desktop", "(min-width: 1441px)"},
15    {"laptop", "(min-width: 769px) and (max-width: 1440px)"},
16    {"tablet", "(min-width: 361px) and (max-width: 768px)"},
17    {"mobile", "(max-width: 360px)"}
18  ]
20  @non_cascading %{"config" => MapSet.new(["hidden"])}
```

| Breakpoint | Width tham chiếu | Query "spec" (ghi đè dần, desktop-first) | Query "range" (khoảng đóng) | So với bp nào |
|---|---|---|---|---|
| desktop | 1920 | — (là **base**, không bọc media) | `(min-width: 1441px)` | — |
| laptop | 1440 | `(max-width: 1440px)` | `(min-width: 769px) and (max-width: 1440px)` | desktop |
| tablet | 768 | `(max-width: 768px)` | `(min-width: 361px) and (max-width: 768px)` | laptop |
| mobile | 360 | `(max-width: 360px)` | `(max-width: 360px)` | tablet |

- **Spec query** dùng cho style thường: desktop-first, mỗi bp chỉ xuất **phần khác** so với bp lớn hơn liền kề (cột "so với").
- **Range query** chỉ dùng cho `hidden` (§5): ẩn ở tablet không được "lan" xuống mobile.

> ⚠️ **Cần lưu ý:** mobile là `max-width: 360px`. Điện thoại phổ biến rộng 375–430px sẽ rơi vào khoảng **tablet** (`361–768px`). Chưa xác minh đây là chủ ý hay cần khớp với breakpoint bên editor.

`media_order/0` (`:22-26`) = 3 spec query rồi 4 range query, `Enum.uniq` → `(max-width: 360px)` chỉ xuất hiện một lần (spec mobile trùng range mobile), nên CSS ẩn-trên-mobile và style mobile nằm chung một khối `@media`.

### 3.2 `merge_namespace/3` — style thực tế của một node tại một bp

```elixir
154  def merge_namespace(node, ns, bp_key) do
155    data = node["data"] || %{}
156    base = data[ns] || %{}
157    responsive = data["responsive"] || %{}
159    case Enum.find(@breakpoints, fn {k, _} -> k == bp_key end) do
160      nil -> base
161      {_, cur_w} -> base |> cascade_down(responsive, ns, bp_key, cur_w) |> fallback_up(responsive, ns, cur_w)
```

`ns` là `"style"` hoặc `"config"`. Dữ liệu node có dạng:

```json
{ "data": {
    "style":  { ...base (desktop) ... },
    "config": { ... },
    "responsive": { "tablet": { "style": {...}, "config": {...}, "states": {...} }, "mobile": {...} },
    "states": { "hover": { "style": {...} } }
}}
```

Hai bước:

```
cascade_down (:165-174)          fallback_up (:176-188)
────────────────────────         ──────────────────────────────
Bắt đầu từ base,                 Duyệt các bp NHỎ HƠN bp hiện tại,
áp lần lượt slot của các bp      key nào bp hiện tại CHƯA có
có width >= bp hiện tại,         thì mượn giá trị từ bp nhỏ hơn.
từ desktop xuống tới bp đó.      (bỏ qua key non-cascading)
→ giá trị gần nhất thắng.
```

- `apply_slot/5` (`:190-196`): khi áp slot của bp **lớn hơn** (không phải bp hiện tại), key non-cascading (`config.hidden`) bị bỏ qua — ẩn ở desktop không tự động ẩn ở laptop.
- `fallback_up`: hệ quả đã kiểm chứng bằng chạy thử — một giá trị **chỉ** đặt ở mobile cũng hiện ra ở desktop/laptop/tablet nếu các bp đó không có key đó:

  ```
  responsive.mobile.style = {"--text-color": "red"}
  → desktop / laptop / tablet / mobile đều merge ra {"--text-color" => "red"}
  ```
  Đây là hành vi của code hiện tại (có thể chủ ý để khớp editor hiển thị giá trị "lan lên"); nếu thấy "chỉnh mobile mà desktop cũng đổi" thì đây là chỗ đầu tiên cần xem.

### 3.3 `Cascade.merge/1` — `lib/qwik_v2/style/cascade.ex:4-15`

```elixir
5    resolved =
6      Map.new(Responsive.all_bps(), fn bp ->
7        {bp, %{ "style" => Responsive.merge_namespace(node, "style", bp),
10               "config" => Responsive.merge_namespace(node, "config", bp) }}
14   put_in(node, ["data", "responsive"], resolved)
```
Tính sẵn style/config **đã merge** cho 4 bp rồi ghi đè vào `data.responsive`. Node trả về gọi là `res` (resolved). Các renderer chỉ đọc qua `Cascade.style(res, bp)` / `Cascade.get_style(res, key, bp, default)` (`:19-23`) — không phải merge lại.

`Cascade.fetch/3` (`:49-55`): key tồn tại nhưng giá trị `nil` → trả `default`.

### 3.4 `Responsive.rules/3` và `fragments/2` — nơi sinh `{:base}` / `{:media}`

```elixir
49  def node_css(id, node, renderers), do: rules("#" <> id, node, renderers)
51  def rules(selector, node, renderers) do
52    res = Cascade.merge(node)
53    maps = Map.new(all_bps(), fn bp -> {bp, Renderers.run(res, bp, renderers)} end)
54    fragments(selector, maps)
```
- `:53` chạy danh sách renderer cho **từng bp** → 4 map khai báo CSS (`%{"padding" => "8px 16px", ...}`).

```elixir
119  def fragments(selector, maps) do
120    base =
121      case rule(selector, maps[default_bp()]) do
122        "" -> []
123        css -> [{:base, css}]
126    media =
127      Enum.flat_map(@specs, fn {bp, ref, query} ->
128        case diff(maps[bp], maps[ref]) do
129          d when map_size(d) == 0 -> []
130          d -> [{:media, query, rule(selector, d)}]
```
- `:120-124` desktop → rule base.
- `:126-132` với mỗi spec, `diff/2` (`:149`) giữ các khai báo có giá trị **khác** bp tham chiếu. Không khác gì → không sinh media. Nhờ vậy CSS rất gọn: 1 node chỉ đổi cỡ chữ ở tablet thì media tablet chỉ có đúng 1 khai báo.
- `rule/2` (`:146-147`) → `#id{k: v;k: v}` qua `Declaration.render/2`.

> `diff` chỉ giữ key có trong map của bp nhỏ. Nếu bp nhỏ **mất** một khai báo mà bp lớn có (vd renderer trả `%{}` ở tablet), rule desktop/laptop vẫn áp xuống tablet — CSS không có cách "unset" tự động.

`fragments_as_state/2` (`:137-144`) giống `fragments` nhưng đổi `:base` → `:state` để `CSS.bundle` xếp sau base.

---

## 4. Renderer — từ key style sang khai báo CSS

File: `lib/qwik_v2/style/renderers.ex`

```elixir
8   def run(res, bp, keys) do
9     Enum.reduce(keys, %{}, fn
10      key, acc when is_function(key, 2) -> Map.merge(acc, key.(res, bp))
11      key, acc -> Map.merge(acc, apply_renderer(key, res, bp))
```
Mỗi node type khai báo `@renderers` là list gồm **atom** (renderer dùng chung) hoặc **hàm 2 tham số** `(res, bp) -> map` (renderer riêng của type, vd `&flex_layout/2` của Button). Kết quả merge lần lượt — renderer sau ghi đè key trùng của renderer trước.

| Renderer | Đọc key (style/config) | Sinh ra | Dòng |
|---|---|---|---|
| `:flex_canvas` | `--layout-direction`, `--layout-horizontal`, `--layout-vertical` | `flex-direction`, `justify-content`, `align-items` (qua `Layout.container_decls`) | `:15` |
| `:canvas_node_wrapper` | `margin`, `--node-width-custom`, `--node-height-custom` | biến `--node-margin-*`, `--node-*-custom` | `:17-28` |
| `:node_size` | `--node-width`, `--node-height` = `fit`/`fixed`/`fill` | `width/height`: `fit-content` / `var(--node-*-custom)` / `auto` | `:30-33`, `:167-170` |
| `:section_size` | `--node-height` | `100vh` / `fit-content` / `var(--node-height-custom)` | `:35-42` |
| `:padding_margin` | `padding`, `margin` | giữ nguyên chuỗi | `:44-46` |
| `:border` | `borderColor`, `borderStyle`, `borderWidth` hoặc `border{Top..}Width` khi `config.isSeparateBorderWidth` | `border` hoặc `border-top/right/...` | `:48-61` |
| `:corner` | `borderRadius` hoặc 4 góc khi `config.isSeparateBorderRadius` | `border-radius` / `border-*-radius` | `:63-72` |
| `:shadow` | `boxShadow` | `box-shadow` | `:74-76` |
| `:bg_color` | `backgroundImage` (ưu tiên) → `config.backgroundVideoUrl` (có video thì **không** set nền) → `backgroundColor` | `background` (ảnh qua `Image.resize_keep`) | `:78-90`, `:130-141` |
| `:gap` | `gap` | `gap: Npx` | `:92` |
| `:text_color` … `:text_transform` | `--text-color`, `--text-font-family`, `--text-font-size`, `--text-align`, `--text-line-height`, `--text-letter-spacing`, `--text-transform` | **giữ nguyên biến CSS** | `:94-100` |
| `:text_style` | `--text-style` (chuỗi chứa `bold`/`italic`/`underline`/`line-through`) | `font-weight`, `font-style`, `text-decoration-line` | `:102-118` |
| `:image` | `imageSize`, `imagePosition`, `config.imageRatio` (`custom` → `customImageRatioWidth/Height`, `auto` → tỉ lệ thật của ảnh) | `--img-object-fit`, `--img-object-position`, `aspect-ratio` | `:120-126`, `:143-165` |

**Vì sao text đi qua biến CSS** (`--text-color`) chứ không phải `color:` trực tiếp? Vì `StaticCSS.app` đã map `h1..h6,p[canvas-node-wrapper]{color:var(--text-color);...}`, và class global `.wk-gs-heading-1{--text-font-size:48px}` cũng chỉ set biến. Rule `#id{--text-font-size:40px}` có specificity cao hơn class nên luôn thắng global style — người dùng chỉnh tay đè lên preset.

`:canvas_node_wrapper` luôn xuất 4 biến `--node-margin-*` (kể cả `0px`) — thấy trong output ví dụ §8.

### 4.1 `Declaration.render/2` — `lib/qwik_v2/style/declaration.ex:19-53`

```
render(key, value)
 ├─ hyphenate(key)          "borderRadius" → "border-radius", "msFoo" → "-ms-foo"   (:24-33)
 └─ value(prop, v)
     ├─ số 0                → "0"
     ├─ prop bắt đầu "--"   → số trần (biến CSS không tự thêm đơn vị)
     ├─ prop trong @unitless (line-height, opacity, z-index, flex-grow, …) → số trần
     ├─ số khác             → "<n>px"
     └─ chuỗi               → giữ nguyên
```
Float nguyên (`12.0`) in ra `12` (`:50-53`).

---

## 5. Ẩn theo thiết bị — `lib/qwik_v2/style/hidden.ex`

```elixir
8   def fragments(selector, node) do
9     case Enum.filter(Responsive.all_bps(), &hidden?(node, &1)) do
10      [] -> []
13      bps ->
14        if length(bps) == length(Responsive.all_bps()) do
15          [{:base, rule(selector)}]
16        else
17          Enum.flat_map(bps, fn bp ->
18            case Responsive.range_query_for_bp(bp) do
20              query -> [{:media, query, rule(selector)}]
```
- `hidden?/2` (`:27-32`) đọc `config.hidden` **đã merge** cho từng bp (chấp nhận `true` hoặc `"true"`).
- Ẩn ở cả 4 bp → một rule base, không media.
- Ẩn ở một số bp → dùng **range query** (khoảng đóng) cho từng bp. Vì `hidden` là non-cascading (§3.2), ẩn ở tablet chỉ sinh `(min-width: 361px) and (max-width: 768px)` — mobile vẫn hiện. Đã kiểm chứng bằng chạy thử.
- Khai báo luôn là `display:none!important` (`:6`) để thắng mọi `display` khác.

---

## 6. State (hover…) — `lib/qwik_v2/style/states.ex`

Node lưu style state trong `data.states.<state>` và `data.responsive.<bp>.states.<state>`.

```elixir
4   def merge_state_node(node, state) do
      ...
8     responsive = for {bp, slot} <- data["responsive"] || %{}, into: %{} do
10      ss = get_in(slot, ["states", state]) || %{}
12      {bp, %{"style" => Map.merge(slot["style"] || %{}, ss["style"] || %{}), ...}}
19    data = data
20      |> Map.put("style", Map.merge(data["style"] || %{}, base_state["style"] || %{}))
      ...
23      |> Map.put("states", %{})
```
→ "gập" state vào node: base style ⊕ state style, mỗi bp slot ⊕ state slot. Kết quả là một node bình thường, đưa qua cùng pipeline renderer.

```elixir
36  defp variant_frags(%{value: val} = variant, selector, node, renderers, base) do
37    state_sel = Map.get(variant, :selector, "")
39    if val == base or state_sel in [nil, ""] do
40      []
42      base_res = Cascade.merge(node)
43      state_res = Cascade.merge_state(node, val)
45      maps = Map.new(Responsive.all_bps(), fn bp ->
47          base_look = Renderers.run(base_res, bp, renderers)
48          state_look = Renderers.run(state_res, bp, renderers)
49          {bp, Responsive.diff(state_look, base_look)}
52      Responsive.fragments_as_state(selector <> state_sel, maps)
```
- Variant là `%{value: "hover", selector: ":hover"}` do từng node type khai báo (vd `button/css.ex:23`). Variant `default` bị bỏ qua (`:39`).
- Chỉ xuất **phần khác** giữa "trông lúc hover" và "trông bình thường" → `#b1:hover{background: #000}` (kiểm chứng chạy thử, style base `#fff`, hover `#000`).

Các type đang có state: Button, TextDataset (`States.state_css`), ProductImageList, ProductVariantOption (`States.state_rules` với selector con).

---

## 7. Layout flex, Satellite, Global

### 7.1 `QwikV2.Style.Layout` — `lib/qwik_v2/style/layout.ex`

- `container_decls/1` (`:4-17`): hướng `vertical` thì `--layout-vertical` → `justify-content`, `--layout-horizontal` → `align-items`; ngang thì ngược lại. `left/top` → `flex-start`, `right/bottom` → `flex-end` (`:52-59`).
- `child_fill_fragments/3` (`:21-41`): với từng con của một flex container, tính ở mỗi bp con có "fill" theo trục chính/trục phụ không (`fill_state/3`, `:61-74`), rồi sinh rule `#parent > #child{flex-grow;flex-basis;align-self}`.
  - `any_grow?`/`any_self?` (`:34-35`): nếu **không bp nào** cần, không sinh khai báo đó → không rác CSS. Nếu ít nhất một bp cần, **mọi bp** đều sinh giá trị tường minh (`flex-grow:0; flex-basis:auto` ở bp không fill) để bp nhỏ không kế thừa nhầm `flex-grow:1` của bp lớn.
- Dùng bởi FlexBlock (`nodes/flex_block/css.ex:20-21`), Popup, v.v.

### 7.2 `QwikV2.Satellite` — `lib/qwik_v2/satellite.ex`

"Vệ tinh" = một node con mà node cha **trỏ tới qua `config.<key>`** (id), dùng để lưu style cho một phần của cha (vd style cho item trong list-dataset). `render/3` (`:25-30`) tìm node vệ tinh (`find/2`, `:46-51`), dựng selector `#<cha_id> <sel>` và chạy preset renderer (`:text`, `:box`, `:text_box`, `:size`, `:icon`, `:17-23`) + state. `raws/5` (`:39-44`) là biến thể cho phép hàm tự trả map `selector → decls` qua `Responsive.raws/3` (`responsive.ex:63-70`). `Responsive.raws` hiện chỉ được gọi từ Satellite.

### 7.3 Global style — `lib/qwik_v2/style/global.ex`

```elixir
15  def css(style_data) when is_map(style_data) do
16    case style_data["all"] do
17      v when is_binary(v) and v != "" -> v
18      _ -> @default_css
```
- `style_data` lấy từ bảng style global của site: `Renders.selected_style_data/1` (`lib/builderx_api_web/controllers/v1/editor_v2/renders.ex:214-219`) và `Published.selected_style_data/1` → `StyleGlobals.get_selected/1`.
- Server **không tự dựng** CSS global từ preset: nó dùng nguyên chuỗi `style_data["all"]` mà client (editor) gửi lên khi lưu style global. Không có → dùng `@default_css` (9 class `.wk-gs-heading-1..6`, `.wk-gs-text-1..3`, chỉ set `--text-font-size`).
- Node gắn class `wk-gs-<slug>` khi `config.textGlobalStyle` có giá trị (`QwikV2.Common.gs_class/1`, `Satellite.gs_class/1`).

> ⚠️ `StyleGlobals.get_selected/1` (`lib/builderx_api/editor_v2/style_globals.ex:50-55`) chỉ lọc `is_removed == false` + `limit(1)`, **không** lọc `is_selected` và không `order_by`. Site có nhiều style global thì style nào được áp là không xác định. Chưa xác minh editor có tạo nhiều bản hay không.

---

## 8. Ví dụ đầy đủ: 1 heading → CSS

Input (map phẳng `ctx.nodes`):

```json
{
  "ROOT": { "data": { "type": "root", "nodes": ["h1"] } },
  "h1": { "data": {
    "type": "heading", "parent": "ROOT",
    "style":  { "--text-color": "#111111", "--text-font-size": "40px",
                "padding": "8px 16px", "--node-width": "fill" },
    "config": {},
    "responsive": {
      "tablet": { "style": { "--text-font-size": "28px" } },
      "mobile": { "style": { "--text-font-size": "22px" }, "config": { "hidden": true } }
    }
  }}
}
```

Đi qua pipeline:

```
CSS.bundle
 ├─ node "ROOT" → RootCanvas.CSS.rule = []            (root không có CSS riêng)
 ├─ node "h1"   → Heading.CSS.rule → Responsive.node_css("h1", node, @renderers)
 │     ├─ Cascade.merge: desktop/laptop font 40px, tablet 28px, mobile 22px
 │     ├─ Renderers.run cho 4 bp
 │     └─ fragments:
 │          {:base, "#h1{...40px...}"}
 │          laptop vs desktop: không khác → bỏ
 │          {:media, "(max-width: 768px)", "#h1{--text-font-size: 28px}"}
 │          {:media, "(max-width: 360px)", "#h1{--text-font-size: 22px}"}
 │   + Hidden.fragments: chỉ mobile hidden → {:media, "(max-width: 360px)", "#h1{display:none!important}"}
 ├─ static = StaticCSS.app + RootCanvas.StaticCSS + Heading.StaticCSS
 └─ all    = Global default css + base của h1
```

Output **thật** (chạy `QwikV2.CSS.bundle/0` trên code hiện tại), phần `all` và `media`:

```elixir
%{
  all: ".wk-gs-heading-1{--text-font-size:48px}...wk-gs-text-3{--text-font-size:12px}" <>
       "#h1{--node-margin-bottom:0px;--node-margin-left:0px;--node-margin-right:0px;" <>
       "--node-margin-top:0px;--text-color:#111111;--text-font-size:40px;" <>
       "border:0px solid #000000;border-radius:0px;padding:8px 16px;width:auto}",
  media: [
    {"(max-width: 768px)", "#h1{--text-font-size:28px}"},
    {"(max-width: 360px)", "#h1{--text-font-size:22px}#h1{display:none!important}"}
  ]
}
```

Nhận xét từ output:
- `--node-width: fill` → `width:auto` (flex-grow nằm ở rule của cha, §7.1).
- `border:0px solid #000000` và `border-radius:0px` luôn xuất hiện vì renderer `:border`/`:corner` có default.
- `bundle_to_inline` sẽ cho `...}\n@media (max-width: 768px){#h1{--text-font-size:28px}}\n@media (max-width: 360px){...}`.

---

## 9. Upload lên Minio — `lib/qwik_v2/assets.ex`

Chỉ chạy lúc **publish** (`Published.publish_css/1`).

```elixir
6   @cache_control "public, max-age=31536000, immutable"
8   def upload_bundle(%{all: all, media: media} = bundle) do
9     static = Map.get(bundle, :static, "")
11    with {:ok, static_link} <- upload_css(static, "static", "all"),
12         {:ok, all_link} <- upload_css(all, Responsive.default_bp(), "all"),
13         {:ok, media_links} <- upload_media(media) do
14      {:ok, static_link <> all_link <> media_links}
```

```elixir
29  defp upload_css(css, bp, media) do
30    key = "css/editor_v2/#{bp}-#{Tools.get_hash(css)}.css"
32    case Minio.upload(key, css, "text/css", cache_control: @cache_control) do
33      {:ok, url} -> {:ok, ~s(<link rel="stylesheet" href="#{url}" media="#{media}" />)}
```

- **Tên file** = `css/editor_v2/<bp>-<hash>.css`. `Tools.get_hash/1` (`lib/builderx_api/tools.ex:2005-2009`) = SHA-256 hex, lấy **9 ký tự đầu**. Nội dung giống nhau → cùng key → upload lại cũng không đổi URL (content-addressed). Vì thế cache `immutable` 1 năm là an toàn.
- `<bp>`: `static`, `desktop` (cho `all`), và với media: `Responsive.bp_for_query(query)` → `laptop` / `tablet` / `mobile`.
- **Mỗi query một file** gắn `media="(max-width: 768px)"` trên thẻ `<link>` — trình duyệt vẫn tải nhưng hạ ưu tiên, không chặn render với file không khớp màn hình.
- `upload_css("", …)` (`:27`) trả `""` — phần rỗng không tạo file.
- `Minio.upload/4` (`lib/minio/minio.ex:9-28`) dùng `ExAws.S3.put_object`, URL trả về `https://<host>/<bucket>/<key>`.
- `upload_media/1` (`:18-25`) dừng ở lỗi đầu tiên (`reduce_while`) → cả bundle rơi về nhánh fallback `<style>` inline (`published.ex:92`).

Chuỗi `<link>…<link>` này được lưu vào cột `published_pages.app_css`, và `render_doc` in thẳng vào `<head>` (`templates/v1/page/render_v2.html.eex:16`, qua assign `css`).

> ⚠️ Range query (chỉ sinh từ `hidden`, vd `(min-width: 361px) and (max-width: 768px)`) không có trong `@specs` → `bp_for_query/1` trả `nil` → key thành `css/editor_v2/-<hash>.css` (tiền tố rỗng). Vẫn chạy đúng, chỉ là tên file xấu.

---

## 10. Minify — `lib/qwik_v2/css/minify.ex`

Tokenizer 3 trạng thái (`:normal`, `:comment`, `{:string, quote}`):
- Comment `/* */` bị xóa (`:14-15`, `:23-27`).
- Chuỗi trong `"…"` / `'…'` giữ nguyên, kể cả dấu escape (`:29-36`) — để không phá `content: "a ; b"` hay `url("…")`.
- Phần `:normal` qua `tighten/1` (`:45-51`): gom whitespace, bỏ cách quanh `{ } ; ,`, bỏ cách **sau** `:`, `;}` → `}`.

> ⚠️ `~r/:\s+/` áp cho cả selector: `.a :hover` (có khoảng trắng — nghĩa là "con cháu đang hover") sẽ thành `.a:hover` (chính `.a` hover). Hiện chưa thấy CSS nào trong code viết selector kiểu đó, nhưng khi viết `static_css` mới nên tránh.

---

## 11. Thêm CSS cho một node type mới (tóm tắt)

1. Tạo `lib/qwik_v2/nodes/<type>/css.ex` với `rule(id, node)` trả list fragment — thường chỉ cần:
   ```elixir
   @renderers [:canvas_node_wrapper, :node_size, :padding_margin, :border, :corner, :shadow, :bg_color]
   def rule(id, node), do: Responsive.node_css(id, node, @renderers)
   ```
   Cần hover → thêm `States.state_css(id, node, @renderers, [%{value: "default"}, %{value: "hover", selector: ":hover"}])`. Cần style phần tử con → `Responsive.rules("#" <> id <> " .wk-x__child", node, [...])`.
2. Tạo `lib/qwik_v2/nodes/<type>/static_css.ex` với `css/0` trả CSS chung (class `.wk-<type>`).
3. Đăng ký type trong `@css` của `lib/qwik_v2/registry.ex` (tên PascalCase trùng thư mục module).
4. Không cần xử lý `hidden` — `CSS.node_fragments` tự thêm.

---

## 12. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Element không có style gì trên trang publish | Type có trong `@css` của `registry.ex`? `published_pages.app_css` có `<link>` không, link có 200 không? |
| Trang publish không có CSS class chung (`.wk-tab`…) | `static_components/1` chỉ lấy type có trong `ctx.nodes` — kiểm tra node có `data.type` đúng; type có `StaticCSS` module? |
| Chỉnh ở mobile mà desktop cũng đổi | `Responsive.fallback_up/4` (`responsive.ex:176-188`) — giá trị chỉ đặt ở bp nhỏ lan lên bp lớn chưa có key |
| Chỉnh ở tablet mà mobile không nhận | Đọc output `media`: rule tablet là `max-width: 768px` nên áp cả mobile, trừ khi mobile có key khác |
| Điện thoại 390px hiển thị theo style tablet | Breakpoint mobile là `max-width: 360px` (`responsive.ex:4,10`) |
| Ẩn ở tablet mà mobile cũng ẩn / không ẩn | `hidden` non-cascading + range query (`hidden.ex`, `responsive.ex:13-20`) |
| Hover không có tác dụng | Type có khai báo variant hover không (`@variants` trong `css.ex` của type)? State lưu ở `data.states.hover.style`? |
| Chữ không nhận global style (heading-1…) | Node có `config.textGlobalStyle`? `style_data["all"]` của site có chuỗi CSS không (nếu rỗng → default)? Node có set `--text-font-size` riêng (sẽ thắng class)? |
| Site có nhiều style global, áp sai bản | `StyleGlobals.get_selected/1` không lọc `is_selected` |
| `app_css` là `<style>…` thay vì `<link>` | Upload Minio lỗi → fallback (`published.ex:90-93`); xem log/config Minio |
| Đổi style, publish lại, trình duyệt vẫn thấy cũ | Không phải do cache file CSS (tên theo hash). Kiểm tra `SkeletonCache` / bản publish (xem [06](./06-publish.md)) |
| CSS selector bị "dính" sau minify | `Minify.tighten/1` bỏ khoảng trắng sau `:` kể cả trong selector |
| Preview khác publish | Preview dùng `CSS.app/0` inline, publish dùng `bundle` + upload; cả hai cùng `bundle/0` — khác biệt thường do dữ liệu (draft vs bản đã publish) chứ không do CSS engine |
