---
sidebar_position: 13
title: Docs research
---

# Docs research

A short primer on the patterns we rely on in **builderx_spa**, with links to the canonical upstream docs.

## Vue 3

- Official guide: [vuejs.org](https://vuejs.org/)
- Try things out in the [Vue Playground](https://play.vuejs.org/)

### Lifecycle hooks (Options API)

A Vue component using the Options API moves through four stages:

#### 1. Initialization

- `beforeCreate` — reactivity is not set up yet.
- `created` — `data`, `computed`, and `methods` are available; the DOM is not mounted.

#### 2. Mounting

- `beforeMount` — called right before the initial render.
- `mounted` — the component is in the DOM and refs are available.

#### 3. Updating

- `beforeUpdate` — fired before the DOM patches in response to reactive changes.
- `updated` — fired after the patch is applied.

#### 4. Unmounting

- `beforeUnmount` — fired right before the component is removed.
- `unmounted` — fired after teardown.

### Recommended option order

Vue does not enforce option order, but the official style guide recommends this layout for readability:

```js
export default {
  name: 'MyComponent',         // 1. Component name
  components: {},              // 2. Registered child components
  directives: {},              // 3. Registered directives

  props: {},                   // 4. Props from parent
  emits: [],                   // 5. Emitted events

  setup() {},                  // 6. Composition API (optional)

  data() {                     // 7. Local reactive state
    return {};
  },
  computed: {},                // 8. Computed properties
  watch: {},                   // 9. Watchers

  methods: {},                 // 10. Methods

  // 11. Lifecycle hooks
  beforeCreate() {},
  created() {},
  beforeMount() {},
  mounted() {},
  beforeUpdate() {},
  updated() {},
  beforeUnmount() {},
  unmounted() {},
};
```

### Worked example

```js
export default {
  name: 'UserCard',
  components: { Avatar },
  props: {
    userId: Number,
  },
  data() {
    return {
      user: null,
    };
  },
  computed: {
    fullName() {
      return `${this.user.firstName} ${this.user.lastName}`;
    },
  },
  watch: {
    userId: 'fetchUser',
  },
  methods: {
    fetchUser() {
      // Fetch user data based on userId
    },
  },
  created() {
    this.fetchUser();
  },
};
```

> Using `<script setup>`? Lifecycle hooks become standalone functions — `onMounted()`, `onUpdated()`, and so on — imported from `vue`.

## Pinia (global state)

Official docs: [pinia.vuejs.org](https://pinia.vuejs.org/)

### A minimal store

```ts
// stores/counter.ts
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Vue',
  }),

  getters: {
    doubleCount: (state) => state.count * 2,
  },

  actions: {
    increment() {
      this.count++
    },
  },
})
```

### Key concepts

#### `defineStore(name, options)`

- `name` — unique identifier used by devtools and internal caching.
- `options` — `state`, `getters`, `actions`.

#### `state()`

- Always a **function returning an object**, mirroring `data()` in Vue.
- Members are reactive automatically.
- Do **not** use `this` inside `state` or `getters` — only inside `actions`.

#### `getters`

- Like computed properties over the store's state.
- May read other getters and state, but must not mutate.

```ts
getters: {
  greeting(state) {
    return `Hello ${state.name}`
  },
  fullInfo() {
    return `${this.greeting} - count: ${this.count}`
  },
}
```

#### `actions`

- The place for mutations and async work. Supports `async/await`.
- Can call other actions or read getters via `this`.

```ts
actions: {
  async fetchData() {
    const data = await fetch('/api/data').then((res) => res.json())
    this.count = data.count
  },
}
```

#### Using a store in a component

```ts
const counter = useCounterStore()

console.log(counter.count)         // reactive
console.log(counter.doubleCount)   // reactive getter
counter.increment()                // mutation via action
```

#### Hot Module Replacement

```ts
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCounterStore, import.meta.hot))
}
```

#### Modules and namespacing

- Each store is its own module — no `namespaced` flag like in Vuex.
- Organize stores by feature (`userStore`, `productStore`, …).

### Summary

| Part | Role | Notes |
| --- | --- | --- |
| `state` | Reactive data | Function returning an object |
| `getters` | Derived, computed values | No side effects |
| `actions` | Mutations and async logic | Use `this` to access state, getters, and other actions |
