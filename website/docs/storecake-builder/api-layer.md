---
sidebar_position: 7
title: API layer
---

# API layer

The `src/api/` layer owns all HTTP/HTTPS traffic to backends (`builderx_api`, `landing_page_backend`, occasional third parties). Its goals: a single axios interceptor stack, request deduplication, easy mocking, and views that do not care about transport details.

## Flow

```text
View / Composable
       │
       ▼
@/api/<feature>Api    →   axiosClient   →   server.js (proxy) → backend
       │                     ▲
       └─ inFlightPool ──────┘ (dedupe identical inflight requests)
```

## Key files

- `axiosClient.js` — single axios instance (baseURL, `Authorization`, `Accept-Language`, timeout, 401/403 interceptors, light retry).
- `baseApi.js` — factory for CRUD endpoints:

  ```js
  const productApi = baseApi('products');
  productApi.list(params);
  productApi.detail(id);
  productApi.create(payload);
  productApi.update(id, payload);
  productApi.remove(id);
  ```

- `inFlightPool.ts` — keyed pool that returns the same Promise for identical inflight requests.

## Writing an API module

```js
// src/api/orderApi.js
import client from './axiosClient';
import baseApi from './baseApi';

const base = baseApi('orders');

const orderApi = {
  ...base,
  async exportCsv(filter) {
    const { data } = await client.get('/orders/export', {
      params: filter,
      responseType: 'blob',
    });
    return data;
  },

  async reorder(orderId) {
    const { data } = await client.post(`/orders/${orderId}/reorder`);
    return data;
  },
};

export default orderApi;
```

Rules:

- One file per feature: `<feature>Api.js`.
- Default-export an object of async methods.
- Throw the original axios error — do not wrap. The store/view decides how to react.
- Do not touch stores or mutate state from an API module.

## Interceptors

`axiosClient.js` adds:

| Interceptor | Behavior |
| --- | --- |
| Request `Authorization` | Reads token from `useUserStore` or the `pat_token` cookie. |
| Request `Accept-Language` | Pulls from `useLocaleStore`. |
| Request `X-Site-Id` | Added when a site is selected (`useSiteStore`). |
| Response 401 | Logs out and redirects to `/login`. |
| Response 403 | Toasts a permission error. |
| Response 5xx | Logs to Sentry, shows a generic toast. |

To bypass auth (rare — public endpoints), pass `{ headers: { 'X-Skip-Auth': true } }` and handle it in the interceptor.

## URLs

- Default base: `import.meta.env.VITE_BUILDERX_API_URL`.
- Calls to `landing_page_backend` use modules under `src/api/landing/` with a different base (`VITE_LANDING_PAGE_API_URL`).
- Cookie-bound internal endpoints are proxied through `server.js` with a `/internal/` prefix.

## Deduplication & cancellation

- `inFlightPool` shares the same `GET` Promise across simultaneous callers.
- For volatile screens, cancel previous requests:

  ```js
  const controller = new AbortController();
  client.get('/products', { signal: controller.signal });
  controller.abort();
  ```

## Mocking / testing

- Override `axiosClient.defaults.baseURL` (via env) for local proxies.
- Hard mocks may live in `src/api/__mocks__/` (not formal yet; align with the team before introducing).

## Pitfalls

- Forgetting `await` inside a Pinia action causes state to set before data arrives.
- Server responses shaped as `{ data, paging }` should pass through untouched — let stores reshape.
- Do not set `Content-Type` manually when uploading `FormData`; axios sets the boundary for you.
- Never `console.log` tokens (ESLint warns).
