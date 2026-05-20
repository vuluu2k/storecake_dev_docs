---
sidebar_position: 2
title: Setup
---

# Workstation setup

A short checklist for getting a new laptop ready to work on any of the three Storecake repositories. Project-specific install steps live under each project section — this page covers the shared baseline.

## Required tooling

| Tool | Purpose | Recommended version |
| --- | --- | --- |
| **Git** | Version control | Latest stable |
| **Docker Desktop** (or OrbStack) | Run backend services and the local stack | Latest stable |
| **Node.js** | builderx_spa and frontend assets | 18 LTS or newer |
| **Elixir / Erlang** | Optional — backend dev without Docker | Elixir 1.12.x · OTP 24 |
| **Make** | Project task runner used by every repo | Bundled with macOS / Linux |
| **VS Code** | Recommended editor (see extension lists per project) | Latest stable |

> Most engineers run the backends inside Docker and the SPA on the host. You only need a native Elixir install if you want to attach an IEx shell or run mix tasks without entering the container.

## SSH and GitHub access

1. Generate an SSH key (`ssh-keygen -t ed25519`) and add it to your GitHub account.
2. Confirm access: `ssh -T git@github.com`.
3. Make sure you are a member of the `pancake-vn` organization — ping a maintainer if you cannot see the repositories.

## Recommended dotfiles

- Configure Git identity:
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```
- Enable rebase on pull and prune-on-fetch:
  ```bash
  git config --global pull.rebase true
  git config --global fetch.prune true
  ```

## Next steps

- Read [Git flow](./git-flow.md) for branching, commit, and review conventions.
- Pick the project you will be working on and follow its **Installation** page.
