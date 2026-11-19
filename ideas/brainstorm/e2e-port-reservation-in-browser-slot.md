---
status: idea
added: 2026-11-18
---

# Reserve the e2e port in browser-slot

`tools/ci/browser-slot.ts` serialises browser runs per machine but does not reserve the checkout's preview port, so another process can hold it (the supervisor then logs `port in use` and names the holder). Reserve or check the port when taking the slot.
