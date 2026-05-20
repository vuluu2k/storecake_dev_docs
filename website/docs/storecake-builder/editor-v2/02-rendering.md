---
sidebar_position: 3
title: Rendering Pipeline
---

# 02 — Rendering Pipeline

Cách Editor V2 render cây node ra DOM, reactive update khi store đổi, và mối liên hệ giữa Pinia/Vue/registry.

## 1. Render từ đỉnh xuống

```
[PageWrapper.vue]
  → import 'registerElements'   (side-effect: populate registry)
  → render template
      <NodeRenderer node-id="ROOT" />
            ↓
      [NodeRenderer.vue]
        computed.node = nodes['ROOT']
        computed.resolved = getDef('root').component = RootCanvasV2
        render <RootCanvasV2 :node="..." :node-id="ROOT" />
            ↓
      [RootCanvasV2.vue]
        v-for childId in node.data.nodes
          <NodeRenderer :node-id="childId" />
                ↓
          (recurse) [NodeRenderer] → getDef('flex-section') → FlexSectionV2
            ↓
          [FlexSectionV2.vue]
            v-for childId in node.data.nodes
              <NodeRenderer :node-id="childId" />
                    ↓
              (recurse) → FlexBlockV2 → ... → HeadingV2 (leaf)
```

`NodeRenderer` là **switcher đệ quy duy nhất**. Mọi container element (`Root`, `FlexSection`, `FlexBlock`, `Grid` tương lai) đều phải render children qua `<NodeRenderer>`. Element không được import nhau trực tiếp — luôn qua NodeRenderer để registry hoạt động.

## 2. NodeRenderer code chi tiết

```vue
<template>
  <component
    :is="resolved"
    v-if="node && resolved"
    :node="node"
    :node-id="nodeId"
  />
  <div v-else-if="node">[unknown: {{ node.data.type }}]</div>
</template>

<script>
import { mapState } from 'pinia'
import { useNodeStore } from '@/stores/editor_v2/node'
import { ROOT_NODE } from '@/composable/editor_v2/constants'
import { getDef } from '@/composable/editor_v2/registry'

export default {
  name: 'NodeRendererV2',
  props: {
    nodeId: { type: String, default: ROOT_NODE },
  },
  computed: {
    ...mapState(useNodeStore, ['nodes']),
    node() { return this.nodes[this.nodeId] || null },
    resolved() {
      if (!this.node) return null
      const def = getDef(this.node.data.type)
      if (!def) console.warn('[editor_v2] No component registered for type:', this.node.data.type)
      return def ? def.component : null
    },
  },
}
</script>
```

Hai computed phụ thuộc reactive vào `nodes[nodeId]`. Khi store đổi (add/move/remove), Pinia notify → Vue rerun `node()` → nếu type đổi thì `resolved()` cũng rerun → `<component :is>` swap.

Fallback `[unknown: xxx]` xuất hiện khi:
- Element file thiếu `export const meta`
- meta.type không match `node.data.type` (sai chính tả)
- `registerElements` chưa chạy (chỉ xảy ra nếu render trước PageWrapper)

## 3. Mỗi element render như thế nào

Lấy `FlexBlockV2.vue` làm ví dụ:

```vue
<template>
  <div
    ref="root"                                    ← LƯU DOM REF
    class="wk-flex-block"
    :class="{
      'wk-flex-block--drop-active': isDropTarget, ← REACTIVE class theo indicator
      'wk-node-selected': isSelected,             ← REACTIVE class theo selection
    }"
    :data-node-id="nodeId"
    data-node-type="flex-block"
    :data-element-placeholder="isEmpty ? 'true' : null"
    :style="blockStyle"                           ← REACTIVE style theo mergedStyle (cascade)
    draggable="true"
    @click.stop="onClick"
    @dragstart="onMoveDragStart"
    @dragend="onMoveDragEnd"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
  >
    <template v-if="!isEmpty">
      <NodeRenderer
        v-for="childId in node.data.nodes"
        :key="childId"
        :node-id="childId"
      />
    </template>
    <div v-else class="wk-node-placeholder">...</div>
  </div>
</template>
```

- `ref="root"` — `nodeBase` lifecycle dùng để gọi `setDOM(nodeId, this.$refs.root)`. DOM ref được lưu vào `node.dom`, sau đó Positioner gọi `getDOMInfo(node.dom)` để biết rect khi drag.
- `:data-node-id` / `data-node-type` — Positioner & EdgeOverlays đọc selector này để tìm element trong DOM.
- `draggable="true"` — bật native HTML5 drag.
- 5 event handlers: click, dragstart, dragend, dragover, dragenter. Tất cả đều bind từ mixin.

## 4. Reactive flow khi click select 1 node

```
1. User click vào FlexBlock
   ↓
2. @click.stop="onClick" — handler trong nodeBase mixin
   ↓
3. useNodeStore().setSelected(this.nodeId)
   ↓
4. store mutates: events.selected = [nodeId]
   ↓
5. Pinia notify watchers
   ↓
6. FlexBlock.isSelected re-compute (vì depends on events.selected)
   ↓
7. Template re-eval: :class={'wk-node-selected': true}
   ↓
8. CSS apply: outline 2px solid #3F8DFF
```

`@click.stop` cần thiết để click child không bubble lên parent. Nếu thiếu, click vào Heading bên trong Block sẽ chọn cả Heading rồi Block (Block thắng vì là handler sau).

`RootCanvas` dùng `@click.self` (chỉ nhận click trên ROOT, không phải bubbled) → click vào vùng trống deselect, click vào child không deselect.

## 5. Reactive flow khi update props qua trait (tương lai)

```
1. User nhập '32' vào Gap field
   ↓
2. @input="setProp(trait.key, $event)" trong TraitField
   ↓
3. nodeStore.changeStyle(id, { gap: 32 })       // default → current bp (style action)
   ↓
4. store mutates: nodes[id].data.responsive.laptop.style.gap = 32
   ↓
5. Pinia notify
   ↓
6. FlexBlock.mergedStyle re-compute → {gap: 32, ...} (cascade desktop-first)
   ↓
7. FlexBlock.blockStyle re-compute → { gap: '32px' }
   ↓
8. Template re-eval: :style={ gap: '32px' }
   ↓
9. CSS apply: gap thay đổi, browser re-layout
```

## 6. Reactive flow khi đổi breakpoint

```
1. User click WkTabs '768px' trên Header
   ↓
2. uiStore.setBreakpoint(768)
   ↓
3. store mutates: breakpointActive = 'tablet'
   ↓
4. Pinia notify
   ↓
5. PageWrapper.canvasStyle re-compute → { width: '768px' }
   ↓
6. .wk-editor-body width transition (CSS transition 200ms ease)
   ↓
7. MỌI element re-compute mergedStyle/mergedConfig (cascade theo bp mới)
   ↓
8. Section: sectionStyle re-compute → padding mobile (15px) thay desktop (24px)
   ↓
9. Block: blockStyle re-compute với responsive.tablet/mobile override (cascade)
   ↓
10. EdgeOverlays cập nhật rect (watch selected, watch breakpoint)
```

## 7. setDOM lifecycle

Mỗi element root có `ref="root"`. Mixin `nodeBase` cài 3 hook:

```js
mounted() {
  useNodeStore().setDOM(this.nodeId, this.$refs.root)
},
updated() {
  useNodeStore().setDOM(this.nodeId, this.$refs.root)
},
beforeUnmount() {
  useNodeStore().setDOM(this.nodeId, null)
},
```

`setDOM` trong store:
```js
setDOM(id, el) {
  const node = this.nodes[id]
  if (!node) return
  node.dom = el ? markRaw(el) : null
}
```

`markRaw` ngăn Vue track DOM element làm reactive (DOM không nên reactive). Sau đó Positioner và EdgeOverlays đọc `node.dom` để gọi `getBoundingClientRect()`.

Tại sao có cả `mounted` và `updated`?
- `mounted` — lần đầu render: ref được set sau DOM commit
- `updated` — khi node tree đổi (vd thêm child, reorder), Vue có thể re-create DOM với ref mới, phải set lại
- `beforeUnmount` — element bị remove khỏi cây → clear ref để store không giữ stale DOM

## 8. Vue reactivity caveat với mảng

`node.data.nodes` là mảng. Khi `addNode` làm:
```js
parent.data.nodes.splice(insertAt, 0, node.id)
```

Pinia (dùng Vue reactivity ref bên dưới) **track** splice nên template `v-for childId in node.data.nodes` re-render. OK.

Nhưng nếu replace bằng index assignment:
```js
parent.data.nodes[0] = 'fb_xxx'   // ❌ KHÔNG track (Vue 3 Proxy thì track, nhưng pinia option store dùng deep ref)
```

Best practice: dùng `push`, `splice`, `unshift`, hoặc reassign cả mảng `parent.data.nodes = [...parent.data.nodes, id]`.

## 9. Performance considerations

### Tránh chạy `getDef` quá nhiều

`NodeRenderer.resolved` compute mỗi lần `nodes[id]` đổi. Với 100 elements, mỗi action toàn cây có thể trigger 100 lần. Map lookup là O(1) nên không sao.

### Render lại cả nhánh khi thêm 1 leaf

Khi `addNode` vào parent, parent's `data.nodes` đổi → parent re-render → mọi child re-render mặc dù không liên quan. Vue 3 `v-for :key="childId"` giúp giữ child instance (không recreate), chỉ patch attr — vẫn tốt.

### Auto-scroll khi drag

`PageWrapper.mounted` cài listener `dragover` cấp document để scroll canvas khi cursor gần edge. Listener không trigger Vue re-render — chỉ mutate `canvas.scrollTop`. Nhẹ.

### Indicator overlay update

`onDragOver` ở mỗi container element gọi `positioner.computeIndicator(...)` mỗi frame native fire dragover (~30–60Hz). Positioner cache `currentTargetChildDimensions` để khỏi đo lại DOM mỗi lần. `setIndicator` chỉ notify store nếu `isDiff(newPosition)` (position thực sự đổi). Vẫn rất chạy được với 50 children.

## 10. Khi nào element TỰ render không qua NodeRenderer?

**Không bao giờ.** Mọi children phải qua `<NodeRenderer :node-id="childId" />`. Lý do:
- Cho phép registry swap component (vd flag dev sang FlexBlockV2Beta)
- Reactivity của `nodes[childId]` được kích hoạt qua NodeRenderer's `node()` computed
- Không cần biết type cụ thể của child — generic

Trường hợp duy nhất render trực tiếp: leaf node không có children (Heading, Text, Image, …) — không có `<template v-for>` nào để render.

## 11. RootCanvasV2 tại sao đặc biệt?

- Không có drag (root không kéo đi đâu được)
- Không có selection (click vào ROOT là deselect, dùng `@click.self`)
- Render `<PageEmpty />` khi `nodes.length === 0`
- Tự manage DOM ref (không dùng mixin vì khác pattern click)
- meta vẫn export với `type: 'root'` để registry nhận diện

Nếu sau này muốn root có thêm hành vi (vd canvas grid, ruler), sửa file này trực tiếp — không ảnh hưởng element khác.
