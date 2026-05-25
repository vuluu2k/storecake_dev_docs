---
sidebar_position: 11
title: Components
---

# Components

The Storecake design system is built on **Ant Design Vue 3**. Every shared component inherits the upstream API and adds a small layer of project-specific props on top.

## Where to import from

All design-system components live under `@/components/design/`. Always import from that path — never directly from `ant-design-vue` in feature code.

```js
import Button from '@/components/design/Button.vue'
```

This indirection lets us:

- Add project defaults (sizing, colors, behavior) in one place.
- Swap or extend an underlying component without touching every call site.
- Eventually publish the layer as a standalone npm package.

## Reference

A live reference of available components, props, and slots is published at
[storecake components](https://vuluu2k.github.io/storecake_components).

## Roadmap

The design-system layer will be extracted into a standalone npm package so it can be reused outside of `builderx_spa`. Until then, treat `@/components/design/` as the canonical import path.
