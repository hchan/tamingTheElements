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
- [blender-rigging-pilot](../brainstorm/blender-rigging-pilot.md): Blender rigging pilot (headless, driven by Claude Code). Owner asked 2026-11-16 whether to rig heroes with Blender.
