---
sidebar_position: 11
title: "10 — render_v2: runtime JS phía trình duyệt"
---

# 10 — render_v2: runtime JS phía trình duyệt

> **Cho BA:** Trang do server dựng ra đã là HTML hoàn chỉnh — khách thấy nội dung ngay, không cần JS. JS chỉ được tải cho những phần **cần tương tác**: bấm tab, mở accordion, chọn biến thể sản phẩm, tăng giảm số lượng, phân trang danh sách, popup… Mỗi phần tương tác là một "đảo" (island) nhỏ; đảo chỉ tải JS khi nó **xuất hiện trên màn hình** hoặc khi khách **bấm** vào. Bộ JS được build một lần, upload lên Minio theo **phiên bản**; mỗi trang đã publish "ghim" vào một phiên bản cụ thể, nên deploy JS mới không làm hỏng trang cũ.

Chương này mô tả thư mục `assets/render_v2/` (runtime chạy trên trang khách), cách server Elixir sinh ra các thuộc tính mà runtime đọc, và quy trình build/deploy/dev. HTML xem [08](./08-qwik-html.md), CSS xem [09](./09-qwik-css.md), luồng request xem [07](./07-render-request.md), publish xem [06](./06-publish.md).

> Snapshot: branch `feat-builder-v2`, commit `3e3eeacb5`. Đường dẫn tính từ root repo `builderx_api`. Bỏ qua các thư mục `.omc/` nằm lẫn trong source (là state của tool AI, không phải code).

---

## 1. Bức tranh tổng

```
SERVER (Elixir)                                          TRÌNH DUYỆT
────────────────────────────────────────────────         ─────────────────────────────────────────────
QwikV2.HTML (node html.ex)                                <html x:id=SITE x:page=PAGE>
  ├─ Common.x_init("Tab")   → x:init="Tab"                 <div id=.. x:init="Tab"> ... on:click='[..]'
  ├─ Common.x_now("Popup")  → x:now="Popup"                <div x:now="Popup" x:props='{..}'>
  ├─ Common.x_props(map)    → x:props='{json}'
  ├─ Common.x_ref(product)  → x:props='{"ref":{..}}'
  ├─ x:text / x:class / on:click trong markup
  └─ Events.attrs(node)     → on:click='[{"call":"PopupEvent#openPopup",..}]'
QwikV2.Data.Seed          → <script type="x/seed">{product:{id:{..}}}</script>
QwikV2.XData              → <script type="x/json">{nodeId:{..}}</script>
QwikV2.Scripts.tags       → <script>window.xbase=..;window.xevents=[..]</script>
                            <script type="module" src="<base>Loader.js">      ──► core/loader.js
                                                                                 ├─ đọc x/json, x/seed
                                                                                 ├─ fetch manifest.json
                                                                                 ├─ lắng nghe click/.. ở document
                                                                                 ├─ x:now  → mount ngay
                                                                                 ├─ x:init → mount khi vào viewport
                                                                                 └─ import(<base>Tab.js) lười
                                                                              nodes/tab.js
                                                                                 └─ WK2.register('Tab', defineModule({...}))
                                                                                      └─ core/define.js: bindDom x:text/x:class/...
```

Ba ý chính:
1. **SSR trước, JS sau.** Server render HTML đầy đủ (kể cả trạng thái ban đầu như tab đang active). JS đọc trạng thái **từ DOM** khi mount, nên không nhấp nháy.
2. **Island lazy.** Mỗi module JS gắn với tên (`Tab`, `Popup`…). Loader chỉ `import()` file của module khi cần.
3. **Directive trong attribute.** Không có template engine phía client; server viết sẵn `x:text`, `x:class`, `on:click`… và `define.js` gắn reactive vào các attribute đó.

---

## 2. Cây thư mục `assets/render_v2/`

```
assets/render_v2/
├─ core/                      — hạ tầng, không phải entry riêng (bundle vào Loader / chunk chung)
│  ├─ loader.js               Entry "Loader": boot, event delegation, lazy import
│  ├─ define.js               defineModule(): class island + bindDom directives
│  ├─ reactive.js             reactive / effect / computed / watch / EffectScope (mini Vue)
│  ├─ store.js                defineStore (singleton kiểu Pinia) / defineDynamicStore (theo entity)
│  ├─ bus.js                  emit/on pub-sub toàn cục
│  └─ image-reveal.js         gắn class is-loaded cho <img data-wk-img> khi ảnh tải xong
├─ nodes/*.js                 — MỖI FILE = 1 entry = 1 module island (PascalCase theo tên file)
├─ events/                    — entry có hậu tố "Event": navigation.js → NavigationEvent, popup/index.js → PopupEvent
├─ stores/                    product.js (dynamic store), cart.js, seed.js (đọc window.xSeed)
├─ api/                       client.js (fetch wrapper) + dataset/cart/product/order/customer/upload
├─ services/                  i18n.js, i18n-boot.js, notify.js (toast), modal.js, layer.js (z-index)
├─ lib/                       tiện ích thuần: array, dom, math, number, string, timing, url, …
├─ locales/                   vi/en/th/es.json — nạp động theo <html lang>
└─ dev/hmr.js                 Chỉ dev: morph DOM khi file .ex đổi
```

Cách Vite biến thư mục thành entry — `assets/vite.render_v2.config.mjs:11-37`:

```js
18  add('Loader', join(R, 'core/loader.js'))
20  for (const d of readdirSync(R, { withFileTypes: true })) {
21    if (d.isDirectory() && !SKIP.has(d.name) && existsSync(join(R, d.name, 'index.js'))) {
22      add(toPascal(d.name), join(R, d.name, 'index.js'))
34  scanEntries(join(R, 'nodes'))
35  scanEntries(join(R, 'events'), 'Event')
```
- `:18` entry cố định `Loader`.
- `:20-24` thư mục cấp 1 (ngoài `SKIP` ở `:9`) có `index.js` cũng thành entry — hiện không có thư mục nào như vậy.
- `:34` mỗi `nodes/foo-bar.js` → entry `FooBar`.
- `:35` mỗi `events/x.js` hoặc `events/x/index.js` → entry `XEvent`.
- `add()` (`:13-16`) **ném lỗi khi trùng tên** — ví dụ không thể có cả `nodes/popup.js` và `nodes/popup/index.js`. `events/popup/` không đụng `nodes/popup.js` vì có hậu tố `Event`.

**Quy ước tên quan trọng:** tên entry = tên dùng trong `x:init` / `x:now` / `on:click.call` = tên truyền cho `WK2.register`. Ba chỗ này phải khớp tuyệt đối.

---

## 3. Server sinh gì cho runtime

### 3.1 `QwikV2.Common` — attribute island

File: `lib/qwik_v2/common.ex`

```elixir
23  def x_init(name), do: runtime_attr("x:init", name)
25  def x_props(map) when is_map(map) and map_size(map) > 0 do
26    ~s( x:props='#{map |> Jason.encode!() |> String.replace("'", "&#39;")}')
32  def x_ref(type, entity) do
33    case QwikV2.Data.Binding.get(entity, "id") do
34      id when is_binary(id) -> x_props(%{"ref" => %{"type" => type, "id" => id}})
40  def x_now(name), do: runtime_attr("x:now", name)
42  defp runtime_attr(dir, name) do
43    QwikV2.Compile.mark_runtime()
44    ~s( #{dir}="#{esc_attr(name)}")
```
- `x:init="Name"`: mount **khi phần tử lọt vào viewport** (IntersectionObserver).
- `x:now="Name"`: mount **ngay khi loader chạy**.
- `x:props='{json}'`: props truyền cho island; dùng nháy đơn bao ngoài, `'` trong JSON được escape `&#39;`.
- `x_ref("product", product)`: props `{"ref":{"type":"product","id":"…"}}` — island dùng để lấy entity từ seed (§6).
- `mark_runtime/0` (`lib/qwik_v2/compile.ex:35`) đánh dấu "trang cần JS" để `Scripts.tags` không bỏ qua thẻ `<script>`.

### 3.2 `QwikV2.Events` — sự kiện người dùng cấu hình

File: `lib/qwik_v2/events.ex`. Node có `data.events = [{trigger, name, target}]`.

```elixir
4   @actions %{ "go_to_url" => GoToUrl, "popup" => Popup, "open_page" => OpenPage,
               "open_cart" => OpenCart, "go_to_checkout" => GoToCheckout }
12  @dom_events %{"click" => "click", "hover" => "mouseenter", "dblclick" => "dblclick"}
```
- `attrs/2` (`:16-29`): mỗi event → action module trả **chuỗi thô** (vd `href="…"`) hoặc **handler** `%{type, call, props, stop}`; handler gom theo type thành `on:click='[{"call":"PopupEvent#openPopup","props":{"id":"…"}}]'` (`:31-45`). Có handler `stop: true` → thêm attribute `on:click.stop`.
- `used_dom_events/1` (`:51-68`): danh sách DOM event thực sự cần runtime (vd `["click","mouseenter"]`) → thành `window.xevents`.
- Button có event `go_to_url` + click → render thành thẻ `<a href>` thật (`html_tag/1`, `:91-106`; `GoToUrl.attrs/2` nhánh `"a"`), **không cần JS** (`runtime?` trả `false`).

| Action | Handler client | Có file JS? |
|---|---|---|
| `go_to_url` (click trên Button) | — (thẻ `<a>`) | không cần |
| `go_to_url` (khác) | `NavigationEvent#goToUrl` | ✅ `events/navigation.js` |
| `popup` | `PopupEvent#openPopup` | ✅ `events/popup/index.js` |
| `open_page` | `NavigationEvent#openPage` | ⚠️ `navigation.js` **không có** method `openPage` |
| `open_cart` | `CartEvent#openCart` | ⚠️ **không có** entry `CartEvent` |
| `go_to_checkout` | `CartEvent#goToCheckout` | ⚠️ **không có** entry `CartEvent` |

> ⚠️ **Chưa nối:** 3 dòng cuối — server sinh `on:click` gọi method/module không tồn tại. `open_page`: loader tạo instance `NavigationEvent` nhưng `vm.openPage` không có → im lặng không làm gì (`loader.js:151`). `open_cart`/`go_to_checkout`: loader `import()` file `CartEvent.js` không có trong manifest → lỗi console `[wk2] load CartEvent lỗi`, promise chờ mãi.

### 3.3 `QwikV2.XData` — `<script type="x/json">`

File: `lib/qwik_v2/x_data.ex`. `build/1` (`:11-17`) gom `%{node_id => data}` từ `Registry.data_mod(type).data/2` + `Events.xdata/1`.

> Hiện `@data %{}` trong `lib/qwik_v2/registry.ex:69` rỗng → không type nào có Data module, và mọi action event đều `data/1 → %{}`. **Island `x/json` hiện luôn rỗng → không được in ra.** Cơ chế còn đó cho tương lai; `defineModule` vẫn đọc `window.xData[id]` (`define.js:130`).

### 3.4 `QwikV2.Data.Seed` — `<script type="x/seed">`

File: `lib/qwik_v2/data/seed.ex`
- `reset/0` (`:12-15`): mỗi lần render, pool về rỗng rồi **luôn** seed `ctx.product` (trang sản phẩm) — comment `:10-11` giải thích: không phải node nào bind product cũng tự gọi `put`.
- `put(type, entity)` (`:17-30`): node html gọi khi render (vd `pricing_dataset/html.ex:21`). Mỗi entity chỉ project một lần.
- `project/2` → `ProductSeed.project/1` (`lib/qwik_v2/data/product_seed.ex`): chỉ giữ `id, slug, image, variations[{id, fields[{name,value}], retail_price(_text), original_price(_text), remain_quantity, images}]` — đủ để client đổi giá/ảnh/tồn kho khi chọn biến thể, không lộ dữ liệu thừa.
- `tag/1` (`:34-38`) → `<script type="x/seed">{"product":{"<id>":{...}}}</script>`, in trong `templates/v1/page/render_v2.html.eex:20`.

### 3.5 `QwikV2.Scripts.tags/1` — thẻ script cuối `<body>`

File: `lib/qwik_v2/scripts.ex`

```elixir
4   def tags(nodes) do
5     xdata = XData.tag(nodes)
6     dom_events = Events.used_dom_events(nodes)
7     dev = Application.get_env(:builderx_api, :qwik_v2_vite_dev, false)
9     if xdata == "" and dom_events == [] and not Compile.needs_runtime?() and not dev do
10       ""
12      base = Runtime.base_path()
13      loader = if dev, do: "core/loader.js", else: "Loader.js"
14      client = if dev, do: ~s(<script type="module" src="#{base}@vite/client"></script>), else: ""
15      hmr = if dev, do: ~s(<script>window.xhmr="/wk2/hmr"</script>\n<script type="module" src="#{base}dev/hmr.js"></script>), else: ""
```
- `:9` Trang không có island, không event, không dev → **không tải JS nào**.
  > Thực tế root node luôn render `x:now="Global"` (`lib/qwik_v2/nodes/root_canvas/html.ex:7`) → `mark_runtime` luôn bật → mọi trang đều tải Loader (để Global nạp locale).
- `:12` `base` = nơi chứa JS (§8.1).
- `:13` Prod nạp file build `Loader.js`; dev nạp source `core/loader.js` thẳng từ Vite.
- `:14-15` Dev thêm Vite client (HMR module JS) và `dev/hmr.js` (HMR cho file `.ex`, §9).
- `config/2` (`:25-29`) in `window.xbase` và `window.xevents`.

Khi **publish**, chuỗi này được tính trong `Compile.compile/1` (`lib/qwik_v2/compile.ex:22`) và **lưu cứng** vào `published_pages.source["scripts"]` — tức là URL phiên bản JS bị "ghim" tại thời điểm publish (§8). Khi **preview draft**, `serve_draft` gọi `Scripts.tags` trực tiếp mỗi request (`render_controller.ex:230`).

### 3.6 Template HTML cuối cùng

`lib/builderx_api_web/templates/v1/page/render_v2.html.eex`:

```eex
2  <html lang="<%= assigns[:lang] || "en" %>" x:id="<%= assigns[:site_id] %>" x:page="<%= assigns[:page_id] %>">
   ...
16     <%= raw(assigns[:css] || "") %>
19     <%= raw(assigns[:body] || "") %>
20     <%= raw(QwikV2.Data.Seed.tag(assigns[:seed])) %>
21     <%= raw(assigns[:scripts] || "") %>
```
- `x:id` / `x:page` trên `<html>`: `api/client.js` đọc để gọi API (`siteId()`, `pageId()`).
- `lang`: `Global` island dùng để chọn locale; `ListDataset` gửi kèm khi phân trang.
- Thứ tự: body → seed → scripts. Loader là `type="module"` (defer mặc định) nên khi chạy, toàn bộ DOM và thẻ seed đã có.

---

## 4. `core/loader.js` từng dòng

File: `assets/render_v2/core/loader.js`. Là IIFE chạy một lần, không export gì; giao tiếp qua `window.WK2`.

### 4.1 State nội bộ — `:5-9`

| Biến | Kiểu | Ý nghĩa |
|---|---|---|
| `classes` | `{name: Class}` | Module đã register |
| `instances` | `Map<key, vm>` | Instance đã tạo; key = `Name` (global) hoặc `Name:<hostId>#<uid>` |
| `mounts` | `Map<key, host>` | Chỉ dùng ở DEV để hot-replace |
| `pending` | `{name: [fn]}` | Hàng đợi lời gọi tới module **chưa tải xong** |
| `fetched` | `{name: 1}` | Đã `import()` rồi, không tải lại |

### 4.2 Đọc dữ liệu server — `:11-28`

```js
11  const island = doc.querySelector('script[type="x/json"]')
13    win.xData = island ? JSON.parse(island.textContent) : {}
18  const seedTag = doc.querySelector('script[type="x/seed"]')
20    win.xSeed = seedTag ? JSON.parse(seedTag.textContent) : {}
25  const mergeSeed = extra => {
27    for (const type in extra) win.xSeed[type] = Object.assign(win.xSeed[type] || {}, extra[type])
```
- `type="x/json"` / `"x/seed"` là type lạ → trình duyệt **không thực thi**, chỉ là kho dữ liệu. `try/catch` để JSON hỏng không làm chết loader.
- `mergeSeed` (expose là `WK2.seed`): dùng khi ListDataset tải trang mới — server trả seed của các sản phẩm mới, gộp vào pool theo type.

### 4.3 `register(name, klass)` — `:30-56`

Được mỗi file module gọi ở dòng cuối: `window.WK2.register('Tab', Tab)`.
- `:44` lưu class.
- `:54-55` **xả hàng đợi** `pending[name]`: các lời gọi (mount/click) đến trước khi file tải xong giờ mới chạy.
- `:32-52` chỉ DEV (`import.meta.env.DEV` bị Vite thay thành `false` và tree-shake khi build): khi file module được HMR nạp lại, hủy instance cũ (sau khi `serialize()` state), tạo instance mới từ class mới, `hydrate(snapshot)` → giữ nguyên state khi sửa code.

### 4.4 `keyFor(name, host)` & `get(id, name)` — `:58-71`

```js
59  const keyFor = (name, host) => {
60    if (!host || host === doc.body) return name
61    if (!host.__wk2k) host.__wk2k = `${host.id || 'n'}#${++uid}`
62    return `${name}:${host.__wk2k}`
```
- Island gắn vào một phần tử (host) → mỗi host một instance, key có uid để 2 island cùng id (ví dụ item lặp) không đụng nhau.
- Không có host (event module như `NavigationEvent` gọi từ nút không nằm trong island `NavigationEvent`) → **singleton** gắn `document.body`, key = tên.
- `get(id, name)` (expose `WK2.get`, dùng trong `$vm()`): tìm instance theo id phần tử và/hoặc tên module.

### 4.5 Mount — `:73-99`

```js
74  const mountAll = root => {
75    const scope = root && root.querySelectorAll ? root : doc
76    scope.querySelectorAll('[x\\:now]').forEach(el => initAttr(el, 'x:now'))
77    if (observer) scope.querySelectorAll('[x\\:init]').forEach(el => observer.observe(el))
80  const hydrate = root => { mountAll(root); revealImages(...) }
85  win.WK2 = { register, instances, emit, on, get, mount: hydrate, seed: mergeSeed }
```
- `x:now` → `initAttr` ngay. `x:init` → giao cho IntersectionObserver.
- `WK2.mount(root)` được gọi lại sau khi chèn HTML mới (ListDataset phân trang, HMR) để mount island trong đoạn HTML đó.
- `:87-99` DEV: trước khi mount, `prune()` hủy instance có host đã bị gỡ khỏi DOM.

### 4.6 Tải module lười — `:101-116`

```js
101 const base = () => win.xbase || '/render_v2/'
104 const loadManifest = cb => {
105   fetch(base() + 'manifest.json').then(r => r.json()).then(m => ((manifest = m), cb())).catch(cb)
111 const fetchModule = name => {
112   if (fetched[name]) return
113   fetched[name] = 1
114   const rel = (manifest && manifest[name]) || `${name}.js`
115   import(/* @vite-ignore */ base() + rel).catch(e => console.error(`[wk2] load ${name} lỗi:`, e))
```
- `manifest.json` map `Tên → file` (`{"Tab":"Tab.js", ...}`, sinh bởi plugin `wk2-manifest`, `vite.render_v2.config.mjs:62-66`; ở dev do middleware trả `{"Tab":"nodes/tab.js"}`, `:52-60`).
- Không có manifest / tên không có trong manifest → đoán `<Name>.js`.
- `import()` động: file module tự chạy `WK2.register(...)` → xả `pending`.

### 4.7 Gọi method — `call` / `callWith` — `:126-152`

```js
126 const call = (name, method, el, ev, props, ctx) => {
127   const host = el && el.closest(`[x\\:init~="${name}"], [x\\:now~="${name}"]`)
129   if (classes[name]) return Promise.resolve(callWith(...))
131   return new Promise(resolve => {
132     ;(pending[name] = pending[name] || []).push(() => resolve(callWith(...)))
135     fetchModule(name)
```
- `:127` **host** = phần tử gần nhất (tính cả chính nó) có `x:init`/`x:now` chứa tên module (`~=` = so khớp một từ trong danh sách cách nhau bởi dấu cách, nên một phần tử có thể là host của nhiều module: `x:init="A B"`).
- Module chưa có → xếp hàng + tải file.

```js
139 const callWith = (name, method, host, el, ev, props, ctx) => {
141   const klass = classes[name]
142   const key = keyFor(name, host)
143   let vm = instances.get(key)
144   if (!vm) { vm = new klass(host || doc.body); instances.set(key, vm); ... }
150   if (props && vm.beforeUpdate) vm.beforeUpdate(props)
151   if (method && vm[method]) return vm[method](props, ev, el, ctx)
```
- Lần đầu gọi → tạo instance (constructor chạy `setup/data/mounted/bindDom`, §5).
- `method` null (mount thuần) → chỉ tạo instance.
- Chữ ký method luôn là `(props, ev, el, ctx)`.

### 4.8 Event delegation — `dispatch` / `listen` — `:154-198`

```js
176 const listen = type => {
177   doc.addEventListener(type, ev => {
181     if ((type == 'mouseenter' || type == 'mouseleave') && !ev.target.hasAttribute(`on:${type}`)) return
183     let el = ev.target.closest(`[on\\:${type}]`)
185     if (type === 'click' && el) {
186       const anchor = ev.target.closest('a[href]')
187       if (anchor && anchor !== el && el.contains(anchor)) return
190     while (el) {
191       dispatch(el, type, ev)
192       if (el.hasAttribute(`on:${type}.stop`)) return
193       el = el.parentElement && el.parentElement.closest(`[on\\:${type}]`)
196   }, { capture: true })
```
- **Một** listener ở `document` cho mỗi loại event (capture) — không gắn listener lên từng phần tử, HTML chèn động cũng tự có sự kiện.
- `:181` `mouseenter` không bubble; với capture, listener nhận cho mọi phần tử — chỉ xử lý khi chính target có `on:mouseenter`.
- `:185-188` click vào một `<a href>` nằm **trong** phần tử có `on:click` → nhường cho link, không chạy handler (ví dụ card sản phẩm có link bên trong).
- `:190-194` đi ngược lên cây, chạy mọi ancestor có `on:click` — trừ khi gặp `on:click.stop`.

```js
154 const dispatch = async (el, type, ev) => {
155   const raw = el.getAttribute(`on:${type}`)
157   if (el.hasAttribute(`on:${type}.prevent`)) ev.preventDefault()
161     list = JSON.parse(raw)
165   if (!Array.isArray(list)) list = [list]
167   const ctx = { el, ev, type, results: [] }
168   for (const item of list) {
169     const [name, method] = String(item.call).split('#')
170     const res = await call(name, method, el, ev, item.props, ctx)
171     ctx.results.push(res)
172     if (res === false) break
```
- `on:click` là **mảng JSON** `[{"call":"Module#method","props":{...}}]`, chạy **tuần tự** (có `await`), method trả `false` → dừng chuỗi.
- `ctx.results` cho phép handler sau đọc kết quả handler trước.

### 4.9 Boot — `:200-222`

```js
200 const initAttr = (el, attr) => {
201   if (el.__wk2i) return
202   el.__wk2i = 1
203   const props = parseProps(el, 'x:props')
204   el.getAttribute(attr).split(' ').forEach(name => call(name, null, el, null, props))
207 loadManifest(() => {
208   ;(win.xevents || ['click']).forEach(listen)
210   observer = new IntersectionObserver(entries => { ... initAttr(entry.target, 'x:init'); observer.unobserve(...) })
218   mountAll(doc)
219   revealImages(doc)
221   ;(win.xmodules || []).forEach(fetchModule)
```
- `__wk2i` chống mount 2 lần (ví dụ `WK2.mount` gọi lại trên cùng vùng).
- Mọi thứ chạy **sau khi** manifest tải xong (hoặc lỗi).
- `:208` chỉ lắng nghe các event trong `window.xevents` (server tính), mặc định `['click']`.
- `:221` `window.xmodules` cho phép preload module — server hiện **không** set biến này.

> ⚠️ **Lỗi tiềm ẩn đã đối chiếu code:** `window.xevents` chỉ tính từ `data.events` của node (`Events.used_dom_events`). Các `on:click` viết **cứng** trong markup island (Tab, Accordion, ListDataset, ProductVariantOption…) không được tính. Nếu trang có event `hover` (→ `xevents = ["mouseenter"]`) mà **không** có event click nào, `xevents` không chứa `"click"` → loader không lắng nghe click → tab/accordion/phân trang không bấm được. Khi `used_dom_events` rỗng thì `xevents` không được set và mặc định `['click']` nên trang bình thường không gặp.

---

## 5. `core/define.js` — `defineModule()`

File: `assets/render_v2/core/define.js`. API mô phỏng Vue Options API (tác giả port từ editor Vue).

### 5.1 Vòng đời constructor — `:125-176`

```js
127 constructor(host) {
128   this.$el = host || document.body
129   this.id = this.$el.id
130   this.props = (window.xData && window.xData[this.id]) || {}
131   const xp = this.$el.getAttribute && this.$el.getAttribute('x:props')
133     try { this.props = { ...this.props, ...JSON.parse(xp) } } catch (e) {}
135   this.scope = new EffectScope()
137   this.scope.run(() => {
138     if (options.setup) { const exposed = options.setup.call(this, { el, id, props }); ... }
142     this.state = reactive(options.data ? options.data.call(this) : {})
144     for (const k in this.state) Object.defineProperty(this, k, { get/set → this.state[k] })
150     for (const name in options.computed || {}) { ... computed(...) ... }
160     for (const name in options.methods || {}) this[name] = (props, ev, el, ctx) => ...
164     for (const key in options.watch || {}) { ... watch(() => resolve(this, key), ...) }
174   if (options.mounted) options.mounted.call(this)
175   bindDom(this.$el, this, this.scope)
```

```
new Klass(host)
 ├─ ① props  = xData[id]  ⊕  JSON(x:props)                 (x:props thắng)
 ├─ ② setup({el, id, props})   — chạy TRƯỚC data; gán this.store = seedFromProps(...) ở đây
 ├─ ③ data()  → reactive state, proxy lên this.<key>
 ├─ ④ computed  → this.<name>
 ├─ ⑤ methods   → this.<name>(props, ev, el, ctx)
 ├─ ⑥ watch     → key là đường dẫn chấm "a.b" resolve trên this
 ├─ ⑦ mounted()
 └─ ⑧ bindDom(this.$el)  — gắn directive x:* vào DOM SSR
```

Tất cả effect tạo trong `scope.run` thuộc `this.scope` → `destroy()` (`:211-214`) gọi `scope.stop()` gỡ sạch effect + listener (`$on` đăng ký cleanup, `:178-181`).

Helper instance: `$on` (listener tự gỡ), `$emit`/`$subscribe` (bus), `$vm(id, name)` (lấy island khác), `$t` (i18n), `$toast`, `$modal`.

### 5.2 `resolve(ctx, expr)` — `:7-14`

Chỉ hỗ trợ **đường dẫn chấm** và phủ định `!`: `"isActive.3"`, `"!loading"`, `"store.priceText"`. **Không** có biểu thức (`a === b`, `a + 1`). Vì vậy các module luôn tạo computed map kiểu `isActive = {0: true, 1: false}` để server viết `x:class='{"is-active":"isActive.0"}'` (comment `nodes/tab.js:3-7`).

### 5.3 `bindDom` — directive — `:26-123`

| Directive | Server viết | Client làm | Dòng |
|---|---|---|---|
| `x:text="expr"` | `<span x:text="priceText">120.000đ</span>` | `el.textContent = resolve(expr)` (reactive) | `:74-77` |
| `x:html="expr"` | | `el.innerHTML = …` | `:78-81` |
| `x:show="expr"` | | `style.display = '' / 'none'` | `:82-85` |
| `x:class='{"cls":"expr"}'` | `x:class='{"wk-tab__btn--active":"isActive.0"}'` | `classList.toggle(cls, !!expr)`; key có thể nhiều class cách nhau dấu cách | `:86-95` |
| `x:attr:NAME="expr"` | `x:attr:src="activeImage"` | `setAttribute`; `null/false` → remove; `true` → `""` | `:96-105` |
| `x:model="expr"` | | 2 chiều cho input | `:106-117` |
| `x:for="list" x:as="item" x:key="item.id"` | con đầu tiên là template | clone template cho từng phần tử, keyed diff | `:29-72` |

- Nội dung SSR **đã đúng sẵn** (vd `120.000đ`); effect chạy lần đầu gán lại cùng giá trị → không đổi hình. Sau đó mỗi khi state đổi, chỉ đúng node đó cập nhật.
- `isNestedIsland` (`:23-24`, comment `:18-22`): gặp phần tử con có `x:init`/`x:now` → **dừng đi xuống**. Island lồng tự quản DOM của nó; nếu không dừng, directive của con bị đánh giá theo state của cha (vd `isActive` có ở cả Tab, MediaDataset, ProductVariantOption).
- `x:for`: template lấy từ `firstElementChild` và **tách khỏi DOM** (cache trong `tplCache`). Block có key cũ được tái sử dụng, block thừa `scope.stop()`.

---

## 6. Reactive, store, seed

### 6.1 `core/reactive.js` — mini Vue reactivity

- `reactive(obj)` (`:63-89`): Proxy sâu (lazy — con chỉ bọc khi được đọc), cache theo `WeakMap`. `set` chỉ `trigger` khi giá trị đổi (`!==`); mảng thêm phần tử mới → trigger thêm `length`.
- `effect(fn)` (`:119-123`): chạy ngay, ghi lại dep đã đọc; mỗi lần chạy lại `cleanup()` dep cũ (`:34-40`) → dep động đúng.
- `computed` (`:125-134`): thực chất là một `effect` ghi vào `holder.value` — **eager**, tính lại ngay khi dep đổi (không lazy như Vue).
- `watch(source, cb, {deep, immediate, once})` (`:145-166`): `deep` duyệt để đăng ký dep; lần đầu chỉ gọi `cb` khi `immediate`.
- `EffectScope` (`:44-58`): gom effect + cleanup để dừng một lần.
- Không có batching/scheduler bất đồng bộ: mọi trigger chạy **đồng bộ**. Gán nhiều field liên tiếp → effect chạy nhiều lần. Chấp nhận được vì island nhỏ.

### 6.2 `core/store.js`

- `defineStore(id, {state, getters, actions})` (`:59-76`): singleton theo `id`, kiểu Pinia; có `$patch`, `$reset`, `$subscribe`, `$state`. Hiện chỉ `stores/cart.js` dùng — và **cart store chưa được module nào import** (xem §10).
- `defineDynamicStore(id, {key, state, getters, actions})` (`:78-154`): **một store, nhiều entity**. `seed(entity)` tạo state cho `entity[key]` (một lần); `of(key)` trả "view" có getter/action bind vào entity đó. Nhiều island dùng chung `of(productId)` → **chia sẻ state**: chọn biến thể ở `ProductVariantOption` làm `PricingDataset` đổi giá và `ProductImageList` đổi ảnh.

### 6.3 `stores/product.js` + `stores/seed.js`

```js
// stores/seed.js
7  export function seedFromProps(props) {
8    const ref = props && props.ref                          // từ x_ref("product", p) phía server
11   const useStore = STORES[ref.type]                       // { product: useProductStore }
14   const store = useStore()
15   const pool = window.xSeed && window.xSeed[ref.type] || {}
16   const entity = pool[ref.id]
17   if (entity) store.seed(entity)
18   return store.of(ref.id)
```

Luồng dữ liệu sản phẩm end-to-end:

```
Server: pricing_dataset/html.ex
  ├─ Seed.put("product", product)             → pool["product"][id] = ProductSeed.project(product)
  └─ x_init("PricingDataset") <> x_ref("product", product)
                                              → x:props='{"ref":{"type":"product","id":"P1"}}'
Template: <script type="x/seed">{"product":{"P1":{...variations...}}}</script>
Client:
  loader → window.xSeed
  PricingDataset.setup → seedFromProps(props) → useProductStore().seed(xSeed.product.P1).of("P1")
  computed priceText = store.priceText  → getter selectedVariation.retail_price_text
  bindDom: <span x:text="priceText">
ProductVariantOption.select → store.selectValue(attr, value)
  → selectedValues đổi → selectedVariation đổi → priceText đổi → <span> cập nhật
                                               → activeImageIndex đổi → ProductImageList cập nhật
```

Getter chính của `useProductStore` (`stores/product.js`): `selectedVariation` (khớp mọi `selectedValues` với `fields`, không khớp → biến thể đầu), `price`, `priceText`, `comparePriceText`, `remainQuantity`, `images` (gộp ảnh mọi biến thể, bỏ trùng), `activeImage`. Action: `setSelected`, `selectValue` (kèm nhảy ảnh về ảnh đầu của biến thể), `setQuantity` (kẹp `1..remainQuantity`), `inc/decQuantity`, `setActiveImage`.

---

## 7. Bảng module JS ↔ node server

| Module (entry) | File | Server gắn ở | Kiểu mount | Làm gì | Dùng store |
|---|---|---|---|---|---|
| `Global` | `nodes/global.js` | `root_canvas/html.ex:7` | `x:now` | `useLocale(<html lang>)` nạp `locales/<lang>.json` | — |
| `Accordion` | `nodes/accordion.js` | `accordion/html.ex:31` | `x:init` | map `open{i:bool}`, `toggle` (mở nhiều mục) | — |
| `Tab` | `nodes/tab.js` | `tab/html.ex:51` | `x:init` | `active`, `isActive`, `select` | — |
| `TextDataset` | `nodes/text-dataset.js` | `text_dataset/html.ex:54` (khi có nút xem thêm) | `x:init` | `expanded`, nhãn more/less | — |
| `PricingDataset` | `nodes/pricing-dataset.js` | `pricing_dataset/html.ex:34` (khi không có children) | `x:init` | `priceText`, `compareText` | product |
| `QuantityDataset` | `nodes/quantity-dataset.js` | `quantity_dataset/html.ex:27` | `x:init` | `inc/dec`, đồng bộ `<input data-qty>` | product |
| `ProductVariantOption` | `nodes/product-variant-option.js` | `product_variant_option/html.ex:31` | `x:init` | chọn giá trị thuộc tính, dropdown `open` | product |
| `ProductImageList` | `nodes/product-image-list.js` | `product_image_list/html.ex:59` | `x:init` | thumbnail, `prev/next/pick` | product |
| `ProductImageFeature` | `nodes/product-image-feature.js` | `product_image_feature/html.ex:39` | `x:init` | ảnh lớn theo `activeImage` | product |
| `ListDataset` | `nodes/list-dataset.js` | `list_dataset/html.ex:45` | `x:init` | slider (`prev/next/goTo`), phân trang số / load more / infinite scroll | — (merge seed) |
| `Marquee` | `nodes/marquee.js` | `text_marquee/html.ex:22` | `x:init` | nhân bản track, chạy animation theo tốc độ | — |
| `ImageComparison` | `nodes/image-comparison.js` | `image_comparison/html.ex:39` | `x:init` | kéo thanh so sánh trước/sau (clip-path) | — |
| `Video` | `nodes/video.js` | `video/html.ex:19` (video tự host) | `x:init` | chỉ 1 video phát cùng lúc; autoplay khi ≥50% trong viewport | — |
| `Popup` | `nodes/popup.js` | `popup/html.ex:26` | `x:now` | trigger `after_time_delay` / `on_page_scroll` / `not_logged_in`, tần suất qua `localStorage` key `wk2:popup:<id>` | — |
| `PopupEvent` | `events/popup/index.js` | event `popup` | singleton | `openPopup({id})`, `closePopup`, Esc đóng hết | — |
| `NavigationEvent` | `events/navigation.js` | event `go_to_url` | singleton | `goToUrl({url,newTab})` | — |

Ghi chú:
- **Popup dùng `x:now`** (không phải `x:init`) vì popup ẩn thì không bao giờ "vào viewport" — cần mount ngay để hẹn giờ/scroll.
- Popup `not_logged_in` đọc `window.xCustomer` (`popup.js:20-23`) — **server hiện không set biến này** → luôn coi là chưa đăng nhập.
- `services/i18n.js` đọc `window.xi18n` để ghi đè bản dịch — **server hiện không set**.

### 7.1 ListDataset phân trang — vòng khép kín client ↔ server

```
Click số trang (on:click → ListDataset#goSlot)
 └─ fetchPage(n)                                         nodes/list-dataset.js:113-146
     ├─ setSkeleton(grid)                                ô xám cao bằng item cũ (mặc định 332px)
     ├─ POST /view/list_dataset_page                     api/dataset.js → api/client.js
     │     {site_id: <html x:id>, page_id: <html x:page>, node_id, page, lang}
     │   Server: RenderController.list_dataset_page      render_controller.ex:34-45
     │     └─ Renders.render_list_dataset_page           renders.ex:53-78
     │          ├─ SkeletonCache → artifact["dynamic_nodes"][node_id]
     │          ├─ fetch entity trang n
     │          └─ ListDatasetHTML.page_items(node, entities) → {html, total, page, limit, seed}
     ├─ WK2.seed(data.seed)                              gộp seed sản phẩm mới
     ├─ grid.innerHTML = html  (hoặc insertAdjacentHTML khi load more)
     └─ WK2.mount(grid)                                  mount island con trong item mới
```

Cửa sổ số trang `slots` (`list-dataset.js:41-48`) cố ý dùng **cùng thuật toán** với `QwikV2.Nodes.ListDataset.HTML.page_slots/2` (7 ô cố định, `0` = ô ẩn) để directive khớp markup SSR — đổi một bên phải đổi bên kia.

`api/client.js`: gửi `Authorization: Bearer <cookie _secure_jwt>` nếu có, timeout 15s, luôn trả object `{status, success, ...body}` — không throw.

---

## 8. Build, versioning và deploy

### 8.1 Base path — `lib/qwik_v2/runtime.ex`

```elixir
24  def base_path do
25    case Application.get_env(:builderx_api, :qwik_v2_asset_base) do
26      nil ->
27        case current_version() do
28          nil -> @unversioned_base          # "/render_v2/"
29          version -> base_for(version)       # https://<minio>/<bucket>/js/editor_v2/<version>/
32      base -> base                           # dev: http://localhost:39990/render_v2/
```

```elixir
7   def current_version do
8     case :persistent_term.get(@cache_key, nil) do
9       nil ->
10        case fetch_current() do
11          nil -> nil
14          version -> :persistent_term.put(@cache_key, version); version
```
- `fetch_current/0` (`:51-62`): GET `https://<minio>/<bucket>/js/editor_v2/current.json` (timeout 5s) → `{"current": "<version>"}`.
- Kết quả cache trong `:persistent_term` **suốt đời node BEAM**.

> ⚠️ `Runtime.reload/0` (`:41-44`) **không có nơi nào gọi**. Sau khi upload JS mới, server đang chạy vẫn dùng version cũ cho publish mới **cho tới khi restart**. Ngược lại, nếu `current.json` không tải được, `nil` **không** được cache → mỗi lần gọi (mỗi publish, mỗi preview) lại thử HTTP 5s và rơi về `/render_v2/`.

> Fallback `/render_v2/` phục vụ từ `priv/static/render_v2/` (`endpoint.ex:95-102`, `only: ~w(... render_v2 ...)`). Thư mục này **không nằm trong git** và vite build **không** xuất vào đó (xuất ra thư mục tạm, §8.2). Trên máy dev hiện có một bản build cũ (`Events.js`, `Price.js`, `Promo.js`… — tên không còn khớp config hiện tại). Không nên trông vào fallback này ở production.

### 8.2 Quy trình deploy JS

```
① cd assets && npm run deploy:render_v2
     = vite build -c vite.render_v2.config.mjs
     → xuất ra $TMPDIR/builderx_render_v2_build/   (RENDER_V2_OUT ghi đè; config :82)
        Loader.js, Tab.js, ..., PopupEvent.js, chunk.<name>.js, manifest.json
        (entryFileNames '[name].js' — KHÔNG có hash trong tên; :107)

② mix qwik_v2.upload_assets                         lib/mix/tasks/qwik_v2_upload_assets.ex
     ├─ đọc mọi *.js trong build dir (sort theo tên)                      :58-73
     ├─ version = get_hash(nội dung mọi file)  → 9 ký tự hex             :16
     ├─ upload js/editor_v2/<version>/<file>    cache immutable 1 năm     :18-25
     ├─ upload js/editor_v2/<version>/manifest.json                       :29-40
     ├─ upload js/editor_v2/current.json = {"current": version}  no-cache :42-49
     └─ xóa build dir                                                     :51

③ (restart server để Runtime nhận version mới — xem cảnh báo §8.1)

④ Publish mới: Published.publish_page
     ├─ Compile.compile → scripts = Scripts.tags(...) với base = .../<version>/   (ghim vào source)
     └─ js_version = Runtime.current_version()                              published.ex:62

⑤ (tuỳ chọn) mix qwik_v2.repin_assets [--site ID] [--to VERSION]
     → chuyển trang ĐÃ publish sang version mới mà không cần publish lại
```

Vì sao **version theo hash nội dung** mà tên file bên trong không hash? Cả thư mục `<version>/` là bất biến; `import` tương đối giữa các chunk (`./chunk.define.js`) luôn trỏ đúng cùng phiên bản. Trang cũ ghim version cũ tiếp tục chạy dù version mới đã deploy.

> Comment ở `upload_assets.ex:27` nói manifest là "module → [chunk...]" nhưng plugin build (`vite.render_v2.config.mjs:62-66`) thực tế sinh `module → "file.js"` (một chuỗi) và loader đọc đúng dạng chuỗi. Comment lỗi thời.

### 8.3 `mix qwik_v2.repin_assets` — `lib/mix/tasks/qwik_v2_repin_assets.ex`

```elixir
10  @prefix_re ~r<(?:https?://[^"' ]+/js/editor_v2/[0-9a-f]{9}/|/render_v2/(?:[0-9a-f]{9}/)?)>
18    target = opts[:to] || QwikV2.Runtime.current_version()
26    base = if opts[:to], do: QwikV2.Runtime.base_for(target), else: QwikV2.Runtime.base_path()
27    site_ids = if opts[:site], do: [opts[:site]], else: list_site_ids(target)
```
- Chọn các `published_pages` có `version == 2` và `js_version` khác `target` (`:33-48`).
- `repin_page/3` (`:50-72`): decode `source`, **regex thay** mọi tiền tố URL JS cũ (Minio có version hoặc `/render_v2/`) trong `source["scripts"]` bằng `base` mới, ghi lại `js_version`, **invalidate `SkeletonCache`** của trang.
- Trang publish trước khi có trường `scripts` → bỏ qua kèm log.
- Dùng để: rollback (`--to <version cũ>`), hoặc đẩy bản vá JS cho mọi trang.

---

## 9. Chế độ dev: Vite + HMR

### 9.1 Cấu hình

`config/dev.exs`:

```elixir
53-61  watchers: node vite -c vite.render_v2.config.mjs, cd assets, env RENDER_V2_ORIGIN=http://localhost:39990
94     live_reload pattern ~r"priv/static/(?!render_v2/).*..."   # không live-reload khi render_v2 đổi
141    config :builderx_api, :qwik_v2_asset_base, "http://localhost:39990/render_v2/"
143    config :builderx_api, :qwik_v2_vite_dev, true
145    config :builderx_api, :render_v2_draft_in_dev, true
```

- `mix phx.server` tự bật Vite dev server (port **3999** trong container, map ra host **39990** — theo comment `:53-54`; `RENDER_V2_PORT` đổi port, `vite.render_v2.config.mjs:83`).
- `qwik_v2_asset_base` → `Runtime.base_path` trả thẳng URL Vite, bỏ qua Minio.
- `qwik_v2_vite_dev` → `Scripts.tags` nạp `core/loader.js` (source), `@vite/client`, `dev/hmr.js`.
- `render_v2_draft_in_dev` → `serve_published` render **bản draft** thay vì bản đã publish (`render_controller.ex:168-175`): sửa trong editor, F5 là thấy, không cần publish.
- Có thể chạy tay: `npm run serve:render_v2` (`assets/package.json`).

### 9.2 HMR JS (sửa file `assets/render_v2/**`)

- Plugin `wk2-hmr-accept` (`vite.render_v2.config.mjs:70-80`) tự chèn `import.meta.hot.accept()` vào mọi entry → file module được nạp lại, gọi `WK2.register` lần nữa → loader (nhánh DEV, §4.3) hủy instance cũ, tạo mới, khôi phục state qua `serialize/hydrate`.
- Plugin `wk2-manifest` (`:43-68`) phục vụ `/render_v2/manifest.json` động và xóa cache entry khi thêm/xóa file trong `nodes/`, `events/`.

### 9.3 HMR server-side (sửa file `.ex`)

```
File lib/**/qwik_v2/**.ex hoặc **/editor_v2/**.ex đổi
 └─ FileSystem (phoenix_live_reload monitor)
     └─ BuilderxApiWeb.HmrSocket.handle_info  {:file_event}          hmr_socket.ex:20-26
         └─ push "changed" qua WS /wk2/hmr/websocket                 endpoint.ex:108 (chỉ khi code_reloading?)
             └─ dev/hmr.js: ws.onmessage "changed" → debounce 60ms   hmr.js:103-115
                 └─ fetch(location.href) → DOMParser
                     ├─ thay nội dung các <style> trong <head> theo thứ tự   hmr.js:51-55
                     ├─ morph [data-node-type="root"] cũ ← mới              hmr.js:9-40
                     │    (khớp con theo id, giữ node cũ, sửa attr, chèn/xóa)
                     └─ WK2.mount(document.body)                            hmr.js:59-63
```
- Response lỗi → thử lại tối đa 3 lần cách 250ms (`:42-43`, `:79-96`); không phải HTML → bỏ qua; trang hiện tại không có root → `location.reload()`.
- Phoenix `code_reloader` biên dịch lại module khi request `fetch(location.href)` đến, nên HTML mới phản ánh code mới.
- `morph` so style **theo index** — thêm/bớt thẻ `<style>` giữa chừng có thể lệch; khi đó F5.

---

## 10. Code chưa dùng / chưa nối (tổng hợp)

| Hạng mục | Tình trạng |
|---|---|
| `CartEvent` (`open_cart`, `go_to_checkout`) | Server sinh handler, **không có** file JS |
| `NavigationEvent#openPage` (`open_page`) | Server sinh handler, `navigation.js` **không có** method |
| `stores/cart.js`, `api/cart.js`, `api/product.js`, `api/order.js`, `api/customer.js`, `api/upload.js` | Không module nào import — khung chờ tính năng giỏ hàng/đơn |
| `Registry @data` / `XData` | Rỗng → `<script type="x/json">` không bao giờ được in |
| `window.xmodules`, `window.xCustomer`, `window.xi18n` | Runtime đọc nhưng server không set |
| `Runtime.reload/0` | Không nơi nào gọi |
| `xevents` không tính `on:click` cứng trong markup | Xem cảnh báo §4.9 |

---

## 11. Thêm một island mới (checklist)

1. **Server** — trong `lib/qwik_v2/nodes/<type>/html.ex`, thêm vào attrs của phần tử host:
   `Common.x_init("MyWidget") <> Common.x_props(%{...})` (hoặc `x_now` nếu phải chạy ngay khi ẩn).
   Viết directive trong markup: `x:text="label"`, `x:class='{"is-open":"open"}'`, `on:click='[{"call":"MyWidget#toggle"}]'`.
2. **Client** — tạo `assets/render_v2/nodes/my-widget.js`:
   ```js
   import { defineModule } from '../core/define'
   const MyWidget = defineModule({
     data() { return { open: this.$el.classList.contains('is-open') } },   // đọc state từ DOM SSR
     methods: { toggle() { this.open = !this.open } },
   })
   window.WK2.register('MyWidget', MyWidget)
   ```
   Tên file `my-widget.js` → entry `MyWidget` — phải trùng chuỗi ở bước 1.
3. Cần dữ liệu sản phẩm → server `Seed.put("product", p)` + `Common.x_ref("product", p)`; client `this.store = seedFromProps(this.props)` trong `setup`.
4. Dev: không cần làm gì thêm (manifest động). Prod: `npm run deploy:render_v2` → `mix qwik_v2.upload_assets` → restart → publish lại (hoặc `repin_assets`).
5. Nếu island dùng `on:click` mà trang có thể không có event click nào từ người dùng — lưu ý §4.9.

---

## 12. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Không có island nào chạy, console sạch | Trang có thẻ `<script type="module" src=".../Loader.js">`? (`Scripts.tags` trả `""` khi không có runtime). Với trang publish, xem `source["scripts"]` trong `published_pages` |
| Console `[wk2] load X lỗi` | File `X.js` không có trong version đang ghim: tên `x:init` sai, file chưa build/upload, hoặc action không có JS (`CartEvent`) |
| 404 `manifest.json` / `Loader.js` | `window.xbase` trỏ đâu? `current.json` trên Minio có đúng version? Trang ghim version đã bị xoá? → `repin_assets` |
| Deploy JS mới nhưng trang vẫn chạy JS cũ | Trang ghim version lúc publish → publish lại hoặc `mix qwik_v2.repin_assets`. Publish mới vẫn cũ → server chưa restart (`Runtime` cache `persistent_term`) |
| Bấm tab/accordion/phân trang không phản hồi | `window.xevents` có `"click"` không (§4.9)? Phần tử bấm có nằm trong host `x:init` đúng tên? Có `<a href>` bọc bên trong không (loader nhường cho link)? |
| Island mount nhưng DOM không cập nhật | Biểu thức directive chỉ hỗ trợ đường dẫn chấm (§5.2). Directive có nằm trong island lồng khác không (`isNestedIsland` chặn)? |
| Giá không đổi khi chọn biến thể | `x:props` có `ref` không (`x_ref` nhận `product` nil → không có props)? `window.xSeed.product[id]` có dữ liệu? `fields` của biến thể có `name/value` khớp `data-attr-name`/`data-value`? |
| Phân trang list-dataset trả rỗng | Response `/view/list_dataset_page` — `list_dataset_page_not_found` khi trang chưa publish, node không phải `list-dataset`, hoặc `Source.paged?` false. `<html x:id/x:page>` có đúng? |
| Item mới sau phân trang không tương tác | `WK2.mount(grid)` có chạy (lỗi JS trước đó)? Seed mới có trong response? |
| Popup "khách chưa đăng nhập" luôn hiện | `window.xCustomer` chưa được server set |
| Popup không hiện lại | `localStorage['wk2:popup:<id>']` đã đạt tần suất; xoá key để test |
| Dev: sửa `.ex` không tự cập nhật trang | WS `/wk2/hmr/websocket` có kết nối (console `[wk2:hmr] on (ws)`)? File có nằm dưới `/qwik_v2/` hoặc `/editor_v2/`? |
| Dev: trang không tải JS | Vite có chạy ở `localhost:39990`? (`watchers` trong `config/dev.exs`) |
| Dev: sửa editor mà trang public không đổi | Đúng ý — trừ khi `render_v2_draft_in_dev` = true (mặc định dev là true) |
