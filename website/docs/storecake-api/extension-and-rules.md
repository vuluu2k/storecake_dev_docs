---
sidebar_position: 11
title: Extension and rules
---

# Extension and rules

Conventions and editor tooling for working on **builderx_api**.

## Coding conventions

- Follow standard Elixir style — run `mix format` before opening a PR.
- Keep the **web layer** (`lib/builderx_api_web/`) thin: controllers, routers, channels, and plugs only. Business logic belongs in `lib/builderx_api/`.
- Prefer Ecto changesets for validation; never trust controller params directly.
- Add migrations for every schema change and check them in alongside the code.
- Wire up a Phoenix Channel only when you genuinely need push semantics — REST is the default.

## Recommended VS Code extensions

1. **[ElixirLS](https://marketplace.visualstudio.com/items?itemName=JakeBecker.elixir-ls)** — compiler diagnostics, formatter integration, go-to-definition.
2. **[Phoenix Framework](https://marketplace.visualstudio.com/items?itemName=phoenixframework.phoenix)** — `.heex` and Phoenix template support.
3. **[EditorConfig](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)** — picks up the repo's `.editorconfig`.

Add to your workspace `.vscode/settings.json`:

```json
{
  "[elixir]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "JakeBecker.elixir-ls"
  },
  "elixirLS.dialyzerEnabled": false
}
```

> Dialyzer is heavy on first run. Turn it on only when you need it.

## Database conventions

- Naming: snake_case tables, plural names (`products`, `orders`).
- Primary keys are UUIDs (binary_id) unless there is a strong reason for integer ids.
- Every table has `inserted_at` and `updated_at`.
- Tenant-aware tables include `site_id` and are indexed on it.
