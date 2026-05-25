---
sidebar_position: 6
title: Pinia stores
---

# Pinia stores

Conventions and inventory of the stores that live in `src/stores/`.

## Conventions

- Use `defineStore('<id>', { state, getters, actions })` (Options style) for most stores; setup-style is OK when logic is complex.
- `state()` is always a function returning an object so each instance is independent.
- `actions` may be async and call modules in `@/api/`. Never import `axios` directly.
- `getters` are pure — no side effects, no state mutation.
- Naming: `useXxxStore`. IDs are kebab-case after the feature (`user`, `site`, `editor-v2-layers`,…).
- Avoid importing one store inside another at module level. When needed, call `useOther()` **inside an action**.

## Inventory

| Store | What it owns |
| --- | --- |
| `user.js` | Current user, profile, permissions, JWT, auth flow. |
| `site.js` | Currently-selected site, locale defaults, domain map. |
| `general.js` | App-level state — layout flags, global modals, theme. |
| `locale.js` | Active locale, supported list, sync with `vue-i18n`. |
| `preview.js` | Editor preview state — device frame, sync editor → preview. |
| `editor.js`, `editor/` | Editor V1 state (page, block, selection). Legacy. |
| `editor_v2/` | Editor V2 slices: `layers`, `traits`, `history`, `selection`, `assets`, `ai`. |
| `dashboard/` | Dashboard stats + filters. |
| `landing/` | Landing builder state (publish, version). |
| `payment/` | Stripe customer, plan, subscription, invoices. |

> When adding a new store, append it to the table and document its primary state and actions.

## Recommended store template

```js
// src/stores/product.js
import { defineStore } from 'pinia';
import productApi from '@/api/productApi';

export const useProductStore = defineStore('product', {
  state: () => ({
    items: [],
    paging: { page: 1, pageSize: 20, total: 0 },
    loading: false,
    filter: {},
  }),

  getters: {
    isEmpty: (s) => !s.loading && s.items.length === 0,
  },

  actions: {
    async fetch(params = {}) {
      this.loading = true;
      try {
        const { data, paging } = await productApi.list({ ...this.filter, ...params });
        this.items = data;
        this.paging = paging;
      } finally {
        this.loading = false;
      }
    },

    setFilter(filter) {
      this.filter = filter;
      this.paging.page = 1;
      return this.fetch({ page: 1 });
    },
  },
});
```

## Persistence

Some stores persist to `localStorage`:

- `user.js` — token and selected language.
- `site.js` — last visited site.
- `general.js` — theme, sidebar collapsed flag.

There is no global `pinia-plugin-persistedstate`; persistence is handled inline (via `watch` or in `src/plugins/`). When you add a new persisted field, check `src/plugins/` to keep the approach consistent.

## Editor V2 slicing

Editor V2 splits state by concern to keep slices testable:

- `layers` — page node tree.
- `selection` — selected node(s).
- `history` — commit-based undo/redo (no whole-tree clones).
- `traits` — trait values per node.
- `assets` — uploaded images, fonts, assets.
- `ai` — AI page generation jobs, progress, prompts.

See [Editor V2 — Architecture](./editor-v2/01-architecture.md).

## DevTools and HMR

- Vue DevTools detects Pinia automatically (`app.use(createPinia())`).
- HMR snippet at the end of a store:

  ```js
  if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useProductStore, import.meta.hot));
  }
  ```

## Pitfalls

- `this` is unavailable in arrow-function actions — use `function` or rely on getters.
- To reset everything, use `this.$reset()` instead of clearing fields one by one.
- Do not import stores at the top of shared modules that load before Pinia is installed. Call `useStore()` inside a function instead.
