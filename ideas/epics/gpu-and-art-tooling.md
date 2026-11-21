---
status: epic
added: 2026-11-16
---

# Epic: GPU offload and art tooling

Offload heavy image/rig work to the Windows GPU PC and pilot Blender rigging.

- Suggested order: remote-gpu-offload first (enables the rest), then the Blender pilot.
- Size: M.
- Dependencies: SSH host/user/key are in the owner memory notes (LAN only); art generators must be saved into tools/.
- Owner-gated: Credentials are never read or printed; using the owner hardware counts as an outward-facing step, so confirm first.

Member ideas, in suggested priority order (work them as separate small work packages):

- [remote-gpu-offload](../brainstorm/remote-gpu-offload.md): Offload heavy work to the owner's Windows PC (RTX 4060). Owner, 2026-11-16: the Mac crashed under parallel agent load;
- [blender-rigging-pilot](../in-progress/blender-rigging-pilot.md): Blender rigging pilot (headless, driven by Claude Code). Owner asked 2026-11-16 whether to rig heroes with Blender.

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [gpu-vs-mac-bakeoff](../brainstorm/gpu-vs-mac-bakeoff.md): Bake-off: RTX 4060 PC vs the Mac (M4 Pro) for heavy jobs

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### GT-1 Remote GPU offload and bake-off

- Members: [remote-gpu-offload](../brainstorm/remote-gpu-offload.md), [blender-rigging-pilot](../in-progress/blender-rigging-pilot.md), [gpu-vs-mac-bakeoff](../brainstorm/gpu-vs-mac-bakeoff.md)
- Size: M
- Shared files: tools/gen/*, tools/rig-assist/*, docs only for results
- Flags: PC-offloadable by definition; OWNER-GATED (using the owner hardware is an outward-facing step: confirm first); credentials never read or printed; no browser
- Parallel: Parallel with everything; do not run during other PC-heavy bundles.
