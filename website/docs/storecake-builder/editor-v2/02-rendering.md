---
sidebar_position: 3
title: 02 — Rendering
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
        computed.resolved = getDef('root').component = RootCanvas
        render <RootCanvas :node="..." :node-id="ROOT" />
            ↓
      [nodes/root_canvas/index.vue]
        v-for childId in node.data.nodes
          <NodeRenderer :node-id="childId" />
                ↓
          (recurse) [NodeRenderer] → getDef('flex-section') → FlexSection
            ↓
          [nodes/flex_section/index.vue]
            v-for childId in node.data.nodes
              <NodeRenderer :node-id="childId" />
                    ↓
              (recurse) → FlexBlock → ... → Heading / Text / Button (leaf)
```

`NodeRenderer` là **switcher đệ quy duy nhất**. Mọi container element (`Root`, `FlexSection`, `FlexBlock`, `Tab`, `List`, …) đều phải render children qua `<NodeRenderer>`. Element không được import nhau trực tiếp — luôn qua NodeRenderer để registry hoạt động.

## 2. NodeRenderer code

```vue
<template>
  <component :is="resolved" v-if="node && resolved" :node="node" :node-id="nodeId" />
  <div v-else-if="node">[unknown: {{ node.data.type }}]</div>
</template>

<script>
import { mapState } from 'pinia'
import { useNodeStore } from '@/stores/editor_v2/node'
import { ROOT_NODE } from '@/composable/editor_v2/constants'
import { getDef } from '@/composable/editor_v2/registry'

export default {
  name: 'NodeRendererV2',
  props: { nodeId: { type: String, default: ROOT_NODE } },
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
- Folder thiếu `index.vue` hoặc `meta.js`
- `meta.type` không match `node.data.type` (sai chính tả)
- `registerElements` chưa chạy (chỉ xảy ra nếu render trước PageWrapper mount)

## 3. Mỗi element render như thế nào

Lấy `nodes/flex_block/index.vue` làm ví dụ:

```vue
<template>
  <div
    ref="root"                                    ← LƯU DOM REF
    v-bind="nodeAttrs"                            ← data-node-id, data-node-type, draggable
    :class="{
      'wk-flex-block': true,
      'wk-flex-block--drop-active': isDropTarget, ← REACTIVE class theo indicator
      ...nodeClassMap,                            ← { wk-node-selected: isSelected, hidden }
    }"
    :data-element-placeholder="isEmpty ? 'true' : null"
    :style="blockStyle"                           ← { ...commonStyleData, ...layoutVars }
    v-on="{
      ...nodeListenersBase,                       ← { click: onClick }
      ...dragListeners,                           ← { dragstart, dragend } từ draggableNode
      dragover: onDragOver,                       ← từ nodeContainer
      dragenter: onDragEnter,
    }"
  >
    <template v-if="!isEmpty">
      <NodeRenderer v-for="childId in node.data.nodes" :key="childId" :node-id="childId" />
    </template>
    <NodePlaceholder v-else />
  </div>
</template>
```

- `ref="root"` — `nodeBase` lifecycle gọi `setDOM(nodeId, this.$refs.root)`. DOM ref được markRaw vào `node.dom`. Positioner gọi `getDOMInfo(node.dom)` khi drag.
- `v-bind="nodeAttrs"` → `data-node-id`, `data-node-type`, `draggable="true"` — Positioner & EdgeOverlays query selector theo `data-node-id`.
- `commonStyleData` precomputed từ `def.renderers` (xem [`07-traits-and-data.md`](./07-traits-and-data.md) section 5).

### Leaf element opt-in `editableText`

Vd `nodes/heading/index.vue`:

```vue
<template>
  <h2
    ref="root"
    v-bind="{ ...nodeAttrs, ...editableAttrs }"   ← editable thêm contenteditable+spellcheck+tabindex
    :class="nodeClassMap"
    :style="commonStyleData"
    v-on="{ ...nodeListenersBase, ...dragListeners, ...editableListeners }"
    v-text="mergedSpecials.text || 'Heading'"
  />
</template>
```

`editableAttrs` / `editableListeners` rỗng khi `meta.rules.isContentEditable !== true` → element inert, không có edge case.

### Stateful element

Vd `nodes/button/index.vue` có `meta.states.variants = [default, hover, active]`. Template:

```vue
<template>
  <button ref="root" v-bind="nodeAttrs" :class="nodeClassMap" :style="buttonStyle">
    <component :is="'style'" v-if="stateCss">{{ stateCss }}</component>
    {{ mergedSpecials.label || 'Button' }}
  </button>
</template>
```

`stateCss` từ `statefulNode` mixin compose ra rule:

```css
[data-node-id="button-abc123"]:hover { background:#0d6efd !important; color:#fff !important; }
[data-node-id="button-abc123"]:active { transform:scale(0.98) !important; }
```

`!important` để beat inline base style. `<style v-if>` chỉ render khi có variant override → no-op cho element không stateful.

### Container có satellite

Vd `nodes/tab/index.vue`:

```vue
<template>
  <div ref="root" v-bind="nodeAttrs" :class="nodeClassMap" :style="commonStyleData">
    <!-- tab items hiển thị qua data.nodes (vẫn editable trong Layers) -->
    <div class="wk-tab__list">
      <NodeRenderer v-for="id in node.data.nodes" :key="id" :node-id="id" />
    </div>
    <!-- tab-content là satellite, KHÔNG nằm trong data.nodes — render qua satelliteId -->
    <NodeRenderer v-if="satelliteId" :node-id="satelliteId" />
  </div>
</template>
```

`satelliteOwner` mixin tự `ensureSatellite()` ở `mounted` → tạo `tab-content` child + ghi id vào `config.satelliteId`. Satellite KHÔNG xuất hiện trong Layers panel (vì `data.nodes` của Tab không chứa nó), nhưng có DOM thật + selection riêng.

## 4. Reactive flow khi click select 1 node

```
1. User click vào FlexBlock
   ↓
2. @click.stop="onClick" — handler trong nodeBase mixin
   ↓
3. useNodeStore().setSelected(this.nodeId)
   ↓
4. store mutates: events.selected = [nodeId], events.state = meta.states.base || null
   ↓
5. Pinia notify watchers
   ↓
6. FlexBlock.isSelected re-compute (vì depends on events.selected)
   ↓
7. Template re-eval: :class={'wk-node-selected': true}
   ↓
8. CSS apply: outline 2px solid #3F8DFF
```

`@click.stop` (gắn sẵn trong `nodeListenersBase`) cần thiết để click child không bubble lên parent. `RootCanvas` dùng `@click.self` → click vào vùng trống deselect, click vào child không deselect.

## 5. Reactive flow khi update qua trait

```
1. User nhập '32' vào Gap field (GapTrait.vue)
   ↓
2. emit('change', 'gap', 32) — TraitField dispatcher
   ↓
3. TraitField.onChange('gap', 32) → resolve def.writes['gap'].target = 'style'
   ↓
4. nodeStore.changeStyle(id, { gap: 32 })
   ↓
5. _writeByPolicy(id, 'style', { gap: 32 }, defaultStyleSlot, currentBp)
   defaultStyleSlot('gap') = 'current'   (gap thuộc STYLE_ASYNC)
   ↓
6. _writeNs(id, 'style', { gap: 32 }, currentBp, ...)
   ↓
7. _commit('changeStyle', mutateFn, { key: 'style:id', throttleMs: 300 })
   ↓
8. mutateFn → writeNamespaceWithRec → allowedKeys check (pass) → rec.set([...path, 'gap'], 32)
   ↓
9. Pinia notify
   ↓
10. FlexBlock.mergedStyle re-compute → { gap: 32, ... } (cascade desktop-first)
    ↓
11. FlexBlock.blockStyle re-compute → { ...commonStyleData (gap renderer ghi gap: '32px'), ... }
    ↓
12. CSS apply: gap thay đổi, browser re-layout
```

## 6. Reactive flow khi đổi breakpoint

```
1. User click WkTabs 'Tablet' trên Header
   ↓
2. uiStore.setStateField('breakpointActive', 'tablet')
   ↓
3. Pinia notify
   ↓
4. PageWrapper.canvasStyle re-compute → { width: `${getBreakpointWidth('tablet')}px` } = '768px'
   ↓
5. .wk-editor-body width transition (CSS transition 200ms ease)
   ↓
6. MỌI element re-compute mergedStyle/mergedConfig (cascade theo bp mới)
   ↓
7. Section: sectionStyle re-compute → padding mobile (15px) thay desktop (24px)
   ↓
8. Block: blockStyle re-compute với responsive.tablet/mobile override (cascade)
   ↓
9. EdgeOverlays cập nhật rect (rAF loop tự đọc rect, không watch)
```

## 7. setDOM lifecycle

Mỗi element root có `ref="root"`. `nodeBase` cài 3 hook:

```js
mounted()       { useNodeStore().setDOM(this.nodeId, this.$refs.root) }
updated()       { useNodeStore().setDOM(this.nodeId, this.$refs.root) }
beforeUnmount() { useNodeStore().setDOM(this.nodeId, null) }
```

`setDOM`:
```js
setDOM(id, el) {
  const node = this.nodes[id]
  if (!node) return
  node.dom = el ? markRaw(el) : null
}
```

`markRaw` ngăn Vue track DOM element làm reactive. Sau đó Positioner và EdgeOverlays đọc `node.dom` để `getBoundingClientRect()`.

`setDOM` KHÔNG qua `_commit` — runtime state, không cần history.

## 8. Vue reactivity caveat với mảng

`node.data.nodes` là mảng. Khi `addNode` mutate qua `rec.insert(['nodes', parentId, 'data', 'nodes'], idx, childId)`, `applyPatches` gọi `arr.splice(idx, 0, childId)` — Pinia (Vue 3 Proxy) track splice nên template re-render OK.

KHÔNG dùng index assignment (`parent.data.nodes[0] = id`) hoặc replace cả mảng — `PatchRecorder.insert/remove` chỉ làm splice.

## 9. Performance considerations

### Tránh re-walk `def.renderers` mỗi render

`renderers` đã precompute trong `registerElement`. `nodeBase.commonStyleData` chỉ là `Object.assign({}, ...renderers.map(r => r(node)))` — O(N renderers) per node per re-render, không có lookup runtime.

### Map lookup là O(1)

`NodeRenderer.resolved` compute mỗi lần `nodes[id]` đổi. Với 100 elements, 100 lần lookup `getDef(type)` là O(100), không sao.

### Auto-scroll khi drag

`PageWrapper.mounted` cài listener `dragover` cấp document để scroll canvas khi cursor gần edge. Listener không trigger Vue re-render — chỉ mutate `canvas.scrollTop`.

### Indicator overlay update

`onDragOver` mỗi container gọi `positioner.computeIndicator(...)` mỗi frame native fire dragover (~30-60Hz). Positioner cache `currentTargetChildDimensions` để khỏi đo lại DOM mỗi lần. `setIndicator` chỉ notify store nếu `isDiff(newPosition)` (position thực sự đổi).

### Stateful CSS

`stateCss` compute mỗi khi `node.data.config[state]` đổi. Output là string CSS string — Vue render `<style>{{ stateCss }}</style>` rất rẻ, browser tự re-parse.

## 10. Khi nào element TỰ render không qua NodeRenderer?

**Không bao giờ.** Mọi children phải qua `<NodeRenderer :node-id="childId" />`. Cả satellite cũng render qua NodeRenderer — chỉ khác là id satellite lấy từ `config.satelliteId` thay vì `data.nodes`.

Lý do:
- Cho phép registry swap component (vd flag dev sang variant beta)
- Reactivity của `nodes[childId]` được kích hoạt qua NodeRenderer's `node()` computed
- Không cần biết type cụ thể của child — generic

Trường hợp duy nhất render trực tiếp: leaf node không có children (Heading, Text, Image, Icon, Button) — không có `<template v-for>`.

## 11. RootCanvas tại sao đặc biệt?

- Không có drag (root không kéo đi đâu được) — `meta.rules.locked: true`
- Không có selection bubble — `@click.self` deselect khi click vùng trống
- Render `<PageEmpty />` khi `nodes.length === 0`
- Ẩn khỏi Layers (`meta.rules.hideInLayer: true`)
- Không có overlay padding (`meta.rules.edgeOverlay: { padding: false }`)
- meta vẫn export với `type: 'root'` + `category: 'system'` để registry nhận diện

Nếu sau này muốn root có thêm hành vi (vd canvas grid, ruler), sửa file này trực tiếp — không ảnh hưởng element khác.
