# 10 — History (Undo / Redo) & Patch System

Deep dive vào undo/redo của editor_v2: `PatchRecorder` thu mutation thành (forward, inverse) patches, `useHistoryStore` giữ timeline, `_commit` trong node store là chokepoint duy nhất ghi state. Coalesce + throttle để hot path (kéo edge-overlay) không phình timeline.

---

## 1. Bức tranh lớn

```
                ┌──────────────────────────────────┐
   user action  │  node store action               │
   ─────────►   │   (move / changeStyle / addNode  │
                │    / reorderChildren / ungroup   │
                │    / duplicate / remove          │
                │    / setState ... )              │
                └────────────────┬─────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────┐
                │  _commit(label, mutateFn, opts)  │  ← chokepoint
                │   1. snapshot selection          │
                │   2. $patch (rec = new           │
                │      PatchRecorder(state))       │
                │   3. mutateFn(rec, state)        │
                │   4. record (fwd, inv) vào       │
                │      history store               │
                └────────────────┬─────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────┐
                │  useHistoryStore                 │
                │   timeline: [entry, ...]         │
                │   pointer: int                   │
                │   _coalesce: { key, until } | null│
                │                                  │
                │   undo() → applyPatches(inv)     │
                │   redo() → applyPatches(fwd)     │
                └──────────────────────────────────┘
```

Mutation trong editor_v2 **luôn** đi qua `_commit` → `PatchRecorder` → `useHistoryStore.record`. Không có path side ghi state mà bỏ history (ngoại trừ runtime-only fields: `node.dom` set qua `setDOM` + `markRaw`; UI selection set qua `setSelected/setIndicator/setState`; drag state qua `dndStore`).

---

## 2. `PatchRecorder` — collect (forward, inverse) atomic

Source: `composable/editor_v2/patchRecorder.js`.

```js
const rec = new PatchRecorder(state)
rec.set(['nodes', id, 'data', 'style', 'padding'], '20px')
// fwd: { op: 'set',   path: [...], value: '20px' }
// inv: { op: 'set',   path: [...], value: <oldValue> }  ← deepClone
//      hoặc inv: { op: 'unset', ... } nếu oldValue undefined

rec.insert(['nodes', parentId, 'data', 'nodes'], 0, childId)
// fwd: { op: 'insert', path: [...], index: 0, value: childId }
// inv: { op: 'remove', path: [...], index: 0 }

rec.remove(['nodes', parentId, 'data', 'nodes'], 2)
// fwd: { op: 'remove', path: [...], index: 2 }
// inv: { op: 'insert', path: [...], index: 2, value: <oldChild> }  ← deepClone
```

### API

```js
class PatchRecorder {
  constructor(state)
  set(path, value)                   // value = undefined → delete
  insert(arrayPath, index, value)    // splice insert
  remove(arrayPath, index)           // splice remove
  getForward(): Patch[]              // theo thứ tự ghi
  getInverse(): Patch[]              // REVERSE — apply left-to-right để undo đúng thứ tự
  hasChanges(): boolean              // skip record nếu rỗng
}
```

### Inverse order

`getInverse()` trả slice đã reverse — vì để hoàn nguyên N op tuần tự, phải undo từ op cuối về op đầu. `applyPatches` là left-fold đơn giản, không tự biết reverse.

### deepClone giá trị

Mọi `value` trong patch đều `cloneDeep` — đảm bảo timeline không bị mutate khi state cũ thay đổi tiếp theo. Đặc biệt quan trọng với object nested (style/config/responsive map).

---

## 3. `compactPatches` + `applyPatches`

### `compactPatches(patches)` — dedupe theo path

Khi user kéo edge-overlay liên tục, mỗi `requestAnimationFrame` ghi 1 `set` lên CÙNG path style key. Entry phình theo số rAF tick. `compactPatches` giữ **occurrence cuối** của mỗi path (last-writer-wins), giữ thứ tự tương đối phần còn lại.

```js
patches = [
  { op: 'set', path: ['a', 'b'], value: 1 },     // ─┐ DROP
  { op: 'set', path: ['c'],      value: 2 },     //  │  KEEP — path 'c'
  { op: 'set', path: ['a', 'b'], value: 3 },     //  │ KEEP — path 'a.b' last write
]
// → 2 patch còn lại (path 'c' giữ index gốc 1, 'a.b' giữ index 2)
```

**Skip dedupe nếu có `insert`/`remove`** — index của chúng phụ thuộc thứ tự, dedupe sẽ làm sai semantic.

### `applyPatches(state, patches)` — left-fold

```js
for (const p of patches) {
  switch (p.op) {
    case 'set':    set(state, p.path, p.value)              break
    case 'unset':  unset(state, p.path)                     break
    case 'insert': get(state, p.path).splice(p.index, 0, p.value)  break
    case 'remove': get(state, p.path).splice(p.index, 1)    break
  }
}
```

Pinia reactive proxy track từng `set`/`delete`/`splice` → component tự re-render khi `applyPatches` chạy trong `$patch`.

---

## 4. `useHistoryStore` — timeline + coalesce

Source: `stores/editor_v2/history.js`. Store ID `editor_v2_history`.

### Constants

```js
const MAX_CAPACITY = 200
const DEFAULT_THROTTLE_MS = 300
```

### State

```js
{
  timeline: [{ patches, inversePatches, label, key, ts, selectedBefore, selectedAfter }, ...],
  pointer: -1,                       // index entry hiện tại (after undo: lùi 1)
  _silent: false,                    // bật bởi `ignore()` — skip record
  _coalesce: null | { key, until },  // window đang mở để gộp entry
}
```

### `record(patches, inversePatches, label, opts)`

3 nhánh:

1. **Silent** (`_silent === true`) — skip toàn bộ. Dùng cho hydrate / init.
2. **Coalesce hit** — `_coalesce.key === opts.key && now < _coalesce.until` → merge vào entry cuối:
   ```js
   last.patches = compactPatches(last.patches.concat(patches))
   last.inversePatches = compactPatches(inversePatches.concat(last.inversePatches))
   last.selectedAfter = selectedAfter
   last.ts = now
   this._coalesce.until = now + throttleMs
   ```
3. **Mới** — nếu `pointer < timeline.length - 1` thì cắt branch redo (`splice`). Push entry mới, tăng pointer. Clamp size = `MAX_CAPACITY = 200`.

### `undo()` / `redo()`

```js
undo() {
  if (!this.canUndo) return
  const entry = this.timeline[this.pointer]
  const ns = useNodeStore()
  ns.$patch((s) => {
    applyPatches(s, entry.inversePatches)
    scrubDomRefsFromPatches(s.nodes, entry.inversePatches)
    s.events.selected = filterExistingIds(s.nodes, entry.selectedBefore)
  })
  this.pointer--
  this._coalesce = null              // bất kỳ undo nào cũng end coalesce window
}
```

`redo` đối xứng: tăng pointer trước, apply forward, restore `selectedAfter`.

### `ignore(fn)` — batch không record

Wrap mutation muốn skip history. Nest-safe — set `_silent = true`, gọi fn, restore prev value trong finally.

```js
useHistoryStore().ignore(() => {
  nodeStore.hydrate(payload)
})
```

### `clear()`

Reset timeline + pointer + coalesce. Gọi sau `hydrate(payload)` — timeline cũ đang trỏ id của page cũ.

### `defaultThrottleMs() → 300`

Default coalesce window cho hot-path writers (`_writeNs`, `_writeByPolicy`).

### Getter

| Getter | Mô tả |
|---|---|
| `canUndo` | `pointer >= 0` |
| `canRedo` | `pointer < timeline.length - 1` |
| `nextUndoLabel` | `timeline[pointer]?.label` |
| `nextRedoLabel` | `timeline[pointer+1]?.label` |

### Helper riêng cho DOM ref

```js
function scrubDomRefsFromPatches(nodesMap, patches) {
  // Khi undo `set ['nodes', id]` về node cũ, .dom của node-vừa-được-set là tham
  // chiếu HTMLElement cũ (mất sau khi remount). Null về để mounted hook tự re-set.
  for (const p of patches) {
    if (p.op === 'set' && p.path.length === 2 && p.path[0] === 'nodes') {
      const node = nodesMap[p.path[1]]
      if (node && node.dom) node.dom = null
    }
  }
}

function filterExistingIds(nodesMap, ids) {
  // Tránh select id của node đã xóa (nếu user undo move thì id selected cũ
  // có thể không còn — filter giữ id vẫn tồn tại).
  return ids.filter((id) => !!nodesMap[id])
}
```

---

## 5. `_commit` — chokepoint trong node store

Source: `stores/editor_v2/node.js`.

```js
_commit(label, mutateFn, opts = {}) {
  const selectedBefore = [...this.events.selected]
  let rec
  this.$patch((state) => {
    rec = new PatchRecorder(state)
    mutateFn(rec, state)
  })
  if (!rec || !rec.hasChanges()) return
  if (!opts.silent) {
    useHistoryStore().record(rec.getForward(), rec.getInverse(), label, {
      key: opts.key || label,
      throttleMs: opts.throttleMs || 0,
      selectedBefore,
      selectedAfter: [...this.events.selected],
    })
  }
}
```

`mutateFn(rec, state)` nhận 2 param:
- `rec` — `PatchRecorder` để mutate + record
- `state` — Pinia state proxy bên trong `$patch`, dùng để **đọc** trạng thái hiện tại. Không mutate trực tiếp `state.X = Y` — luôn đi qua `rec`.

### Actions ghi history

Mọi action sau đi qua `_commit` → có entry undo:

| Action | Label | Notes |
|---|---|---|
| `move` | `move` | Re-parent + cycle guard + auto-wrap |
| `reorderChildren` | `reorderChildren` | Permutation reorder (1 entry thay vì N) |
| `ungroup` | `ungroup` | Dissolve container → lift children |
| `remove` | `remove` | Xoá node + descendants + satellites |
| `duplicate` | `duplicate` | Clone subtree với id mới |
| `addNode` | `addNode` | Insert 1 node đã shaped |
| `addNodeTree` | `addNodeTree` | Merge tree + auto-wrap |
| `changeStyle` | `changeStyle` | Coalesce key `style:<id>`, throttle 300ms |
| `changeConfig` | `changeConfig` | Coalesce key `config:<id>`, throttle 300ms |
| `changeSpecials` | `changeSpecials` | Coalesce key `specials:<id>`, throttle 300ms |
| `resetStyle/Config/Specials` | `change*` | Force throttle = 0 (entry rời rạc) |
| `addEvent` / `updateEvent` / `removeEvent` | `add/update/removeEvent` | Coalesce per `events:<id>:<entryId>` |
| `addBinding` / `updateBinding` / `removeBinding` | `add/update/removeBinding` | Tương tự |

### Actions KHÔNG ghi history

- `setDOM(id, el)` — runtime DOM ref
- `setSelected(id)` — UI selection
- `setIndicator(...)` — drag indicator
- `setState(value)` — variant UI
- `setNodeEvent(name, value)` — drag/hover event
- `clearEvents()` — UI cleanup
- `addDetachedNode(node, parentId)` — satellite registration (gọi từ `ensureSatellite` lifecycle, không phải user action)

### Vì sao snapshot selection trước/sau?

User kéo node A từ section1 → section2:
- `selectedBefore = [A]`
- Sau `move`, selected = [A] vẫn còn → `selectedAfter = [A]`

User remove node A:
- `selectedBefore = [A]`
- Sau `remove`, selected = [] → `selectedAfter = []`

Undo `remove` → restore `selectedBefore = [A]`. Redo → restore `selectedAfter = []`.

### `serialize()` / `hydrate(payload)`

- `serialize()` — pure snapshot, KHÔNG mutate → không qua `_commit`
- `hydrate(payload)` — replace `state.nodes` direct (không qua `_commit`) → SAU đó gọi `useHistoryStore().clear()` để timeline cũ không kéo id lạ

`serialize()`:
```js
return { schemaVersion: 1, rootNodeId: ROOT_NODE, nodes: { /* clean shape */ } }
```

`hydrate(payload)`:
```js
this.nodes = hydrated
this.clearEvents()
useHistoryStore().clear()
```

---

## 6. Hot path: throttle + coalesce

Khi user kéo edge-overlay (chỉnh padding/margin trực quan), mouse-move fire 60×/giây. Mỗi tick gọi `changeStyle(id, { padding: '20px 24px' })` — 1 entry/tick = ~60 entries cho 1 lần kéo. UX bị: undo lùi 60 lần mới hủy lần kéo. Tránh:

### Throttle window

`useHistoryStore().defaultThrottleMs() = 300`. `_writeNs` truyền:

```js
_writeNs(id, ns, patch, slot, opts = {}) {
  const throttleMs = opts.throttle === false ? 0 : opts.throttle || useHistoryStore().defaultThrottleMs()
  const key = `${ns}:${id}`                          // ← dedupe key: cùng (ns, node) → cùng window
  this._commit(`change${ns[0].toUpperCase()}${ns.slice(1)}`, mutateFn, { key, throttleMs })
}
```

Trong window 300ms, mọi `_writeNs` cùng `(ns, id)` → coalesce vào entry cuối.

### Compact dedupe trong coalesce

Sau khi `last.patches.concat(newPatches)`, gọi `compactPatches` để giữ duy nhất occurrence cuối của mỗi path. Kéo padding ghi `set ['nodes', id, 'data', 'responsive', bp, 'style', 'padding']` 60 lần → chỉ 1 patch còn lại trong entry.

### `_resetNs` force throttle = false

Reset key về undefined là intent rời rạc, không gộp với mutation kế:

```js
_resetNs(methodName, id, keys, opts = {}) {
  const patch = {}
  keys.forEach((k) => patch[k] = undefined)
  this[methodName](id, patch, { ...opts, throttle: false })   // ép throttleMs = 0
}
```

### Coalesce key strategies

| `opts.key` | Hành vi |
|---|---|
| `undefined` (default) | dùng `label` làm key — cùng action type sẽ gộp (vd nhiều `move` liên tiếp) |
| `'${ns}:${id}'` | gộp theo `(namespace, node)` — kéo edge-overlay 1 node cùng namespace |
| `'${ns}:${id}:${entryId}'` | event/binding update — gộp theo từng entry riêng |
| `'${ns}:${id}:add'` | append-only `_addEntry` — default throttle = 0 (mỗi add 1 entry rõ ràng) |

---

## 7. Patch op cheatsheet

| Op | Field | Effect | Inverse |
|---|---|---|---|
| `set` | `path: string[]`, `value: any` | `lodash.set(state, path, value)` | `set` với oldValue, hoặc `unset` nếu oldValue undefined |
| `unset` | `path: string[]` | `lodash.unset(state, path)` | `set` với oldValue |
| `insert` | `path: string[]`, `index: number`, `value: any` | `arr.splice(index, 0, value)` | `remove` cùng `path, index` |
| `remove` | `path: string[]`, `index: number` | `arr.splice(index, 1)` | `insert` cùng `path, index, <oldValue>` |

`set` với `value = undefined` trong recorder được mặc định convert thành `unset` (xem `PatchRecorder.set`).

---

## 8. Lifecycle entry: example

User thao tác: **kéo `padding` slider** trên 1 flex-block với active breakpoint = `mobile`.

```
t = 0ms      mouseMove → changeStyle(id, { padding: '10px' })
              _commit('changeStyle', ...)
              rec.set(['nodes', id, 'data', 'responsive', 'mobile', 'style', 'padding'], '10px')
              record(fwd, inv, 'changeStyle', { key: 'style:id', throttleMs: 300 })
              → push entry [E0], pointer = 0, _coalesce = { key: 'style:id', until: 300ms }

t = 16ms     mouseMove → changeStyle(id, { padding: '11px' })
              record(..., { key: 'style:id', throttleMs: 300 })
              now (16) < until (300) && key match
              → merge: E0.patches = compactPatches([
                                       { set path...padding, value '10px' },
                                       { set path...padding, value '11px' },
                                     ])
                       = [{ set path...padding, value '11px' }]   ← compact giữ cuối
              E0.inversePatches = compactPatches([
                                       inv của '11px' (set oldValue='10px'),
                                       inv của '10px' (set oldValue=undefined → unset),
                                     ])
                                = [{ set path...padding, value '10px' },
                                   { unset path...padding }]
                                  ← compact: cùng path, KEEP last (unset)
                                  → chỉ còn 1 inverse: unset

t = 50ms..   tiếp tục mouse-move → liên tục coalesce, _coalesce.until trượt theo

t = 800ms    user thả chuột — không có event ghi thêm
              entry E0 cuối cùng:
                patches:        [{ set path...padding, value <giá trị cuối> }]
                inversePatches: [{ unset path...padding }]   ← '10px' là giá trị đầu, oldValue undefined

t = 2000ms   user nhấn Cmd+Z
              undo() → applyPatches(state, [{ unset path...padding }])
              state.nodes[id].data.responsive.mobile.style.padding = undefined
              s.events.selected = filterExistingIds(s.nodes, E0.selectedBefore)
              pointer = -1
```

1 lần kéo → **1 entry undo**, không phải 60.

---

## 9. Stateful write history

Khi user edit variant `hover` của Button:

```
1. setState('hover')                                    [no history]
2. changeStyle(id, { background: '#0d6efd' }, { stateful: true })
     → _routeState divert vào config.hover.background
     → _writeNs(id, 'config', { hover: {...} }, currentBp)
     → entry E1 'changeConfig', key 'config:id'
3. setState('default')                                  [no history]
4. Cmd-Z → undo E1 → config.hover.background remove
   selectedBefore = [id], state vẫn 'default' (selection restore không reset state)
```

Note: `events.state` KHÔNG nằm trong history — chỉ là UI marker. User undo + state ≠ base có thể gây UX surprise; consider auto-reset state khi history navigates.

---

## 10. Câu hỏi thường gặp

### Khi nào nên gọi `ignore()`?

Khi seed state ban đầu mà không muốn undo "lùi về page trống":
- `hydrate(payload)` — replace nodes hoàn toàn (đã có `clear()` trong action)
- Migration script chạy 1 lần trên page cũ format
- Auto-fix corrupted state ở init

### Khi nào nên truyền `silent: true` trong `_commit`?

Hiện chỉ `_writeNs` exposed `opts.silent`. Caller dùng khi:
- Tự ghi lại entry custom sau đó (compound action: ghi 3 patch trong 1 entry chung)
- State chỉ runtime-only

### `selectedBefore`/`selectedAfter` có cần manual snapshot?

Không. `_commit` tự snapshot trước/sau.

### Pointer ở -1 nghĩa là gì?

State đang ở **trước** entry 0 — không có gì để undo. `canUndo` trả false. Sau redo về entry 0, pointer = 0.

### Sao `inversePatches.concat(last.inversePatches)` chứ không phải `last.inversePatches.concat(inversePatches)`?

Inverse chạy ngược thứ tự forward. Batch mới ghi SAU batch cũ → undo phải hoàn nguyên batch mới TRƯỚC batch cũ.

`getInverse()` đã reverse 1 lần. Concat:
- `last.inversePatches`: thứ tự undo của batch cũ (= reverse của forward cũ)
- `inversePatches`: thứ tự undo của batch mới (= reverse của forward mới)
- Concat `[inversePatches, last.inversePatches]` = `[mới_undo, cũ_undo]` — apply trái sang phải → undo batch mới trước batch cũ ✓

### Satellite có ghi history không?

`ensureSatellite()` gọi `addDetachedNode(node, parentId)` lifecycle → KHÔNG qua `_commit`. Lý do: satellite là phần lifecycle của owner, không phải user action — gắn cứng vào owner.

Tuy nhiên user edit satellite (trait edit, drag) → vẫn qua `changeStyle/move/...` → có history. Xoá satellite tự cascade khi `remove(ownerId)` → 1 entry phủ cả 2.

---

## 11. Glossary

| Term | Đầy đủ | Ý nghĩa |
|---|---|---|
| `rec` | record | `PatchRecorder` instance dùng trong `mutateFn` |
| `fwd` | forward | mảng patch apply để redo |
| `inv` | inverse | mảng patch apply để undo |
| `entry` | history entry | 1 phần tử trong `timeline` |
| `pointer` | timeline cursor | index entry hiện tại |
| `coalesce` | coalesce window | khoảng thời gian gộp entry cùng key |
| `throttleMs` | throttle window ms | thời lượng coalesce window |
| `key` | coalesce key | dedupe key cho gộp (default = label) |
| `label` | UI label | hiển thị "Undo &lt;label&gt;" |
| `selectedBefore/After` | selection snapshot | id list cần restore khi undo/redo |
| `silent` | bỏ record | flag bypass history cho mutation runtime-only |
| `MAX_CAPACITY` | timeline cap | 200 entry tối đa, oldest bị shift |
| `DEFAULT_THROTTLE_MS` | default throttle | 300ms cho hot path |

---

## 12. File hash (lookup)

| Tìm gì | Đọc file |
|---|---|
| Recorder + compact + apply | `composable/editor_v2/patchRecorder.js` |
| Timeline + coalesce + undo/redo | `stores/editor_v2/history.js` |
| `_commit` chokepoint + chain action | `stores/editor_v2/node.js` |
| Throttle default | `useHistoryStore().defaultThrottleMs()` (300ms) |
| Capacity | `MAX_CAPACITY` constant trong `history.js` (200) |
| Hot path entry | `node.js#_writeNs` (key = `${ns}:${id}`, throttleMs = default) |
| Reset force discrete | `node.js#_resetNs` (throttle: false) |
| Event/binding entry | `node.js#_addEntry/_updateEntry/_removeEntry` |
| DOM ref scrub | `history.js#scrubDomRefsFromPatches` |
| Selection filter | `history.js#filterExistingIds` |
