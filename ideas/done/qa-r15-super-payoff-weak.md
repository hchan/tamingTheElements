---
status: done
added: 2026-11-14
---

# Supers hit too softly for their cut-in (r15)

With the meter full and a frozen foe at point blank, a super took only 7.8% of life (Sindarosa vs Fiara), 10% (Pax vs Lavax), 15.7% (Echo vs Rokcore) and 7% (Curomo vs Treenoc). The big cut-in banner (HELLFIRE LANCE) promises a round-turning move; Street Fighter and Marvel vs Capcom supers take a third or more. Raise super damage, or add a bonus effect (guaranteed knockdown, root, big shake and hitstop) so the banner pays off. Measured with ~/claudetmp/qa-r15/d.mjs, shots 22-super-*.png.

Resolution (2026-11-14, SIM_VERSION 52): every super damage x3 (mean 10.2% -> 30.0% of life, min 4 -> 13, max 33 -> 79), heal shares cut to keep balance.
