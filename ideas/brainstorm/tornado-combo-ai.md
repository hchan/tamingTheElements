---
status: idea
added: 2026-11-12
---

# Tornado deals 0 damage and the AI never converts it

From docs/ABILITY-AUDIT.md finding 3. Tornado is 0.0% of damage in every run (Classic and Arcade): a 60-tick stun (heavy) whose value is the Wind Cone follow-up. Teach the Arcade AI (src/core/agents/scripted-ai) to fire Wind Cone and Charge into a stunned target, or give Tornado a small hit. Measure with the Cyclonius pairings. See ai-tuning-more.
