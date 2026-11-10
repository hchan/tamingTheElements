---
name: mermaid
description: Rendering rules for Mermaid diagrams in this repo's Markdown docs. Use whenever creating or editing a mermaid block in docs/ or README.md.
allowed-tools: Read, Grep, Glob, Edit, Bash(git diff *)
---

# mermaid

Diagrams must render in GitHub and in the VS Code preview, which bundles an older Mermaid. Existing diagrams live in `docs/ARCHITECTURE.md`; copy their style.

## Hard rules

1. No `direction` inside a `subgraph`.
2. Never use a subgraph id as an edge endpoint; connect node ids.
3. Quote every label that has spaces or punctuation: `A["Fixed step (50 Hz)"]`.
4. Use `<br>` for line breaks in labels, never `\n`.
5. Keep ids short ASCII; no reserved word `end` as an id or lowercase label.
6. Plain `flowchart TD` or `LR`, `sequenceDiagram` or `stateDiagram-v2`; avoid newer diagram types.
7. Style lines are optional; if used, set both `fill` and `color` so text stays readable in light and dark themes.

## Check

1. Re-read the block against the rules above.
2. If `mmdc` is installed, run `mmdc -i <file> -o ~/claudetmp/out.svg` (syntax only). It is not part of this repo's dependencies, so skip it if absent.
3. Do not describe history in diagrams; show the current design.
