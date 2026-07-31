# 13 — Inline text editing (Tiptap)

Double-click vào Heading / Text / Button / List item → sửa chữ ngay trên canvas, bôi đen để in đậm hoặc đổi màu. Chương này giải thích toàn bộ luồng đó.

Trước đây phần này chạy bằng `document.execCommand`; nay đã thay bằng **Tiptap** (ProseMirror). Vì vậy nội dung cũ vẫn phải đọc được — schema được thiết kế để parse lại đúng những gì `execCommand` từng sinh ra.

---

## 1. Bốn mảnh

```
composable/editor_v2/tiptap.js       schema + helper strip mark
mixins/editableText.js               dblclick → tạo editor → commit khi blur
stores/editor_v2/edittext.js         editor đang sống + trạng thái B/I/U của vùng chọn
elements/EditTextToolbar.vue         nút bấm, điều khiển editor qua store
```

---

## 2. Schema: cố ý chỉ có inline

```js
const InlineDocument = Document.extend({ content: 'inline*' })

inlineExtensions() {
  return [InlineDocument, Text, HardBreak, Bold, Italic, Underline, Strike, TextColor]
}
```

Node gốc chứa nội dung inline **trực tiếp** — không bọc `<p>`. Nhờ vậy `editor.getHTML()` trả về đúng hình dạng đang lưu ở `specials.text`:

```
a <strong>b</strong><br>c
```

Nếu dùng `Document` mặc định, output sẽ là `<p>a <strong>b</strong></p>` và mọi nội dung cũ sẽ bị bọc thêm một tầng.

### 2.1 Mark `textColor` tự viết

Bold/Italic/Underline/Strike dùng extension sẵn có. Màu chữ thì không: nó phải hỗ trợ **cả màu đặc lẫn gradient**, và phải đọc lại được ba dạng HTML cũ.

```js
renderHTML({ HTMLAttributes }) {
  const value = HTMLAttributes.value
  if (String(value).includes('gradient')) {
    style = `background:${value};-webkit-background-clip:text;background-clip:text;` +
            '-webkit-text-fill-color:transparent;color:transparent;'
  } else {
    style = `color:${value};`
  }
  return ['span', { style }, 0]
}
```

`parseHTML` nhận diện ba dạng:

| Dạng | Nhận biết bằng |
|---|---|
| Gradient | `span` có `background-clip: text` (hoặc `-webkit-background-clip`) |
| Màu đặc | `span` có `style.color` khác `transparent` |
| Cũ (execCommand) | `<font color="…">` |

---

## 3. Bật inline-edit cho một element

Hai điều kiện, thiếu một là inert:

**① Meta:**

```js
rules: { isContentEditable: true }
```

**② Template:**

```vue
<component :is="mergedSpecials.htmlTag" ref="root"
  v-bind="{ ...nodeAttrs, ...editableAttrs }"
  v-on="{ ...nodeListenersBase, ...dragListeners, ...editableListeners }">

  <EditorContent v-if="isEditing" :editor="textEditor" />
  <span v-else ref="editableContent" v-html="displayText || 'Enter your heading here'" />
</component>
```

Rule tắt ⇒ `editableAttrs` và `editableListeners` đều rỗng ⇒ mixin không làm gì. Nhờ vậy `Image` và `Video` dùng chung `nodeLeaf` mà không phải trả giá.

Chú ý `ref="editableContent"`: `startEdit` đọc `innerHTML` của nó để lấy **nội dung đang thật sự hiển thị**, kể cả placeholder mặc định — nếu đọc thẳng `specials.text` thì double-click vào element chưa từng gõ chữ sẽ ra ô trống.

### 3.1 `displayText` — vá một khác biệt của trình duyệt

```js
displayText() {
  return (this.mergedSpecials?.text || '').replace(/(<br\s*\/?>)(\s*)$/gi, '$1&#8203;$2')
}
```

`<br>` ở cuối một `span` thường không chiếm chiều cao; nhưng trong contenteditable của Tiptap, nó hiện thành một dòng trống. Chèn zero-width space sau `<br>` cuối làm hai chế độ nhìn giống nhau.

---

## 4. Vòng đời một phiên chỉnh sửa

```
dblclick
 └─ editableText.startEdit()
      ├─ initial = $refs.editableContent.innerHTML  (chụp trước khi template đổi nhánh)
      ├─ isEditing = true
      ├─ editTextStore.setIsEditText(true)          → ElementToolbar đổi sang EditTextToolbar
      ├─ createInlineEditor({ content: initial, editorProps, callbacks })
      ├─ editTextStore.setActiveTextEditor(editor)  (markRaw)
      └─ _syncEditState(editor)

… người dùng gõ / bôi đen …
      onSelectionUpdate / onUpdate → _syncEditState()
        editTextStore.updateEditTextState({ bold, italic, underline, strikethrough, color })

kết thúc (Enter / Escape / blur / bỏ chọn node)
 └─ finishEdit()
      ├─ nếu editTextPickerOpen → RETURN (đang mở picker màu, đừng thoát)
      ├─ text rỗng → _finishEditCleanup() + nodeStore.remove(nodeId)
      └─ ngược lại → changeSpecials(nodeId, { text: editor.getHTML() })
                     + _finishEditCleanup()
```

### 4.1 `editorProps` — hai override

```js
handleKeyDown: (view, event) => {
  if (event.key === 'Enter' && !event.shiftKey) { finishEdit(); return true }
  if (event.key === 'Escape')                   { finishEdit(); return true }
  return false
}
```

Enter kết thúc, **Shift+Enter** để xuống dòng (`HardBreak`).

```js
handlePaste: (view, event) => {
  const text = event.clipboardData.getData('text/plain')
  // dán plain text, mỗi xuống dòng thành một hard break
}
```

Không cho dán HTML — tránh mang cả rừng style từ Word/Docs vào canvas.

### 4.2 Ba đường thoát

| Lối ra | Cơ chế |
|---|---|
| Enter / Escape | `handleKeyDown` |
| Click ra ngoài | `onBlur: () => this.finishEdit()` |
| Chọn node khác trong lúc đang mở picker màu | Watcher `isNodeSelected` — hạ cờ `editTextPickerOpen` rồi `finishEdit()`, nếu không toolbar sẽ kẹt ở chế độ edit |

Ngoài ra `beforeUnmount` cũng dọn: node bị xóa giữa chừng thì editor được `destroy()` và store reset về mặc định, tránh toolbar trỏ vào editor đã chết.

---

## 5. `useEditTextStore`

```js
state: {
  isEditText: false,          // ElementToolbar dùng cờ này để đổi nội dung
  editTextPickerOpen: false,  // đang mở picker màu → hoãn finishEdit
  editTextState: { bold, italic, underline, strikethrough, color },
  activeTextEditor: null,     // instance Tiptap, LUÔN markRaw
}
```

`activeTextEditor` **bắt buộc** `markRaw`: bọc reactive quanh instance ProseMirror sẽ vỡ ngay.

---

## 6. `EditTextToolbar`

Thay chỗ nội dung mặc định của `ElementToolbar` khi `isEditText === true`.

```vue
<div class="flex gap-…" @mousedown.prevent>
```

`@mousedown.prevent` ở container là mấu chốt: giữ focus trên contenteditable, nếu không mỗi lần bấm nút sẽ blur → `finishEdit` → editor biến mất trước khi lệnh chạy.

### 6.1 Bốn nút toggle

```js
const TOGGLE_METHOD = {
  bold: 'toggleBold', italic: 'toggleItalic',
  underline: 'toggleUnderline', strikeThrough: 'toggleStrike',
}
toggle(command) { this.editor.chain().focus()[TOGGLE_METHOD[command]]().run() }
```

Trạng thái active đọc từ `editTextState` (do `_syncEditState` cập nhật), không hỏi editor mỗi lần render.

### 6.2 Picker màu — phần tinh vi nhất

Vấn đề: khi kéo trong picker màu, vùng chọn màu xanh của trình duyệt che mất màu vừa áp dụng, và picker đang giữ focus DOM.

Cách giải:

```
MỞ picker
 ├─ lưu range hiện tại: _savedRange = editor.state.selection
 ├─ editor.commands.blur()               → tắt highlight native, xem màu rõ
 ├─ thêm class 'wk-fill-preview' vào DOM của editor
 └─ đăng ký mousedown ở CAPTURE phase để bắt click ra ngoài

KÉO trong picker
 └─ applyColor(color):
      chain().setTextSelection(_savedRange).setMark('textColor', { value: color }).run()
      KHÔNG gọi focus() — refocus mỗi khung hình sẽ làm đứt thao tác kéo.
      ProseMirror vẫn áp mark lên range đã lưu dù editor không focus,
      và chạy lại chỉ cập nhật giá trị mark tại chỗ (không lồng thêm span).

ĐÓNG picker
 ├─ gỡ class + gỡ listener
 └─ nextTick → chain().setTextSelection(range).focus().run()   → quay lại chỉnh sửa
```

Vì sao listener phải ở **capture phase**? Node trên canvas `click.stop` để chọn chính nó, sẽ nuốt mất outside-click ở bubble phase của `SettingDialog`. Capture chạy trước mọi `stopPropagation`.

`onOutsidePointerDown` bỏ qua click bên trong `.setting-dialog-wrapper` và bên trong `[data-wk-portal-root]` (dropdown của Wk mở từ trong picker).

### 6.3 Màu hiển thị trên nút

```js
currentColor() {
  const selColor = this.editTextState.color
  if (selColor && selColor !== '#000000' && selColor !== 'rgb(0, 0, 0)') return selColor
  return getStyle(this.node, '--text-color') || '#000000'   // fallback: trait cấp node
}
```

---

## 7. Trait cấp node **thắng** định dạng từng đoạn

Người dùng bôi đỏ vài chữ, rồi đổi màu chữ ở panel bên phải. Nếu không xử lý, mấy chữ đỏ vẫn đỏ và trông như panel bị hỏng.

`TraitField.onChange` xử lý bằng cách xóa inline mark:

```js
if (STRIP_INLINE_KEYS.has(key) && !opts?.stateful && def.rules?.isContentEditable) {
  store.stripInlineTextStyles(id, { key: `${target}:${id}`, traitKey: key, traitValue: value })
}
```

`STRIP_INLINE_KEYS = { 'textGlobalStyle', '--text-color', '--text-style' }`.

Xóa có chọn lọc — trait nào chỉ xóa mark tương ứng:

```js
stripInlineTextStyles(id, { traitKey, traitValue }) {
  if (traitKey === '--text-color')      stripped = stripColorMarks(html)
  else if (traitKey === '--text-style') stripped = stripStyleMarks(html, traitValue || '')
  else                                  stripped = stripInlineMarks(html)   // textGlobalStyle → xóa sạch
  if (stripped !== html) this.changeSpecials(id, { text: stripped }, { throttle: false })
}
```

| Helper (`tiptap.js`) | Xóa gì | Giữ gì |
|---|---|---|
| `stripInlineMarks(html)` | Mọi mark + mọi wrapper `<span>`/`<font>` | Chỉ text và `<br>` |
| `stripColorMarks(html)` | Span màu / gradient / `<font color>` | Bold, italic, underline, strike |
| `stripStyleMarks(html, activeStyles)` | Chỉ tag khớp `activeStyles` (`bold→<strong>`, `italic→<em>`, `underline→<u>`, `line-through→<s>`) | Màu và các style **không** nằm trong `activeStyles` |

Ví dụ `stripStyleMarks`: `--text-style` được đặt thành `"italic"` thì chỉ `<em>` bị gỡ; một `<strong>` do người dùng bôi đen vẫn còn.

Cả ba dùng chung `reconstructHTML(parent, shouldStrip)` — đi cây DOM, "mở bọc" element nào khớp và giữ nguyên phần còn lại, escape text (`&`, `<`, `>`).

### 7.1 Vì sao chỉ một lần undo

`stripInlineTextStyles` được gọi với `key = '${target}:${id}'` — **trùng** coalesce key của lệnh đổi typography vừa chạy. Hai patch gộp vào một entry history. Người dùng Ctrl+Z một lần là về đúng trạng thái trước đó.

---

## 8. Bảng debug nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Double-click không vào chế độ sửa | Thiếu `rules.isContentEditable`, hoặc template chưa bind `editableListeners` |
| Bấm nút toolbar là editor tắt | Thiếu `@mousedown.prevent` trên container toolbar |
| Xóa hết chữ thì node biến mất | Đúng thiết kế — `finishEdit` gọi `nodeStore.remove` khi text rỗng |
| Kéo picker màu làm editor mất | Đang gọi `focus()` trong `applyColor` |
| Chọn node khác mà toolbar kẹt ở chế độ edit | Watcher `isNodeSelected` không chạy, hoặc `editTextPickerOpen` còn `true` |
| Nội dung dán vào kèm cả style ngoài | `handlePaste` bị bỏ qua / trả `false` |
| Nội dung cũ bị bọc thêm `<p>` | Dùng `Document` mặc định thay vì `InlineDocument` |
| Đổi màu ở panel mà chữ bôi đỏ vẫn đỏ | `STRIP_INLINE_KEYS` không chứa key đó, hoặc node thiếu `isContentEditable` |
| Đổi typography phải Ctrl+Z hai lần | `stripInlineTextStyles` truyền sai `key` ⇒ không gộp coalesce |
