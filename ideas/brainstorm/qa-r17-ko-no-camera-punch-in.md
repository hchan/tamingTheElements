---
status: idea
added: 2026-11-14
---

# KO has a colour wash but no camera punch-in (r17)

Seen in a headless Chromium run on main (f92013c3). After setHp(foe, 0) and shockSeek(200) the KO wash is about 0.59, but `arena.camera()` keeps zoom 1 through the whole KO. Street Fighter and MvC push the camera in on the final blow and hold a beat. Here the only KO cues are the wash, the big "K.O." letters and the rings, so the last hit lands flat compared with the super's zoom. Idea: a short zoom of about 1.08 toward the loser over about 250 ms with a 2-tick hit-stop, off under reduced motion. Shots: ~/claudetmp/qa-r17/12-ko-sindarosa-200.png, ~/claudetmp/qa-r17/53-land-ko.png.
