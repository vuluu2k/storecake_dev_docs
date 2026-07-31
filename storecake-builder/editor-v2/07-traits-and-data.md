# 07 — Trait panel & Responsive

Chương này bám theo **một cú click** trong panel bên phải, từ lúc panel được vẽ ra cho tới lúc giá trị nằm đúng chỗ trong `node.data`.

---

## 1. Panel được vẽ ra như thế nào

`Trait.vue` **không biết gì về element cụ thể**. Nó chỉ làm 4 việc:

```
① selectedNode  = nodes[events.selected[0]]
② meta          = getDef(selectedNode.data.type)
③ activeGroups  = lọc meta.traits[activeTab]   ('general' | 'advanced')
④ với mỗi group → <TraitWrapper> ; với mỗi attribute → <TraitField>
```

### 1.1 Bộ lọc `activeGroups` — 5 bước, đúng thứ tự

```js
let list = traits[activeTab]

// ① Nếu element KHÔNG khai ô State thì gỡ cờ stateful/keepInState khỏi mọi group
list = this.currentGroups(list)

// ② Element có variants nhưng chưa khai ô State → tự chèn ô State lên đầu
if (stateVariants.length && !list.some(g => g.state))
  list = [{ key: '__state__', state: true }, ...list]

// ③ Element không có variant → bỏ ô State đi
list = list.filter(g => !g.state || stateVariants.length > 0)

// ④ Predicate visible(node, nodes) của từng group
list = list.filter(g => this.isGroupVisible(g))

// ⑤ Đang ở state khác base → chỉ giữ ô State + group stateful/keepInState
return inOverrideState ? list.filter(g => g.state || g.stateful || g.keepInState) : list
```

Bước ⑤ chính là lý do khi bấm tab "Hover" thì panel co lại chỉ còn vài nhóm.

### 1.2 Ba tính năng UI của một group

**Ẩn/hiện theo ngữ cảnh** — `visible(node, nodes)`:

```js
{
  key: 'product', label: 'Product',
  visible: (node) => isVisibleByKind(node, ['product::product_general'])
                  && isVisibleByListDataset(node),
  attributes: [ … ],
}
```

Các predicate dùng chung nằm ở `utils/editor_v2/visible.js` ([chương 11](./11-dataset-binding.md)).

**Show more** — attribute gắn `group: 'more'` bị giấu sau nút *Show more*, có animation trượt chiều cao.

**Công tắc ở tiêu đề nhóm** — 5 group đặc biệt có `WkSwitch` ngay trên header, và nhóm tự co lại khi tắt:

| `group.key` | Đọc từ | Ghi bằng |
|---|---|---|
| `animation` | `config.animation.active` | `changeConfig({ animation: {...,active} })` |
| `icon` | `specials.iconEnabled` | `changeSpecials` |
| `more_button` | `specials.moreButtonEnabled` | `changeSpecials` |
| `variant_label` | `config.variantLabel.active` | `changeConfig` |
| `variant_image` | `config.variantImage.active` | `changeConfig` |

---

## 2. Từ attribute đến widget

```
attribute            'font_size'  hoặc  { key: 'font_size', group: 'more' }
   ↓ getComponentDefinition(attribute)
COMPONENT_DEFINITIONS[key]   = { ...DEFINITIONS_DATA[key], component: VUE_COMPONENTS[key] }
   ↓
<FontSizeTrait :attribute :node="renderNode" :node-id :disabled @change="onChange" />
```

Ba mảnh ghép, ba file:

| Mảnh | File | Nội dung |
|---|---|---|
| Dữ liệu | `trait/fields/defs/<nhóm>.js` | `writes` + JSON Schema — **Vue-free** |
| Widget | `trait/components/fields/<X>Trait.vue` | Giao diện (79 file) |
| Nối | `trait/fields/registry.js` | `VUE_COMPONENTS: { defKey → component }` |

Hiện có **82 định nghĩa trait** chia làm **14 nhóm domain**:

| File | Trait tiêu biểu |
|---|---|
| `size.js` | `width_select`, `height_select` |
| `layout.js` | `direction`, `gap`, `vertical`, `horizontal`, `padding`, `margin`, `padding_margin`, `content_width`, `tab_layout`, `align_self`, `product_layout`, `product_image_layout` |
| `background.js` | `bg_color`, `bg_image`, `bg_video`, `accordion_item_bg_color` |
| `shape.js` | `border`, `corner`, `shadow` + biến thể `accordion_item_*` |
| `typography.js` | `html_tag`, `text_global_style`, `text_color`, `text_style`, `font_family`, `font_size`, `text_align`, `line_height`, `text_spacing`, `text_transform`, `text_content` |
| `icon.js` | `icon`, `button_icon`, `icon_color/size/position/gap`, `accordion_icon_*` |
| `behavior.js` | `animation`, `display`, `action`, `list_items`, `marquee_settings`, `class_css`, `more_button`, `toggle_button` |
| `media.js` | `video`, `video_settings`, `map` |
| `image.js` | `image`, `image_ratio`, `image_size`, `image_position` |
| `image_comparison.js` | `image_comparison` |
| `dataset.js` | `product`, `category`, `product_collection`, `collection_list`, `price_display`, `description_display`, `quantity_setting`, `pagination`, `navigation` |
| `product_image_list.js` | `product_image_list_*` (width, item size, border, ratio, image size/position) |
| `product_image_feature.js` | `product_image_feature_hover_action`, `product_image_feature_click_action` |
| `product_variants.js` | `variant_display`, `variant_label`, `variant_option`, `variant_image`, `variant_image_size` |

### 2.1 Một định nghĩa trait trông thế nào

```js
[TRAIT.WIDTH_SELECT]: {
  writes: {
    '--node-width':        { target: TARGET.STYLE, schema: oneOfEnum({ fill, fit, fixed }) },
    '--node-width-custom': { target: TARGET.STYLE, schema: number({ … }) },
  },
},
```

`writes` là **map nhiều key** — một widget được phép ghi vào nhiều writeKey khác nhau, thậm chí khác namespace. Ví dụ `padding` ghi `style.padding` **và** `config.isPaddingLinked`.

`target` chỉ nhận `'style' | 'config' | 'specials'`.

---

## 3. Đường ghi: `TraitField.onChange`

Widget `emit('change', key, value, patch, opts)`. `TraitField` là bộ điều phối:

```js
onChange(key, value, patch, opts) {
  const writes = this.componentDefinition.writes
  if (!Object.keys(writes).includes(key)) { console.error('invalid key'); return }
  const target = writes[key].target

  // specials luôn là base-only ⇒ không bao giờ đánh dấu stateful
  const o = (this.stateCtx && target !== 'specials') ? { ...opts, stateful: true } : opts

  if (target === 'style')    store.changeStyle(id,    { [key]: value }, o)
  if (target === 'config')   store.changeConfig(id,   { [key]: value }, o)
  if (target === 'specials') store.changeSpecials(id, { [key]: value }, o)

  // Trait typography cấp node THẮNG định dạng bôi đen từng đoạn:
  // xóa inline mark, gộp chung coalesce key ⇒ vẫn là MỘT lần undo.
  if (STRIP_INLINE_KEYS.has(key) && !o?.stateful && def.rules?.isContentEditable) {
    store.stripInlineTextStyles(id, { key: `${target}:${id}`, traitKey: key, traitValue: value })
  }
}
```

Còn `visible` / `disabled` cấp **attribute** (khác với cấp group) nhận `node.data`:

```js
visible:  (data) => …    // ẩn hẳn field
disabled: (data) => …    // vẫn hiện nhưng khóa
```

---

## 4. Giá trị rơi vào breakpoint nào?

Đây là phần dễ nhầm nhất. Có **hai** cơ chế, đừng lẫn.

### 4.1 Lúc GHI — `responsivePolicy.js` quyết định slot

```js
changeStyle(id, patch, opts)
  ├─ opts.breakpoint có khai?  →  dùng đúng slot đó (resolveBreakpointSlot)
  └─ không khai → chia patch theo TỪNG KEY:
        STYLE_ASYNC.has(key)  → slot 'current'  (responsive[bpĐangXem])
        ngược lại             → slot 'base'     (data.style)
```

- `STYLE_ASYNC` — thuộc tính designer thật sự chỉnh khác nhau theo màn hình: `padding`, `margin`, `gap`, `--node-width/height(-custom)`, `--layout-direction/vertical/horizontal`, `display`, `--text-font-size`, `--text-line-height`, `--text-align`, `--text-letter-spacing`, `--text-style`, `--text-color`, `align-self`, `imageSize`, `imagePosition`, `layout`, `listItemImageSize`, `listItemImagePosition`, …
- `CONFIG_ASYNC` — phần config đổi theo màn hình: `src`, `contentWidth`, `hidden`, `textGlobalStyle`, `iconSize/Color/Position/Gap`, `imageRatio`, `quantity`, `itemsPerRow`, `layout`, các key `listNav*` và `pagination*`, …
- Không nằm trong hai `Set` trên ⇒ ghi vào **base**, dùng chung cho mọi breakpoint.

Sentinel của `resolveBreakpointSlot`:

| Giá trị | Slot |
|---|---|
| `'base'` / `null` / `undefined` | `data.style` (base) |
| `'current'` | `data.responsive[bpĐangXem]` |
| `'mobile'`, `'tablet'`, … | slot chỉ định |

> Chỉnh mà "cả 4 breakpoint cùng đổi" hoặc ngược lại "chỉ mobile đổi" — sửa hai `Set` trong `responsivePolicy.js`, không sửa store.

### 4.2 Lúc ĐỌC — `mergeNamespace` cascade hai chiều

Bốn breakpoint (giảm dần): `desktop 1920` → `laptop 1440` → `tablet 768` → `mobile 360`. Mặc định editor mở ở **laptop**.

Độ ưu tiên cho từng key:

```
1. slot của breakpoint ĐANG XEM
2. slot của breakpoint RỘNG HƠN  (cascade xuống, gần nhất thắng)
3. base
4. slot của breakpoint HẸP HƠN   (fallback lên, chỉ điền key còn thiếu)
```

Bước 4 tồn tại để một giá trị đặt ở mobile vẫn hiện ra khi bạn quay lại laptop mà chưa từng đặt ở đó — nếu không, panel sẽ trông như rỗng.

**Key không cascade** — `NON_CASCADING`:

```js
const NON_CASCADING = { config: new Set(['hidden']) }
```

`hidden` chỉ áp dụng đúng breakpoint của nó: ẩn ở desktop **không** làm ẩn ở mobile.

`specials` **không cascade** — luôn base.

---

## 5. State (hover / active)

### 5.1 Khai báo

```js
states: {
  base: 'default',
  variants: [
    { label: 'Default', value: 'default' },
    { label: 'Hover',   value: 'hover',  selector: ':hover' },
    { label: 'Active',  value: 'active', selector: '.is-active',
      visible: (node, nodes) => … },
  ],
},
```

Group nào cho phép sửa theo state thì gắn `stateful: true`; attribute nào muốn từ chối thì gắn `stateful: false`.

### 5.2 Nơi lưu

State là **namespace riêng**, không nhét trong `config`:

```
base:      data.states.hover.style / .config
theo bp:   data.responsive.mobile.states.hover.style / .config
```

### 5.3 Đường ghi — `_routeState`

```js
changeStyle(id, patch, opts)
  → patch = this._routeState(id, patch, opts, 'style')
```

`_routeState` chỉ hoạt động khi có **cả ba** điều kiện:

1. `opts.stateful === true` (do `TraitField` gắn khi có `stateCtx`),
2. node đang được chọn và `events.state` khác `states.base`,
3. writeKey nằm trong `def.statefulKeys`.

Key thỏa cả ba → chuyển sang `_writeState()` ghi vào `states[st][ns]` (vẫn tôn trọng responsive policy). Key không thỏa → trả về cho `changeStyle` ghi phẳng như thường.

### 5.4 Đường đọc — ba helper

| Helper | Trả về | Dùng ở |
|---|---|---|
| `mergeStateNs(node, state, ns, bp)` | Override của một namespace, đã cascade theo bp | nội bộ |
| `mergeStateMap(node, state, bp)` | Union phẳng style+config của state đó | `statefulNode.stateCss` — biết state này đổi những key nào |
| `mergeStateNode(node, state)` | **Node tổng hợp** với state đã gộp vào chính style/config của nó (cả base lẫn mọi slot bp) | `TraitField.renderNode` (panel đọc lại đúng giá trị state), `renderStateDecls` |

`mergeStateNode` là mẹo hay: thay vì mọi renderer phải biết về state, ta tạo ra một node "giả vờ như state đó là mặc định" rồi cho renderer chạy bình thường.

### 5.5 Đường render

```js
// statefulNode.stateCss
override = mergeStateMap(node, 'hover', bpActive)   // key nào bị đổi?
defKeys  = override.keys → map ngược về def key     // dùng renderer nào?
body     = declsToCss(renderStateDecls(node, 'hover', defKeys), /* important */ true)
css      = `[data-node-id="${nodeId}"]:hover{${body}}`
```

`!important` là bắt buộc: style base gắn inline, mà inline luôn thắng rule ngoài.

---

## 6. Guard ở tầng store

```js
const allowed = getAllowedKeys(node.data.type, ns)
if (allowed && allowed.size) {
  for (const key in patch) {
    if (!allowed.has(key)) {
      console.warn(`[editor_v2] ${type}.${ns}: unknown key '${key}' (not declared in traits) — dropped`)
      delete patch[key]
    }
  }
}
```

- `allowed === null` → type chưa đăng ký.
- `allowed.size === 0` → element không khai trait nào ⇒ **bỏ qua** kiểm tra (node hệ thống / node cũ).
- Ngược lại: key lạ bị xóa khỏi patch, kèm cảnh báo.

Muốn ghi một key mà không muốn hiện UI: khai `{ key: TRAIT.X, visible: false }` trong `traits`.

---

## 7. Reset

| Hàm | Tác dụng |
|---|---|
| `resetStyle(id, keys)` / `resetConfig` / `resetSpecials` | Ghi `undefined` cho các key, tạo entry history riêng (`throttle: false`) |
| `resetNodeToDefault(id, { configOverride })` | Xóa sạch `style/config/specials/states/responsive` về đúng `meta.defaults`, như vừa thả mới. `configOverride` cho phép giữ lại vài lựa chọn (ví dụ layout vừa chọn) |

---

## 8. Sinh JSON Schema (cho AI & CI)

`definitions.js` xuất các hàm thuần:

| Hàm | Kết quả |
|---|---|
| `buildElementSchema(meta)` | Schema `{ style, config, specials, responsive, events }`; mọi bp mirror lại đủ property của base; `default` lấy từ `meta.defaults` (default trong helper bị strip) |
| `buildStateOverrideSchema(meta)` | Schema của **một** state override — chỉ key thuộc group `stateful: true`, trừ attribute `stateful: false` |
| `applyStateSchema(schema, meta)` | Gắn thêm namespace `states` vào base và vào từng slot bp |
| `collectStatefulWriteKeys(meta)` | `Set` writeKey cho phép ghi theo state → chính là `def.statefulKeys` |
| `buildSatelliteSchema(satMeta)` | Schema rút gọn (`style` + `config` + `states`) cho field `satellite` của owner |
| `normalizeResponsiveSlot(slot)` | Chấp nhận cả `{ style, config }` lẫn dạng phẳng `{ writeKey: value }` (tự route theo `target`) |

Toàn bộ chuỗi này chạy được bằng plain Node — đó là lý do `defs/*.js` cấm import Vue.

---

## 9. Events

Khai trong `meta.events`, catalog nằm ở `eventDefinitions.js`, action ở `fields/events/actions/`:

`goToUrl` · `openPage` · `openPopup` · `openCart` · `goToCheckout`

Lưu ở `node.data.events` (base-only, không responsive). `addEvent` / `updateEvent` chạy `validateEvents(next, 'events', def.events, { strict: false })` **trước** khi ghi; sai thì `console.warn` và bỏ qua. `strict: false` nghĩa là bỏ qua kiểm tra url/id, chỉ kiểm cấu trúc — người dùng có quyền để trống trong lúc đang điền.

Runtime dispatcher: `fields/events/engine.js`. Widget UI: `fields/UrlEvent.vue` / `PageEvent.vue` / `PopupEvent.vue`.

---

## 10. Bảng debug nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Chỉnh trait không có gì xảy ra | `console.warn` "unknown key … dropped" ⇒ chưa khai trong `meta.traits` |
| Chỉnh ở mobile mà desktop cũng đổi | Key không nằm trong `STYLE_ASYNC`/`CONFIG_ASYNC` ⇒ ghi vào base |
| Chỉnh ở desktop mà mobile không đổi | Có giá trị riêng ở slot mobile đang đè lên (ưu tiên 1 thắng cascade) |
| Panel rỗng khi bấm Hover | Nhóm chưa gắn `stateful: true` hoặc `keepInState: true` |
| Sửa ở Hover mà lưu vào base | `def.statefulKeys` không chứa key đó (nhóm chứa nó chưa `stateful`) |
| Nhóm trait không hiện | Predicate `visible(node, nodes)` trả false |
| Field hiện nhưng bấm không được | Predicate `disabled(node.data)` trả true |
| Ẩn ở desktop kéo theo ẩn ở mobile | Sai — `hidden` nằm trong `NON_CASCADING`, kiểm tra lại code đang ghi thẳng vào base |
