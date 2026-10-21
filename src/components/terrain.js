import { WORLD_MAP, WORLD_SIZE } from '../world/worldConfig.js'
export { WORLD_SIZE }

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function baseTerrainHeight(x, z) {
  return Math.sin(x * 0.009) * 3.2 + Math.cos(z * 0.008) * 2.8
    + Math.sin((x + z) * 0.018) * .9 + Math.cos((x - z) * 0.015) * .8
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
  const { spawn, village, fort, cliffs, ridge, river, lake } = WORLD_MAP

  // Broad, walkable authored clearings.
  h += (2.5 - h) * ellipseWeight(x, z, spawn.x, spawn.z, 90, 72, .55, 1.05)
  h += (3.2 - h) * ellipseWeight(x, z, village.x, village.z, 62, 54, .65, 1.15)

  // Fort mesa, west cliff shelf, and the northern mountain backbone.
  h += (fort.plateauHeight - h) * ellipseWeight(x, z, fort.x, fort.z, fort.plateauRadiusX, fort.plateauRadiusZ, .72, 1.05)
  h += cliffs.height * ellipseWeight(x, z, cliffs.x, cliffs.z, cliffs.width, cliffs.depth, .78, 1.2)
  const ridgeShape = Math.exp(-((z - ridge.z) ** 2) / (ridge.width * ridge.width))
  const ridgeVariation = .72 + .28 * Math.sin(x * .018) ** 2
  h += ridge.height * ridgeShape * ridgeVariation

  // River channel and east lake basin. The bridge deck region stays level with the banks.
  const distance = riverDistance(x, z)
  const channel = Math.exp(-(distance * distance) / 250)
  const bridge = WORLD_MAP.landmarks.bridge
  const bridgeDeck = ellipseWeight(x, z, bridge.x, bridge.z, 7, 20, .72, 1.12)
  const ford = WORLD_MAP.landmarks.ford
  const fordMask = ellipseWeight(x, z, ford.x, ford.z, 19, 14, .72, 1.15)
  h -= river.waterDepth * channel * (1 - bridgeDeck) * (1 - fordMask * .72)
  h -= 13 * Math.exp(-(((x - lake.x) ** 2) / (lake.radiusX ** 2 * .42) + ((z - lake.z) ** 2) / (lake.radiusZ ** 2 * .42)))

  return h
}
