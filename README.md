# School Assistant

A personal planner, life coach and grade calculator for Windows, with an iPhone companion
through Telegram, powered by your own Claude subscription.

- **Planner**: time-blocks your whole week from deadlines and re-plans live as your day changes.
  A task timer learns how long things really take you.
- **Life Coach**: researches your big goals in depth and builds a plan that gets you there: a
  roadmap of the best textbooks, projects and competitions, honest warnings when the timeline is
  tough, and a check that every step really helps the goal. Courses follow real textbooks, with
  homework, placement tests and practice exams, and everything breaks down into tasks on your
  calendar. Also a weekly research report on competitions and opportunities.
- **Grade Calc**: every grade in every course, your current grade, and the best grade still
  possible.

> Status: **foundation built (M0)**; the first outside review is applied. See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next and
> [docs/STATUS.md](docs/STATUS.md) for the latest handoff note.

## Set up on your Windows laptop

1. Install **Node.js 24 LTS** (https://nodejs.org) and **Git** (https://git-scm.com).
2. Enable pnpm: open PowerShell and run `corepack enable`.
3. Install **Claude Code** and log in with your Claude Pro account
   (https://code.claude.com/docs/en/setup). The app will use it for its AI features.
4. Clone and run:

   ```powershell
   git clone https://github.com/johnj14144-debug/School-Assistant-.git
   cd School-Assistant-
   pnpm install
   pnpm dev
   ```

   The first `pnpm dev` downloads Electron, which takes a minute.

Later milestones will need a Telegram account plus a bot token from @BotFather, and a free
Cloudflare account (M14). The roadmap explains each step when it's needed.

## Working on it with Claude Code

Open the folder in Claude Code and say "continue the roadmap". `CLAUDE.md` tells Claude how
the project works and to read `docs/STATUS.md` first. Each session builds the next milestone and
updates the status note for the next one.

| Doc | What's in it |
|---|---|
| [docs/VISION.md](docs/VISION.md) | What the app does and why (the product spec) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it's built |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones M0–M12 with checklists |
| [docs/STATUS.md](docs/STATUS.md) | Where things stand right now |
| [docs/IDEAS.md](docs/IDEAS.md) | Parked ideas for later |
| [docs/decisions/](docs/decisions/) | Why key choices were made |
| [docs/prompts/](docs/prompts/) | Ready-to-run prompts for specific sessions (e.g. the deep review) |
