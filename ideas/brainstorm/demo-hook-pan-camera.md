---
status: idea
added: 2026-11-12
---

# `?ff=arenaDemo,arcade` builds the 1920 world but never mounts the pan camera

Found in WP 38f: the demo hook skips `arcadeLaunch`, so the camera stays fixed. Pan specs must use the real `#arcade` route (Fight!). Mount the pan camera in the demo path too so demo-based specs and screenshots see the real view.
