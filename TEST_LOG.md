# Test log

Environment: Chromium headless (Playwright 1.65) with SwiftShader software WebGL2 at 640x360 (about 20 FPS), plus a 844x390 touch/mobile emulation. No physical phone, no GPU, no headphones or phone speakers were available. Performance numbers (60/120 FPS targets) are therefore **not measured**; the quality tiers exist and auto-detect but are untuned on real hardware.

| Check | Result |
|---|---|
| `node tests/level.test.js 1000` (connectivity, tree + loops, doors centred, cross path clear, start corner and room clear, pod = farthest dead end with all-blue doors, red dead-end room >= 2.5 rooms, terminal spacing, key-locker spacing and reachability, lockers on walls not on the cross, 6-12 decoy lockers, 1-2 wall generators, monster start 2-3.5 rooms, determinism) | 0 failures; avg 1.24 generation attempts; 35% of extra links are hatches |
| Console errors across all browser runs (low, medium, high, mobile) | 0 |
| Title, settings, how-to, credits, pause/resume | pass |
| Locker opens, blue card auto-equipped, door lights refresh | pass |
| Door: -4 power, +22 noise, slide animation; hatch: 0 power, +45 noise, clang, round hatch swings open | pass |
| Locked RED door: message + red prompt | pass |
| Generator: prompt, noise rises while holding, release cancels, full hold gives +30 once and goes "spent" | pass (via `simulate`) |
| Terminal (Ana): -3 power, forced choice, free Ana -15 | pass |
| Scanner -8 power, +35 noise, radar 4 s; decoy thrown, count 0 | pass |
| Dark timer: 30 s dark then 5 s light gives 15 s (3x recovery); warning message; health 0 -> "Lost in the dark" | pass |
| Power 0: flashlight off and locked, message, noise floor 60, scanner beep each second | pass |
| Four stages: messages and chase speeds 3.10 / 3.2 / 3.3 / 3.38 tiles/s | pass |
| Noise 100 near monster -> hunt; contact -> caught cinematic -> ending | pass |
| Endings seen: Hull failure, Lost in the dark, Everyone out, The Long Quiet (hidden), caught scene; pod launch costs 10; pod refuses without blue card | pass. "It found you" and the 1-2-saved/alone endings are driven by the same `finish()` code but my script's text readout lagged, so those three were not visually confirmed |
| Touch: joystick (full push = run), look drag, LIGHT button, fullscreen request, portrait notice | pass (synthetic pointer events) |
| High quality (4x MSAA, GTAO, bloom) | runs with 0 errors; screenshot not captured because software rendering was too slow |
| Audio: 106 clips in 61 groups rendered, AudioContext running, 7 adaptive loops started | pass (graph state only; nothing was actually listened to) |

## Not verified / known gaps
Real-device FPS, touch ergonomics, audio mix balance and loudness by ear, Safari/Opus fallback, full pixel-level z-fighting review, the Spring Boot server (not compiled), key rebinding by keypress (UI renders), and a manual full 10-minute playthrough.
