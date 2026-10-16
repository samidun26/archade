// Ballyhoo Island: one source of truth for where everything sits.
// +x = east, -z = north. Water level is y = 0.

export interface V2 {
  x: number;
  z: number;
}

export const WORLD = {
  half: 190, // terrain extends from -half..half on x and z
  water: 0,
};

/** Land "blobs" unioned into the island silhouette. */
export const LAND: Array<{ x: number; z: number; r: number }> = [
  { x: 0, z: 0, r: 112 },
  { x: 88, z: 2, r: 62 }, // carnival
  { x: -88, z: -8, r: 64 }, // forest
  { x: 6, z: 82, r: 56 }, // beach
  { x: -62, z: 104, r: 30 }, // lighthouse point
  { x: -12, z: -96, r: 50 }, // bluff
  { x: 84, z: -70, r: 44 }, // big top hill
];

/** Areas flattened to a target height. w = blend weight at the center. */
export const FLATS: Array<{ x: number; z: number; r: number; fall: number; h: number; w?: number }> = [
  { x: 0, z: 0, r: 24, fall: 18, h: 4.5 }, // town square
  { x: 86, z: 4, r: 40, fall: 16, h: 4.2 }, // carnival midway
  { x: 84, z: -72, r: 22, fall: 22, h: 9 }, // big top plateau
  { x: 6, z: 92, r: 30, fall: 26, h: 1.4 }, // beach
  { x: -64, z: 108, r: 12, fall: 10, h: 6.5 }, // lighthouse rock
  { x: -12, z: -102, r: 20, fall: 30, h: 19 }, // lookout bluff
  { x: -86, z: -12, r: 44, fall: 20, h: 6, w: 0.55 }, // forest floor (soft)
];

export const ZONES = {
  town: { x: 0, z: 0, name: 'Town Square' },
  docks: { x: 18, z: 98, name: 'Bobber Docks' },
  lighthouse: { x: -64, z: 108, name: 'Old Blinky Lighthouse' },
  carnival: { x: 86, z: 4, name: 'Midway Carnival' },
  forest: { x: -86, z: -12, name: 'Gloomwood Forest' },
  bluff: { x: -12, z: -102, name: 'Lookout Bluff' },
  skyIsles: { x: 4, z: -150, name: 'Cumulus Isles' },
  bigTop: { x: 84, z: -72, name: 'The Big Top' },
} as const;

export const SPAWN = { x: 0, z: 16, yaw: Math.PI }; // facing north toward the mayor

/** Dirt paths (polylines) painted and gently grooved into the terrain. */
export const PATHS: V2[][] = [
  // town -> carnival
  [
    { x: 18, z: 2 },
    { x: 40, z: 6 },
    { x: 58, z: 4 },
  ],
  // town -> forest
  [
    { x: -18, z: -2 },
    { x: -38, z: -8 },
    { x: -56, z: -10 },
    { x: -70, z: -14 },
  ],
  // town -> beach / docks
  [
    { x: 2, z: 20 },
    { x: 6, z: 42 },
    { x: 10, z: 62 },
    { x: 14, z: 78 },
  ],
  // beach -> lighthouse
  [
    { x: -6, z: 88 },
    { x: -28, z: 96 },
    { x: -48, z: 104 },
  ],
  // town -> bluff (switchback)
  [
    { x: -4, z: -20 },
    { x: -14, z: -40 },
    { x: 2, z: -58 },
    { x: -14, z: -74 },
    { x: -12, z: -88 },
  ],
  // carnival -> big top
  [
    { x: 84, z: -20 },
    { x: 86, z: -38 },
    { x: 84, z: -54 },
  ],
];
