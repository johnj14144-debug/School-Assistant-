# School Assistant

A personal Windows app for one UH student: a **Planner** (auto time-blocking + task timer),
a **Life Coach** (where you start → deep research → roadmap of textbooks, projects and
competitions for the goal as stated, with feasibility warnings and "does this help?" checks →
textbook-first courses → planner tasks), and **Grade Calc**. iPhone via a Telegram bot; AI via
the user's own Claude Pro subscription.
Product spec: `docs/VISION.md`. Design: `docs/ARCHITECTURE.md`.

## Session protocol (multi-session project)

**Start of every session**
1. Read `docs/STATUS.md` (handoff note), then `docs/ROADMAP.md`.
2. Work on the **first unchecked milestone** unless the user asks for something else.
3. Skim the relevant ADRs in `docs/decisions/` before changing anything architectural.

**End of every session**
1. `pnpm check` must pass (lint + typecheck + tests).
2. Tick finished items in `docs/ROADMAP.md`; rewrite `docs/STATUS.md` (done / next / gotchas /
   open questions).
3. Record new architectural decisions as a new ADR (`docs/decisions/000N-*.md` + index).
4. Commit, push, and open or update the PR.

**Running out of time or usage mid-milestone:** stop at a clean point (tests green, no
half-wired UI), commit, and list exactly what's left under "Next session" in `docs/STATUS.md`.
Never leave the app unusable between sessions.

## Commands

```bash
pnpm install          # once; Electron's binary downloads on first launch
pnpm dev              # run the desktop app with hot reload
pnpm check            # lint + typecheck + tests (run before every commit)
pnpm lint:fix         # Biome format + safe fixes
pnpm test             # Vitest (all projects)
pnpm build            # production build of the desktop app (apps/desktop/out)
pnpm --filter @sa/desktop dist   # Windows installer (run on Windows)
pnpm fable-kit        # bundle the whole project into one file for an outside review
```

## Layout and conventions

- `packages/core` — **pure** TypeScript domain logic (grades, scheduler, estimator, zod
  schemas). No Electron, no I/O, no Date.now() inside functions; pass `now` in. Most tests
  live here. If logic can be pure, it goes here.
- `apps/desktop/src/main` — Electron main process: lifecycle, tray, DB, services, AI runner.
  Feature services go in `src/main/features/<feature>/`.
- `apps/desktop/src/shared/ipc.ts` — the IPC contract (zod schemas for every channel). New
  renderer→main call = add a channel here + a handler in the feature's handler object under
  `src/main/features/<feature>/`, which `src/main/handlers.ts` spreads together. Handlers
  receive the parsed input (`IpcParsedInput`).
- `apps/desktop/src/renderer/src` — React UI. Screens go in `features/<feature>/`; register pages in
  `routes.tsx`. Talk to main only via `window.api.invoke`.
- `apps/relay` — Cloudflare Worker for Telegram (arrives in M14).
- Style: TypeScript strict, Biome formatting (2 spaces, single quotes, 100 cols). Tests next to
  code as `*.test.ts`. Instants are stored in UTC; recurring fixed events store local time + an
  IANA zone (ADR 0007); durations are in minutes.

## Rules

- Scheduling/re-planning is deterministic code, never an LLM call (ADR 0002).
- Claude is invoked only through the user's `claude` CLI **without `--bare`** so it uses the
  subscription (ADR 0003). Prompts go through stdin; CLI flags live in one table with minimum
  versions; the child environment never carries `ANTHROPIC_API_KEY` (ARCHITECTURE "Claude
  bridge"). Claude returns schema-validated data/intents; the app applies them. Never add API
  keys or paid-API code paths.
- The Life Coach (ADR 0006) builds the plan for the goal **as the user stated it**: warn about
  feasibility, never lower the goal. Every roadmap item needs a sourced impact check ("does
  this help the goal?"). Courses are textbook-first: a unit points at real material or is an
  explicitly justified gap; never generate lessons for material a chosen textbook covers.
  Materials are chosen on quality alone; price is never a factor. The user approves the
  dossier, the roadmap and each course before tasks are created.
- Renderer URL policy: links open externally only if `isSafeExternalUrl`; navigation only if
  `isAllowedNavigation` (`src/main/security.ts`). Don't bypass these for new features.
- Never commit user data (`*.db`), secrets, or tokens. Bot tokens go in Electron `safeStorage`
  and Worker secrets.
- Keep `@sa/core` in the desktop app's **devDependencies** (it must be bundled, not externalized).
- Pinned on purpose: Vite 7.x + `@vitejs/plugin-react` 5.x (electron-vite 5 doesn't support
  Vite 8 yet). See `docs/STATUS.md` gotchas before upgrading tooling.
- New features need tests. Core logic gets unit tests; scheduler gets property-based tests.
- The user decides product questions. When the spec is unclear, ask rather than guess, and
  record the answer in `docs/VISION.md`.
