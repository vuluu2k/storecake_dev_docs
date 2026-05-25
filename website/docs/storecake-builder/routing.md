---
sidebar_position: 5
title: Routing & Guards
---

# Routing & Guards

How Vue Router is wired in `builderx_spa` and the guards that protect each route.

## Layout

```text
src/router/
├── index.js          # Routes + bootstrap
└── guards/           # Auth, permission, site, feature flag
```

## Declaring routes

```js
import { createRouter, createWebHistory } from 'vue-router';
import authGuard from './guards/auth';
import siteGuard from './guards/site';

const routes = [
  {
    path: '/login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('@/views/Dashboard.vue') },
      { path: 'products', component: () => import('@/views/Products.vue') },
      {
        path: 'editor-v2/:siteId/:pageId',
        component: () => import('@/views/EditorV2.vue'),
        meta: { layout: 'blank' },
      },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(authGuard);
router.beforeEach(siteGuard);

export default router;
```

Rules:

- **Always lazy-load** views (`() => import(...)`) for chunking.
- The admin layout wraps everything; fullscreen pages (Editor V2) set `meta.layout = 'blank'`.
- Public routes (`/login`, OAuth callback, accept-invite) set `meta.public = true` to skip the auth guard.
- Add `name` to routes that other code needs to navigate to.

## Guards

| File | Job |
| --- | --- |
| `guards/auth.js` | Verify or refresh the token; redirect `/login` when missing. Skipped if `meta.public`. |
| `guards/site.js` | Ensure `useSiteStore().currentSite` is loaded before entering site-scoped routes. |
| `guards/permission.js` | Compare `meta.permissions` against `user.permissions` (RBAC). |
| `guards/feature-flag.js` | Gate by feature flag (e.g., Editor V2 for a subset of tenants). |

> Filenames may evolve; check `src/router/guards/` for the current list before editing.

## Meta conventions

| Key | Meaning |
| --- | --- |
| `requiresAuth` | `true` to require login. |
| `public` | `true` to skip auth guard. |
| `permissions` | Array of required permission strings. |
| `featureFlag` | Feature flag key required. |
| `layout` | `'admin'` (default) / `'blank'` / `'storefront'`. |
| `title` | Page title (set in `afterEach`). |
| `breadcrumb` | Breadcrumb config for the admin layout. |

## Subdomain routing (server.js)

Express decides which HTML entry to serve based on subdomain:

- `admin.<domain>` → `index.html` (admin SPA).
- `<store>.<domain>` → `index_themes.html` (storefront theme SPA).
- Apex hostnames receive iframe / preview routes used by the Editor.

For local dev, add subdomains to `/etc/hosts` (see [Setup](../setup.md)).

## Adding a new route

1. Create `src/views/<feature>/MyPage.vue`.
2. Add the entry in `routes`:

   ```js
   {
     path: 'feature',
     name: 'feature-list',
     component: () => import('@/views/feature/MyPage.vue'),
     meta: { permissions: ['feature.read'], title: 'Feature' },
   }
   ```

3. Add a store under `src/stores/feature.js` if you need shared state.
4. Add the new translation keys to `src/i18n/locales/*.json`.

## Navigation tips

- Prefer `router.replace` for redirects that should not create history (login flow, deeplink redirects).
- In `<script setup>`, use `useRoute()` and `useRouter()` instead of `this.$route`.

## Common pitfalls

- **Redirect loop** between `/login` and `/`: guard not skipping `meta.public`. Check order of guards.
- **No matching route** after adding a child: parent `path` must not end with `/`; child `path` must not start with `/`.
- **Lazy-load chunk 404** after deploy: bundle hashes changed. Router error handler reloads the page — keep this when modifying `router/index.js`.
