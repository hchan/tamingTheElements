---
status: done
added: 2026-11-12
---
# Touch layout CSS uses `mod()` / `round()` with no fallback

`src/ui/styles/main.css` (dac088a / 2924a31): the two-row mouse wrap (`@media (pointer: fine) and (max-width: 1100px)`) and the short coarse
screen layout (`@media (pointer: coarse) and (max-height: 520px)`) place buttons with `mod(var(--touch-row), 4)` and
`round(down, var(--touch-row) / 4, 1)`. Browsers without CSS stepped-value functions (Chrome < 125, Safari < 15.4, Firefox < 118) drop the
whole declaration, so the earlier single-column/row `right`/`bottom` stays and on a short phone the 8th button runs off the top again
(the exact bug the rule fixes). The e2e (`responsive.spec.ts`) only runs current Chromium, so it cannot see this.
Fix: wrap in `@supports (right: round(down, 5px / 4, 1px))`, or set `--touch-col` and `--touch-line` inline from `touchButton(label, row)`
(plain integers, no CSS math) which also keeps the layout testable in happy-dom. Also: `touch-controls.ts` header comment still says
"56 px apart" (now `--touch-pitch` 78/86 px).
