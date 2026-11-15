---
status: in-progress
added: 2026-11-14
---

# Crowd-control animations (dazed, snagged, iced, ...) and matching abilities

Owner idea (2026-11-14): the opponent needs a visible animation when dazed, snagged, iced and so on, and we should create the corresponding abilities.

- Audit the status effects that already exist in the sim (stun/daze, Snag root, freeze/ice, slow, burn, knockdown, ...) and what each looks like today; list the ones with no distinct animation.
- Per-status animation per hero (presentation only): dazed = swaying head with orbiting stars or motes, snagged = rope/vines wrapping and straining, iced = frost crust with a frozen pose and cracking on release, slowed = heavy drag, burning = flame licks (see [idle-element-auras](idle-element-auras.md)), plus new ones below. A clear start, hold and release beat for each so players read what happened and when it ends. Not colour alone; reduced-motion keeps a static icon pose.
- New abilities to cause the missing states (sim change, Arcade only), for example: air daze/gust stun, water freeze or soak (slows, extra damage from lightning), earth root/entomb, fire blind/smoulder. Each with duration, cooldown, counter, cleanse interaction and diminishing returns so nobody gets chain-locked.
- Coordinate with [hot-dot-abilities](hot-dot-abilities.md) and [backline-support-abilities](backline-support-abilities.md) (shared status code and cleanse), [backward-walk-animation](backward-walk-animation.md) and the locomotion/pose-layer hooks.
- Sim part queues behind other sim work (one sim agent at a time); the animation part can ship first for statuses that already exist.
