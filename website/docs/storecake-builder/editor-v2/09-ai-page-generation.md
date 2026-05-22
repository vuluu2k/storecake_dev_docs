---
sidebar_position: 9
title: 09 — AI Page Generation (Plan)
---

# 09 — AI Page Generation (Plan)

Plan tích hợp tính năng **AI generate page** vào editor_v2. Tài liệu này KHÔNG phải implementation — là blueprint để khi triển khai cứ theo phase mà làm, không phải design lại từ đầu.

> **Liên quan chặt:**
> - [`07-traits-and-data.md`](./07-traits-and-data.md) — registry + trait schema = nguồn sự thật cho LLM tool schema
> - [`05-extending.md`](./05-extending.md) — quy trình thêm element (mỗi element mới → registry tự cập nhật → LLM tự biết)
> - [`01-architecture.md`](./01-architecture.md) — pipeline render/store mà AI gen sẽ reuse 100%

---

## 1. Goals & Non-goals

### Goals
- User nhập 1 prompt (vd "landing page bán khoá tiếng Anh") → AI sinh ra page hoàn chỉnh trên canvas.
- AI output **đi qua đúng pipeline DnD** đang dùng (`createNodeTree` → `addNodeTree`) — không có code path riêng. Mọi feature của editor (undo, drag, trait edit, save) hoạt động ngay với node do AI tạo.
- Khi thêm element mới (`nodes/XxxV2.vue` + meta), AI tự biết element đó tồn tại — KHÔNG cần update prompt/schema/BE.

### Non-goals (v1)
- Streaming UI (section appear dần khi LLM emit) — defer Phase 3
- Image generation (DALL-E/SDXL) — v1 dùng placeholder URL
- AI tune responsive per-breakpoint — chỉ generate base, user tune mobile/tablet bằng tay
- AI edit selected node — Phase 2
- AI add 1 section vào page hiện tại — Phase 2

---

## 2. Roadmap 3 phase

### Phase 1 — One-shot full page (MVP, 1-2 sprint)

> "Nhập prompt → generate cả page → commit lên canvas trống/replace. User sửa tay tiếp như drag thường."

- 1 button "AI Generate" trong Header editor_v2 → mở Modal nhập prompt
- Confirm dialog nếu canvas đang có nội dung (Replace / Cancel)
- Loading state khi BE call LLM
- "🔄 Try again" giữ prompt, gọi lại LLM
- Generate **base values only** — không có `responsive[bp]` overrides
- Validation reject hallucination → BE re-prompt tối đa 2 lần → vẫn fail → surface error

### Phase 2 — Iterative editing (sau khi Phase 1 chạy stable)

> "Add section by AI / edit selected node by AI"

- **Add section:** prompt → LLM trả về `def` của **1 section** (`type: 'flex-section'`) → `addNodeTree(tree, ROOT_NODE, indexAfterSelected)`
- **Edit selected:** reverse-build def từ subtree đang chọn (strip id/parent/responsive) → pass vào prompt cùng instruction → LLM trả về def mới → 2 chiến lược:
  - **Replace strategy** (đơn giản): `remove(oldId)` + `addNodeTree(newTree, parentId, oldIndex)` — mất selection/scroll
  - **Patch strategy** (Phase 3): LLM trả về `{ nodeId, style?, config?, specials? }[]` thay vì def → loop `changeStyle/changeConfig/changeSpecials` — giữ ID, history sạch

### Phase 3 — Polish (sau khi Phase 2 prove value)

- Streaming partial JSON (Anthropic tool use streaming) → mỗi section parse được commit ngay → page "tự lớn lên"
- Few-shot examples loaded từ DB (5-10 best pages của user) thay vì hardcode trong prompt
- Image gen (Phase 3a — placeholder lib; Phase 3b — DALL-E/SDXL nếu có budget)
- Quota UI ("còn 8 lượt hôm nay"), upsell
- A/B test prompts: track keep-vs-discard rate → tune system prompt

---

## 3. Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (editor_v2)                                            │
│                                                                 │
│   [AI button] → [Modal prompt] → POST /api/v2/ai/generate-page  │
│                                       │                         │
│                                       ▼                         │
│   ┌─────────────────────────────────────────────────┐           │
│   │ Request body:                                   │           │
│   │   { prompt, registry_schema, examples?, site_id}│           │
│   └─────────────────────────────────────────────────┘           │
│                                       │                         │
│                                       ▼                         │
│                              ┌─────────────────┐                │
│                              │ Backend Elixir  │                │
│                              │ BuilderxApi     │                │
│                              └─────────────────┘                │
│                                       │                         │
│                                       ▼                         │
│                              ┌─────────────────┐                │
│                              │ Anthropic API   │                │
│                              │ (Claude Sonnet) │                │
│                              │ + tool use      │                │
│                              └─────────────────┘                │
│                                       │                         │
│                                       ▼                         │
│   Response: { def: {...}, usage: {...} }                        │
│                                       │                         │
│                                       ▼                         │
│   validateDef(def)  ─────  errors? ──► show error / re-prompt   │
│                                       │                         │
│                                       ▼ pass                    │
│   createNodeTree(def) → useNodeStore().addNodeTree(tree, ROOT)  │
│                                       │                         │
│                                       ▼                         │
│   Canvas re-renders (NodeRenderer) — undo/redo/drag all work    │
└─────────────────────────────────────────────────────────────────┘
```

### Vì sao BE là thin proxy?
- API key Anthropic sống ở BE (không leak ra browser).
- Rate limit / quota / billing đặt ở BE.
- **Schema sống ở FE** (registry = nguồn sự thật). FE post `registry_schema` lên BE mỗi request → BE không bao giờ out-of-sync khi FE thêm element mới.
- Trade-off: request lớn hơn ~5-10KB. Chấp nhận được — không phải hot path.

---

## 4. JSON Contracts

### 4.1 FE → BE request

```ts
POST /api/v2/ai/generate-page
{
  prompt: string                       // user prompt
  site_id: string                      // for quota/billing
  registry_schema: RegistrySchema      // dump từ dumpRegistryForLLM()
  examples?: ExampleDef[]              // optional few-shot (Phase 1: empty hoặc 2-3 hardcoded)
  context?: {                          // optional — Phase 2 dùng cho edit
    selected_def?: Def
    mode?: 'generate' | 'add_section' | 'edit_selected'
  }
}
```

### 4.2 BE → FE response (success)

```ts
{
  ok: true
  def: Def                             // recursive { type, style?, config?, specials?, children? }
  usage: {
    input_tokens: number
    output_tokens: number
    cost_usd: number
  }
  attempts: number                     // 1 = first try, 2 = re-prompted once, ...
}
```

### 4.3 BE → FE response (failure)

```ts
{
  ok: false
  error: {
    code: 'validation_failed' | 'llm_timeout' | 'llm_refused' | 'quota_exceeded' | 'internal'
    message: string                    // user-facing message
    details?: string[]                 // validateDef errors nếu code === 'validation_failed'
    raw_response?: any                 // raw LLM output for debugging (dev only)
  }
}
```

### 4.4 Def shape (canonical contract)

```ts
type Def = {
  type: string                          // MUST exist trong registry
  style?:    Record<string, any>        // base CSS only
  config?:   Record<string, any>        // base data only
  specials?: Record<string, any>        // text, href, htmlId, ...
  children?: Def[]                      // only for isContainer types
}
```

**Forbidden fields trong LLM output** (BE strip nếu LLM hallucinate):
`id`, `parent`, `nodes`, `responsive`, `dom`, `events`, `isCanvas`, `hidden`, `custom`

→ Những field này hệ thống tự derive: `id` ← `genId(type)`, `parent` ← `addNodeTree`, `nodes` ← `children`, `responsive` ← seeded by store, `isCanvas` ← `meta.isContainer` qua registry factory.

### 4.5 RegistrySchema shape

```ts
type RegistrySchema = Record<string, ElementSchema>
type ElementSchema = {
  type: string
  label: string
  category: string
  isContainer: boolean
  rules: { isRootOnly: boolean }
  traits: TraitSchema[]
}
type TraitSchema = {
  key: string
  target: 'style' | 'config' | 'specials'
  type: string                          // 'text'|'number'|'color'|'select'|'spacing'|...
  options?: any[]                       // chỉ có khi type === 'select'
  default?: any
}
```

---

## 5. Building blocks cần viết (FE)

Mỗi block đứng độc lập, test riêng được. Phase 1 cần đủ 3 cái.

### 5.1 `dumpRegistryForLLM()` — `src/composable/editor_v2/aiSchema.js` (new)

Walk registry → flatten element metadata + trait schemas → return JSON-serializable `RegistrySchema`.

**Pseudocode:**
```js
import { getDef } from './registry'
import { buildElementSchema } from '@/components/editor_v2/components/trait/fields/definitions'

export const dumpRegistryForLLM = () => {
  const out = {}
  // registry tác file src/composable/editor_v2/registry.js
  const registry = getFullRegistry() // dump toàn bộ def objects
  
  for (const type in registry) {
    const def = registry[type]
    const jsonSchema = buildElementSchema(def.meta) // use buildElementSchema
    out[type] = {
      type,
      label: def.label,
      category: def.category,
      isContainer: !!def.isContainer,
      rules: { isRootOnly: !!(def.rules && def.rules.isRootOnly) },
      schema: jsonSchema,  // JSON Schema từ buildElementSchema
      traits: flattenTraits(def.traits),  // fallback for reference
    }
  }
  return out
}

const flattenTraits = (traits) => {
  // Walk general → advanced groups → attributes/fields
  // → flat list của { key, target, type, options?, default?, description? }
}
```

**Why `buildElementSchema`:** Lấy cùng logic element validate dùng khi CI + store guard, tránh dupicate / desync.

**Test:** call sau `registerElements` chạy → kiểm tra mọi registered type có entry → kiểm tra `flex-section` có `isRootOnly: true` → kiểm tra schema valid (Ajv).

### 5.2 `validateDef(def, depth?, parentType?)` — `src/composable/editor_v2/aiSchema.js`

Trả về `string[]` (rỗng = valid). Check:
1. `def.type` exists trong registry
2. `isRootOnly` types chỉ ở `depth === 0`
3. `canDropInto(type, parentType)` nếu có parent
4. `children` chỉ tồn tại trên `meta.isContainer === true`
5. Mọi key trong `style`/`config`/`specials` PHẢI có trong `traits[*].key` của type đó (catch typo + hallucination)
6. Recurse vào children

**Quan trọng:** validate LOUD (return errors), không silent fix. Store auto-wrap + auto-seed là cho user mistakes, không phải cho LLM — LLM mistakes phải feedback lại để re-prompt.

### 5.3 `commitAIPage(def)` — `src/composable/editor_v2/aiSchema.js`

```js
import { createNodeTree } from './createNode'
import { useNodeStore } from '@/stores/editor_v2/node'
import { ROOT_NODE } from './constants'

export const commitAIPage = (def) => {
  const errors = validateDef(def)
  if (errors.length) {
    throw new AIGenerationError(errors)
  }
  const tree = createNodeTree(def)
  useNodeStore().addNodeTree(tree, ROOT_NODE)
  return tree.rootNodeId
}
```

→ Mọi feature đi qua hàm này. Không có "path riêng cho AI" ở chỗ nào khác.

### 5.4 UI Components (FE)

- `components/editor_v2/components/ai/AIGenerateButton.vue` — button trên Header
- `components/editor_v2/components/ai/AIGenerateModal.vue` — prompt input + loading + error display + "Try again"
- API call helper: dùng `useApipost` từ `@/composable/fetch` (xem skill `builderx_spa-api`)

---

## 6. Building blocks cần viết (BE Elixir)

### 6.1 Endpoint `POST /api/v2/ai/generate-page`

- Auth: JWT (giống các endpoint khác)
- Rate limit: theo `user_id`, e.g. 30 requests/hour
- Quota: theo `site_id` + plan, e.g. 50 generations/month free tier

### 6.2 LLM integration

- Provider: Anthropic Claude Sonnet 4.6 hoặc 4.7 (newest available). Lý do: structured output (tool use) tốt + cheap hơn Opus + đủ smart cho task này.
- **Tool use** thay vì free-form JSON. Define 1 tool:
  ```json
  {
    "name": "generate_page",
    "description": "Generate a landing page tree using only registered element types.",
    "input_schema": {
      "type": "object",
      "properties": { "def": { /* JSON schema sinh từ registry_schema */ } },
      "required": ["def"]
    }
  }
  ```
- Force tool choice: `tool_choice: { type: "tool", name: "generate_page" }`
- BE convert `registry_schema` → JSON schema cho tool input (type-discriminated union: 1 variant per `type`).

### 6.3 Re-prompt loop

```
attempt 1:
  call LLM → get def → light validate (shape check)
  if shape invalid → attempt 2 with error feedback
  return def

attempt 2 (max):
  call LLM with prior messages + user message "previous output had these errors: [...]. Fix and retry."
  return def or error
```

→ FE-side `validateDef` chạy lần cuối. Nếu vẫn fail → return error to FE.

---

## 7. Prompt strategy

### 7.1 System prompt structure

```
You are a landing page designer for the BuilderX editor.
You produce JSON page definitions using only the registered element types.

# Available element types
<inject registry_schema as compact JSON>

# Output rules
- Use the `generate_page` tool. The `def` argument must be a recursive tree.
- For each element, only emit `type`, `style`, `config`, `specials`, `children`.
- NEVER emit: id, parent, nodes, responsive, dom, events, isCanvas, hidden, custom.
- `style` keys must be valid CSS-ish keys from the element's trait schema.
- `specials` is for content/structural fields (text, href, htmlId, className).
- `config` is rare — only when the trait says target=config.
- Page must have at least 3 sections (header / content / cta).
- Use only colors from the schema enum if provided.
- Image URLs: use https://placehold.co/WIDTHxHEIGHT for placeholders.

# Examples
<inject 2-3 few-shot examples>
```

### 7.2 Few-shot examples (hardcode trong BE Phase 1)

- 1 example hero section (Section → Block → Heading + Button)
- 1 example pricing section (Section → Row of 3 Blocks)
- 1 example full minimal page (Header + Hero + Features + CTA + Footer)

→ Source: lấy từ buildBlankSection / buildRowSection trong `nodeFactory.js`, expand thêm content.

### 7.3 User prompt

Forward nguyên text user nhập. KHÔNG paraphrase. Có thể prepend "Generate a landing page for: " nếu user nhập ngắn.

---

## 8. Error handling matrix

| Error code | Trigger | UI |
|---|---|---|
| `validation_failed` | `validateDef` fail sau 2 attempts | "AI sinh ra page không hợp lệ. Thử lại với prompt rõ hơn." + show first 3 error details (dev mode) |
| `llm_timeout` | Anthropic timeout > 30s | "Hệ thống AI đang quá tải, thử lại sau ít phút." |
| `llm_refused` | Anthropic refuse to answer (e.g. policy) | "Prompt không hợp lệ. Vui lòng nhập nội dung khác." |
| `quota_exceeded` | User vượt quota tháng | "Hết lượt generate tháng này. Nâng cấp gói để dùng tiếp." + upsell link |
| `internal` | BE crash / network | "Có lỗi xảy ra, đã ghi lại log." |

---

## 9. Cost & quota

### 9.1 Estimate per call (Phase 1)
- Input tokens: ~3K (system prompt + schema + few-shot + user prompt)
- Output tokens: ~2K (a full page def)
- Sonnet pricing (2026): ~$0.003 input + $0.015 output = **~$0.04/page**
- Buffer 30% cho re-prompts: **~$0.05/page**

### 9.2 Quota (suggested)
- Free tier: 5 generations/month
- Pro: 100/month
- Business: unlimited (soft limit 1000)
- Track in BE DB, expose `GET /api/v2/ai/quota` for FE display

### 9.3 Cache
- Key = `hash(prompt + schema_version)` → return cached `def` nếu trùng
- TTL 7 ngày
- Mostly catch test/duplicate prompts; real users rarely hit cache

---

## 10. Test plan

### 10.1 Unit (FE)
- `dumpRegistryForLLM()` → mọi registered type có entry, `flex-section.rules.isRootOnly === true`
- `validateDef(validDef)` → empty array
- `validateDef({ type: 'unknown' })` → error containing `"unknown"`
- `validateDef({ type: 'heading', children: [...] })` → error (heading not container)
- `validateDef({ type: 'heading', style: { fontWeghts: 400 } })` → error (typo not in trait keys)
- `validateDef({ type: 'flex-block', children: [{ type: 'flex-section' }] })` → error (root-only nested)

### 10.2 Integration (FE + BE local)
- Happy path: prompt → BE → real LLM → def → commit → canvas có ≥ 3 sections
- LLM hallucinates type → BE re-prompt → 2nd attempt valid → commit
- LLM hallucinates twice → FE shows validation_failed error
- Network timeout → llm_timeout UI

### 10.3 Manual QA
- 10 prompts khác nhau (landing course / SaaS / portfolio / restaurant / event / blog / pricing / about / contact / 404) → mỗi prompt generate 3 lần → đánh giá:
  - Page có render được không?
  - Content có liên quan prompt không?
  - Layout có "designer-quality" không (gap đều, hierarchy rõ)?
  - Edit tay sau có break gì không?
- Target: 80% pages "usable as starting point" (user keep > 50% sections sau khi review).

---

## 11. Open questions (quyết khi bắt đầu)

1. **Replace vs Append canvas trống/có nội dung?**
   - Đề xuất: canvas trống → append; có nội dung → confirm dialog "Replace / Add to end / Cancel".

2. **Multi-language prompt?**
   - LLM hiểu Vietnamese OK. System prompt nên viết English (model tuning tốt hơn) hoặc Vietnamese (chất lượng tương đương, easier maintain)?
   - Đề xuất: system prompt English, user prompt forward nguyên ngữ.

3. **Save AI prompts vào history?**
   - Phase 1 không cần. Phase 2 nên có "Recent prompts" dropdown trong modal.

4. **Anonymize PII trong user prompt trước khi gửi Anthropic?**
   - Compliance với Anthropic policy + GDPR. Cần check legal trước khi production.

5. **Image URLs: dùng placeholder, stock library (Unsplash API), hay user upload?**
   - Phase 1: hardcoded placeholder (`placehold.co`). Phase 3 mới integrate stock/AI gen.

6. **Designer review mode?**
   - "AI generate xong show preview, user click Accept/Reject từng section trước khi commit"?
   - Phase 2 feature, có thể là big UX win.

---

## 11.5. Element metadata requirements (DO NOW, every new element)

Để AI gen hoạt động tốt khi launch, **mọi element mới từ bây giờ phải fill đủ AI-ready metadata trong `meta` export**. Fields đều optional ở type-level nên không break gì, nhưng required ở code review.

### Required cho mọi element

```js
export const meta = {
  // ... existing identity fields ...

  description: '1-2 sentences naming semantic role. LLM picks element by purpose, not by label.',

  aiHints: {
    useWhen:      ['concrete scenario 1', 'concrete scenario 2'],
    avoidWhen:    ['scenario where alt element is better (NAME the alt)'],
    contentTips:  ['tone / length / casing convention'],
  },

  examples: [
    { description: 'what it illustrates',
      def: { type: '...', /* valid def */ } },
    // 1-3 examples, each must pass validateDef
  ],

  semantics: ['typography' | 'cta' | 'navigation' | 'commerce' | 'above-fold-ok' | ...],

  traits: {
    general: [{
      attributes: [{
        key: 'text',
        // ...
        isContent: true,                       // ★ flag content fields
        contentType: 'short_text',             // short_text|long_text|url|image_url|rich_text
        description: 'per-field guidance beyond label',
      }],
    }],
  },
}
```

Trait `select` options must include `description` per value:

```js
options: [
  { label: 'Primary', value: 'primary',
    description: 'Main CTA, high contrast. Max 1 per section.' },
  { label: 'Secondary', value: 'secondary',
    description: 'Supporting action. Pair with primary.' },
]
```

### Required cho container (`isContainer: true`)

```js
expectedChildren: {
  typical: ['flex-block', 'heading', 'text', 'button'],
  patterns: [
    'heading + text + button (CTA pattern)',
    'image + heading + text (feature card pattern)',
  ],
},
minChildren: 0,                                // optional hard constraint
maxChildren: 20,
layoutHints: {                                 // defaults that scale with child count
  whenChildren: {
    1:     { flexDirection: 'column' },
    '2-3': { flexDirection: 'row', gap: '24px' },
    '4+':  { flexDirection: 'row', gap: '16px' },
  },
},
```

### Required cho storefront elements (commerce / data-bound)

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

### Vì sao làm bây giờ

| Cost (per element) | Benefit (when AI launches) |
|---|---|
| ~30s viết description | LLM pick đúng element theo purpose, không bốc theo `label` |
| ~1min viết aiHints + examples | Few-shot pattern matching → +30% output quality |
| ~1min viết trait descriptions | LLM hết hallucinate enum value, biết khi nào dùng cái nào |
| **Total: ~3min/element** | **Save: 1-2 giờ/element retrofit chaos lúc launch sprint** |

### Tham khảo / template

- Skill `builderx_spa-editor-v2-element` — checklist + template file đầy đủ
- `src/components/editor_v2/nodes/HeadingV2.vue`, `FlexSectionV2.vue`, `FlexBlockV2.vue` — đã retrofit, dùng làm living examples
- Skill ref: `.claude/skills/builderx_spa-editor-v2-element/references/template-ai-ready-element.md`

---

## 12. Dependency on element registry

**Khi thêm element mới (xem `05-extending.md`):**
1. Drop file `nodes/XxxV2.vue` với `meta` export
2. `registerElements.js` auto-pickup
3. `dumpRegistryForLLM()` lần next call sẽ tự include element mới
4. LLM lần next gen có thể dùng element mới
5. **KHÔNG cần update BE, prompt, hay schema bằng tay**

→ Cost của việc thêm element ko bị inflate bởi AI feature. Đây là invariant cực quan trọng — break invariant này = AI feature trở thành tech debt mỗi lần thêm element.

**Khi đổi trait schema của element (rename key, đổi target, đổi options):**
- Generated pages cũ trong DB có thể bị invalid keys (vì registry mới khác lúc gen)
- Cần migration tương tự khi đổi schema cho user pages — không phải vấn đề mới của AI gen

---

## 13. Files sẽ tạo / sửa khi triển khai

| File | Action | Phase |
|---|---|---|
| `src/composable/editor_v2/aiSchema.js` | NEW — `dumpRegistryForLLM`, `validateDef`, `commitAIPage` | 1 |
| `src/components/editor_v2/components/ai/AIGenerateButton.vue` | NEW | 1 |
| `src/components/editor_v2/components/ai/AIGenerateModal.vue` | NEW | 1 |
| `src/components/editor_v2/Header.vue` | EDIT — mount AIGenerateButton | 1 |
| `src/api/aiApi.js` | NEW — `generatePage(prompt, opts)` wrapper | 1 |
| (BE Elixir) `lib/builderx_api_web/controllers/ai_controller.ex` | NEW | 1 |
| (BE Elixir) `lib/builderx_api/ai/anthropic_client.ex` | NEW | 1 |
| (BE Elixir) `lib/builderx_api/ai/quota.ex` | NEW | 1 |
| Migration: `ai_generation_log` table | NEW | 1 |
| `src/composable/editor_v2/aiSchema.js` | EDIT — add reverse-build def from node | 2 |
| `AIGenerateModal.vue` | EDIT — add mode toggle (generate/add/edit) | 2 |

---

## 14. Skills liên quan (Claude Code)

Đã viết sẵn 3 skill local trong `builderx_spa/.claude/skills/`:
- `builderx_spa-editor-v2-element` — build element mới
- `builderx_spa-editor-v2-tree` — JSON tree contract (DnD + AI dùng chung)
- `builderx_spa-editor-v2-ai-gen` — AI gen pipeline chi tiết (có sẵn code template cho `dumpRegistryForLLM`, `validateDef`)

→ Khi bắt đầu Phase 1: trigger skill `builderx_spa-editor-v2-ai-gen` (keyword "ai generate page", "llm gen editor", "prompt to canvas") → có sẵn pseudocode + namespace rules + forbidden fields list.
