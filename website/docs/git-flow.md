---
sidebar_position: 3
title: Git flow
---

# Git flow

![Git flow overview](/img/gitbook/image.png)

1. Start branch → get **master** (hotfix) → create **my branch** (feature name)
2. Complete feature → muốn test → tạo branch từ **develop** → **my branch dev** → merge/rebase/cherry-pick **my branch** → fix conflict → create pull request từ **my branch dev** vào **develop**
3. Commit attachment id issue (`#number_id #number_id`)

![PR screenshot 1](/img/gitbook/Screenshot%202025-07-26%20at%2011.45.14.png)

![PR screenshot 2](/img/gitbook/Screenshot%202025-07-26%20at%2011.40.27.png)
