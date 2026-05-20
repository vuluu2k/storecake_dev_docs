---
sidebar_position: 3
title: Extension and rules
---

# Extension and rules

## Development Rules

1. Follow Vue3 Options API — [vuejs.org/guide/introduction](https://vuejs.org/guide/introduction.html)

![Vue3 Options API](/img/gitbook/Screenshot%202025-07-03%20at%2009.21.38.png)

2. Install [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
3. Install [Husky](https://typicode.github.io/husky/)

```bash
npm run setup:husky
```

```bash
# if husky not working you run
chmod +x .husky/pre-commit
```

4. Install [i18n-ally](https://marketplace.visualstudio.com/items?itemName=Lokalise.i18n-ally)

Config trong `.vscode/settings.json` của project:

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

5. Fix warning Tailwind trong VSCode

- Tạo `.vscode/tailwind.json`:

```json
{
  "version": 1.1,
  "atDirectives": [
    {
      "name": "@tailwind",
      "description": "Use the `@tailwind` directive to insert Tailwind's `base`, `components`, `utilities` and `screens` styles into your CSS.",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#tailwind"
        }
      ]
    },
    {
      "name": "@apply",
      "description": "Use the `@apply` directive to inline any existing utility classes into your own custom CSS.",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#apply"
        }
      ]
    },
    {
      "name": "@responsive",
      "description": "Generate responsive variants of your own classes by wrapping their definitions in the `@responsive` directive.",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#responsive"
        }
      ]
    },
    {
      "name": "@screen",
      "description": "The `@screen` directive allows you to create media queries that reference your breakpoints by name instead of duplicating their values in your own CSS.",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#screen"
        }
      ]
    },
    {
      "name": "@variants",
      "description": "Generate `hover`, `focus`, `active` and other variants of your own utilities by wrapping their definitions in the `@variants` directive.",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#variants"
        }
      ]
    }
  ]
}
```

- Thêm vào `.vscode/settings.json`:

```json
"css.customData": [".vscode/tailwind.json"]
```
