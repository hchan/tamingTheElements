---
status: idea
added: 2026-11-14
---

# Online lobby: code labels squeezed beside textareas on phone landscape

On 844x390 the "Your code to send to your friend (host)" label sits in a narrow left column with the textarea to its right, wrapping to 3+ lines; on 1280x720 the label stacks above the textarea. Stack label over textarea at every width (main.css form layout, `#menu form > div`), and keep Make a code / Copy buttons at 44 px. The page also scrolls 1300-1650 px with no Back near the top; add a top Back link as Help now has. Wording: "(host)" repeated on every label is noise for players; consider dropping it from the visible label and keeping it in aria-label. Score: layout 3/5, readability 4/5 (no peer needed to review it).
