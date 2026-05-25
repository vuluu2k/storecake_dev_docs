---
sidebar_position: 13
title: Tài liệu tham khảo
---

# Tài liệu tham khảo

Tóm tắt ngắn các pattern team đang dùng trong **builderx_spa**, kèm link tới tài liệu chính chủ.

## Vue 3

- Tài liệu chính thức: [vuejs.org](https://vuejs.org/)
- Thử nhanh các snippet trong [Vue Playground](https://play.vuejs.org/)

### Lifecycle hooks (Options API)

Một component Vue dùng Options API đi qua bốn giai đoạn:

#### 1. Khởi tạo (Initialization)

- `beforeCreate` — reactivity chưa được thiết lập.
- `created` — `data`, `computed`, `methods` đã sẵn sàng; DOM chưa được mount.

#### 2. Mount

- `beforeMount` — được gọi ngay trước lần render đầu tiên.
- `mounted` — component đã có trong DOM, các `ref` đã có giá trị.

#### 3. Cập nhật (Updating)

- `beforeUpdate` — chạy trước khi Vue patch DOM theo state thay đổi.
- `updated` — chạy sau khi patch hoàn tất.

#### 4. Unmount (Hủy)

- `beforeUnmount` — chạy ngay trước khi component bị gỡ.
- `unmounted` — chạy sau khi teardown xong.

### Thứ tự option khuyến nghị

Vue không bắt buộc, nhưng style guide chính thức gợi ý sắp xếp theo thứ tự sau để dễ đọc:

```js
export default {
  name: 'MyComponent',         // 1. Tên component
  components: {},              // 2. Component con đã đăng ký
  directives: {},              // 3. Directive đã đăng ký

  props: {},                   // 4. Props nhận từ parent
  emits: [],                   // 5. Sự kiện component emit ra

  setup() {},                  // 6. Composition API (tùy chọn)

  data() {                     // 7. State local
    return {};
  },
  computed: {},                // 8. Computed properties
  watch: {},                   // 9. Watcher

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

### Ví dụ đầy đủ

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
      // Lấy dữ liệu user theo userId
    },
  },
  created() {
    this.fetchUser();
  },
};
```

> Nếu dùng `<script setup>`, lifecycle hook trở thành các hàm độc lập — `onMounted()`, `onUpdated()`,... — import từ `vue`.

## Pinia (state global)

Tài liệu chính thức: [pinia.vuejs.org](https://pinia.vuejs.org/)

### Store tối giản

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

### Các khái niệm chính

#### `defineStore(name, options)`

- `name` — định danh duy nhất cho store, dùng cho devtools và cache.
- `options` — gồm `state`, `getters`, `actions`.

#### `state()`

- Luôn là **hàm trả về object**, giống `data()` trong Vue.
- Mọi field trong state đều reactive tự động.
- **Không** dùng `this` trong `state` hay `getters` — chỉ dùng trong `actions`.

#### `getters`

- Tương đương computed properties trên state của store.
- Có thể đọc state và getter khác nhưng không được mutate.

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

- Nơi đặt mutation và logic bất đồng bộ. Hỗ trợ `async/await`.
- Có thể gọi action khác hoặc đọc getter qua `this`.

```ts
actions: {
  async fetchData() {
    const data = await fetch('/api/data').then((res) => res.json())
    this.count = data.count
  },
}
```

#### Dùng store trong component

```ts
const counter = useCounterStore()

console.log(counter.count)         // reactive
console.log(counter.doubleCount)   // getter reactive
counter.increment()                // gọi action để mutate
```

#### Hot Module Replacement

```ts
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCounterStore, import.meta.hot))
}
```

#### Module & namespacing

- Mỗi store là một module độc lập — không có cờ `namespaced` như Vuex.
- Tổ chức store theo feature (`userStore`, `productStore`,...).

### Tóm tắt

| Phần | Vai trò | Ghi chú |
| --- | --- | --- |
| `state` | Dữ liệu reactive | Hàm trả về object |
| `getters` | Giá trị derived/computed | Không gây side effect |
| `actions` | Mutation và logic async | Dùng `this` để truy cập state, getters, action khác |
