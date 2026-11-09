# Taming the Elements

A real-time 1v1 elemental arena battler with monster capture. Build a garrison of elemental creatures, fight in real time,
capture defeated enemies, and take on the Eternal Void across four chapters.

> **Status: modernization in progress.** The playable game is the legacy Crafty.js version in `war/`. It is being ported to
> Phaser 4 + TypeScript + Vite with a deterministic simulation core and full test coverage.

## Play the legacy version

Serve `war/WEB-INF/private/` with any static file server and open `index.html`:

```sh
npx http-server war/WEB-INF/private -p 8080
```

## Contributing

Trunk-based development with small branches: see [docs/BRANCHING.md](docs/BRANCHING.md). Repo rules for contributors and
agents are in [CLAUDE.md](CLAUDE.md).

## Roadmap

1. Toolchain, CI and characterization tests that lock the legacy behaviour.
2. Deterministic simulation core, then the Phaser renderer and DOM menus.
3. Deploy to GitHub Pages and itch.io, then polish and online play.
