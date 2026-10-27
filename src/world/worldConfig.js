// Authored, deterministic layout for the compact Sunmeadow Valley map.
// Coordinates: X is east/west, Y is up, and north is negative Z.
export const WORLD_SIZE = 600
export const WORLD_SEED = 18473

// Temporary A/B switch for the imported battlefield. Set false to return to
// the complete procedural Sunmeadow map below.
export const USE_TEST_BATTLEFIELD = true
export const TEST_BATTLEFIELD_NAME = 'Sunmeadow Valley 1v1 V5'
export const TEST_BATTLEFIELD_SPAWN = { x: 0, z: -250 }
// Open terrain just beyond each base's outer back wall, for local movement tests.
// Heights are sampled from the V5 VIS_Terrain and include the usual 0.04 ground offset.
export const TEST_BATTLEFIELD_DEBUG_SPAWNS = {
  A: { x: 0, y: 3.701, z: -300 },
  B: { x: 0, y: 12.552, z: 300 },
}
export const SHOW_MAP_COLLIDERS = false
export const SHOW_GROUND_DEBUG = false

export const WORLD_MAP = {
  id: 'sunmeadow-reference-map',
  displayName: 'Sunmeadow Valley',
  spawn: { x: 0, z: 245 },
  landmarks: {
    spawn: { x: 0, z: 245 },
    bridge: { x: 0, z: 105 },
    ford: { x: 190, z: 105 },
    village: { x: -5, z: -38 },
    greatTree: { x: -112, z: -48 },
    westFort: { x: -205, z: -178 },
    openField: { x: 105, z: -105 },
    lake: { x: 228, z: -168 },
    forest: { x: 205, z: -35 },
    westCliffs: { x: -280, z: -12 },
    northRidge: { x: 0, z: -286 },
    ruins: { x: -245, z: 194 },
    mountainRange: { startX: -300, endX: 300, z: -292, peaks: 11 },
  },
  routes: {
    mainRoad: [[0,245],[-12,215],[7,185],[0,150],[0,105],[-4,72],[-17,28],[-5,-38]],
    fortRoad: [[-5,-38],[-52,-68],[-105,-105],[-151,-139],[-205,-178]],
    eastRoad: [[-5,-38],[42,-46],[94,-62],[145,-75],[190,-91],[228,-122]],
    greatTreeRoad: [[-10,12],[-45,-2],[-75,-26],[-112,-48]],
    forestPath: [[20,135],[65,157],[116,151],[160,128],[190,105],[218,67],[224,20],[205,-35],[246,-6]],
  },
  river: {
    points: [[-300,115],[-250,108],[-205,120],[-155,111],[-105,122],[-55,111],[0,105],[48,115],[100,106],[150,114],[190,105],[235,113],[275,102],[300,108]],
    width: 16,
    waterDepth: 5,
  },
  lake: { x: 228, z: -168, radiusX: 48, radiusZ: 37 },
  village: { x: -5, z: -38, houseCount: 8, radius: 53 },
  forests: [
    { id: 'east-forest', x: 212, z: -28, width: 132, depth: 180, columns: 9, rows: 12, density: 0.82, seed: 501 },
    { id: 'eastern-boundary', x: 276, z: 30, width: 62, depth: 510, columns: 4, rows: 18, density: 0.9, seed: 901 },
    { id: 'great-tree-wood', x: -175, z: -34, width: 104, depth: 148, columns: 7, rows: 10, density: 0.58, seed: 1201 },
    { id: 'northwest-pines', x: -132, z: -230, width: 142, depth: 88, columns: 9, rows: 5, density: 0.72, seed: 2401 },
  ],
  clearings: [
    { id: 'spawn', x: 0, z: 245, radiusX: 68, radiusZ: 52 },
    { id: 'great-tree', x: -112, z: -48, radiusX: 35, radiusZ: 34 },
    { id: 'village-square', x: -5, z: -38, radiusX: 55, radiusZ: 46 },
    { id: 'east-outpost', x: 205, z: -35, radiusX: 38, radiusZ: 34 },
    { id: 'lake-shore', x: 228, z: -168, radiusX: 58, radiusZ: 46 },
    { id: 'fort-courtyard', x: -205, z: -178, radiusX: 38, radiusZ: 38 },
  ],
  cliffs: { x: -286, z: -14, width: 62, depth: 224, height: 28 },
  fort: { x: -205, z: -178, plateauRadiusX: 55, plateauRadiusZ: 52, plateauHeight: 24 },
  ridge: { z: -286, height: 49, width: 48, peaks: 4 },
  foothills: [
    { x: -230, z: -238, width: 118, depth: 100, height: 34, seed: 12 },
    { x: -38, z: -242, width: 136, depth: 104, height: 28, seed: 28 },
    { x: 175, z: -245, width: 148, depth: 100, height: 32, seed: 44 },
  ],
  mountains: [
    { x: -235, z: -300, width: 152, depth: 132, height: 142, tint: '#7e949a', seed: 2, peaks: [[-.34,-.12,.95,.27],[.18,.08,.76,.32],[.38,-.2,.52,.24]] },
    { x: -76, z: -303, width: 150, depth: 128, height: 126, tint: '#879ca0', seed: 5, peaks: [[-.25,.12,.76,.3],[.18,-.1,1,.29],[.42,.15,.53,.25]] },
    { x: 92, z: -300, width: 166, depth: 140, height: 154, tint: '#748991', seed: 9, peaks: [[-.38,.1,.75,.34],[.02,-.15,1,.31],[.36,.12,.69,.32]] },
    { x: 246, z: -300, width: 150, depth: 126, height: 136, tint: '#a5b6b9', seed: 15, peaks: [[-.35,-.05,.65,.32],[.12,.12,1,.3],[.4,-.12,.72,.28]] },
  ],
  debugLandmarks: ['spawn','bridge','ford','village','greatTree','westFort','forest','openField','lake','northRidge'],
}

// The server and browser use the same small deterministic spawn spread.
export function getPlayerSpawn(playerId = '') {
  if (USE_TEST_BATTLEFIELD) {
    let hash = 2166136261
    for (let i = 0; i < playerId.length; i++) hash = Math.imul(hash ^ playerId.charCodeAt(i), 16777619)
    const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2
    const radius = 2 + ((hash >>> 8) % 5) * 1.1
    return {
      x: TEST_BATTLEFIELD_SPAWN.x + Math.cos(angle) * radius,
      z: TEST_BATTLEFIELD_SPAWN.z + Math.sin(angle) * radius,
    }
  }
  let hash = 2166136261
  for (let i = 0; i < playerId.length; i++) hash = Math.imul(hash ^ playerId.charCodeAt(i), 16777619)
  const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2
  const radius = 2 + ((hash >>> 8) % 5) * 1.1
  return { x: WORLD_MAP.spawn.x + Math.cos(angle) * radius, z: WORLD_MAP.spawn.z + Math.sin(angle) * radius }
}

export const ZONES = {
  SPAWN_MEADOW: { x: 0, z: 245, radiusX: 72, radiusZ: 56 },
  RIVER: { points: WORLD_MAP.river.points },
  VILLAGE: { x: -5, z: -38, radiusX: 58, radiusZ: 50 },
  WEST_FORT: { x: -205, z: -178, radiusX: 62, radiusZ: 58 },
  OPEN_FIELD: { x: 105, z: -105, radiusX: 85, radiusZ: 72 },
  EAST_FOREST: { x: 205, z: -35, radiusX: 74, radiusZ: 96 },
  LAKE: { x: 228, z: -168, radiusX: 54, radiusZ: 43 },
  WEST_CLIFFS: { x: -286, z: -14, radiusX: 58, radiusZ: 210 },
  NORTH_RIDGE: { x: 0, z: -292, radiusX: 300, radiusZ: 70 },
}
