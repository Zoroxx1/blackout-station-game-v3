// Level-generation parameters for Halcyon Deep offshore platform. 1 tile = 2 m.
export default {
  // Size classes (dimensions in tiles, 1 tile = 2m) and selection weights
  sizeClasses: {
    closet:    { w: 3,  h: 3,  weight: 8,  ceiling: 3.0 },
    small:     { w: 4,  h: 6,  weight: 22, ceiling: 3.0 },
    medium:    { w: 6,  h: 8,  weight: 28, ceiling: 3.0 },
    large:     { w: 9,  h: 12, weight: 10, ceiling: 4.0 },
    long:      { w: 3,  h: 14, weight: 10, ceiling: 3.0 },
    l_shape:   { w: 8,  h: 8,  cutW: 4, cutH: 4, weight: 10, ceiling: 3.0 },
    two_level: { w: 8,  h: 10, hasCatwalk: true, weight: 6, ceiling: 4.0 },
    open_deck: { w: 12, h: 12, maxPerLevel: 2, weight: 6, ceiling: 12.0 },
  },

  // 5 Offshore Platform Zones from back (South/West) to front (North/East)
  zones: [
    {
      id: 'accommodation',
      name: 'Accommodation',
      bandWidthRange: [0.16, 0.23],
      required: ['crew_quarters', 'crew_quarters', 'mess_galley', 'locker_shower', 'medical_bay'],
      optional: ['storage'],
    },
    {
      id: 'operations',
      name: 'Operations',
      bandWidthRange: [0.16, 0.23],
      required: ['control_room', 'radio_room', 'lab', 'office'],
      optional: ['electrical_switch'],
    },
    {
      id: 'engineering',
      name: 'Engineering & Utilities',
      bandWidthRange: [0.18, 0.25],
      required: ['engine_room', 'pump_room', 'electrical_switch', 'workshop', 'cold_storage'],
      optional: ['storage'],
    },
    {
      id: 'drilling',
      name: 'Drilling & Process',
      bandWidthRange: [0.16, 0.23],
      required: ['storage', 'pipe_deck', 'moon_pool'],
      optional: ['workshop'],
    },
    {
      id: 'topside',
      name: 'Topside',
      bandWidthRange: [0.16, 0.23],
      required: ['lifeboat_station', 'escape_vestibule', 'helideck'],
      optional: [],
    },
  ],

  corridorWidthPreferred: 3,
  corridorWidthMin: 2,
  loopsRange: [2, 4],
  deadEndsRange: [2, 3],
  emergencyHatchesRange: [3, 4],
  minStartToEscapeRooms: 5,
  crewRoomsMinApart: 4,
  firstCrewMaxFromStart: 6,
  firstLogMaxFromStart: 2,
  minTemplateRepeatDist: 4,
  doorEntryClearanceMeters: 2.0,
  propPathMinWidthMeters: 1.2,
  occupancyResolutionMeters: 0.5,

  // Keycard, terminal, chest, and generator rules
  doorIndex: 3,
  obstaclesMax: 2,
  obstacleMaxSize: 2,
  insetMax: 2,
  minDeadEndFromStartRooms: 2.5,
  terminalMinApart: 3,
  terminalMinFromStart: 2,
  keyLockerMinApart: 3,
  decoyLockers: [6, 12],
  chestsRange: [8, 14],
  generators: [1, 2],
  monsterStartRooms: [2, 3.5],
  wetRoomChance: 0.45,
  emergencyRoomChance: 0.55,
  flickerRoomChance: 0.28,
  propsPerRoom: [3, 7],

  // Legacy compatibility fields for any external callers
  grid: { w: 7, h: 4 },
  interior: 8,
  crossTiles: [3, 4],
};
