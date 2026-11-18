# Assets

**Honest status:** this build bundles **no third-party art, models or audio**. Everything visible and audible is generated in code at load time. Open-source packs were not downloaded, so the CC0 sourcing in the brief (Kenney, Quaternius, Poly Haven, ambientCG, Freesound...) is **not done**. Counts: CC0 packs 0, CC-BY 0, original procedural 3 groups, libraries 2 (Three.js MIT, Silkscreen OFL).

| Asset | Source | Author | License | Path |
|---|---|---|---|---|
| Silkscreen font | @fontsource/silkscreen (Google Fonts) | Jason Kottke | OFL-1.1 | npm, inlined at build |
| Three.js | https://threejs.org | mrdoof & contributors | MIT | npm |
| PBR texture sets (albedo/normal/ORM/emissive): wall atlas with 8 panel designs, floors, ceiling, plating, rust, crate, hazard, concrete, decals, signs | generated | Blackout Station | original, CC0 | src/game/textures.js |
| 3D models: world kit, doors, hatches, lockers, terminals, generators, pod, props, hands, items, monster | generated from primitives | Blackout Station | original, CC0 | world.js, hands.js, monster.js |
| Sound bank (~106 clips incl. music layers) | offline Web Audio synthesis | Blackout Station | original, CC0 | synth.js |

Machine-readable list: `assets/manifest.json` (checked by `scripts/check-assets.js`).

## To replace placeholders with real assets (not downloaded)
Models: Kenney "Space Kit" and "Modular Space Kit", Quaternius "Sci-Fi Modular"/"Ultimate Space Kit". Textures: ambientCG "Metal", "DiamondPlate", "Grate", "Rust"; Poly Haven metal/concrete sets. Audio: Kenney "Sci-fi Sounds"/"Impact Sounds", Freesound CC0 horror drones and creaks, OpenGameArt CC0 dark-ambient loops. Add each to the manifest and credits.
