---
name: play-local
description: Run the game locally in a browser (dev server or production preview), with the useful URL flags for Classic, Arcade, tester mode and demos. Use when asked to run, play or try the game locally.
argument-hint: [dev|preview] [port]
allowed-tools: Bash(corepack pnpm dev *), Bash(corepack pnpm dev), Bash(corepack pnpm build), Bash(corepack pnpm preview *), Bash(kill *), Bash(lsof *), Bash(open *), Read
---

# play-local

Runs Taming the Elements on your machine. Use `corepack pnpm` (`pnpm` may not be on PATH).

## Procedure

Run the script (it checks the port, starts the server detached, waits until it answers, opens the browser, prints one line):

`tools/dev/play-local.sh [dev|preview] [port] [query]` e.g. `tools/dev/play-local.sh dev 5173 '?ff=play&seed=7'`

Mode default `dev`, port default `5173`; it refuses the reserved e2e ports. Preview builds first (URL flags do NOT work there). If the port is already serving, it just opens the browser. Report the printed URL and pid. When finished, `kill <pid>` (never `pkill -f vite`).

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
