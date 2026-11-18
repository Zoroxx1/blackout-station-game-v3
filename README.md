# BLACKOUT STATION

A first-person, fully 3D (Three.js / WebGL2) horror survival game for desktop and phones. Ten minutes. A blind creature that hears everything. A new seeded level every run.

## Run / build
```
npm install
npm run dev          # dev server
npm run build        # production build -> dist/index.html (single self-contained file, host anywhere)
node tests/level.test.js 1000     # 1000 generated levels, all rules asserted
node scripts/check-assets.js      # fails if an asset file is missing from assets/manifest.json
```
Browser tests (needs `npx playwright install chromium`; serve with `npx vite preview --port 4173`):
`node tests/play.mjs <name> "q=low&small" tests/s_rules.js` (also `s_end.js`, `s_mobile.js`, `s_tour.js`, `s_mon.js`, `s_quiet.js`).

URL helpers: `?seed=ABC123` (with `&autostart=1`), `?q=low|medium|high`. In the console `__bs` is the game object (`__bs.simulate(seconds)` steps the game headlessly).

## Controls
| Desktop | |
|---|---|
| W A S D | move (rebindable) |
| Mouse (pointer lock) / arrow keys | look. Falls back to click-and-drag if capture is blocked |
| Shift | run (loud) |
| L | flashlight |
| Q / Tab | switch item (scanner, decoy, blue card, red card) |
| Space | use item |
| E | interact (HOLD at generators) |
| 1 / 2 | terminal choices |
| Esc / P | pause, F fullscreen, F3 debug overlay, F4 audio debug panel |

Phones: left joystick (push fully = run), drag the right side to look, buttons USE (hold at generators), TOOL, SWAP, LIGHT, RUN (hold). Fullscreen + landscape lock are requested on Play; portrait shows "Rotate your phone".

## Tuning
* `src/game/config.js` - every gameplay number (costs, speeds, timings, monster stages, quality presets, audio defaults)
* `src/game/level.config.js` - level generation parameters
* `src/game/story.json` - all story text, terminal logs, endings, messages
* `RULEBOOK.md` documents the exact values currently in config.js.

## Optional audio files
Drop `.ogg/.mp3/.wav` files into `src/assets/audio/` using your names (`creak-1`, `monster-howl`, `menu_music`, ...). Files override the synthesized versions of the same group automatically; list them in `assets/manifest.json`.

## Optional backend
`server/` is a Spring Boot 3 + H2 + JPA app (`POST /api/runs`, `GET /api/leaderboard`, `GET /api/runs/{id}`). Run `cd server && mvn spring-boot:run`, then build the game with `VITE_API_URL=http://localhost:8080`. The game works fully without it. (NOT compiled or run in this environment - see TEST_LOG.md.)

## Architecture
`config` / `level.config` / `story.json` - data; `levelgen` - seeded generator + validation; `textures` - procedural PBR sets; `world` - mesh builder (merged per room, instancing, doors, lockers, terminals, generators, pod, decals, light pool, room culling); `physics` - circle vs grid/AABB; `player`, `input`, `touch`; `hands` - first-person arms and items; `monster` (rigged model) and `monsterai` (BFS distance-field AI); `synth` + `audio` - offline-rendered sound bank, buses, HRTF, occlusion, reverb, ducking, adaptive layers; `effects` - composer, beam, dust, sparks, steam; `ui` / `ui.css`; `save`; `game` - loop and rules.
