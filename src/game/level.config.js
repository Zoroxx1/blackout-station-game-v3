// Level-generation parameters. 1 tile = 2 m.
export default {
  grid: { w: 7, h: 4 },            // rooms
  interior: 8,                     // interior tiles per room side (walls are 1 tile, shared)
  insetMax: 2,                     // random inset 0..2 per side
  obstaclesMax: 5,                 // 0..5 blocks, 1x1 .. 2x2
  obstacleMaxSize: 2,
  extraLinkFractionOfTree: 0.3,    // extra links ~30% (of spanning-tree size) -> loops
  hatchFraction: 0.35,             // share of extra links that are emergency hatches
  doorIndex: 3,                    // door tile index along each shared wall (0..7); cross = 3 and 4
  crossTiles: [3, 4],              // clear cross-shaped path through each room
  minDeadEndFromStartRooms: 2.5,   // red-door room: from start and from pod
  terminalMinApart: 3,             // rooms between terminals
  terminalMinFromStart: 2,
  keyLockerMinApart: 3,            // keycard lockers vs terminals and each other
  decoyLockers: [6, 12],
  generators: [1, 2],
  decoysPerLocker: 1,
  monsterStartRooms: [2, 3.5],
  names: ['Medbay', 'Comms', 'Lab', 'Reactor', 'Cargo', 'Storage', 'Quarters', 'Pod Bay'],
  fillerNames: ['Lab', 'Cargo', 'Storage', 'Quarters', 'Lab', 'Cargo', 'Storage', 'Quarters', 'Mess', 'Engineering'],
  wetRoomChance: 0.25,
  emergencyRoomChance: 0.55,
  flickerRoomChance: 0.18,
  propsPerRoom: [2, 6],
};
