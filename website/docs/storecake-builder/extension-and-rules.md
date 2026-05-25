---
sidebar_position: 12
title: Extension and rules
---

# Extension and rules

Conventions and editor tooling for working on **builderx_spa**.

## Coding conventions

- Author components with the **Vue 3 Options API** unless you have a clear reason to use `<script setup>`. See the [official guide](https://vuejs.org/guide/introduction.html).
- Import shared UI from `@/components/design/*` — these are the Ant Design wrappers used across the app.
- Keep translation keys nested and sorted; the source language is Vietnamese (`vi`).
- Run `npm run lint` and `npm run format` before opening a PR.

![Vue 3 Options API example](/img/gitbook/Screenshot%202025-07-03%20at%2009.21.38.png)

## Recommended VS Code extensions

1. **[ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)** — surfaces lint errors inline.
2. **[Husky](https://typicode.github.io/husky/)** — Git hooks for pre-commit lint:

   ```bash
   npm run setup:husky
   ```

   If hooks do not fire after install:

   ```bash
   chmod +x .husky/pre-commit
   ```

3. **[i18n-ally](https://marketplace.visualstudio.com/items?itemName=Lokalise.i18n-ally)** — translation key navigation and inline preview. Configure it in `.vscode/settings.json`:

   ```json
   {
     "i18n-ally.localesPaths": ["src/i18n/locales"],
     "i18n-ally.keystyle": "nested",
     "i18n-ally.translate.engines": ["google"],
     "i18n-ally.translate.fallbackToKey": false,
     "i18n-ally.sortKeys": true,
     "i18n-ally.sourceLanguage": "vi",
     "i18n-ally.regex.usageMatchAppend": [
       "t\\.success\\(\\s*['\"]({key})['\"]",
       "t\\.error\\(\\s*['\"]({key})['\"]"
     ],
     "i18n-ally.sortCompare": "locale",
     "i18n-ally.annotationInPlace": false
   }
   ```

## Silencing Tailwind "unknown at-rule" warnings

VS Code's built-in CSS validator does not know about `@tailwind`, `@apply`, etc. Add a custom data file so the warnings go away:

1. Create `.vscode/tailwind.json`:

   ```json
   {
     "version": 1.1,
     "atDirectives": [
       {
         "name": "@tailwind",
         "description": "Use the `@tailwind` directive to insert Tailwind's `base`, `components`, `utilities` and `screens` styles into your CSS.",
         "references": [
           { "name": "Tailwind docs", "url": "https://tailwindcss.com/docs/functions-and-directives#tailwind" }
         ]
       },
       {
         "name": "@apply",
         "description": "Inline existing utility classes into your own custom CSS.",
         "references": [
           { "name": "Tailwind docs", "url": "https://tailwindcss.com/docs/functions-and-directives#apply" }
         ]
       },
       {
         "name": "@responsive",
         "description": "Generate responsive variants of your own classes.",
         "references": [
           { "name": "Tailwind docs", "url": "https://tailwindcss.com/docs/functions-and-directives#responsive" }
         ]
       },
       {
         "name": "@screen",
         "description": "Create media queries that reference your named breakpoints.",
         "references": [
           { "name": "Tailwind docs", "url": "https://tailwindcss.com/docs/functions-and-directives#screen" }
         ]
       },
       {
         "name": "@variants",
         "description": "Generate `hover`, `focus`, `active` and other variants of your own utilities.",
         "references": [
           { "name": "Tailwind docs", "url": "https://tailwindcss.com/docs/functions-and-directives#variants" }
         ]
       }
     ]
   }
   ```

2. Reference it from `.vscode/settings.json`:

   ```json
   "css.customData": [".vscode/tailwind.json"]
   ```
