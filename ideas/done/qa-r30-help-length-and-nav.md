---
status: done
added: 2026-11-14
---

# Help is a 4200-4900 px scroll with no in-page navigation

Help (desktop 4902 px, phone 4200 px) stacks How to fight, the hero picker steps and Controls in one column. Fixed in the screens WP: a Back link now follows the title. Still open: a jump-link row (How to fight, Picking a team, Controls) or collapsible sections like Settings uses, a sticky Back on phone, and the five link chips (Key Bindings, Guide, Wiki, Watch the story, About) look like inline underlined links rather than buttons. Settings is good (3 collapsible groups, Save and Back sticky at top; radio pills are 50 px tall; scores readability 4/5, layout 4/5). Menu 4/5, Tour hub 4/5 (phone Back alignment fixed in tour-select.css).
Progress: jump-to nav (buttons, scroll+focus, reduced-motion safe) and button-styled chips in src/ui/styles/help.css; sticky phone Back not done.
