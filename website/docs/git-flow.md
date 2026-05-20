---
sidebar_position: 3
title: Git flow
---

# Git flow

We use a lightweight Git Flow with three long-lived branches and short-lived feature branches.

![Git flow overview](/img/gitbook/image.png)

## Long-lived branches

| Branch | Purpose |
| --- | --- |
| `master` | Production. Only hotfixes and release merges land here. |
| `develop` | Integration branch for upcoming releases. All testing happens here. |
| `feature/*`, `hotfix/*` | Short-lived branches owned by a single engineer. |

## Day-to-day workflow

1. **Start a feature**
   - Branch from `master` for a hotfix, or from the latest `develop` for a new feature.
   - Name the branch after the work, e.g. `feature/product-search`, `hotfix/checkout-redirect`.

2. **Develop and test**
   - Commit small, focused changes locally on your feature branch.
   - When the feature is ready for QA, create a personal integration branch (for example `feature/product-search-dev`) off `develop`.
   - Merge, rebase, or cherry-pick your feature branch into that integration branch and resolve any conflicts there — never on `develop`.

3. **Open a pull request**
   - Open the PR from your integration branch into `develop`.
   - Link the related issue(s) in the description and reference them in commits using `#<issue_id>` (e.g. `feat(builder): add product search #1234`).

![Pull request example 1](/img/gitbook/Screenshot%202025-07-26%20at%2011.45.14.png)

![Pull request example 2](/img/gitbook/Screenshot%202025-07-26%20at%2011.40.27.png)

## Commit message conventions

- Use the imperative mood: "Add", "Fix", "Refactor" — not "Added" or "Fixes".
- Prefix with a scope when helpful: `feat(api):`, `fix(builder):`, `chore(deps):`.
- Always reference the issue id at the end of the subject or in the body: `#1234`.
- Keep the subject under 72 characters; put the detailed explanation in the body.

## Review checklist before merging

- The branch is rebased on the latest `develop` (or `master` for hotfixes).
- CI is green.
- At least one reviewer has approved.
- All linked issues are referenced and ready to be closed.
