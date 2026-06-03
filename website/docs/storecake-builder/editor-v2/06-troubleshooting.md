---
sidebar_position: 7
title: 06 — Troubleshooting
---

# 06 — Troubleshooting

Lỗi thường gặp, cách debug, checklist khi sửa code.

## 1. Lỗi build / runtime phổ biến

### `Cannot access 'useNodeStore' before initialization`

**Trigger:** Khi vào editor, console hiện ReferenceError ở `mixins/nodeBase.js`.

**Nguyên nhân:** Import cycle TDZ. Chain:
```
store.js → registry.js → (eager-import nodes/) → mixins → store.js
```

**Fix:** `registry.js` KHÔNG được eager-import elements. Phần `import.meta.glob({ eager: true })` phải nằm trong `registerElements.js`, chỉ load từ `PageWrapper`.

**Check nhanh:**
```bash
grep "import.meta.glob" src/composable/editor_v2/registry.js
# Phải không có. Nếu có → dời sang registerElements.js
```

### `[unknown: xxx]` thay vì render element

**Trigger:** Canvas hiện text `[unknown: heading]` (hoặc type khác).

**Nguyên nhân:** Type không match meta nào trong registry.

**Check:**
```js
import('@/composable/editor_v2/registry').then(r => console.log(r.registry))
// Xem có key 'heading' không?
```

Các trường hợp:
- Folder `nodes/<name>/index.vue` không tồn tại / sai cấu trúc
- Quên `export const meta = {...}` trong `index.vue` (chỉ export trong `meta.js` không đủ — `index.vue` PHẢI re-spread)
- `meta.type` không khớp `node.data.type`
- `registerElements.js` chưa được import từ PageWrapper → registry rỗng

**Fix:**
```bash
ls src/components/editor_v2/nodes/                            # folder tồn tại?
ls src/components/editor_v2/nodes/<name>/                     # có index.vue + meta.js?
grep "export const meta" src/components/editor_v2/nodes/<name>/index.vue   # re-export?
grep "registerElements" src/components/editor_v2/PageWrapper.vue           # bootstrap?
```

### Drag không kéo được từ sidebar

**Trigger:** Sidebar item không drag được hoặc drag không tạo element.

**Check thứ tự:**
1. `display: contents` hay `display: block` trên `.element-drag-v2`? Phải `block`. `contents` xoá box → HTML5 drag không nhận.
2. `dragstart` có fire? Console log trong `_onDragStart`.
3. `tree` factory có return valid NodeTree (`{ rootNodeId, nodes }`)?
4. `dndStore.startCreate` có chạy? Set breakpoint.
5. Cursor có vào `.wk-editor-body`? Nếu không → `endDrag` skip apply do `dropInsideCanvas = false`.

### Drag child chọn parent

**Trigger:** Drag Heading → ElementToolbar hiện trên Block.

**Nguyên nhân:** `@dragstart` bubble lên Block, handler Block chạy sau và override.

**Fix:** `e.stopPropagation()` đầu `onMoveDragStart` — đã có sẵn trong `draggableNode` mixin. Nếu element override riêng phải tự stop.

### Indicator vạch xanh không hiện khi drag

**Check:**
1. `dndStore.positioner` có khác null trong khi drag?
2. `positioner.computeIndicator` có return value (non-undefined)?
3. `nodeStore.events.indicator` có được set?
4. `IndicatorOverlay.show` computed có return true?
   - Ẩn nếu target container EMPTY (placeholder đã đủ)

### Padding strip chỉ hiện 1 cạnh

**Nguyên nhân:** `EdgeOverlays.updateRect` thiếu `right` và `bottom`.

**Fix:**
```js
this.rect = {
  top: r.top, left: r.left, width: r.width, height: r.height,
  right: r.left + r.width,
  bottom: r.top + r.height,
}
```

### Drag flex-section nhảy vào trong flex-block

**Trigger:** Đang move 1 Section, hover qua Block → indicator trỏ vào Block.

**Nguyên nhân:** `Positioner.isDraggingRootOnly()` không nhận diện đúng. Check `meta.rules.isRootOnly: true` cho Section.

**Fix:**
```js
import('@/composable/editor_v2/registry').then(r =>
  console.log(r.isRootOnlyType('flex-section'))  // phải true
)
```

### Element không xuất hiện sau khi tạo folder

**Trigger:** Tạo `nodes/my_element/` + `index.vue` + `meta.js`, HMR reload, nhưng element không hiện.

**Nguyên nhân:**
1. Glob pattern `'@/components/editor_v2/nodes/*/index.vue'` không match — file không ở đúng vị trí
2. Quên `export const meta = {...}` trong `index.vue` (chỉ export trong `meta.js` không đủ)
3. `meta.type` chưa đăng ký hoặc trùng type khác
4. `index.vue` import từ `meta.js` thất bại (vd vô tình import component vào meta.js gây TDZ)
5. `meta.js` import `@/` alias → CI/test scripts `node` thuần không hiểu — phải dùng relative `../../components/...`

**Fix:**
```bash
ls -R src/components/editor_v2/nodes/my_element/
grep "export const meta" src/components/editor_v2/nodes/my_element/index.vue
grep "from '@/" src/components/editor_v2/nodes/my_element/meta.js   # phải KHÔNG có (CI broke)
```

### Store warn "unknown key dropped"

**Trigger:** Console hiện `[editor_v2] heading.style: unknown key 'fontSizeX' (not declared in traits) — dropped`.

**Nguyên nhân:** Key không nằm trong `meta.traits` của element. `allowedKeys` guard reject.

**Fix:**
1. Verify `meta.traits` có chứa key qua `def.writes`
2. Nếu dùng definition ref, check `DEFINITIONS_DATA[refKey]` writes có cover writeKey
3. Nếu legacy inline-spec, ensure `attr.key` + `attr.target` match patch ghi vào

### CI: "invalid JSON Schema"

**Trigger:** `npm run validate:schemas` fail với error "Schema validation failed at element X, attribute Y"

**Fix:**
```bash
npm run validate:schemas -- --debug
grep "export const DEFINITIONS_DATA" src/components/editor_v2/components/trait/fields/defs/
grep "key: 'width_select'" src/components/editor_v2/nodes/flex_block/meta.js
```

### Drop ngoài canvas vẫn tạo element

**Nguyên nhân:** `endDrag` không guard `dropInsideCanvas`.

**Verify:**
```bash
grep -A 5 "dropInsideCanvas" src/stores/editor_v2/dnd.js
```

### Toolbar không follow theo scroll/resize

**Nguyên nhân:** `ElementToolbar` rAF loop bị cancel sớm hoặc không start.

**Check:** Console `this._raf` value khi selected → phải là number.

**Fix:** Đảm bảo `mounted` start `_updatePosition`, `beforeUnmount` cancel.

### Stateful CSS không apply khi đổi variant

**Trigger:** User chọn variant "Hover" trong toolbar + edit `bg_color`, nhưng `:hover` rule không xuất hiện.

**Check:**
1. `meta.states.variants` có chứa entry `{ value: 'hover', selector: ':hover' }`?
2. `meta.states.groups` có cover trait đang edit? (Nếu groups = `['shape']` mà edit `bg_color` thuộc 'background', writeKey không qua `statefulKeys` → ghi flat)
3. `useNodeStore().events.state === 'hover'`?
4. Component template có `<component :is="'style'" v-if="stateCss">{{ stateCss }}</component>`?
5. Element mixin có include `statefulNode`?

**Fix:**
```js
// Verify statefulKeys
import('@/composable/editor_v2/registry').then(r => {
  const def = r.getDef('button')
  console.log('statefulKeys:', def.statefulKeys)         // Set chứa 'background', '--text-color', …
  console.log('states:', def.states)
})

// Verify routing
useNodeStore().setState('hover')
useNodeStore().changeStyle('btn-id', { background: '#0d6efd' }, { stateful: true })
// → nodes['btn-id'].data.config.hover.background phải = '#0d6efd'
```

### Satellite không xuất hiện sau khi drag Tab

**Trigger:** Drop Tab vào canvas → tab-content satellite không render.

**Nguyên nhân:**
1. Owner template thiếu `<NodeRenderer v-if="satelliteId" :node-id="satelliteId" />`
2. Mixin `satelliteOwner` không include
3. `meta.satellite = { type, configKey }` thiếu hoặc sai
4. `factoryFor(satellite.type)` return null (satellite type chưa register)

**Fix:**
```js
// Verify owner has satellite meta
import('@/composable/editor_v2/registry').then(r => {
  console.log(r.getDef('tab').satellite)            // { type: 'tab-item', configKey: 'tabItemId' }
  console.log(r.getDef('tab-item'))                  // phải có def
})

// Manually verify ensureSatellite
const owner = useNodeStore().nodes['tab-id']
console.log('satelliteId:', owner.data.config.tabItemId)
console.log('satellite node:', useNodeStore().nodes[owner.data.config.tabItemId])
```

### Event action không fire

**Trigger:** Click button có event `goToUrl` nhưng không navigate.

**Check:**
1. `node.data.events` có entry với `name: 'click'` + `action: 'goToUrl'`?
2. Event editor không hỏng — verify qua `validateEvents(node.data.events, 'events', def.events, { strict: true })`
3. `events/engine.js` runtime dispatcher có gắn vào click handler trong template?

```js
// Trong button/index.vue, click handler gọi engine.runEvent(node, 'click', e)
```

## 2. Static cycle check script

```bash
node -e "
const fs = require('fs');
const path = require('path');
const { parse } = require('@vue/compiler-sfc');
const graph = {};
function importsOf(file) {
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, 'utf8');
  let code = src;
  if (file.endsWith('.vue')) {
    const { descriptor } = parse(src, { filename: file });
    code = (descriptor.script && descriptor.script.content) || '';
  }
  const out = [];
  const re = /import[\s\S]*?from ['\"]([^'\"]+)['\"]/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1]);
  const re2 = /import ['\"]([^'\"]+)['\"]/g;
  while ((m = re2.exec(code))) out.push(m[1]);
  return out;
}
function resolve(spec, fromFile) {
  if (spec.startsWith('@/')) spec = spec.replace('@/', 'src/');
  if (spec.startsWith('./') || spec.startsWith('../')) spec = path.join(path.dirname(fromFile), spec);
  if (!spec.startsWith('src/')) return null;
  for (const ext of ['', '.js', '.vue', '/index.js', '/index.vue']) {
    const p = spec + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
function walk(file, seen = new Set()) {
  if (seen.has(file)) return;
  seen.add(file);
  graph[file] = [];
  for (const spec of importsOf(file)) {
    const r = resolve(spec, file);
    if (r) { graph[file].push(r); walk(r, seen); }
  }
}
walk('src/stores/editor_v2/node.js');
function findCycle(start, target, path = [], seen = new Set()) {
  if (seen.has(start)) return null;
  seen.add(start);
  for (const dep of (graph[start] || [])) {
    if (dep.includes(target)) return [...path, start, dep];
    const r = findCycle(dep, target, [...path, start], seen);
    if (r) return r;
  }
  return null;
}
console.log('store→nodeBase cycle:', findCycle('src/stores/editor_v2/node.js', 'mixins/nodeBase') || 'NONE');
console.log('store→nodes/* cycle:',  findCycle('src/stores/editor_v2/node.js', 'nodes/') || 'NONE');
console.log('registry.js deps:', graph['src/composable/editor_v2/registry.js'] || []);
"
```

Expected output:
```
store→nodeBase cycle: NONE
store→nodes/* cycle: NONE
registry.js deps: [<small set of pure data deps>]
```

## 3. SFC compile check

```bash
node -e "
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const fs = require('fs');
const files = process.argv.slice(1);
let bad = 0;
for (const f of files) {
  const { descriptor, errors: pErr } = parse(fs.readFileSync(f, 'utf8'), { filename: f });
  if (pErr.length) { bad++; console.log('PARSE-FAIL', f, pErr); continue; }
  try {
    if (descriptor.script) compileScript(descriptor, { id: f });
    if (descriptor.template) {
      const t = compileTemplate({ source: descriptor.template.content, filename: f, id: f });
      if (t.errors.length) { bad++; console.log('TEMPLATE-FAIL', f, t.errors); continue; }
    }
    console.log('OK', f);
  } catch (e) { bad++; console.log('COMPILE-FAIL', f, e.message); }
}
process.exit(bad ? 1 : 0);
" -- src/components/editor_v2/nodes/*/index.vue
```

## 4. DevTools tricks

### Inspect store live

```js
// Trong Vue DevTools Pinia tab — store IDs:
//   editor_v2_node, editor_v2_dnd, ui, editor_v2_history,
//   editor_v2_page, editor_v2_page_list, editor_v2_global_styling

// Hoặc tự expose qua window từ PageWrapper:
window.__editor_node_store    = useNodeStore()
window.__editor_dnd_store     = useDndStore()
window.__editor_history_store = useHistoryStore()
```

### Tìm node theo type

```js
Object.values(__editor_node_store.nodes).filter(n => n.data.type === 'flex-block')
```

### Inspect satellite chain

```js
const tabs = Object.values(__editor_node_store.nodes).filter(n => n.data.type === 'tab')
tabs.forEach(t => {
  const satId = t.data.config?.tabItemId
  console.log(t.id, '→ satellite:', satId, __editor_node_store.nodes[satId])
})
```

### Inspect history

```js
__editor_history_store.timeline                 // entries
__editor_history_store.pointer                  // current
__editor_history_store.canUndo
__editor_history_store.nextUndoLabel
__editor_history_store.undo()
```

### Inspect Positioner

```js
// Khi đang drag:
__editor_dnd_store.positioner.currentIndicator
__editor_dnd_store.positioner.currentTargetChildDimensions
```

## 5. Checklist khi thêm element

- [ ] Folder `nodes/<snake_case>/` đúng tên
- [ ] `meta.js` Vue-free + relative imports (no `@/`)
- [ ] `index.vue` re-export `export const meta = { ...baseMeta, factory, icon? }`
- [ ] Template root: `ref="root"` + `v-bind="nodeAttrs"` + `v-on="{...nodeListenersBase, ...dragListeners}"`
- [ ] Container: thêm `dragover: onDragOver, dragenter: onDragEnter` + `<NodeRenderer v-for>`
- [ ] Stateful: thêm `<component :is="'style'" v-if="stateCss">` + mixin `statefulNode`
- [ ] Satellite owner: thêm `<NodeRenderer v-if="satelliteId" :node-id="satelliteId" />` + mixin `satelliteOwner`
- [ ] `meta.type` kebab-case, unique
- [ ] `meta.factory` call `createNode(...)` không trực tiếp object literal
- [ ] `meta.traits` chỉ ref `DEFINITIONS_DATA` (hoặc inline-spec đúng shape)
- [ ] Style scoped chỉ structural CSS
- [ ] Test: drag từ sidebar → outline → trait edit → undo

## 6. Checklist khi sửa store action

- [ ] Mutate qua `_commit(label, mutateFn, opts)` chứ KHÔNG direct `this.nodes[id].x = y`
- [ ] Mảng dùng `rec.insert/remove` (= splice), không index assignment
- [ ] DOM refs `markRaw` (`setDOM` đã làm)
- [ ] Cycle / self-parent guard với `move`, `addNodeTree`
- [ ] Sau khi action xong, indicator/dragged event được clear nếu liên quan
- [ ] Update giá trị qua `changeStyle/changeConfig/changeSpecials`, không direct mutate
- [ ] Reset events khi appropriate (xoá node selected → remove khỏi selection)
- [ ] Satellite cascade: `remove` của owner cũng xoá satellite (qua `getDescendants` + sweep)
- [ ] Stateful write check `opts.stateful` + `_routeState`

## 7. Checklist khi sửa Positioner

- [ ] `cleanup()` được gọi mỗi `endDrag`
- [ ] Window event listener (`scroll`, `dragover`) cleanup đúng
- [ ] `isDiff()` so sánh đủ 3 trường: parent.id, index, where
- [ ] `getCanvasAncestor` không infinite loop (parent chain hữu hạn)
- [ ] `isNearBorders` axis-aware (đọc `inFlow` từ getDOMInfo)
- [ ] Root-only type force ROOT target (không nest vào container khác)
- [ ] `isDroppable` được hỏi và surface error vào indicator
- [ ] Locked type (rule.locked) → từ chối drag riêng

## 8. Checklist khi thêm trait field type

- [ ] Định nghĩa vào `components/trait/fields/defs/<group>.js` với `writes: { [writeKey]: { target, schema } }`
- [ ] Build widget Vue trong `components/trait/components/fields/XxxTrait.vue`
- [ ] Register vào `components/trait/fields/registry.js#VUE_COMPONENTS`
- [ ] Nếu CSS phức hợp → thêm renderer vào `styleRenderers.js`
- [ ] (Optional) Schema enum thêm description cho từng value (AI gen friendly)
- [ ] Test trong element meta `attributes: ['my_new_def']`

## 9. Checklist khi thêm event action

- [ ] Tạo file `components/trait/fields/events/actions/<name>.js` với handler runtime
- [ ] Thêm action vào `eventDefinitions.js` `EVENTS_AI` (LLM enum)
- [ ] Cập nhật `validateEvents` nếu có constraint mới
- [ ] Tạo Vue editor `components/trait/components/fields/events/<Name>Event.vue` cho payload
- [ ] Register vào `events/index.js` map

## 10. Khi nào cần restart dev server

Vite HMR xử lý:
- ✅ Sửa template SFC
- ✅ Sửa `<script>` body
- ✅ Sửa CSS
- ✅ Thêm/xoá element trong `nodes/` (glob re-evaluate khi page reload)

Cần full reload (Cmd-R):
- ⚠️ Sửa import path
- ⚠️ Đổi export name (`meta` → `definition`)
- ⚠️ Sửa mixin (Vue Options merge issue khi HMR)
- ⚠️ Thêm action vào `eventDefinitions.js` (registry cache)

Cần restart dev server:
- ❌ Sửa `vite.config.js`, `tsconfig.json`
- ❌ Sửa file trong `node_modules`
- ❌ Sửa `server.js` (express)

## 11. Trace 1 lỗi end-to-end (case study)

**Báo:** "Click element không chọn được"

Trace:
1. Console có warn / error? → Nếu TDZ → xem mục 1
2. Mở Pinia DevTools (store `editor_v2_node`) → `events.selected` có thay đổi khi click?
   - Có → lỗi ở rendering: outline CSS không apply
     - Check `.wk-node-selected` rule trong `assets/editor_v2/node.css`
     - Check `:class` binding template (đúng key `nodeClassMap`?)
   - Không → lỗi ở handler
3. Click handler có fire? Console.log trong `onClick` mixin
   - Không fire → `@click.stop` bị parent intercept hoặc `pointer-events: none`
   - Fire → `setSelected` nhưng store không update?
4. Store actions có ESM live binding đúng? `useNodeStore()` return store đúng instance?

Process tương tự cho mọi loại lỗi: từ user-facing symptom → check Pinia DevTools state → trace ngược về handler/action.

## 12. Khi nào nên hỏi / ask đồng nghiệp

- Cycle import phức tạp >3 file
- Positioner indicator sai vị trí với layout đặc biệt (grid 2D, sticky, transform parent)
- Reactivity không trigger sau khi mutate store
- Performance: re-render quá nhiều với cây > 200 nodes
- AI gen schema không match LLM output sau Phase 1

Trước khi hỏi: chạy cycle check script (mục 2), capture exact reproduce steps, screenshot DevTools state.
