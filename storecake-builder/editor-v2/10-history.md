# 10 — Undo / Redo

Undo/redo của Editor V2 **không** snapshot cả cây (quá tốn), mà ghi lại **patch hai chiều** cho từng thao tác.

---

## 1. Ba mảnh

```
PatchRecorder            useNodeStore._commit          useHistoryStore
(thu patch khi mutate)   (chokepoint duy nhất)          (timeline + con trỏ)
```

Không có mảnh nào biết về UI. Một action mới chỉ cần đi qua `_commit` là tự động undo được.

---

## 2. `PatchRecorder` — vừa sửa vừa ghi sổ

Ba lệnh, mỗi lệnh sinh **một cặp** (forward, inverse):

| Lệnh | Forward | Inverse |
|---|---|---|
| `rec.set(path, value)` | `set` (hoặc `unset` nếu `value === undefined`) | `set` giá trị cũ, hoặc `unset` nếu trước đó chưa tồn tại |
| `rec.insert(arrayPath, index, value)` | `insert` | `remove` cùng index |
| `rec.remove(arrayPath, index)` | `remove` | `insert` lại giá trị cũ |

```js
getForward()  → this.fwd
getInverse()  → this._invReverse.slice().reverse()   // ĐẢO NGƯỢC
```

Vì sao phải đảo? Vì `applyPatches` chạy trái-sang-phải. Muốn hoàn tác một chuỗi thao tác thì phải gỡ theo thứ tự ngược lại.

Giá trị lưu vào patch đều `cloneDeep` — nếu giữ tham chiếu, một mutation sau đó sẽ làm hỏng lịch sử.

---

## 3. `_commit` — chokepoint

```js
_commit(label, mutateFn, opts = {}) {
  const selectedBefore = [...this.events.selected]
  let rec
  this.$patch((state) => {
    rec = new PatchRecorder(state)
    mutateFn(rec, state)        // mutate + thu patch trong CÙNG một lượt
  })
  if (!rec || !rec.hasChanges()) return       // không đổi gì ⇒ không ghi sổ
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

Bọc trong `$patch` để Pinia chỉ phát **một** thông báo cho cả nhóm mutation.

Ba tùy chọn:

| Opt | Ý nghĩa |
|---|---|
| `silent: true` | Mutate nhưng **không** ghi vào timeline. Dùng cho thao tác không phải nội dung — ví dụ `ensureSatellite` gán id satellite vào config. |
| `key` | Khóa gộp (coalesce). Cùng key trong cùng cửa sổ thời gian ⇒ gộp làm một entry. |
| `throttleMs` | Độ dài cửa sổ gộp. Mặc định `useHistoryStore().defaultThrottleMs()` = **300ms**. |

---

## 4. `useHistoryStore` — timeline

```js
state: {
  timeline: [],    // [{ patches, inversePatches, label, key, ts, selectedBefore, selectedAfter }]
  pointer: -1,     // vị trí entry sẽ được undo tiếp
  _silent: false,
  _coalesce: null, // { key, until }
}
```

`MAX_CAPACITY = 200` — vượt thì `shift()` bỏ entry cũ nhất và lùi `pointer`.

### 4.1 `record()` — 3 nhánh

```
① GỘP: cùng key và now < _coalesce.until và pointer >= 0
     last.patches        = compactPatches(last.patches.concat(patches))
     last.inversePatches = compactPatches(inversePatches.concat(last.inversePatches))
     last.selectedAfter  = selectedAfter        // selectedBefore giữ của entry đầu
     _coalesce.until     = now + throttleMs     // gia hạn cửa sổ
     → return, KHÔNG tạo entry mới

② CẮT NHÁNH: pointer < timeline.length - 1
     timeline.splice(pointer + 1)               // undo rồi sửa mới ⇒ bỏ nhánh redo

③ ĐẨY entry mới, pointer++
```

Chú ý thứ tự nối inverse ở nhánh ①: `inversePatches` **đứng trước** `last.inversePatches`. Undo phải gỡ thao tác mới nhất trước.

### 4.2 `compactPatches` — chống phình

Kéo dải padding sinh một `set` lên **cùng một path** mỗi khung hình. Nếu chỉ nối lại thì một cú kéo 2 giây tạo ra hàng trăm patch.

```js
// Chỉ giữ lần ghi CUỐI của mỗi path (kết quả không đổi vì apply là last-writer-wins)
// BỎ QUA nếu trong danh sách có insert/remove — index của chúng phụ thuộc thứ tự,
// dedupe sẽ làm sai.
```

### 4.3 `undo()` / `redo()`

```js
undo() {
  const entry = timeline[pointer]
  nodeStore.$patch((s) => {
    applyPatches(s, entry.inversePatches)
    scrubDomRefsFromPatches(s.nodes, entry.inversePatches)
    s.events.selected = filterExistingIds(s.nodes, entry.selectedBefore)
  })
  pointer--
  _coalesce = null      // xả cửa sổ gộp
}
```

`redo()` đối xứng: `pointer++` trước, dùng `entry.patches` và `entry.selectedAfter`.

Hai hàm dọn dẹp:

- `filterExistingIds` — bỏ id đã bị xóa khỏi selection để không trỏ vào node ma.
- `scrubDomRefsFromPatches` — patch nào tạo lại nguyên một node (`path.length === 2 && path[0] === 'nodes'`) thì set `node.dom = null`; component sẽ tự đăng ký lại khi remount.

### 4.4 `ignore(fn)` và `clear()`

```js
history.ignore(() => { … })   // chạy fn mà không ghi timeline (lồng nhau an toàn)
history.clear()               // xóa sạch — gọi trong nodeStore.hydrate()
```

`hydrate` **phải** clear: timeline cũ trỏ vào id của trang cũ, undo sẽ kéo node lạ vào trang mới.

---

## 5. Coalesce key trong thực tế

| Action | Key | Throttle |
|---|---|---|
| `changeStyle` / `changeConfig` / `changeSpecials` | `${ns}:${id}` | 300ms (mặc định) |
| Ghi theo state | `states:${id}:${st}:${ns}` | 300ms |
| `updateEvent` / `updateBinding` | `${ns}:${id}:${entryId}` | 300ms |
| `addEvent` / `addBinding` | `${ns}:${id}:add` | 0 |
| `resetStyle/Config/Specials` | key mặc định | `throttle: false` ⇒ luôn là entry riêng |
| `resetNodeToDefault` | `resetNodeToDefault:${id}` | 0 |
| `move` / `remove` / `duplicate` / `addNodeTree` … | = `label` | 0 |

Mẹo có chủ đích: `stripInlineTextStyles` được gọi với `key = '${target}:${id}'` — **trùng key** với lệnh đổi typography vừa chạy, nên hai thao tác gộp thành **một** entry. Người dùng đổi cỡ chữ rồi Ctrl+Z một lần là về đúng trạng thái cũ, không phải hai lần.

---

## 6. Phím tắt

Đăng ký trong `views/EditorV2.vue`:

```js
if (t.matches('input, textarea, [contenteditable="true"]')) return   // đang gõ thì thôi
Cmd/Ctrl + Z            → history.undo()
Cmd/Ctrl + Shift + Z    → history.redo()
Cmd/Ctrl + Y            → history.redo()
Cmd/Ctrl + S            → lưu tạm vào localStorage 'temp_page_source_v2'   // TODO: nối vào DB
```

Getter cho UI: `canUndo`, `canRedo`, `nextUndoLabel`, `nextRedoLabel`.

---

## 7. Bảng debug nhanh

| Triệu chứng | Nguyên nhân |
|---|---|
| Thao tác không undo được | Action mutate `this.nodes` trực tiếp thay vì qua `_commit`, hoặc truyền `silent: true` |
| Một cú kéo tạo 200 entry | Quên truyền `throttleMs`, hoặc `key` mỗi lần một khác |
| Hai thao tác riêng bị gộp làm một | Trùng `key` và cách nhau < 300ms — cân nhắc `throttle: false` |
| Undo xong canvas trắng | `hydrate` không gọi `history.clear()` ⇒ patch trỏ vào node của trang cũ |
| Undo xong overlay bám sai | `scrubDomRefsFromPatches` không quét tới node đó — kiểm tra hình dạng path của patch |
| Redo mất sau khi sửa | Đúng hành vi: sửa mới sau khi undo sẽ cắt nhánh redo (nhánh ② ở §4.1) |
