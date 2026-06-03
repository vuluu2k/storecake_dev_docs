# 09 — AI Page Generation

> **STATUS: IMPLEMENTED (FE pipeline) + BE in spec** — Phase 1 pipeline FE đã có đủ ở `composable/editor_v2/ai/` (13 module). BE Elixir partner đang implement theo `composable/editor_v2/ai/BACKEND_PLAN.md`. Phase 2/3 còn ở backlog.

Tài liệu này mô tả pipeline AI gen hiện tại + contracts + cách extend.

> **Liên quan chặt:**
> - [`07-traits-and-data.md`](./07-traits-and-data.md) — schema từ registry + trait
> - [`05-extending.md`](./05-extending.md) — quy trình element mới (registry tự cập nhật → LLM tự biết)
> - [`01-architecture.md`](./01-architecture.md) — pipeline node store mà commit reuse 100%

---

## 1. Goals (Phase 1) — DONE

- User mô tả site → AI sinh **multi-page** + commit từng page qua pageApi.
- AI output đi qua đúng pipeline canvas (`createNodeTree` → `addNodeTree`) hoặc headless persist (`buildPagePayload` → `pageApi.save`) — không có code path riêng.
- Thêm element mới (`nodes/<name>/{meta.js, ai.js}`) → AI tự biết, KHÔNG cần update prompt/schema/BE.
- Validate `loud` trước commit → re-prompt với lỗi cụ thể.

## 2. Inventory `composable/editor_v2/ai/`

| File | Export | Trách nhiệm |
|---|---|---|
| `schema.js` | `dumpRegistryForLLM(opts)`, `listElementSchemas(opts)` | Glob `nodes/*/meta.js` + `nodes/*/ai.js` → map `{ type → { schema, ai } }` cho LLM tool input |
| `validate.js` | `validateDef(def)`, `validatePage(page)`, `validateSite(siteDef)` | Loud validation — type tồn tại, isRootOnly placement, allowedKeys, canDropInto, container check, forbidden fields, events |
| `commit.js` | `commitAISectionToCanvas(def, opts)`, `commitAISectionsToCanvas(sections, opts)` | Apply vào page ĐANG MỞ qua `useNodeStore().addNodeTree` — có undo/redo |
| `buildPage.js` | `buildPagePayload(sections)` | Headless lắp payload đúng shape `nodeStore.serialize()` để POST trực tiếp |
| `commitSite.js` | `commitAISite(siteDef, opts)` | Multi-page commit: build payload từng page → pageApi.create/save |
| `aiChat.js` | `createAiChatSession({ siteId, locale, onState, chatFn })` | UI state machine cho chat intake (history, brief gom dần) |
| `aiSiteApi.js` | `default = new AiSiteApi()` | REST HTTP transport — chat / generate / status |
| `aiSiteChannel.js` | `createAiSiteChannel(siteId, { socket })` | Phoenix WS transport — stream live `section` events |
| `aiSiteStream.js` | `createAiSiteRunner(transport, opts)`, `createRealPersistence()` | Runner orchestrator: pull events, persist từng page khi `PAGE_DONE` |
| `mockStream.js` | `createMockAiSiteTransport`, `createMockChat`, `createLocalPersistence` | Local mock cho dev/test |
| `protocol.js` | `AI_SITE_TOPIC`, `AI_EVENTS`, `AI_COMMANDS`, `AI_ROUTES` | Constants FE/BE chia sẻ |
| `selftest.js` | `runAiGenSelfTest({ live, siteId, render })` | Smoke test pipeline end-to-end |
| `BACKEND_PLAN.md` | – | Spec BE Elixir partner |

---

## 3. Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│ FE editor_v2                                                    │
│                                                                 │
│   [AI button Header] → AIGenerateModal                          │
│                            │                                    │
│        ┌───────────────────┼───────────────────┐                │
│        ▼                   ▼                   ▼                │
│   chat intake         site generate       page lazy regen       │
│   (aiChat)            (commitSite)        (commit)              │
│        │                   │                   │                │
│        ▼                   ▼                   ▼                │
│   POST /chat          POST /generate     POST /generate_page    │
│       OR              OR WS ai_site:<id>      OR section event  │
│       │                   │                                     │
│       └──────► aiSiteApi  │   aiSiteChannel  ◄──────┘           │
│                           │                                     │
│                           ▼                                     │
│                  createAiSiteRunner                             │
│                  (xử lý events SITE_PLAN/SECTION/PAGE_DONE)     │
│                           │                                     │
│      ┌────────────────────┼───────────────────────┐             │
│      ▼                    ▼                       ▼             │
│  validateDef         buildPagePayload         persistence       │
│      │                    │                       │             │
│      ▼                    ▼                       ▼             │
│   (chấp nhận)      payload đúng shape      pageApi.save()       │
│                    serialize()                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                     ┌────────────────┐
                     │ BE Elixir      │  (separate service)
                     │ BuilderxApi    │  ai_controller.ex (TODO)
                     │   + WS         │  ai/anthropic_client.ex
                     │   + REST       │  ai/quota.ex
                     └────────────────┘
                            │
                            ▼
                     Anthropic API
                     (Claude Sonnet, tool use)
```

---

## 4. JSON Contracts

### 4.1 Def shape (canonical)

```ts
type AiDef = {
  type: string                        // MUST exist trong registry
  name?: string                       // sidebar label override
  style?:    Record<string, any>      // base CSS only
  config?:   Record<string, any>      // base data only
  specials?: Record<string, any>      // text, href, htmlId, …
  events?:   AiEvent[]                // base behaviors (validated)
  bindings?: AiBinding[]              // base data refs
  children?: AiDef[]                  // only for isContainer types
  satellite?: AiSatelliteSeed         // optional — seed config cho satellite (vd tab-item style)
}
```

**Forbidden fields trong LLM output** (validateDef reject):
`id`, `parent`, `nodes`, `responsive`, `dom`

Hệ thống tự derive: `id` ← `genId(type)`, `parent` ← `addNodeTree`, `nodes` ← `children`, `responsive` ← seeded by store/factory, `dom` ← lifecycle.

### 4.2 Page shape

```ts
type AiPage = {
  name: string                        // hiển thị Layers/sidebar
  slug: string                        // URL path
  isHome?: boolean                    // đúng 1 page có true
  sections: AiDef[]                   // mỗi entry là 1 def gốc (non-section auto-wrap qua buildPagePayload)
}
```

### 4.3 Site shape

```ts
type AiSiteDef = {
  pages: AiPage[]                     // đúng 1 isHome, slug duy nhất
}
```

### 4.4 Channel events (FE ← BE, Phoenix WS)

```ts
// Topic: ai_site:<siteId>
AI_EVENTS = {
  SITE_PLAN:  'site_plan',   // { pages: [{ name, slug, isHome }] }
  PAGE_START: 'page_start',  // { slug }
  SECTION:    'section',     // { slug, def, index? }
  PAGE_DONE:  'page_done',   // { slug }
  SITE_DONE:  'site_done',   // { }
  ERROR:      'error',       // { message, slug? }
}
```

### 4.5 Channel commands (FE → BE)

```ts
AI_COMMANDS = {
  GENERATE_SITE: 'generate_site',  // { prompt?, brief?, locale?, hints? }
  GENERATE_PAGE: 'generate_page',  // { slug, prompt? } — lazy regen
  CANCEL:        'cancel',         // {}
}
```

### 4.6 REST routes

```
POST   /sites/:id/ai/chat            { messages }      → { reply, done, brief? }
POST   /sites/:id/ai/generate        { prompt|brief }  → siteDef (non-stream fallback)
POST   /sites/:id/ai/generate_page   { slug, prompt }  → { sections: AiDef[] }
GET    /sites/:id/ai/jobs/:jobId                       → { phase, progress }
```

### 4.7 AiBrief shape

```ts
type AiBrief = {
  businessName?: string
  industry?:     string
  goal?:         string
  audience?:     string
  tone?:         string
  pages?:        Array<{ name, slug, isHome?, purpose? }>   // sitemap AI đề xuất
  brand?:        { primaryColor?, secondaryColor?, fonts? }
  notes?:        string
}
```

Chat intake gom dần `brief` qua N round → feed vào `generate_site`.

---

## 5. Building blocks (FE) — đã implement

### 5.1 `dumpRegistryForLLM(opts) → { type → schema }`

```js
import { buildElementSchema, buildSatelliteSchema, applyStateSchema } from '@/components/editor_v2/components/trait/fields/definitions'
import { EVENTS_AI } from '@/components/editor_v2/components/trait/fields/eventDefinitions'

const metaModules = import.meta.glob('@/components/editor_v2/nodes/*/meta.js', { eager: true })
const aiModules = import.meta.glob('@/components/editor_v2/nodes/*/ai.js', { eager: true })

export const dumpRegistryForLLM = ({ onlySidebar = true, withHints = true } = {}) => {
  const out = {}
  for (const path in metaModules) {
    const meta = metaModules[path]?.meta
    if (!meta || (onlySidebar && meta.showInSidebar === false)) continue
    if (satelliteTypes.has(meta.type)) continue   // satellite không bao giờ AI emit
    out[meta.type] = {
      type: meta.type,
      label: meta.label,
      isContainer: !!meta.isContainer,
      isRootOnly: !!(meta.rules?.isRootOnly),
      schema: applyStateSchema(buildElementSchema(meta), meta),
      satellite: meta.satellite ? satelliteSeedSchema(meta.satellite) : null,
      events: meta.events ? EVENTS_AI : null,
      ai: withHints ? aiByFolder[folderOf(path)] : null,
    }
  }
  return out
}
```

**Glob `meta.js` + `ai.js`** (không glob `index.vue`) → an toàn TDZ, AI gen chunk không bundle Vue.

### 5.2 `validateDef(def, depth=0, parentType=null) → string[]`

Loud — không silent fix.

Checks:
1. Shape: object có `type` string
2. Type exists trong registry
3. Factory phải có (warn nếu thiếu — defaults sẽ không seed)
4. `isRootOnly` chỉ ở `depth === 0`
5. `canDropInto(srcType, parentType)`
6. `children` chỉ tồn tại trên `isContainer`
7. Mọi key trong `style/config/specials` phải có trong `allowedKeys[ns]` (cho phép empty Set = legacy)
8. Forbidden fields: `id, parent, nodes, responsive, dom`
9. Events: structural validate qua `validateEvents` theo `meta.events`
10. Recurse children

Return `string[]` — empty = valid. Throw KHÔNG được — caller (BE re-prompt) cần list lỗi.

### 5.3 `commitAISectionToCanvas(def, opts)` — đẩy vào page đang mở

```js
export const commitAISectionToCanvas = (def, { parentId = ROOT_NODE, index, validate = true } = {}) => {
  if (validate) {
    const errs = validateDef(def, 0, null)
    if (errs.length) throw new Error(`section bị từ chối:\n  - ${errs.join('\n  - ')}`)
  }
  const tree = createNodeTree(def)
  useNodeStore().addNodeTree(tree, parentId, index)
  return tree.rootNodeId
}
```

Reuse pipeline drag-drop → render ngay, có undo/redo, auto-wrap non-section root.

### 5.4 `buildPagePayload(sections) → payload`

Headless lắp payload đúng shape `nodeStore.serialize()` để POST qua `pageApi.save(pageId, payload)` mà KHÔNG load page vào editor.

```js
import { ROOT_NODE } from '../constants'
import { createNodeTree } from '../createNode'
import { wrapInBlankSection } from '../nodeFactory'
import { isRootOnlyType } from '../registry'

export const buildPagePayload = (sections = []) => {
  const nodes = { [ROOT_NODE]: seedRoot() }
  const childIds = []
  for (const def of sections) {
    let tree = createNodeTree(def)
    if (!isRootOnlyType(def.type)) tree = wrapInBlankSection(tree)
    Object.assign(nodes, tree.nodes.reduce((acc, n) => { acc[n.id] = toPersist(n); return acc }, {}))
    childIds.push(tree.rootNodeId)
    nodes[tree.rootNodeId].data.parent = ROOT_NODE
  }
  nodes[ROOT_NODE].data.nodes = childIds
  return { schemaVersion: 1, rootNodeId: ROOT_NODE, nodes }
}
```

### 5.5 `commitAISite(siteDef, opts)` — multi-page persist

```js
export const commitAISite = async (siteDef, { siteId, onProgress } = {}) => {
  const errs = validateSite(siteDef)
  if (errs.length) throw new Error(`siteDef invalid:\n  - ${errs.join('\n  - ')}`)
  const results = []
  for (const page of siteDef.pages) {
    onProgress?.({ phase: 'page', slug: page.slug })
    const created = await pageApi.create(siteId, { name: page.name, slug: page.slug, isHome: page.isHome })
    const payload = buildPagePayload(page.sections)
    await pageApi.save(created.id, payload)
    results.push(created)
  }
  return results
}
```

### 5.6 `createAiChatSession({ siteId, locale, onState, chatFn })`

UI state machine cho chat intake — track history, gom brief.

```js
const session = createAiChatSession({
  siteId: '123',
  locale: 'vi',
  chatFn: (messages) => aiSiteApi.chat(siteId, messages),
  onState: (state) => { /* re-render */ },
})
session.send('Tôi muốn site khoá tiếng Anh')
session.state.brief        // brief gom dần
session.state.done         // boolean — AI đã đủ info để generate
```

### 5.7 `createAiSiteRunner(transport, opts)` — streaming orchestrator

```js
const transport = createAiSiteChannel(siteId, { socket })   // hoặc createMockAiSiteTransport()
const runner = createAiSiteRunner(transport, {
  onState: (state) => console.log(state.phase, state.progress),
  persistence: createRealPersistence(),                      // hoặc createLocalPersistence() cho dev
})
await runner.generate({ brief })

// runner reactive trên:
//   SITE_PLAN → tạo skeleton pages
//   SECTION   → buffer per slug, validate, append payload
//   PAGE_DONE → persistence.savePage(slug, payload)
//   SITE_DONE → emit done
//   ERROR     → emit error
```

`createRealPersistence` dùng `pageApi`. `createLocalPersistence` dùng IndexedDB (dev mock).

### 5.8 `runAiGenSelfTest({ live, siteId, render })`

Smoke test end-to-end. `live=false` dùng mock transport; `live=true` cần `siteId` thực + WS auth.

```js
import { runAiGenSelfTest } from '@/composable/editor_v2/ai/selftest'
await runAiGenSelfTest({ live: false, render: true })
// → dùng mock → render kết quả lên canvas đang mở để mắt verify
```

---

## 6. Building blocks (BE Elixir) — TODO theo BACKEND_PLAN.md

### 6.1 Endpoint `POST /api/v2/ai/generate_site`

- Auth: JWT (giống các endpoint khác)
- Rate limit: theo `user_id`, e.g. 30 req/hour
- Quota: theo `site_id` + plan
- Response: hoặc stream qua Phoenix channel `ai_site:<siteId>` hoặc non-stream `siteDef`

### 6.2 Anthropic integration

- Provider: Claude Sonnet 4.6/4.7 (latest)
- **Tool use** thay vì free-form JSON. Define 1 tool:
  ```json
  {
    "name": "generate_section",
    "description": "Generate a section using only registered element types.",
    "input_schema": { /* type-discriminated union — 1 variant per type, từ dumpRegistryForLLM */ }
  }
  ```
- Force tool choice: `tool_choice: { type: "tool", name: "generate_section" }`

### 6.3 Streaming partial JSON

Anthropic streaming tool use → BE parse section khi đủ → emit `SECTION` event ngay → FE commit section đó vào payload page → user thấy progress.

### 6.4 Re-prompt loop

```
attempt 1: call LLM → BE light validate shape
  if invalid → attempt 2 with error feedback
  return def

attempt 2 (max): call LLM with prior messages + "previous output had errors: [...]. Fix."
  return def or error
```

FE-side `validateDef` chạy lần cuối. Vẫn fail → return error to FE → toast UI.

---

## 7. Prompt strategy

### 7.1 System prompt structure (BE)

```
You are a landing page designer for the BuilderX editor.
You produce JSON page definitions using only the registered element types.

# Available element types
<inject `dumpRegistryForLLM()` as compact JSON>

# Output rules
- Use the `generate_section` tool. The `def` argument must be a recursive tree.
- For each element, only emit `type`, `style`, `config`, `specials`, `events`, `children`, `satellite`.
- NEVER emit: id, parent, nodes, responsive, dom, isCanvas, hidden, custom.
- Base values only (no per-breakpoint overrides — user tunes mobile/tablet by hand).
- `style` keys must be valid CSS-ish writeKeys from the element's trait schema.
- `specials` is for content/structural fields (text, href, htmlId, label).
- `config` is for data fields (contentWidth, isPaddingLinked).
- For stateful elements (Button): use `config.default/hover/active = {...}` for state overrides.
- For owner elements (Tab, List): style satellite via `satellite: { style, config, specials }`.
- Page must have at least 3 sections (header / content / cta).
- Use only colors/fonts from the brief. Image URLs: `https://placehold.co/WIDTHxHEIGHT`.

# Examples
<inject 2-3 few-shot examples từ ai.examples + templates/hero.js>
```

### 7.2 Few-shot examples (BE hardcode hoặc DB)

- 1 example hero section (Section → Block → Heading + Button)
- 1 example pricing section (Section → Row of 3 Blocks)
- 1 example product detail (Section + Image + Heading + Button)

Source: `templates/hero.js#def` + `ai.examples` trong từng `nodes/<name>/ai.js`.

### 7.3 User prompt → brief

Chat intake gom dần qua `aiChat.js`:
- `tone` ("formal/casual"), `audience`, `goal` (CTA: signup/buy/contact)
- `pages` (sitemap) — AI propose, user accept/reject
- `brand` (color hex, font family)

Brief feed vào `generate_site` thay vì raw prompt.

---

## 8. Error handling matrix

| Error code | Trigger | UI |
|---|---|---|
| `validation_failed` | `validateDef`/`validatePage`/`validateSite` fail sau N attempts BE | "AI sinh page không hợp lệ. Thử lại với prompt rõ hơn." + show first 3 error details (dev mode) |
| `llm_timeout` | Anthropic timeout > 30s | "Hệ thống AI đang quá tải, thử lại sau" |
| `llm_refused` | Anthropic refuse to answer | "Prompt không hợp lệ, nhập nội dung khác" |
| `quota_exceeded` | User vượt quota tháng | "Hết lượt generate tháng này" + upsell |
| `internal` | BE crash / network | "Có lỗi xảy ra, đã ghi log" |
| `cancel` | User huỷ giữa chừng | Closed silently, partial pages giữ nguyên |

---

## 9. Cost & quota (BE concern)

### 9.1 Estimate per site (Phase 1)
- Input tokens: ~5K (system prompt + schema + few-shot + brief)
- Output tokens: ~8K (3-5 pages × ~2K/page)
- Sonnet pricing: ~$0.015 + $0.060 = **~$0.08/site**
- Buffer 30% cho re-prompts: **~$0.10/site**

### 9.2 Quota (suggested)
- Free tier: 1 site/month
- Pro: 10/month
- Business: unlimited (soft limit 100)

### 9.3 Cache
- Key = `hash(brief + schema_version)`
- TTL 7 ngày
- Catch test/dup prompts; real users rarely hit

---

## 10. Test plan

### 10.1 Unit (FE)
- `dumpRegistryForLLM()` → mọi registered type có entry; `flex-section.isRootOnly === true`
- `validateDef(validDef)` → empty
- `validateDef({ type: 'unknown' })` → error
- `validateDef({ type: 'heading', children: [...] })` → error (heading not container)
- `validateDef({ type: 'heading', style: { fontWeghts: 400 } })` → error (typo)
- `validateDef({ type: 'flex-block', children: [{ type: 'flex-section' }] })` → error (root-only nested)
- `validateDef({ type: 'tab', children: [...] })` → satellite không phải trong children
- `validatePage({ name, slug, sections: [validDef] })` → empty
- `validateSite({ pages: [{ isHome: true, ...}, { isHome: true, ...}] })` → error (multiple home)

### 10.2 Integration
- Mock transport: `createMockAiSiteTransport` emit SITE_PLAN + N×SECTION + PAGE_DONE → runner buffer + persist
- `runAiGenSelfTest({ live: false, render: true })` → render mock site lên canvas, undo Cmd-Z hoạt động

### 10.3 Manual QA
- 10 brief khác nhau (landing course / SaaS / portfolio / restaurant / event / blog / pricing / about / contact / 404)
- Mỗi brief generate 3 lần → đánh giá:
  - Page render được không?
  - Content liên quan brief không?
  - Layout designer-quality (gap đều, hierarchy rõ)?
  - Edit tay sau có break gì không?
- Target: 80% pages "usable as starting point"

---

## 11. Roadmap

### Phase 1 (DONE — FE)
- [x] `dumpRegistryForLLM` schema dump từ registry
- [x] `validateDef/Page/Site` loud validation
- [x] `commitAISectionToCanvas` + `commitAISectionsToCanvas` canvas commit
- [x] `buildPagePayload` headless persist
- [x] `commitAISite` multi-page
- [x] `aiChat` state machine + intake
- [x] `aiSiteApi` REST + `aiSiteChannel` WS transports
- [x] `aiSiteStream` runner + persistence
- [x] `mockStream` local mock
- [x] `protocol.js` contract constants
- [x] `selftest.js` smoke verification

### Phase 1 (TODO — BE)
- [ ] `ai_controller.ex` REST endpoints
- [ ] WS handler `ai_site:<siteId>`
- [ ] `anthropic_client.ex` LLM integration
- [ ] `quota.ex` rate limit + billing
- [ ] Few-shot DB / hardcode
- [ ] Cache layer

### Phase 1 (TODO — FE UX)
- [ ] `AIGenerateButton.vue` mount trong Header
- [ ] `AIGenerateModal.vue` intake UI
- [ ] Progress UI (per-page + per-section indicator)
- [ ] "Retry / Cancel" controls
- [ ] Error toast + error detail dev mode

### Phase 2 (sau khi Phase 1 stable)

> "Add section by AI / edit selected node by AI"

- **Add section:** prompt → LLM 1 section def → `commitAISectionToCanvas(def, { parentId: ROOT, index: idxAfterSelected })`
- **Edit selected:** reverse-build def từ subtree đang chọn (strip id/parent/responsive) → pass vào prompt + instruction → LLM trả def mới → 2 chiến lược:
  - **Replace:** `remove(oldId)` + `commitAISectionToCanvas(newDef, parentId, oldIndex)` — mất selection
  - **Patch (Phase 3):** LLM trả `{ nodeId, style?, config?, specials? }[]` thay vì def → loop `changeStyle/changeConfig/changeSpecials` — giữ ID, history sạch

### Phase 3 (polish)

- Streaming partial JSON từ Anthropic tool use streaming → SECTION event ngay khi parse được → page tự lớn lên trên canvas
- Few-shot examples loaded từ DB (5-10 best pages của user) thay vì hardcode
- Image gen: Phase 3a placeholder lib (Unsplash API), Phase 3b DALL-E/SDXL
- Quota UI ("còn 8 lượt hôm nay"), upsell
- A/B test prompts: track keep-vs-discard rate

---

## 12. Open questions

1. **Replace vs Append canvas có nội dung?**
   - Canvas trống → append; có nội dung → confirm dialog "Replace / Add to end / Cancel"

2. **Multi-language prompt?**
   - System prompt English, user prompt forward nguyên ngữ
   - Brief gom dần qua chat — language auto-detect

3. **Save AI brief vào history?**
   - Phase 1 không; Phase 2 "Recent prompts" dropdown

4. **PII trong user prompt?**
   - Cần check legal (Anthropic policy + GDPR) trước production

5. **Designer review mode?**
   - "AI generate xong show preview, user click Accept/Reject từng section"
   - Phase 2 feature, big UX win

---

## 13. AI-ready metadata requirements

Mọi element mới fill đủ `ai.js` để LLM pick được:

### Cho mọi element

```js
export const ai = {
  description: '1-2 câu naming semantic role',
  hints: {
    useWhen:     ['concrete scenario 1', 'concrete scenario 2'],
    avoidWhen:   ['scenario where alt element is better (NAME the alt)'],
    contentTips: ['tone / length / casing'],
  },
  examples: [
    { description: 'what it illustrates', def: { type: '...', /* valid def */ } },
  ],
  semantics: ['typography' | 'cta' | 'navigation' | 'commerce' | 'above-fold-ok' | ...],
}
```

Trait `select` options nên có `description` per value:

```js
options: [
  { label: 'Primary',   value: 'primary',   description: 'Main CTA, max 1 per section' },
  { label: 'Secondary', value: 'secondary', description: 'Supporting action, pair with primary' },
]
```

### Container (`isContainer: true`)

```js
expectedChildren: {
  typical: ['flex-block', 'heading', 'text', 'button'],
  patterns: [
    'heading + text + button (CTA)',
    'image + heading + text (feature card)',
  ],
},
minChildren: 0,
maxChildren: 20,
layoutHints: {
  whenChildren: {
    1:     { flexDirection: 'column' },
    '2-3': { flexDirection: 'row', gap: '24px' },
    '4+':  { flexDirection: 'row', gap: '16px' },
  },
},
```

### Storefront (commerce / data-bound)

```js
dataBindings: {
  available: [
    { path: 'product.title',  type: 'short_text' },
    { path: 'product.price',  type: 'currency' },
    { path: 'product.image',  type: 'image_url' },
  ],
  required: ['product.title', 'product.price'],
},
pageContext: ['product-detail', 'product-listing'],
```

---

## 14. Dependency invariant on element registry

**Khi thêm element mới:**
1. Drop `nodes/<name>/{meta.js, index.vue, ai.js}` — auto-pickup
2. `dumpRegistryForLLM()` next call tự include element
3. LLM next gen có thể dùng element
4. **KHÔNG cần update BE prompt, schema, hay channel handler**

**Đây là invariant cực quan trọng** — break = AI feature trở thành tech debt mỗi lần thêm element.

**Khi đổi trait schema:**
- Generated pages cũ trong DB có thể bị invalid keys (registry mới khác lúc gen)
- Cần migration giống user pages

---

## 15. Files sẽ tạo / sửa khi triển khai UX

| File | Action | Phase |
|---|---|---|
| `src/composable/editor_v2/ai/*` | DONE | 1 |
| `src/components/editor_v2/components/ai/AIGenerateButton.vue` | NEW | 1 |
| `src/components/editor_v2/components/ai/AIGenerateModal.vue` | NEW | 1 |
| `src/components/editor_v2/components/ai/AIChatInterview.vue` | NEW (intake UI) | 1 |
| `src/components/editor_v2/components/ai/AIProgressOverlay.vue` | NEW (stream progress) | 1 |
| `src/components/editor_v2/Header.vue` | EDIT — mount AIGenerateButton | 1 |
| (BE Elixir) `lib/builderx_api_web/controllers/ai_controller.ex` | NEW | 1 |
| (BE Elixir) `lib/builderx_api_web/channels/ai_site_channel.ex` | NEW | 1 |
| (BE Elixir) `lib/builderx_api/ai/anthropic_client.ex` | NEW | 1 |
| (BE Elixir) `lib/builderx_api/ai/quota.ex` | NEW | 1 |
| Migration: `ai_generation_log` table | NEW | 1 |
| `src/composable/editor_v2/ai/inverse.js` (reverse-build def) | NEW | 2 |
| `AIGenerateModal.vue` | EDIT — mode toggle (generate/add/edit) | 2 |
| `src/composable/editor_v2/ai/patch.js` (PATCH strategy) | NEW | 3 |

---

## 16. Skills liên quan (Claude Code)

Local skill `builderx_spa-editor-v2-ai-gen` — pipeline reference + namespace rules + forbidden fields list + LLM prompt template.

Trigger keyword: "ai generate page", "llm gen editor", "prompt to canvas".

Tham khảo file `composable/editor_v2/ai/BACKEND_PLAN.md` cho spec BE partner.
