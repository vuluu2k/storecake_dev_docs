---
sidebar_position: 7
title: 06 — Troubleshooting
---

# 06 — Troubleshooting

Lỗi thường gặp, cách debug, checklist khi sửa code.

## 1. Lỗi build / runtime phổ biến

### `Cannot access 'useNodeStore' before initialization` (hoặc tên store khác)

**Trigger:** Khi vào editor, console hiện ReferenceError ở `mixins/nodeBase.js` (hoặc nodeContainer).

**Nguyên nhân:** Import cycle TDZ. Chain:
```
store.js → registry.js → (eager-import nodes/) → mixins → store.js
```
Khi reset store, JS module chưa init xong → mixin's `mapState(useNodeStore, ...)` thấy `useNodeStore = undefined`.

**Fix:** `registry.js` KHÔNG được eager-import elements. Phần `import.meta.glob({ eager: true })` phải nằm trong file riêng (`registerElements.js`) chỉ load từ `PageWrapper`.

**Check nhanh:**
```bash
grep "import.meta.glob" src/composable/editor_v2/registry.js
# Phải không có kết quả. Nếu có → bug, dời sang registerElements.js
```

### `[unknown: xxx]` thay vì render element

**Trigger:** Canvas hiện text `[unknown: heading]` (hoặc type khác).

**Nguyên nhân:** Type không match meta nào trong registry.

**Check:**
```js
// Trong DevTools console:
import('@/composable/editor_v2/registry').then(r => console.log(r.registry))
// Xem có key 'heading' không?
```

Các trường hợp:
- File `nodes/HeadingV2.vue` không tồn tại / sai đường dẫn
- Quên `export const meta = {...}`
- `meta.type` không khớp `node.data.type`
- `registerElements.js` chưa được import từ PageWrapper → registry rỗng

**Fix:**
```bash
# Verify glob match file
ls src/components/editor_v2/nodes/

# Verify PageWrapper import
grep "registerElements" src/components/editor_v2/PageWrapper.vue
```

### `No component registered for type: xxx` warning + `[unknown]`

Cùng nguyên nhân trên — warning từ `NodeRenderer.resolved`. Xem mục trên.

### Drag không kéo được từ sidebar

**Trigger:** Sidebar item không drag được hoặc drag không tạo element.

**Check thứ tự:**
1. `display: contents` hay `display: block` trên `.element-drag-v2`? Phải `block`. `contents` xoá box → HTML5 drag không nhận.
2. `dragstart` có fire? Console log trong `_onDragStart`.
3. `tree` factory có return valid NodeTree (`{ rootNodeId, nodes }`)?
4. `dndStore.startCreate` có chạy? Set breakpoint.
5. Cursor có vào `.wk-editor-body`? Nếu không → `endDrag` skip apply do `dropInsideCanvas = false`.

### Drag child chọn parent

**Trigger:** Drag Heading → Block được chọn thay vì Heading.

**Nguyên nhân:** `@dragstart` bubble lên Block, handler Block chạy sau và override.

**Fix:** `e.stopPropagation()` đầu `onMoveDragStart`. Đã có trong `draggableNode` mixin — nếu element override `onMoveDragStart` riêng phải tự stop.

### Indicator vạch xanh không hiện khi drag

**Check:**
1. `dndStore.positioner` có khác null trong khi drag?
2. `positioner.computeIndicator` có return value (non-undefined)?
3. `nodeStore.events.indicator` có được set?
4. `IndicatorOverlay.show` computed có return true?
   - Note: `show` ẩn nếu target container EMPTY (placeholder đã đủ hint)

### Padding strip chỉ hiện 1 cạnh, các cạnh khác null

**Nguyên nhân:** `EdgeOverlays.updateRect` thiếu `right` và `bottom` (chỉ tính top/left/width/height).

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

**Fix:** Kiểm tra registry đã load Section meta:
```js
import('@/composable/editor_v2/registry').then(r =>
  console.log(r.isRootOnlyType('flex-section'))  // phải true
)
```

### Element không xuất hiện sau khi tạo folder

**Trigger:** Tạo `nodes/my_element/` + `index.vue` + `meta.js`, HMR reload, nhưng element không hiện trong sidebar / không render khi drag.

**Nguyên nhân:**
1. Glob pattern sai — `registerElements.js` chạy `import.meta.glob('nodes/*/index.vue')` nhưng file không ở đúng vị trí
2. Quên `export const meta = {...}` trong `index.vue`
3. `meta.type` chưa đăng ký
4. `index.vue` import từ `meta.js` thất bại (vd vô tình import component)

**Fix:**
```bash
# Verify folder structure
ls -R src/components/editor_v2/nodes/my_element/
# Phải có: index.vue, meta.js

# Verify meta export
grep "export const meta" src/components/editor_v2/nodes/my_element/index.vue

# Check registry load
import('@/composable/editor_v2/registry').then(r => console.log(r.getDef('my-element')))
```

### Store warn "unknown key dropped"

**Trigger:** Console hiện warn dạng `Unknown key 'fontSize' for type 'grid'`, value không được update.

**Nguyên nhân:** Key không nằm trong `meta.traits` của element. `store._writeNamespace` guard bị activate.

**Fix:**
1. Verify `meta.traits` của element có chứa key đó (check attribute `key` field)
2. Nếu dùng definition ref (string), check `definitions.js` có entry đó và element meta có tham chiếu nó
3. Nếu legacy inline spec, ensure key match giữa template bind (`@change="(val) => applyTrait(nodeId, { key: 'fontSize' }, val)"`) và meta.attributes.key

### CI: "invalid JSON Schema"

**Trigger:** `npm run validate:schemas` fail với error "Schema validation failed at element X, attribute Y"

**Nguyên nhân:**
1. `schema_helpers` misuse — vd `cssLength('20px')` return không-string khi expected string
2. `buildElementSchema` không properly resolve definition ref
3. Attribute reference definition không tồn tại

**Fix:**
```bash
npm run validate:schemas -- --debug
# Show detailed error per element

# Check definitions.js có entry
grep "export const DEFINITIONS_DATA" src/components/editor_v2/components/trait/fields/definitions.js
# Search key trong đó

# Verify element traits reference nó
grep "key: 'width_select'" src/components/editor_v2/nodes/flex_block/meta.js
```

### Drop ngoài canvas vẫn tạo element

**Nguyên nhân:** `endDrag` không guard `dropInsideCanvas`.

**Fix:** Đã có guard trong `dnd.js`. Verify:
```bash
grep -A 5 "dropInsideCanvas" src/stores/editor_v2/dnd.js
```

### Toolbar không follow theo scroll/resize

**Nguyên nhân:** `ElementToolbar` rAF loop bị cancel sớm hoặc không start.

**Check:** Console `this._raf` value khi selected → phải là number, không phải null.

**Fix:** Đảm bảo `mounted` start `_updatePosition`, `beforeUnmount` cancel.

## 2. Static cycle check script

Để verify không có cycle khi sửa code:

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
  for (const ext of ['', '.js', '.vue', '/index.js']) {
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
    if (r) {
      graph[file].push(r);
      walk(r, seen);
    }
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
console.log('store→nodes/* cycle:', findCycle('src/stores/editor_v2/node.js', 'nodes/') || 'NONE');
console.log('registry.js deps:', graph['src/composable/editor_v2/registry.js'] || []);
"
```

Expected output:
```
store→nodeBase cycle: NONE
store→nodes/* cycle: NONE
registry.js deps: []
```

Nếu có cycle → trace path output để biết file nào tạo cycle, refactor cho phù hợp.

## 3. SFC compile check

Sau khi sửa node element, verify compile được:

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
" -- src/components/editor_v2/nodes/*.vue
```

## 4. DevTools tricks

### Inspect store live

```js
// Trong Vue DevTools Pinia tab
// Hoặc trong browser console:
window.__editor_node_store = useNodeStore()  // (cần expose từ PageWrapper)
// Then:
__editor_node_store.nodes
__editor_node_store.events.selected
__editor_node_store.events.indicator
```

### Tìm node theo type

```js
Object.values(__editor_node_store.nodes).filter(n => n.data.type === 'flex-block')
```

### Manual trigger action

```js
__editor_node_store.setSelected('fb_xxx')
__editor_node_store.remove('fs_yyy')
```

### Inspect Positioner

```js
window.__editor_dnd = useDndStore()
// Khi đang drag:
__editor_dnd.positioner.currentIndicator
__editor_dnd.positioner.currentTargetChildDimensions
```

## 5. Checklist khi thêm element

- [ ] File trong `src/components/editor_v2/nodes/XxxV2.vue`
- [ ] Template root có `ref="root"` + `:data-node-id` + `data-node-type`
- [ ] Template có `draggable="true"`
- [ ] 5 handler: `@click.stop`, `@dragstart`, `@dragend`, `@dragover` (container), `@dragenter` (container)
- [ ] `export default { mixins: [nodeLeaf|nodeContainer, draggableNode] }`
- [ ] `export const meta = { type, label, factory, ... }`
- [ ] meta.factory return từ `createNode(...)` không trực tiếp object literal
- [ ] meta.type kebab-case, unique trong registry
- [ ] Test: drag từ sidebar → outline → drag → resize → delete

## 6. Checklist khi sửa store action

- [ ] Action mutate state qua method Pinia (không direct assign từ ngoài)
- [ ] Mảng dùng `splice/push`, không index assignment
- [ ] DOM refs `markRaw` (`setDOM` đã làm)
- [ ] Cycle / self-parent guard với `move`, `addNodeTree`
- [ ] Sau khi action xong, indicator/dragged event được clear nếu liên quan
- [ ] Update giá trị qua `changeStyle/changeConfig/changeSpecials` hoặc `applyTrait(nodeId, field, value)`, không direct mutate
- [ ] Reset events khi appropriate (xoá node selected → remove khỏi selection)

## 7. Checklist khi sửa Positioner

- [ ] `cleanup()` được gọi mỗi `endDrag`
- [ ] Window event listener (`scroll`, `dragover`) cleanup đúng
- [ ] `isDiff()` so sánh đủ 3 trường: parent.id, index, where
- [ ] `getCanvasAncestor` không infinite loop (parent chain hữu hạn)
- [ ] `isNearBorders` axis-aware (đọc `inFlow` từ getDOMInfo)
- [ ] Root-only type force ROOT target (không nest vào container khác)
- [ ] `isDroppable` được hỏi và surface error vào indicator

## 8. Khi nào cần restart dev server

Vite HMR xử lý:
- ✅ Sửa template SFC
- ✅ Sửa `<script>` body
- ✅ Sửa CSS
- ✅ Thêm/xoá element trong `nodes/` (glob re-evaluate khi page reload)

Cần full reload (Cmd-R):
- ⚠️ Sửa import path
- ⚠️ Đổi export name (`meta` → `definition`)
- ⚠️ Sửa mixin (Vue Options merge issue khi HMR)

Cần restart dev server:
- ❌ Sửa `vite.config.js`, `tsconfig.json`
- ❌ Sửa file trong `node_modules`
- ❌ Sửa server.js (express)

## 9. Trace 1 lỗi end-to-end (case study)

**Báo:** "Click element không chọn được"

Trace:
1. Console có warn / error? → Nếu có TDZ → xem mục 1
2. Mở Pinia DevTools → `events.selected` có thay đổi khi click?
   - Có → lỗi ở rendering: outline CSS không apply
     - Check `.wk-node-selected` rule trong `assets/editor_v2/node.css`
     - Check `:class` binding template
   - Không → lỗi ở handler
3. Click handler có fire? Console.log trong `onClick` mixin
   - Không fire → `@click.stop` bị parent intercept hoặc `pointer-events: none`
   - Fire → `setSelected` nhưng store không update?
4. Store actions có ESM live binding đúng? `useNodeStore()` return store đúng instance?

Process tương tự cho mọi loại lỗi: từ user-facing symptom → check Pinia DevTools state → trace ngược về handler/action.

## 10. Khi nào nên hỏi / ask đồng nghiệp

- Cycle import phức tạp >3 file
- Positioner indicator sai vị trí với layout đặc biệt (grid 2D, sticky, transform parent)
- Reactivity không trigger sau khi mutate store
- Performance: re-render quá nhiều với cây > 200 nodes

Trước khi hỏi: chạy cycle check script (mục 2), capture exact reproduce steps, screenshot DevTools state.
