---
status: idea
added: 2026-11-18
---

# Online guest token persistence

Every Find asks the service for a fresh guest session. Keeping the guest token in localStorage (own key, expiry from the service) would let a reload resume a match inside the reconnect grace and would give a stable guest identity for later ranking. Privacy note needed (a random token, no personal data); clear it with the other saves in Settings.
