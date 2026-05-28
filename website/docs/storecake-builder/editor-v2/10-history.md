---
sidebar_position: 11
title: 10 — History (Undo / Redo) & Patch System
---

# 10 — History (Undo / Redo) & Patch System

Deep dive vào undo/redo của editor_v2: `PatchRecorder` thu thập mutation thành (forward, inverse) patches, history store giữ timeline, `_commit` trong node store là chokepoint duy nhất ghi state. Coalesce + throttle để hot path (kéo edge-overlay) không phình timeline.

---

## 1. Bức tranh lớn

```
                ┌──────────────────────────────────┐
   user action  │  node store action               │
   ─────────►   │   (move / changeStyle / addNode) │
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
                │   timeline: [entry, entry, ...]  │
                │   pointer: int                   │
                │   _coalesce: { key, until } | null│
                │                                  │
                │   undo() → applyPatches(inv)     │
                │   redo() → applyPatches(fwd)     │
                └──────────────────────────────────┘
```

Mutation trong editor_v2 **luôn** đi qua `_commit` → `PatchRecorder` → `useHistoryStore.record`. Không có path side nào ghi state mà bỏ history (ngoại trừ runtime-only field `node.dom` set qua `setDOM` + `markRaw`).

---

## 2. `PatchRecorder` — collect (forward, inverse) atomic

Source: `composable/editor_v2/patchRecorder.js`.

`PatchRecorder` mutate state in-place + thu thập 2 chiều patches. Mỗi method (`set`, `insert`, `remove`) tự sinh **inverse op** tương ứng:

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
  constructor(state)                 // mutate state này
  set(path, value)                   // value = undefined → delete
  insert(arrayPath, index, value)    // splice insert
  remove(arrayPath, index)           // splice remove
  getForward(): Patch[]              // theo thứ tự ghi
  getInverse(): Patch[]              // REVERSE — apply left-to-right để undo đúng thứ tự
  hasChanges(): boolean              // skip record nếu rỗng
}
```

### Inverse order

`getInverse()` trả slice đã reverse — vì để hoàn nguyên N op tuần tự, phải undo từ op cuối về op đầu. `applyPatches` chỉ là left-fold đơn giản, không tự biết reverse.

### deepClone giá trị

Mọi `value` trong patch đều `cloneDeep` — đảm bảo timeline không bị mutate khi state cũ thay đổi tiếp theo. Đặc biệt quan trọng với object nested (style/config/responsive map) vì JS proxy của Pinia track tới deep level.

---

## 3. Compact + applyPatches

### `compactPatches(patches)` — dedupe theo path

Khi user kéo edge-overlay liên tục, mỗi `requestAnimationFrame` ghi 1 `set` lên CÙNG path style key. Nếu cứ append vào entry coalesce, entry phình theo số rAF tick (hàng chục/giây). `compactPatches` giữ **occurrence cuối** của mỗi path (last-writer-wins), giữ thứ tự tương đối phần còn lại.

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

Source: `stores/editor_v2/history.js`.

### State

```js
{
  timeline: [{ patches, inversePatches, label, key, ts, selectedBefore, selectedAfter }, ...],
  pointer: -1,                       // index entry hiện tại (after undo: lùi 1)
  _silent: false,                    // flag bật bởi `ignore()` — skip record
  _coalesce: null | { key, until },  // window đang mở để gộp entry mới
}
```

| Field entry | Ý nghĩa |
|---|---|
| `patches` | forward — apply để redo |
| `inversePatches` | reverse — apply để undo |
| `label` | hiển thị trong UI (vd "changeStyle", "move") |
| `key` | dedupe key cho coalesce window (mặc định = label) |
| `ts` | timestamp ms |
| `selectedBefore` | id list selection trước mutation |
| `selectedAfter` | id list selection sau mutation — restore khi redo |

### `record(patches, inversePatches, label, opts)`

3 nhánh xử lý:

1. **Silent** (`this._silent === true`) — skip toàn bộ. Dùng cho hydrate / init.
2. **Coalesce hit** — `_coalesce.key === opts.key && now < _coalesce.until` → merge vào entry cuối:
   - `last.patches = compactPatches(last.patches.concat(newPatches))`
   - `last.inversePatches = compactPatches(newInverse.concat(last.inversePatches))`
     (chú ý thứ tự — inverse của batch mới apply TRƯỚC inverse cũ khi undo)
   - `last.selectedAfter` cập nhật theo lần cuối
   - `last.selectedBefore` giữ nguyên (snapshot lần đầu của window)
   - `last.ts` cập nhật để extend window
3. **Mới** — nếu `pointer < timeline.length - 1` thì cắt branch redo. Push entry mới, tăng pointer. Clamp size = `MAX_CAPACITY = 200` (oldest bị shift, pointer giảm tương ứng).

```js
record(patches, inversePatches, label, opts) {
  if (this._silent || !patches?.length) return
  const now = Date.now()
  const key = opts.key || label
  const throttleMs = opts.throttleMs || 0

  if (this._coalesce && this._coalesce.key === key && this.pointer >= 0 && now < this._coalesce.until) {
    const last = this.timeline[this.pointer]
    last.patches = compactPatches(last.patches.concat(patches))
    last.inversePatches = compactPatches(inversePatches.concat(last.inversePatches))
    last.selectedAfter = opts.selectedAfter || []
    last.ts = now
    this._coalesce.until = now + throttleMs
    return
  }

  if (this.pointer < this.timeline.length - 1) this.timeline.splice(this.pointer + 1)
  this.timeline.push({ patches, inversePatches, label, key, ts: now, selectedBefore, selectedAfter })
  this.pointer++
  if (this.timeline.length > MAX_CAPACITY) { this.timeline.shift(); this.pointer-- }
  this._coalesce = throttleMs > 0 ? { key, until: now + throttleMs } : null
}
```

### `undo()` / `redo()`

```js
undo() {
  if (!this.canUndo) return
  const entry = this.timeline[this.pointer]
  const ns = useNodeStore()
  ns.$patch((s) => {
    applyPatches(s, entry.inversePatches)
    scrubDomRefsFromPatches(s.nodes, entry.inversePatches)  // null .dom của node bị recreate
    s.events.selected = filterExistingIds(s.nodes, entry.selectedBefore)
  })
  this.pointer--
  this._coalesce = null                                      // bất kỳ undo nào cũng end coalesce window
}
```

`redo` đối xứng: tăng pointer trước, apply forward, restore `selectedAfter`.

### `ignore(fn)` — batch không record

Wrap mutation muốn skip history (vd seed page lúc hydrate, reapply migration). Nest-safe — set `_silent = true`, gọi fn, restore prev value trong finally.

```js
useHistoryStore().ignore(() => {
  nodeStore.hydrate(payload)            // không tạo entry undo
})
```

### `clear()`

Gọi sau `hydrate(payload)` của node store — timeline cũ đang trỏ id của page cũ, không còn ý nghĩa. Reset cả `pointer`, `_coalesce`, `_silent`.

### Getter

| Getter | Mô tả |
|---|---|
| `canUndo` | `pointer >= 0` |
| `canRedo` | `pointer < timeline.length - 1` |
| `nextUndoLabel` | `timeline[pointer]?.label` — hiển thị nút "Undo &lt;label&gt;" |
| `nextRedoLabel` | `timeline[pointer+1]?.label` |

### Helper riêng cho DOM ref

```js
function scrubDomRefsFromPatches(nodesMap, patches) {
  // Khi undo `set ['nodes', id]` về undefined hoặc redo `set ['nodes', id]` thành node mới,
  // .dom của node-vừa-được-set là tham chiếu HTMLElement cũ (mất sau khi remount).
  // Null về để mounted hook tự re-set.
  for (const p of patches) {
    if (p.op === 'set' && p.path.length === 2 && p.path[0] === 'nodes') {
      const node = nodesMap[p.path[1]]
      if (node && node.dom) node.dom = null
    }
  }
}

function filterExistingIds(nodesMap, ids) {
  // Tránh select id của node đã xóa (nếu user undo move thì id selected cũ
  // có thể không còn — filter giữ id vẫn tồn tại trong nodes map).
  return ids.filter((id) => !!nodesMap[id])
}
```

---

## 5. `_commit` — chokepoint trong node store

Source: `stores/editor_v2/node.js`.

Mọi action mutate state (move/remove/duplicate/addNode/addNodeTree/changeStyle/Config/Specials/reset*/addEvent/...) đều gọi `_commit`:

```js
_commit(label, mutateFn, opts = {}) {
  const selectedBefore = [...this.events.selected]
  let rec
  this.$patch((state) => {
    rec = new PatchRecorder(state)
    mutateFn(rec, state)                            // mutate qua rec.set / rec.insert / rec.remove
  })
  if (!rec || !rec.hasChanges()) return             // no-op → không record entry
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

`mutateFn(rec, state)` nhận hai param:
- `rec` — `PatchRecorder` để mutate + record
- `state` — Pinia state proxy bên trong `$patch`, dùng để **đọc** trạng thái hiện tại (lookup nodes, parent index, …). Không mutate trực tiếp `state.X = Y` — luôn đi qua `rec`.

### Vì sao snapshot selection trước/sau?

Khi user kéo node A từ section1 → section2, sau `remove` lẫn `addNode` thì selected = [A] vẫn còn. Nhưng nếu `remove` node A, selected = [], khi user redo `remove` phải clear lại. Snapshot `selectedBefore = [A]` + `selectedAfter = []` để cả 2 chiều undo/redo restore đúng UI state.

### `silent: true`

Hai chỗ chính dùng:
- Hot path setter nội bộ (vd setter DOM ref) — không cần history vì state runtime
- `_writeNs(id, ns, patch, slot, opts)` chấp nhận `opts.silent` để caller bypass khi cần (rare)

---

## 6. Hot path: throttle + coalesce

Khi user kéo edge-overlay (chỉnh padding/margin trực quan), mouse-move fire 60×/giây. Mỗi tick gọi `changeStyle(id, { padding: '20px 24px' })` — 1 entry/tick = ~60 entries cho 1 lần kéo. UX bị: undo lùi 60 lần mới hủy lần kéo. Tránh:

### Throttle window

`history.defaultThrottleMs() = 300`. `_writeNs` truyền:

```js
_writeNs(id, ns, patch, slot, opts = {}) {
  const throttleMs = opts.throttle === false ? 0 : opts.throttle || useHistoryStore().defaultThrottleMs()
  const key = `${ns}:${id}`                          // ← dedupe key: cùng (ns, node) → cùng window
  this._commit(`change${ns[0].toUpperCase()}${ns.slice(1)}`, mutateFn, { key, throttleMs })
}
```

Trong window 300ms, mọi `_writeNs` cùng `(ns, id)` → coalesce vào entry cuối thay vì push mới.

### Compact dedupe trong coalesce

Sau khi `last.patches.concat(newPatches)`, gọi `compactPatches` để giữ duy nhất occurrence cuối của mỗi path. Kéo padding ghi `set ['nodes', id, 'data', 'responsive', bp, 'style', 'padding']` 60 lần → chỉ 1 patch còn lại trong entry.

### `_resetNs` force throttle = false

Reset key về undefined là intent rời rạc (user click "Reset to default"), không nên gộp với mutation kế đó:

```js
_resetNs(methodName, id, keys, opts = {}) {
  const patch = {}
  keys.forEach((k) => patch[k] = undefined)
  this[methodName](id, patch, { ...opts, throttle: false })   // ← ép throttleMs = 0
}
```

### Coalesce vs throttle key

| `opts.key` | Hành vi |
|---|---|
| `undefined` (default) | dùng `label` làm key — cùng action type sẽ gộp (vd nhiều `move` liên tiếp) |
| `'${ns}:${id}'` | gộp theo `(namespace, node)` — kéo edge-overlay 1 node cùng namespace |
| `'${ns}:${id}:${entryId}'` | event/binding update — gộp theo từng entry riêng |

`_addEntry` / `_removeEntry` dùng key `'${ns}:${id}:add'` và default throttle = 0 — mỗi lần add là 1 entry rõ ràng, không gộp.

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
                inversePatches: [{ unset path...padding }]   ← '10px' là giá trị đầu, oldValue khi đó là undefined

t = 2000ms   user nhấn Cmd+Z
              undo() → applyPatches(state, [{ unset path...padding }])
              state.nodes[id].data.responsive.mobile.style.padding = undefined
              s.events.selected = filterExistingIds(s.nodes, E0.selectedBefore)
              pointer = -1
```

1 lần kéo → **1 entry undo**, không phải 60.

---

## 9. Câu hỏi thường gặp

### Khi nào nên gọi `ignore()`?

Khi seed state ban đầu mà không muốn undo "lùi về page trống":
- `hydrate(payload)` — replace nodes hoàn toàn, history cũ đã clear
- Migration script chạy 1 lần trên page cũ format
- Auto-fix corrupted state ở init

### Khi nào nên truyền `silent: true` trong `_commit`?

Hiện chỉ `_writeNs` exposed `opts.silent`. Caller dùng khi:
- Tự ghi lại entry custom sau đó (vd compound action: ghi 3 patch trong 1 entry chung)
- State chỉ runtime-only (ngoài runtime fields như `node.dom` đã set bằng `markRaw` ngoài rec)

### `selectedBefore`/`selectedAfter` có cần manual snapshot?

Không. `_commit` tự snapshot trước/sau. Caller chỉ cần gọi `changeStyle/move/...` như bình thường.

### Pointer ở -1 nghĩa là gì?

State đang ở **trước** entry 0 — không có gì để undo. `canUndo` trả false. Sau redo về entry 0, pointer = 0.

### Sao `inversePatches.concat(last.inversePatches)` chứ không phải `last.inversePatches.concat(inversePatches)`?

Inverse chạy ngược thứ tự forward. Batch mới ghi SAU batch cũ → undo phải hoàn nguyên batch mới TRƯỚC batch cũ. Concat theo thứ tự `[mới, cũ]` đảm bảo `getInverse()` (đã reverse 1 lần) ra `[cũ_reversed, mới_reversed]` đúng — không, đợi, kiểm tra lại:

`getInverse()` trả `_invReverse.slice().reverse()`. Trong recorder, mỗi `set/insert/remove` push 1 op vào `_invReverse`. Khi coalesce, ta đã có sẵn `forward + inverse` từ recorder của batch mới (sau khi `.reverse()`). Concat:
- `last.inversePatches`: thứ tự undo của batch cũ (= reverse của forward cũ)
- `inversePatches`: thứ tự undo của batch mới (= reverse của forward mới)
- Concat `[inversePatches, last.inversePatches]` = `[mới_undo, cũ_undo]` — apply trái sang phải → undo batch mới trước batch cũ ✓

---

## 10. Glossary

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

---

## 11. File hash (lookup)

| Tìm gì | Đọc file |
|---|---|
| Recorder + compact + apply | `composable/editor_v2/patchRecorder.js` |
| Timeline + coalesce + undo/redo | `stores/editor_v2/history.js` |
| `_commit` chokepoint + chain action | `stores/editor_v2/node.js` |
| Throttle default | `useHistoryStore().defaultThrottleMs()` (300ms) |
| Capacity | `MAX_CAPACITY` constant trong `history.js` (200) |
