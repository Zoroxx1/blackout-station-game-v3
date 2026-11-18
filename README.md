# BLACKOUT STATION: HALCYON DEEP

A first-person, fully 3D (Three.js / WebGL2) offshore oil rig survival horror game for desktop and phones. Ten minutes before the storm tears Halcyon Deep apart. Four surviving crew members trapped across the platform. A pale, weeping creature in the dark that cannot bear to be seen.

## Run / Build / Verify
```bash
npm install
npm run dev                  # dev server
npm run build                # production build -> dist/index.html (single self-contained file)
node tests/level.test.js 1000 # 1000 generated levels, all rules asserted
node tests/upgrade.test.js    # 1000-seed world check, 20-door isolation test, 6 face-seen tests, FSM tests, 1000-chase simulation
node scripts/check-assets.js  # verifies assets/manifest.json integrity
```

## How the Level Generator Works (`src/game/levelgen.js`)
1. **Five Offshore Platform Zones**: Divides the platform footprint from back to front into **Accommodation** (start), **Operations**, **Engineering & Utilities**, **Drilling & Process**, and **Topside** (escape) with randomized zone band widths (`15% to 25%` each).
2. **Eight Size Classes & Non-Identical Neighbors**: Assigns rooms across 8 size classes (`closet 3x3`, `small 4x6`, `medium 6x8`, `large 9x12`, `long 3x14`, `l_shape 8x8 with 4x4 cut`, `two_level 8x10 with catwalk`, and `open_deck 12x12`) with varying ceiling heights (`2.4m` corridors, `3.0m` standard rooms, `4.0m` large rooms, `12.0m` open Helideck). Neighboring rooms are guaranteed never to share identical dimensions.
3. **Template & Fingerprint Usage Ledger**: Pulls from `src/game/templates.json` (15+ room types, each with two distinct layouts `A` and `B`, orientations `0/90/180/270`, mirror flag, and prop seed). Computes `fingerprint = hash(templateId, layout, orientation, mirrored, propSeed)` and rejects duplicates so rooms never repeat.
4. **Wall Edge Ledger**: Evaluates every shared tile edge across the grid (`open`, `doorway`, or `wall`) and builds `0.3m` thick 3D box walls (`0.01m` inset gap to prevent coplanar z-fighting) strictly from the ledger. `world.verifyWallLedger()` verifies 0 missing wall edges at load time.
5. **0.5m Occupancy Grid & 1.2m Path Check**: Places required layout props and random props while keeping a `2.0m` clear entry zone inside every doorway and running a `0.5m` resolution flood-fill (`verifyRoomPaths05m`) to guarantee a `>= 1.2m` wide walkable path between all doors and interactables.

## Controls
| Desktop | Action |
|---|---|
| `W A S D` | Move (rebindable) |
| Mouse / Arrow keys | Look (falls back to click-and-drag if pointer lock is blocked) |
| `Shift` | Run (3.4 tiles/s, loud) |
| `L` | Toggle Flashlight |
| `Q` / `Tab` | Cycle right-hand item (`Scanner`, `Decoy`, `Food`, `Pry Bar`, `Eli's Locket`, `Blue Card`, `Red Card`) |
| `Space` | Use item (HOLD `1.5s` to eat food: `Ration +10 HP`, `Stew +12 HP`, `Soup +15 HP`) |
| `E` | Interact (HOLD at generators `8s`, door close `0.5s`, Ana's shelving `6s`, stimulant `2s`, Chen's valves `3s`) |
| `J` | Open Platform Journal (re-read all 16 collected logs & puzzle clues) |
| `1` / `2` | Crew rescue / terminal choices |
| `Esc` / `P` | Pause, `F` Fullscreen, `F3` 3D Level/Wall Debug Overlay, `F4` AI & Audio Debug Overlay |

## License & SCP Attribution
Content relating to the SCP Foundation, including the SCP Foundation logo, is licensed under Creative Commons Sharealike 3.0 and all concepts originate from scpwiki.com and its authors. Blackout Station: Halcyon Deep, being derived from this content, is hereby also released under Creative Commons Sharealike 3.0. See `ASSETS.md` and `assets/scp-derived/LICENSE` for details.
