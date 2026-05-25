---
sidebar_position: 9
title: Environment variables
---

# Environment variables

Runtime config splits into two layers:

- **Client (Vite)** — every key prefixed `VITE_*` is exposed to the SPA via `import.meta.env`.
- **Server (`server.js`)** — read with `process.env` via `dotenv`.

`.env.development` is committed and serves as the reference; the real local file is `.env` (gitignored).

## Bootstrap

```bash
cp .env.development .env
# tweak URLs and OAuth client IDs for your environment
```

## Client env (`VITE_*`)

| Key | Purpose |
| --- | --- |
| `VITE_BUILDERX_SPA_URL` | Current SPA URL — used for CORS and redirect callbacks. |
| `VITE_BUILDERX_API_URL` | `builderx_api` base URL. |
| `VITE_BUILDERX_SPA_AFFILIATE_URL` | Affiliate subdomain (`affiliate.localhost:5173`). |
| `VITE_LANDING_PAGE_API_URL` | Public `landing_page_backend` URL. |
| `VITE_LANDING_PREVIEW_URL` | Landing preview render service. |
| `VITE_LANDING_PAGE_BUILDER_URL` | Landing builder URL. |
| `VITE_PANCAKEID_CLIENT_ID` / `_SECRET` | Pancake ID OAuth client. |
| `VITE_PANCAKE_AUTH_URL` | OAuth domain VN (`https://account.pancake.vn`). |
| `VITE_PANCAKE_AUTH_URL_INTERNATIONAL` | OAuth domain (`https://account.pancake.biz`). |
| `VITE_GOOGLE_CLIENT_ID` / `_API_KEY` | Google OAuth + Drive / Sheets / Picker. |
| `VITE_DROPBOX_APP_KEY` | Dropbox chooser. |
| `VITE_DRIBBBLE_CLIENT_ID` | Dribbble asset picker. |
| `VITE_VIMEO_API_KEY` | Vimeo metadata. |
| `VITE_INSTAGRAM_CLIENT_ID` | Instagram graph login. |
| `VITE_FACEBOOK_CLIENT_ID` | Facebook login & graph. |
| `VITE_DEVIANT_ART_CLIENT_ID` | DeviantArt asset picker. |
| `VITE_STRIPE_PK` | Stripe publishable key. |
| `VITE_SLACK_CLIENT_ID` | Slack notification integration. |
| `VITE_PANCAKE_SECRET_KEY` | Pancake non-critical signing secret. |
| `VITE_SAPO_CLIENT_ID` | Sapo integration. |
| `VITE_HARAVAN_CLIENT_ID` | Haravan integration. |
| `VITE_SHOPIFY_CLIENT_ID` / `_SECRET_KEY` | Shopify integration (sandbox). |
| `VITE_LANDING_PAGE_BACKEND_URL` | Backend URL used server-side (`server.js`). |
| `VITE_LANDING_GOOGLE_CLIENT_ID` | OAuth client used by the landing flow. |
| `VITE_LANDING_SLACK_CLIENT_ID` | Slack client used by the landing flow. |

> Every `VITE_*` value lands in the client bundle. Do **not** put real secrets here.

## Server env (`server.js`)

| Key | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `production`. Drives caching and log levels. |
| `JWT_KEY` | Secret used to sign internal cookies. Must be shared across replicas. |
| `PANCAKE_AUTH_URL` | Pancake auth endpoint used server-side (OAuth exchange). |
| `BUILDERX_API_URL` | URL of `builderx_api` from inside the container (often `http://host.docker.internal:24679`). |

## Adding a new env

1. Add a placeholder to `.env.development` (no real secret).
2. Update the table above with the meaning and source (ops, generated, public,…).
3. Make sure `vite.config.js` or `server.js` reads the key.
4. Push real secrets through Ansible / vault, not via this file.

## Pitfalls

- Env changes do not hot reload — stop Vite, edit `.env`, run `npm run dev` again.
- Variables without `VITE_*` are not visible in `import.meta.env`.
- Use `import.meta.env.MODE` (`'development'` / `'production'`) instead of comparing `NODE_ENV` in client code.
- Never `console.log(import.meta.env)` — it can leak public OAuth client IDs you do not want indexed.
