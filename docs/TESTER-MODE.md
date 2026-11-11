# Tester mode

An opt-in playtest mode that is also in production builds, so the live site can be playtested. It is off until you enter the
cheat code, it lasts only for the browser tab, and it is marked on screen the whole time.

## Turn it on

| How | Where |
|---|---|
| Click **Cheats** on the main menu (every build; it turns tester mode on and opens the panel; afterwards it reads **Tester options**) | Main menu |
| Press **Up Up Down Down Left Right Left Right B A** | on the main menu |
| Tick **Unlock full garrison** | Settings |
| Add `?cheats=1` to the URL | dev and test builds only (never production) |

A yellow **TESTER MODE** badge (top right) shows on every screen, including during play. It says whether progress is thrown
away ("progress not saved") or kept ("keeping progress"). Click it to open **Tester options**. The panel is also reachable from
the main menu (**Tester options** button) and from the pause dialog during a battle (**Tester options**, pause with Escape or Shift-P).
Turn it off with **Turn tester mode off** in the panel, or close the tab.

## What each option does

**Full cheat** (button at the top of the panel): one click turns on every option below (unlock all abilities, 3-hero team,
instant swap, God mode, bench panel, and the Arcade extras), leaves **Keep cheat progress** off, and fills the garrison with one
hero of every character, the last boss (Eternal Void) included, at level 15. Heroes you already have are raised to level 15,
others are kept. The edit goes to the throwaway slot only; if Keep was on, the preset switches it off first (re-copying your real
save), so the real save is never written.

Options (checkboxes, each on its own):

- **Unlock all abilities (Capture) in any chapter**: sets the `testerCapture` sim flag for the next battle, so the Capture slot
  exists in a chapter-1 save. Every character's own abilities are always usable; Capture is the only one gated by chapter.
- **3-hero team in any chapter**: the Garrison picker accepts 1 to 3 heroes in any chapter, so Swap is available. Swap uses the
  normal swap system and its normal 5 second cooldown.
- **Instant swap**: zeroes your swap cooldown every tick.
- **God mode**: your team stays at full health. Turn it off to watch benched health recover.
- **Bench panel**: during a battle shows every hero on your team with `current / max (rest cap)` as text and bars (grey = the rest
  cap, coloured = current). Benched heroes heal 0.5% of max health every second up to the rest cap; the cap halves the gap each
  time you swap a hero out.
- **Arcade: full hyper meter** and **Arcade: no cooldowns** (a separate group, shown only while an Arcade battle is running):
  every tick, before `step`, team 0's meter is set to full and its ability, dash and weather cooldowns are zeroed. Plain state
  edits like God mode: no sim change, no `SIM_VERSION` bump, goldens unchanged; a Classic match has no Arcade block, so they do
  nothing there. The replay is flagged `cheats` like any tester match.
- **Keep cheat progress**: off by default. Off means every save goes to a throwaway slot in this tab (copied from your real save
  when tester mode started) and your real save is never written. On copies the tester slot over your real save (after a confirm)
  and writes there from then on. Turning it off again re-copies your real save.

In a battle (buttons; the legacy keys still work while tester mode is on):

- **My HP to 25%**, **Enemy HP to 25% (capture window)**: sets the active hero or enemy to exactly 25% health.
- **I win (Shift-Q)**: kills every enemy. **Freeze enemy (Shift-X)**: freezes every enemy. **Capture win (Shift-C)**: flags every
  enemy captured, so they join your garrison.

On the save (applies to the active slot, usually the throwaway one):

- **Level +1 / to 5 / to 10 / to 15** for the hero chosen in the list, **Advance chapter** (capped at 5, ignores objectives),
  **Add every race to the garrison** (one level 1 hero of each race you do not have; not the last boss).

## What tester mode does not do

- It never changes the Classic rules. Cheats are state edits applied outside the simulation step (`src/core/tester/`), plus the
  recorded `testerCapture` sim flag, which is off in normal play (Classic hashes and golden replays are unchanged).
- It never writes your real save unless you turn on **Keep cheat progress**.
- A replay recorded in tester mode (with "Record playtests" on) has `cheats: true` in its header. The replay viewer, `pnpm
  replay:verify`, the golden recorder and the balance gates refuse it.

## 5-minute playtest checklist

1. Open the site with a chapter-1 save (or press New Game). Enter the code on the main menu; check the TESTER MODE badge.
2. Open **Tester options**, click **Add every race to the garrison**, **Close**.
3. Garrison: pick three different heroes, **Enter Battleground**.
4. **Capture**: the action bar shows Capture with its key (C by default) and "Capture unlocked!" for 10 seconds. Open the panel
   (pause, then Tester options), click **Enemy HP to 25%**, resume, walk up and press C: the enemy leaves the field and, after the
   match, joins your garrison.
5. **Swap and rest-heal**: turn **God mode** off. Let the enemy hurt your hero (or click **My HP to 25%**), then press 3 (or 4) to swap.
   Watch the Bench panel: the hurt hero's number rises about every second, never above its grey rest cap. Wait for the swap
   cooldown to fill on the action bar, swap back, and check the hero returns with the recovered health.
6. **Instant swap**: tick **Instant swap**, swap twice in a row with no wait.
7. **Normal progression** (turn tester mode off first): play chapter 1 to level 5 (5 wins), open **Current Objectives**, press **Begin
   next chapter** and look for **Capture unlocked!**. Faster: with tester mode on, **Level to 5**, **Advance chapter**, then check the
   same screens.
8. Finish: check the badge text says your progress was not saved, then **Turn tester mode off** and confirm your real save is as before.
