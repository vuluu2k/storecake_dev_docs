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

