# 0001 — All-TypeScript Electron app in a pnpm monorepo

**Status:** Accepted (2026-10-02)

## Context
The app must be a standalone Windows program with a tray icon, auto-start, notifications and an
installer. It needs a rich calendar UI, a background scheduler, subprocess calls to the
`claude` CLI, and a small cloud relay for Telegram. The user explicitly said this is not the
codebase they will learn on: "create it with what's best for this application." It will be
extended mostly by Claude Code across many sessions.

## Decision
- One language, **TypeScript**, everywhere: app logic, UI, the relay (Cloudflare Worker) and
  the JSON schemas that constrain Claude's outputs (zod).
- **Electron** (via electron-vite) for the desktop shell, **React + Tailwind** for the UI.
- **pnpm workspace**: `packages/core` (pure domain logic, no I/O), `apps/desktop`, later
  `apps/relay`.
- **Biome** for lint + format and **Vitest** for tests.

## Consequences
- Types and schemas are shared end to end, so one tool and one test runner cover everything.
- Electron is heavier than Tauri (~150–300 MB RAM). That's acceptable on a laptop for a single
  always-on personal app, and it brings the most mature Windows desktop integration.
- Rejected: Python backend + web UI (three runtimes once the relay exists, harder packaging);
  Tauri (Rust backend, less mature ecosystem for this).
