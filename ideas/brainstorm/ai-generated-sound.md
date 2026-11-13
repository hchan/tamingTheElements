---
status: idea
added: 2026-11-13
---

# AI-generated sound effects and music

Today every cue is synthesised in the browser (`src/game/audio/element-sfx.ts`: oscillators and filtered noise, no files). It sounds thin next to the grim, textured art. Owner (2026-11-13): bundle size does not matter, so shipped audio files are fine.

- Pilot a local text-to-audio model (Stable Audio Open, AudioGen; MusicGen for music) on the Mac GPU, first check it runs headless.
- Generator scripts in `tools/audio-gen` (committed with the outputs, licence notes in the same commit), output as small .ogg files per element and `SfxKind`.
- Pilot: the four element hit sounds plus the Cleanse sounds; keep the synth voices as fallback and for tests.
- Loop-able ambience per arena element, then music.
- Check model licences allow shipping the output.
