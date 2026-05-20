---
sidebar_position: 4
title: Docs research (recommend)
---

# Docs research (recommend)

## Vue 3

1. Read official docs: [Vue docs](https://vuejs.org/)
2. Học cơ bản với [Vue Playground](https://play.vuejs.org/)

### Lifecycle Hooks in Vue Options API

A Vue component using the Options API goes through the following **lifecycle stages**:

#### 1. Initialization

- `beforeCreate`: Data observation and reactivity haven't been set up yet.
- `created`: Data, computed properties, and methods are available. DOM has not been mounted yet.

#### 2. Mounting (Attaching to the DOM)

- `beforeMount`: Called right before the initial DOM render.
- `mounted`: The component is mounted, and the DOM is available.

#### 3. Updating (Reactive data changes)

- `beforeUpdate`: Called before the DOM is patched due to reactive data changes.
- `updated`: Called after the DOM is updated.

#### 4. Unmounting (Destroying the component)

- `beforeUnmount`: Called right before the component is removed from the DOM.
- `unmounted`: Called after the component is destroyed and removed.

---

### Recommended Order of Options in a Vue Component

Although Vue doesn't enforce option order, the official style guide recommends this structure for readability and consistency:

```js
export default {
  name: 'MyComponent',         // 1. Component name
  components: {},              // 2. Registered child components
  directives: {},              // 3. Registered directives

  props: {},                   // 4. Props from parent
  emits: [],                   // 5. Emitted events

  setup() {},                  // 6. If using Composition API

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

### Full Example

```js
export default {
  name: 'UserCard',
  components: { Avatar },
  props: {
    userId: Number
  },
  data() {
    return {
      user: null
    };
  },
  computed: {
    fullName() {
      return `${this.user.firstName} ${this.user.lastName}`;
    }
  },
  watch: {
    userId: 'fetchUser'
  },
  methods: {
    fetchUser() {
      // Fetch user data based on userId
    }
  },
  created() {
    this.fetchUser();
  }
}
```

If you're using the **Composition API** (`<script setup>`), lifecycle hooks are used as functions like `onMounted()`, `onUpdated()`, etc., imported from Vue.

## Pinia Store (Manage global state)

Official docs: [pinia.vuejs.org](https://pinia.vuejs.org/)

### Basic Structure of a Pinia Store (Options API)

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

### Key Concepts

#### 1. `defineStore(name, options)`

- `name`: unique identifier for the store (required, used by devtools and internally).
- `options`: contains `state`, `getters`, and `actions`.

#### 2. `state()`

- Always a **function that returns an object**, similar to `data()` in Vue.
- Defines **reactive state variables**.
- Automatically made reactive by Pinia.

> ⚠️ Use `this` only inside `actions`, not inside `state` or `getters`.

#### 3. `getters`

- Like **computed properties** based on state.
- Can access state variables and other getters.
- Should **not mutate** state.
- Can use `this` to access `state`, `getters`, and `actions`.

```ts
getters: {
  greeting(state) {
    return `Hello ${state.name}`
  },
  fullInfo() {
    return `${this.greeting} - count: ${this.count}`
  }
}
```

#### 4. `actions`

- Used to **mutate state** or perform async logic.
- Supports `async/await`.
- Can call other actions or access getters via `this`.

```ts
actions: {
  async fetchData() {
    const data = await fetch('/api/data').then(res => res.json())
    this.count = data.count
  }
}
```

#### 5. Reactivity in Components

```ts
const counter = useCounterStore()
console.log(counter.count)         // reactive
console.log(counter.doubleCount)   // reactive getter
counter.increment()                // call action
```

#### 6. No need for `setup()` if not required

- Can be used inside `<script setup>` or with the Options API.
- Pinia works well with both Composition and Options API.

#### 7. Devtools & Hot Module Replacement (HMR)

- Integrated with Vue Devtools automatically.
- Add HMR for better DX during development:

```ts
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCounterStore, import.meta.hot))
}
```

#### 8. Modules & Namespacing

- Each store is an independent module.
- No need for `namespaced` like in Vuex.
- Organize stores by feature (e.g., `userStore`, `productStore`).

### Summary

| Part      | Role                     | Notes                                      |
| --------- | ------------------------ | ------------------------------------------ |
| `state`   | Holds reactive data      | Function that returns an object            |
| `getters` | Computed-like properties | Should not cause side effects              |
| `actions` | Logic & state mutations  | Use `this` to access state/getters/actions |
