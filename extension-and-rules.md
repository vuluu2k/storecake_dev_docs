# Extension and rules

### &#x20;Development Rules

1. Follow Vue3 Options API [https://vuejs.org/guide/introduction.html](https://vuejs.org/guide/introduction.html)

<figure><img src=".gitbook/assets/Screenshot 2025-07-03 at 09.21.38.png" alt=""><figcaption></figcaption></figure>

1. Install [Eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
2. Install [Husky](https://typicode.github.io/husky/)

```
npm run setup:husky
```

```
#if husky not working you run
chmod +x .husky/pre-commit
```

3. Install [i18n-ally](https://marketplace.visualstudio.com/items?itemName=Lokalise.i18n-ally)

In config for project .vscode/settings.json

```
"i18n-ally.localesPaths": [
    "src/i18n/locales"
],
"i18n-ally.keystyle": "nested",
"i18n-ally.translate.engines": [
  "google"
],
"i18n-ally.translate.fallbackToKey": false,
"i18n-ally.sortKeys": true,
"i18n-ally.sourceLanguage": "vi",
"i18n-ally.regex.usageMatchAppend": [
  "t\\.success\\(\\s*['\"]({key})['\"]",
  "t\\.error\\(\\s*['\"]({key})['\"]",
 ],
// "i18n-ally.translate.promptSource": true,
"i18n-ally.sortCompare": "locale",
"i18n-ally.annotationInPlace": false,
```

4. Fix warning tools in taildwind

* Create tailwind.json in .vscode folder

````
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
      "description": "Use the `@apply` directive to inline any existing utility classes into your own custom CSS. This is useful when you find a common utility pattern in your HTML that you’d like to extract to a new component.",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#apply"
        }
      ]
    },
    {
      "name": "@responsive",
      "description": "You can generate responsive variants of your own classes by wrapping their definitions in the `@responsive` directive:\n```css\n@responsive {\n  .alert {\n    background-color: #E53E3E;\n  }\n}\n```\n",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#responsive"
        }
      ]
    },
    {
      "name": "@screen",
      "description": "The `@screen` directive allows you to create media queries that reference your breakpoints by **name** instead of duplicating their values in your own CSS:\n```css\n@screen sm {\n  /* ... */\n}\n```\n…gets transformed into this:\n```css\n@media (min-width: 640px) {\n  /* ... */\n}\n```\n",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#screen"
        }
      ]
    },
    {
      "name": "@variants",
      "description": "Generate `hover`, `focus`, `active` and other **variants** of your own utilities by wrapping their definitions in the `@variants` directive:\n```css\n@variants hover, focus {\n   .btn-brand {\n    background-color: #3182CE;\n  }\n}\n```\n",
      "references": [
        {
          "name": "Tailwind Documentation",
          "url": "https://tailwindcss.com/docs/functions-and-directives#variants"
        }
      ]
    }
  ]
}
````

* Add line in settings.json in .vscode folder

```
"css.customData": [".vscode/tailwind.json"]
```
