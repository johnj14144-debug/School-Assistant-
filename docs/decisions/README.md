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
