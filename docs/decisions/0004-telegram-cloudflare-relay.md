# 0004 — Telegram bot hosted on a free Cloudflare Worker relay

**Status:** Accepted (2026-10-02)

## Context
The user needs two-way texting with an iPhone: reminders out, and changes in. The app runs on
a Windows **laptop that sleeps and travels**, so a bot hosted on the laptop would miss
reminders and button taps whenever the lid is closed. iMessage is impossible from Windows.
SMS (Twilio) costs money, needs US carrier registration and has no buttons. Claude Code's
built-in channels are a research preview and need a live Claude session, so every message
would cost tokens.

## Decision
- **Telegram** bot (free, instant iPhone push, inline buttons, photos).
- The bot's webhook is a **Cloudflare Worker** (free tier) with D1 and a 1-minute cron. It
  holds a reminder **outbox** (filled ahead of time by the laptop) and an event **inbox**
  (timestamped button taps, texts, photos).
- The laptop polls the relay over HTTPS (no inbound ports, HMAC-signed). Buttons are handled by
  the relay at zero token cost. Free text waits for the laptop, which sends it to Claude.

## Consequences
- Reminders and timer taps work with the laptop asleep, with accurate timestamps.
- The user needs a free Cloudflare account and a BotFather token (setup in M8).
- A second deployable (`apps/relay`) to maintain; kept deliberately tiny.
