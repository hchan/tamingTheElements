---
status: done
added: 2026-11-14
---
# Tag and Snag feedback (r12)

2v2: pressing 3 shows TAG! and the bench cooldown, but the live region did not announce it (stayed "The enemy charged. | Fight!"), so screen-reader users get no tag feedback. A second 3 during cooldown gives no message. Snag: the first-run text says "Snag with C" for every hero including Sindarosa, who has no Snag, and the action bar shows no C label. Pax in 2v2 has 445 life vs 765 in 1v1, which is not explained anywhere.

Fix: announce tag, say "not ready" on an early tag, make the hint hero-aware.

Done (touch-snag): the first-run card now names Snag only for heroes that have it. Still open: the live-region Tag announcement, the early-Tag "not ready" message, and the Pax 2v2 life note.

Done (tag-announce): Classic 2v2 swaps now announce "Tagged in <hero>." (Arcade already had tagIn lines); a Tag press during the cooldown says "Tag ready in N seconds." in the live region (Arena.announceEarlyTag, tagNotReady); the "SNAG" pop above the caster already reads Snag (no Capture wording in ability-aura-view). Not done: the Pax 2v2 life note (design text only).
