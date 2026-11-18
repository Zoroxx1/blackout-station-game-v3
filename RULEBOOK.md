# Rulebook (matches `src/game/config.js`)

**Run** 600 s. Start: 100 health, 100 power, 1 decoy, flashlight on. Hard mode: start power 70, generator +25, monster wander x1.15, chase x1.05, head-to-player interval x0.7.

**Power (max 100)**: flashlight 0.22/s; door 4; terminal 3; scan 8; pod launch 10 (needs 10); hatch 0. Gains: generator +30, siphon Ana +20, cut Chen's loop +25. At 0 power: flashlight off and locked, scanner beeps every second, noise held at >= 60, monster hearing 90 tiles, power actions fail with a message.

**Noise (0-100)**: decay 10/s; still 0; walk +5/s; run +32/s. Bursts: door +22, hatch +45, scan +35, terminal +10, generator charging +22/s (no decay while charging), Bix distress -> 100.

**Darkness**: flashlight off 40 s -> warning; 60 s -> -5 health every 3 s. Light on recovers the timer 3x faster than it builds. 0 health = "Lost in the dark". The monster kills on contact at 0.55 tiles.

**Generators** (built into walls): hold E 8 s, +30 power, once. Cancels on release / turning away / >~2 tiles. Cannot move while charging.

**Doors**: green light = openable, red = locked. RED / BLUE cards open matching doors (E). Hatches (amber) cost 0 power, +45 noise. Monster opens anything. Pod launch: blue card + 10 power + E at the pod.

**Terminals** (once each, 3 power, +10 noise, choice with 1/2): Ana free (-15) / siphon (+20); Bix distress (noise 100, 8 s hunt, Bix lives) / silent; Chen seal (-20) / cut (+25).

**Monster** effective noise = noise + 18 with light. Hunts when effective noise > 30 and in hearing range, or light on and within 3 tiles. Decoy: ignores player noise 6 s unless within 2.5 tiles. Hunt lingers 3.5 s after the last trigger, then searches 9 s, then wanders.
| Stage | Time left | Hearing | Chase | Wander | Heads to player | Sounds |
|---|---|---|---|---|---|---|
| Calm | >5:00 | 40 | 3.1 | 1.6 | 40 s (3 s) | 14-26 s |
| Aggressive | 5:00-2:30 | 50 | 3.2 | 2.0 | 22 s (3 s) | 9-16 s |
| Very aggressive | 2:30-1:00 | 60 | 3.3 | 2.5 | 10 s (6 s) | 6-11 s |
| Frenzy | <1:00 | 75 | 3.38 | 3.0 | 6 s (8 s) | 3-6 s |
Player: walk 2, run 3.4 tiles/s.

**Endings**: Everyone out (3 saved), Some of you (1-2), You, alone (0), It found you, Hull failure, Lost in the dark, and hidden **The Long Quiet**: read all three logs and launch the pod with the flashlight OFF (Chen's log hints at it).
