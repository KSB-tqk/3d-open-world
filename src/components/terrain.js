import { USE_TEST_BATTLEFIELD, WORLD_MAP, WORLD_SIZE } from '../world/worldConfig.js'
import { getTestBattlefieldGroundInfo, getTestBattlefieldHeight, MAX_GROUND_STEP_UP } from '../world/testBattlefieldTerrain.js'
export { WORLD_SIZE }

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function baseTerrainHeight(x, z) {
  // Broad deterministic rolling forms keep the compact map readable and walkable.
  return Math.sin(x * 0.012) * 2.2 + Math.cos(z * 0.011) * 2.1
    + Math.sin((x + z) * 0.022) * .55 + Math.cos((x - z) * 0.018) * .5
}

export function riverDistance(x, z) {
  let closest = Infinity
  const points = WORLD_MAP.river.points
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1]
    const dx = bx - ax, dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    closest = Math.min(closest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
  }
  return closest
}

function ellipseWeight(x, z, centerX, centerZ, radiusX, radiusZ, inner = .68, outer = 1.08) {
  const d = Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ)
  return 1 - smoothstep(inner, outer, d)
}

export function terrainHeight(x, z) {
  let h = baseTerrainHeight(x, z)
  const { spawn, village, fort, cliffs, ridge, river, lake, landmarks } = WORLD_MAP

  // Broad, walkable authored clearings.
  h += (2.5 - h) * ellipseWeight(x, z, spawn.x, spawn.z, 72, 56, .55, 1.05)
  h += (3.2 - h) * ellipseWeight(x, z, village.x, village.z, 60, 52, .65, 1.15)
  h += (2.8 - h) * ellipseWeight(x, z, landmarks.greatTree.x, landmarks.greatTree.z, 38, 36, .58, 1.08)
  h += (3.5 - h) * ellipseWeight(x, z, landmarks.forest.x, landmarks.forest.z, 42, 38, .6, 1.08)

  // West ridge, high fort mesa, rolling east side, and northern boundary.
  h += (fort.plateauHeight - h) * ellipseWeight(x, z, fort.x, fort.z, fort.plateauRadiusX, fort.plateauRadiusZ, .72, 1.05)
  const westUplands = ellipseWeight(x, z, -222, -84, 100, 150, .25, 1.2)
  h += 17 * westUplands
  h += cliffs.height * ellipseWeight(x, z, cliffs.x, cliffs.z, cliffs.width, cliffs.depth, .78, 1.2)
  const eastRoll = ellipseWeight(x, z, 245, 28, 92, 190, .05, 1.25)
  h += eastRoll * (4 + 2.4 * Math.sin(z * .025))
  const ridgeShape = Math.exp(-((z - ridge.z) ** 2) / (ridge.width * ridge.width))
  const ridgeVariation = .72 + .28 * Math.sin(x * .026) ** 2
  h += ridge.height * ridgeShape * ridgeVariation

  // River channel and east lake basin. The bridge deck region stays level with the banks.
  const distance = riverDistance(x, z)
  const channel = Math.exp(-(distance * distance) / 250)
  const bridge = landmarks.bridge
  const bridgeDeck = ellipseWeight(x, z, bridge.x, bridge.z, 7, 20, .72, 1.12)
  const ford = landmarks.ford
  const fordMask = ellipseWeight(x, z, ford.x, ford.z, 19, 14, .72, 1.15)
  h -= river.waterDepth * channel * (1 - bridgeDeck) * (1 - fordMask * .72)
  h -= 13 * Math.exp(-(((x - lake.x) ** 2) / (lake.radiusX ** 2 * .42) + ((z - lake.z) ** 2) / (lake.radiusZ ** 2 * .42)))

  return h
}

export function activeTerrainHeight(x, z) {
  if (USE_TEST_BATTLEFIELD) {
    const testHeight = getTestBattlefieldHeight(x, z)
    if (testHeight !== null) return testHeight
  }
  return terrainHeight(x, z)
}

// Player feet grounding is separate from the camera's terrain-only query so
// authored ramps, fort walkways and bridge deck can carry the player.
export function activeGroundInfo(x, z, referenceY = Infinity) {
  if (USE_TEST_BATTLEFIELD) {
    const ground = getTestBattlefieldGroundInfo(x, z, referenceY)
    if (ground) return ground
    const terrain = getTestBattlefieldHeight(x, z)
    if (terrain !== null) {
      const height = Number.isFinite(referenceY) ? Math.min(terrain, referenceY + MAX_GROUND_STEP_UP) : terrain
      return { height, surface: height === terrain ? 'VIS_Terrain' : 'VIS_Terrain (step-limited)', terrainY: terrain, candidates: [{ surface: 'VIS_Terrain', y: terrain }] }
    }
    if (Number.isFinite(referenceY)) return { height: referenceY, surface: 'battlefield-loading', terrainY: null, candidates: [] }
    const fallbackHeight = terrainHeight(x, z)
    return { height: fallbackHeight, surface: 'map-loading fallback', terrainY: null, candidates: [] }
  }
  const height = terrainHeight(x, z)
  return { height, surface: 'procedural terrain', terrainY: height, candidates: [{ surface: 'procedural terrain', y: height }] }
}

export function activeGroundHeight(x, z, referenceY = Infinity) {
  return activeGroundInfo(x, z, referenceY).height
}
