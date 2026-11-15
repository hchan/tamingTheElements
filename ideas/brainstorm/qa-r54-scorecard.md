---
status: idea
added: 2026-11-15
---

# QA r54 scorecard (HEAD 42576d52, dev server port 7955, headless Chromium SwiftShader)

Scores 0-5 versus Street Fighter / Marvel vs Capcom (r53 was 3.5 / 4.2 / 3.5). Screenshots: `~/claudetmp/qa-r54/s/`. E2E used port 7954.

- Fun: 3.5 (=). All flows ran with 0 page errors: four 1v1 stages with hit and super, 2v2 tag swap (TAG!, "TAG 2.8s"), Tour, phone landscape (667x375) and, new this round, phone portrait (390x844) in-match. CC adds chips but no body feedback, so a stun still does not feel like a stun. Hit-stop and the new CC audio cues cannot be judged from stills.
- Graphics: 4.2 (=). Idle auras read well (Fiara orange motes, Morblass blue halo, Echo violet glow, Rokcore ember eyes and floating shards on Earth). No new art beyond that. Wispera's dithered halo and the menu silhouette contour noise are still there.
- Readability: 3.6 (+0.1). CC chips (DAZED / ICED / DOWN / SILENCED with icon and countdown) are legible next to SAFE / STUN / SNAGGED. Deduction: phone portrait in-match is unusable (findings, new #2), and the chip lane sits on the busy crowd band.

Compared with r53: fun =, graphics =, readability +0.1.

E2E subset (port 7954, 1 worker): idle-aura, idle-motif, status-fx, arcade-tag, 27 of 27 passed.
