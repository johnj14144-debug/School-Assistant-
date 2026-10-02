# 0003 — Use Claude through the user's own `claude` CLI and subscription

**Status:** Accepted (2026-10-02)

## Context
The user wants all Claude usage to come from their regular Claude plan (Pro), not paid API
tokens. Verified in the Claude Code docs (Oct 2026):
- `claude -p` (headless mode) uses the logged-in subscription when run **without** `--bare`.
  Bare mode skips OAuth and requires `ANTHROPIC_API_KEY`.
- `-p` supports `--output-format json`, `--json-schema` (validated structured output),
  `--model`, `--resume`, `--allowedTools`, `--permission-mode`, `--permission-prompts none`.
- The Agent SDK docs say third-party developers may not offer claude.ai login in their
  products. This app isn't distributed. It scripts the user's own installed Claude Code on the
  user's own machine.

## Decision
The main process spawns the user's installed `claude` executable as a subprocess, with JSON
schemas generated from zod, model **aliases** (`haiku`/`sonnet`/`opus`) from config, a
dedicated working folder, and the minimum tools each job needs. Claude returns structured
data or intents; the app validates them and applies them itself.

## Consequences
- No API keys and no per-token billing. Jobs must cope with usage limits (queue,
  `waiting_for_reset`, resume).
- Requires Claude Code installed and logged in on the laptop. Settings will check this.
- Tests use a fake `claude` executable; CI never needs credentials.
- If Anthropic's terms for scripted personal use change, revisit this ADR.
