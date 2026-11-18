# Assets & Licensing (`ASSETS.md`)

## 1. SCP Foundation Attribution & Share-Alike Notice (CC BY-SA 3.0)
> "Content relating to the SCP Foundation, including the SCP Foundation logo, is licensed under Creative Commons Sharealike 3.0 and all concepts originate from scpwiki.com and its authors. Blackout Station: Halcyon Deep, being derived from this content, is hereby also released under Creative Commons Sharealike 3.0."

### Share-Alike Impact & How to Avoid It
* **Files isolated as SCP-derived (`CC BY-SA 3.0`)**:
  * `assets/scp-derived/LICENSE`
  * `src/game/monster.js` (pale emaciated sea creature model, unhinging jaw, and 11 animations inspired by SCP-096)
  * `src/game/monsterai.js` (the `ROAM -> FACE_SEEN -> DISTRESS -> RAGE -> RECOVER` gaze-triggered state machine)
  * Monster vocal synthesis entries (`monster-sob`, `monster-breath-wet`, `monster-growl`, `monster-scream`, `jumpscare-scream`) in `src/game/synth.js` and SCP notice in `src/game/story.json` / `src/game/config.js`
* **Share-Alike impact**: Under CC BY-SA 3.0, distributing a game that includes SCP-096 derived concepts or references the SCP Foundation requires the distributed derivative work to be licensed under CC BY-SA 3.0.
* **How to avoid CC BY-SA 3.0 if you want a proprietary license**:
  1. Remove the `SCP_ATTRIBUTION` string from `src/game/config.js` and `src/game/story.json`, and remove `assets/scp-derived/`.
  2. Adjust the creature design in `src/game/monster.js` (for example, replace the chalk-white emaciated unhinging-jaw humanoid with an original deep-sea angler/crustacean or diving-suit silhouette) so it is purely your original deep-sea horror concept ("Eli Vance / The Diver") with zero reference to SCP-096.

## 2. Bundled & Procedural Asset Manifest

All textures, 3D models, and audio clips in this repository are **generated procedurally in-engine at load time** (no third-party sculptures or reference images were copied, traced, or imported, and no external binary models/audio are hotlinked). Every entry is tracked in `assets/manifest.json` and verified by `node scripts/check-assets.js`.

| Asset / Sound Group | Original Title / Description | Author | Source URL / File | License | Edits / Notes |
|---|---|---|---|---|---|
| Silkscreen font | `@fontsource/silkscreen` | Jason Kottke | https://fonts.google.com/specimen/Silkscreen | OFL-1.1 | Bundled via npm, inlined at build |
| Three.js | `three` v0.187.0 | mrdoob & contributors | https://threejs.org | MIT | Bundled via npm |
| Offshore PBR Texture Atlas | 8-panel wall atlas (70% calm steel, 25% accent hazard/monitors/vents, 5% heavy pipe manifolds), 4-tile floor atlas, ceiling, rust, supply crate, decals, 20-room sign atlas | Blackout Station | `src/game/textures.js` | CC0 (original) | Procedural Canvas 2D + normal/ORM generation with salt/rain roughness streaks |
| Offshore Oil Rig 3D World & Props Kit | 15 room types (Layouts A & B), 10 door styles, unique Helideck Blast Gate, stormy Helideck, rescue helicopter, blinking green LED steel supply chests, food (`RATION`, `STEW`, `SOUP`), `PRY BAR`, `ELI LOCKET`, 4 crew rescue setpieces | Blackout Station | `src/game/world.js`, `src/game/hands.js`, `src/game/templates.json` | CC0 (original) | Built from Three.js primitives, merged per room with bounding boxes/spheres & instancing |
| Pale Deep-Sea Creature Rig (`Eli Vance`) | 2.4m emaciated sea creature with named skeleton bones, calcified barnacles, wet-look skin shader, 4x unhinging jaw, and 11 animation clips | Blackout Station (derived from SCP-096 concept by Dr Dan) | `src/game/monster.js`, `assets/scp-derived/LICENSE` | CC BY-SA 3.0 | Original procedural geometry & bone rig; reference images used for style only |
| Ocean & Storm Sound Bank | `wave-crash` (3x), `thunder-close` (2x), `thunder-mid` (2x), `thunder-far` (2x), `ambience-loop` | Blackout Station | `src/game/synth.js` | CC0 (original) | Offline Web Audio synthesis, -16/-20 LUFS normalized, seamless crossfaded loops |
| Structure & Rig Details Sound Bank | `creak` (5x), `pipe-groan` (2x), `vent-scrape` (3x), `distant-thud` (4x), `drip` (3x), `steam` (2x), `spark` (3x), `door-open` (3x), `door-close` (2x), `hatch-open` (2x), `escape-gate` (1x), `locker-open` (3x), `eat-food` (2x), `valve-turn` (2x) | Blackout Station | `src/game/synth.js` | CC0 (original) | Mono 32 kHz for 3D HRTF positioning, short fade-in/out |
| 14 Room Tone Loops | `tone-engine`, `tone-control`, `tone-galley`, `tone-storage`, `tone-pump`, `tone-medbay`, `tone-quarters`, `tone-cold`, `tone-workshop`, `tone-lab`, `tone-lifeboat`, `tone-moonpool`, `tone-corridor`, `tone-helideck` | Blackout Station | `src/game/synth.js` | CC0 (original) | Seamless 4s loops with 0.8s equal-power crossfade |
| Player & Footstep Sound Bank | `footstep-grate` (4x), `footstep-plate` (4x), `footstep-wet` (4x), `footrun` (4x), `breath-calm`, `breath-heavy`, `breath-pain`, `gasp`, `heartbeat_slow`, `heartbeat_fast` | Blackout Station | `src/game/synth.js` | CC0 (original) | Mono 32 kHz, pitch/volume jittered per step |
| Creature & Jump-Scare Sound Bank | `monster-sob` (3x), `monster-breath-wet` (2x), `monster-growl` (4x), `monster-scream` (3x), `monster-step-wet` (4x), `monster-bash` (2x), `monster-nora` (1x), `jumpscare-scream` (1x) | Blackout Station | `src/game/synth.js`, `assets/scp-derived/LICENSE` | CC BY-SA 3.0 | Formant-filtered vocal synthesis + 40 Hz sub-bass hit + 4 kHz tinnitus tail |

## 3. Recommended Open-Source Packs to Replace Procedural Placeholders (Optional Drop-In)
Because external internet downloads are restricted in the local sandbox environment, all models, textures, and sounds above are generated procedurally in-engine. To replace any procedural asset with downloaded CC0 packs:
* **3D Models (glTF)**:
  * Kenney *Modular Industrial / Space Kit* (CC0): https://kenney.nl/assets
  * Quaternius *Modular Sci-Fi / Industrial Props* (CC0): https://quaternius.com
  * Poly Haven *Industrial Props & Containers* (CC0): https://polyhaven.com/models
* **PBR Textures (KTX2 / WebP)**:
  * ambientCG `Metal032`, `DiamondPlate008`, `MetalGrate011`, `Rust004` (CC0): https://ambientcg.com
* **Recorded Audio (OGG / MP3 drop-in under `src/assets/audio/`)**:
  * Freesound (filter `license:CC0`): search terms `ship hull creak`, `metal stress`, `steel groan`, `platform creak`, `ocean waves storm`, `diesel generator hum`, `watertight door wheel`, `male sobbing crying` (https://freesound.org)
  * Kenney *Impact Sounds* & *Sci-Fi Sounds* (CC0): https://kenney.nl/assets/category:Audio
