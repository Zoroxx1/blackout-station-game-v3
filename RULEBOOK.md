# Blackout Station: Halcyon Deep — Rulebook & Tunable Parameters

All gameplay numbers live in `src/game/config.js` and `src/game/level.config.js`.

## 1. Core Player & Resource Numbers
* **Scale**: `1 tile = 2 m`. Walls are `0.3 m` thick (`0.01 m` coplanar gap). Ceilings: `3.0 m` in standard rooms, `4.0 m` in large/two-level rooms, `2.4 m` in corridors, `12.0 m` open sky on the Helideck.
* **Movement**: Walk `2.0 tiles/s` (`4.0 m/s`), Run `3.4 tiles/s` (`6.8 m/s`).
* **Power** (starts at `100`, Hard starts at `70`):
  * Flashlight: `0.22 / s`
  * Normal Door unlock: `4` (opening an already-unlocked door or a chest costs `0`)
  * Emergency Hatch: `0` power (`+45` noise)
  * Scanner ping: `8` power (`+35` noise, `4 s` duration)
  * Terminal read: `3` power (`+10` noise)
  * Helideck Escape Gate / Helicopter launch: `10` power (requires `BLUE` keycard)
  * Wall Generator: hold `E` for `8 s` (`+22 noise/s`) for `+30` power (`+25` on Hard), once per generator.
* **Health & Darkness** (starts at `100`):
  * Warning after `40 s` in the dark; after `60 s` in the dark, drains `5 HP` every `3 s`.
  * Turning the flashlight on recovers the dark timer `3x` faster than it builds.
* **Food** (restores health, carry up to `4`, select in right hand with `Q` and hold `Space` for `1.5 s`, `+5` noise):
  * `RATION`: `+10 HP` (50% weight)
  * `STEW`: `+12 HP` (30% weight)
  * `SOUP`: `+15 HP` (20% weight, spawns only in Mess & Galley chests or from Dara Holt)
* **Noise** (`0..100`, decays `10 / s`, or `20 / s` during Bix's 60s quiet bonus):
  * Walk: `+5 / s`, Run: `+32 / s`, Door open: `+22`, Manual door close (`0.5 s` hold `E`): `+10`, Hatch: `+45`, Eat food: `+5`.

## 2. Four Difficulty Levels (`CFG.difficulties`)

| Setting | Easy | Medium | Hard | Extreme |
|---|---|---|---|---|
| Roam speed (tiles/s) | `1.2` | `1.6` | `2.0` | `2.4` |
| Hearing range (tiles) | `20` | `35` | `50` | `75` |
| Loud noise alone triggers `INVESTIGATE` above | `never` | `70` | `55` | `40` |
| Face-seen dwell (seconds) | `0.4 s` | `0.25 s` | `0.1 s` | `0 s` (instant) |
| Distress wind-up | `25 s` | `16 s` | `10 s` | `6 s` |
| Rage speed (tiles/s) | `3.0` | `3.4` | `3.9` | `4.4` |
| Rage tracking | `last_known` | `last_known` | `exact` | `exact` |
| Loses you after out of sight for | `20 s` | `35 s` | `60 s` | `never` |
| Door bash time | `3.0 s` | `2.0 s` | `1.2 s` | `0.6 s` |
| Recover (sits sobbing) for | `40 s` | `30 s` | `20 s` | `12 s` |
| Scanner shows monster | `clear` | `unreliable` | `direction` | `never` |

## 3. Four Crew Rescues (`src/game/crew.json`)
1. **Ana Reyes (Medical Bay — Rescue)**: Find the `PRY BAR` in a Workshop/Storage chest, hold `E` for `6 s` (`+15 noise/s`, pausable) to lever off the shelving, then take the `STIMULANT` from the Medical Bay cabinet and hold `E` for `2 s`. Help reward: `+20 HP` medkit. Leave reward: `+20 Power` battery.
2. **Bix Okafor (Radio Room — Repair Puzzle)**: Reconnect the `RED`, `GREEN`, and `BLUE` leads to ports `1`, `2`, `3` on the patch panel using the randomized clue in nearby logs (`L04`/`L08`). Wrong connection adds `+20` noise. Help reward: reveals Helideck route on HUD/scanner. Leave reward: `60 s` of `2x` faster noise decay.
3. **Chen Wei (Engine Room — Valve Sequence)**: Read the wall chart (or logs `L07`/`L14`) for the randomized 3-valve sequence (e.g. `C -> A -> B`). Hold `E` for `3 s` (`+25` noise) at each valve to drain the flooded bulkhead; wrong order costs `-10 s`. Help reward: `+30 Power`. Leave reward: `+25 Power`.
4. **Dara Holt (Cold Storage — Calm & Patience)**: Stand within `3 m` of her freezer door with noise `< 10` for `10 s` continuously. Help reward: `+2 Food` (Hot Soup). Leave reward: `+3 Food` (Rations).
