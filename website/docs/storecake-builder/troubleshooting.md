---
sidebar_position: 14
title: Troubleshooting
---

# Troubleshooting

Common issues encountered when developing `builderx_spa`. Add new ones here so the next person can find the answer fast.

## 1. `npm install` fails on `node-gyp`

Symptom: install hangs at `node-gyp rebuild`, missing `python` or `make`.

Fix:

- macOS: `xcode-select --install`.
- Linux: `sudo apt install build-essential python3`.
- Windows (WSL): install `build-essential` inside WSL, not cmd.
- Use the right Node version (`nvm use 16`).

## 2. `tinymce/` missing after install

Symptom: console 404s on `/tinymce/skins/...`.

```bash
npm run postinstall
# or manually
rm -rf tinymce
cp -R node_modules/tinymce tinymce
```

## 3. CORS error when calling `builderx_api`

- Verify `VITE_BUILDERX_API_URL` matches scheme + port.
- Make sure `builderx_api` whitelists the SPA origin via `corsica` (`config :builderx_api, :cors_origins`).
- Cross-site cookies need `SameSite=None; Secure` — for local dev you can disable secure flags.

## 4. Phoenix Channel won't connect

- Network tab shows WS close code `1006`, or store doesn't receive events.
- `builderx_api` is running and `/socket/websocket` is reachable.
- The user's JWT is still valid (logout and re-login).
- Browser blocks mixed content (HTTPS SPA → HTTP backend) — align the scheme.

## 5. Vite HMR not updating

- Files must live under `src/` (Vite watches the project root only).
- Avoid symlinked code paths; Vite can miss changes through symlinks.
- Clear cache: `rm -rf node_modules/.vite`.

## 6. Husky hooks not firing

```bash
chmod +x .husky/pre-commit
git config core.hooksPath .husky
```

## 7. Lint is slow

- Enable cache: `npm run lint -- --cache`.
- Configure `eslint.workingDirectories` in VS Code so ESLint and lint-staged do not double-run.

## 8. Out of memory while building

```bash
NODE_OPTIONS=--max_old_space_size=4096 npm run build:client
```

Or raise Docker Desktop's RAM allowance when building inside a container.

## 9. `Failed to fetch dynamically imported module` after deploy

Hashed chunks rotated but the client still has the old hash.

- The router already auto-reloads when a chunk 404s — keep that error handler in `src/router/index.js`.
- If it doesn't reload, flush CDN cache and set `Cache-Control: no-cache` on `index.html`.

## 10. Local subdomain not resolving

- Add to `/etc/hosts`:

  ```
  127.0.0.1 admin.localhost
  127.0.0.1 affiliate.localhost
  ```

- macOS does not wildcard `*.localhost` — declare each subdomain or use `dnsmasq`.

## 11. TinyMCE / Monaco assets missing

- `tinymce/` is still present after build.
- Configure Monaco worker paths when bundling (`@guolao/vue-monaco-editor`).
- Deployment pipelines must upload `tinymce/` alongside main assets.

## 12. Sentry not sending events

- `VITE_SENTRY_DSN` matches the project.
- `import.meta.env.MODE !== 'development'` — Sentry is off in dev by default. Toggle the init flag if you need to test in dev.
- Ad-blockers can drop Sentry calls; test in incognito with extensions off.

## 13. Editor V2 schema mismatch

- Run `npm run validate:schemas` to see the exact mismatch.
- If you added a trait, run `npm run build:schemas` to regenerate `schemas/elements.json`.
- Verify the schema version still matches what `builderx_api` expects.

## 14. Port already in use

- Vite defaults to 5173, Express to 3000.
- Change `server.port` in `vite.config.js` or `PORT` in `server.js`.

## 15. Quick debug helpers

- `localStorage.setItem('debug', 'storecake:*')` if a `debug` namespace is wired.
- `window.__pinia.state.value` (dev only).
- Use Vue DevTools to identify the selected component.

If you cannot resolve an issue: capture logs + reproduction steps and post in `#frontend-help` or tag the team lead.
