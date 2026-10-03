# Architecture decision records

One short file per significant decision: the context, the decision, and its consequences.
Add a new numbered file when a session makes a decision a future session would otherwise
re-debate. Don't rewrite old ADRs. Supersede them with a new one that links back.

| # | Decision | Status |
|---|---|---|
| [0001](0001-typescript-electron-monorepo.md) | All-TypeScript Electron app in a pnpm monorepo | Accepted |
| [0002](0002-algorithm-plans-claude-advises.md) | Deterministic scheduler; Claude only for fuzzy work | Accepted |
| [0003](0003-claude-via-user-cli.md) | Use Claude through the user's own `claude` CLI and subscription | Accepted |
| [0004](0004-telegram-cloudflare-relay.md) | Telegram bot hosted on a free Cloudflare Worker relay | Accepted |
| [0005](0005-sqlite-drizzle.md) | SQLite via better-sqlite3 + Drizzle ORM | Accepted |
| [0006](0006-textbook-first-roadmap-coach.md) | The coach researches, plans for the stated goal and decomposes; it doesn't author textbooks | Accepted |
| [0007](0007-local-time-recurrences.md) | Instants in UTC; recurring fixed events in local time + IANA zone | Accepted |
| [0008](0008-embedded-migrations.md) | Migrations: drizzle-kit SQL embedded in the bundle, applied by our own runner | Accepted |
| [0009](0009-timer-sessions-and-change-events.md) | The timer lives in the database; main pushes change events to the renderer | Accepted |
| [0010](0010-calendar-routine-and-blocks.md) | Calendar: RRULE subset, an Intl zone helper, a protected sleep floor, FullCalendar 7 | Accepted |
| [0011](0011-scheduler-v1.md) | Scheduler v1: earliest deadline first on a 5-minute grid, steps first, fallbacks | Accepted |
