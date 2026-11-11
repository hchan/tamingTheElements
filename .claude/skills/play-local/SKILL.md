---
name: play-local
description: Run the game locally in a browser (dev server or production preview), with the useful URL flags for Classic, Arcade, tester mode and demos. Use when asked to run, play or try the game locally.
argument-hint: [dev|preview] [port]
allowed-tools: Bash(corepack pnpm dev *), Bash(corepack pnpm dev), Bash(corepack pnpm build), Bash(corepack pnpm preview *), Bash(kill *), Bash(lsof *), Bash(open *), Read
---

# play-local

Runs Taming the Elements on your machine. Use `corepack pnpm` (`pnpm` may not be on PATH).

## Procedure

1. Mode from `$ARGUMENTS` (default `dev`), port default `5173`. Never use 4173/4373/4473/4573/4673/4773 (reserved for e2e and agents).
2. Check the port is free: `lsof -i :<port>`. If a stale vite of yours is on it, kill only that PID (`kill <pid>` from lsof). Never `pkill -f vite`: it also kills dev servers other agents are using.
3. Start it in the background (`run_in_background`) so the session stays usable:
   - **dev** (hot reload, URL flags work): `corepack pnpm dev --port <port> --strictPort`
   - **preview** (what ships; URL flags do NOT work): `corepack pnpm build && corepack pnpm preview --port <port>`
4. Wait for the "Local: http://localhost:<port>/" line, then `open http://localhost:<port>/` and tell the user the URL.
5. When finished, `kill` the PID holding the port. Use `--strictPort` so vite fails instead of silently moving to another port.

## URL flags (dev/test builds only)

| URL | What you get |
| --- | --- |
| `/` | Normal menu, Classic game (Skip is canvas-drawn at about (1150,46); the starting hero is random) |
| `/?ff=play` | Straight into play |
| `/?ff=arenaDemo` | Arena demo |
| `/?manual=1` | Manual stepping for debugging |
| `/?seed=123` | Fixed seed for repeatable runs |

Combine with `&`, e.g. `/?ff=play&seed=7`. Tester mode (full garrison and abilities) is in the in-game settings; see docs/TESTER-MODE.md. The Arcade ruleset is opt-in from the menu.

## Controls and display

Arrow keys move, Space attacks. Display Size is in Settings (new players start at Largest). Classic is the legacy ruleset; Arcade is the new fun-focused one.

## Report

Say the mode, the URL, and whether the server came up cleanly. Do not edit code in this skill.
