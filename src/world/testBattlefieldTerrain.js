import * as THREE from 'three'

export const PLAYER_COLLISION_RADIUS = 0.55
export const PLAYER_COLLISION_HEIGHT = 3.35
export const MAX_GROUND_STEP_UP = 1.25
export const MAX_GROUND_STEP_DOWN = 0.55

let terrainMesh = null
let groundMeshes = []
let courtyardGroundMeshes = []
let courtyardBounds = {}
let blockers = []
let markers = new Map()
const raycaster = new THREE.Raycaster()
const rayOrigin = new THREE.Vector3()
const rayDirection = new THREE.Vector3(0, -1, 0)
const WALKABLE = /^COLLIDER_(MainBridge$|[AB]_(ApproachGround$|StairRamp_|Walk_))/
const COURTYARD_GROUND = /^COLLIDER_[AB]_BaseGround$/
const NON_BLOCKING_TERRAIN = /^COLLIDER_Terrain_/

// Called once after the GLB loads. Cache world-space bounds and only the
// designated walkable surfaces; no scene traversal is done in the frame loop.
export function registerTestBattlefield(scene, showColliders = false) {
  scene.updateMatrixWorld(true)
  terrainMesh = scene.getObjectByName('VIS_Terrain') || scene.getObjectByName('Terrain') || null
  groundMeshes = terrainMesh ? [terrainMesh] : []
  courtyardGroundMeshes = []
  courtyardBounds = {}
  blockers = []
  markers = new Map()
  let colliderCount = 0
  const savedColliderState = []
  const colliderMeshes = []

  scene.traverse(object => {
    if (!object.isMesh) return
    if (object.name.startsWith('COLLIDER_')) {
      colliderCount++
      savedColliderState.push({ object, visible: object.visible, material: object.material })
      object.visible = showColliders
      if (showColliders) {
        const makeDebugMaterial = material => {
          const debug = material.clone()
          debug.color?.set('#ff38d1')
          debug.wireframe = true
          debug.transparent = true
          debug.opacity = 0.7
          debug.depthWrite = false
          return debug
        }
        object.material = Array.isArray(object.material) ? object.material.map(makeDebugMaterial) : makeDebugMaterial(object.material)
      }
      object.updateWorldMatrix(true, false)
      const box = new THREE.Box3().setFromObject(object)
      colliderMeshes.push({ object, box })
      return
    }
    if (['Spawn_A', 'Spawn_B', 'Flag_A_CaptureZone', 'Flag_B_CaptureZone'].includes(object.name)) {
      object.updateWorldMatrix(true, false)
      markers.set(object.name, new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()))
    }
  })

  // Infer the inside of each fort from its authored wall colliders. BaseGround
  // is a broad rectangular mesh, so it is only a ground candidate within this
  // wall-bounded courtyard and never across the surrounding outdoor terrain.
  for (const side of ['A', 'B']) {
    const left = colliderMeshes.find(item => item.object.name === `COLLIDER_${side}_Wall_Left`)
    const right = colliderMeshes.find(item => item.object.name === `COLLIDER_${side}_Wall_Right`)
    const back = colliderMeshes.find(item => item.object.name === `COLLIDER_${side}_Wall_Back`)
    const front = colliderMeshes.find(item => item.object.name === `COLLIDER_${side}_Wall_Front_L`)
    if (left && right && back && front) {
      courtyardBounds[side] = side === 'A'
        ? { minX: left.box.max.x, maxX: right.box.min.x, minZ: back.box.max.z, maxZ: front.box.min.z }
        : { minX: left.box.max.x, maxX: right.box.min.x, minZ: front.box.max.z, maxZ: back.box.min.z }
    }
  }
  for (const item of colliderMeshes) {
    const { object, box } = item
    if (WALKABLE.test(object.name)) groundMeshes.push(object)
    else if (COURTYARD_GROUND.test(object.name)) courtyardGroundMeshes.push({ object, side: object.name.includes('_A_') ? 'A' : 'B' })
    else if (!NON_BLOCKING_TERRAIN.test(object.name)) blockers.push({ name: object.name, box })
  }

  if (import.meta.env?.DEV) {
    console.info(`[TestBattlefield] loaded ${scene.name || 'scene'}: ${colliderCount} collider meshes, ${groundMeshes.length - (terrainMesh ? 1 : 0)} walkable collider meshes`)
    console.info('[TestBattlefield] marker world positions:', Object.fromEntries([...markers].map(([name, value]) => [name, value.toArray()])))
  }

  return () => {
    for (const { object, visible, material } of savedColliderState) {
      const debugMaterials = Array.isArray(object.material) ? object.material : [object.material]
      const originals = Array.isArray(material) ? material : [material]
      if (object.material !== material) debugMaterials.forEach((debug, index) => { if (debug !== originals[index]) debug.dispose() })
      object.material = material
      object.visible = visible
    }
    if (terrainMesh && (terrainMesh === scene.getObjectByName('VIS_Terrain') || terrainMesh === scene.getObjectByName('Terrain'))) {
      terrainMesh = null
      groundMeshes = []
      courtyardGroundMeshes = []
      courtyardBounds = {}
      blockers = []
      markers = new Map()
    }
  }
}

export function getTestBattlefieldGroundInfo(x, z, referenceY = Infinity) {
  if (!groundMeshes.length) return null
  const candidates = [...groundMeshes, ...courtyardGroundMeshes.map(item => item.object)]
  rayOrigin.set(x, Number.isFinite(referenceY) ? referenceY + MAX_GROUND_STEP_UP + 30 : 1000, z)
  raycaster.set(rayOrigin, rayDirection)
  raycaster.far = 1100
  const terrainHits = terrainMesh ? raycaster.intersectObject(terrainMesh, false) : []
  const terrainHit = terrainHits[0] || null
  const terrainIsValid = terrainHit && (!Number.isFinite(referenceY) || (terrainHit.point.y <= referenceY + MAX_GROUND_STEP_UP && terrainHit.point.y >= referenceY - MAX_GROUND_STEP_DOWN))
  const boundsForSide = side => courtyardBounds[side]
  const hits = raycaster.intersectObjects(candidates, false).filter(hit => {
    if (Number.isFinite(referenceY) && (hit.point.y > referenceY + MAX_GROUND_STEP_UP || hit.point.y < referenceY - MAX_GROUND_STEP_DOWN)) return false
    const floor = courtyardGroundMeshes.find(item => item.object === hit.object)
    if (!floor) return true
    const region = boundsForSide(floor.side)
    return Boolean(region && x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ)
  })
  let chosen = hits[0] || (terrainIsValid ? terrainHit : null)
  let stepLimited = false
  if (!chosen && terrainHit && Number.isFinite(referenceY)) {
    chosen = terrainHit
    stepLimited = true
  }
  if (!chosen) return null
  const height = stepLimited
    ? THREE.MathUtils.clamp(terrainHit.point.y, referenceY - MAX_GROUND_STEP_DOWN, referenceY + MAX_GROUND_STEP_UP)
    : chosen.point.y
  return {
    height,
    surface: stepLimited ? `${chosen.object.name} (step-limited)` : chosen.object.name,
    terrainY: terrainHit?.point.y ?? null,
    candidates: hits.map(hit => ({ surface: hit.object.name, y: hit.point.y })),
  }
}

// Terrain-only query used by the camera to keep it above landscape without
// treating roofs, bridge decks, walls, or walkways as terrain.
export function getTestBattlefieldHeight(x, z) {
  if (!terrainMesh) return null
  rayOrigin.set(x, 1000, z)
  raycaster.set(rayOrigin, rayDirection)
  raycaster.far = 1100
  const hit = raycaster.intersectObject(terrainMesh, false)[0]
  return hit ? hit.point.y : null
}

// Grounding query includes terrain plus the map-authored flat pads, ramps,
// walkways and bridge deck. Spawn/respawn can query with Infinity.
export function getTestBattlefieldGroundHeight(x, z, referenceY = Infinity) {
  return getTestBattlefieldGroundInfo(x, z, referenceY)?.height ?? null
}

export function getTestBattlefieldMarker(name) {
  const marker = markers.get(name)
  return marker ? marker.clone() : null
}

function overlapsPlayer(x, z, feetY, blocker) {
  const box = blocker.box
  if (feetY + PLAYER_COLLISION_HEIGHT <= box.min.y || feetY >= box.max.y) return false
  const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x)
  const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z)
  const dx = x - closestX, dz = z - closestZ
  return dx * dx + dz * dz < PLAYER_COLLISION_RADIUS * PLAYER_COLLISION_RADIUS
}

// Axis-separated resolution preserves motion parallel to a wall (wall slide).
// A small number of substeps prevents fast sprinting from tunneling through a box.
export function resolveTestBattlefieldMovement(from, to, out = {}) {
  if (!blockers.length) {
    out.x = to.x
    out.z = to.z
    return out
  }
  let x = from.x, z = from.z
  const dx = to.x - from.x, dz = to.z - from.z
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (PLAYER_COLLISION_RADIUS * 0.5)))
  const stepX = dx / steps, stepZ = dz / steps
  const feetY = Number.isFinite(from.y) ? from.y : 0
  for (let i = 0; i < steps; i++) {
    const nextX = x + stepX
    if (!blockers.some(blocker => overlapsPlayer(nextX, z, feetY, blocker))) x = nextX
    const nextZ = z + stepZ
    if (!blockers.some(blocker => overlapsPlayer(x, nextZ, feetY, blocker))) z = nextZ
  }
  out.x = x
  out.z = z
  return out
}

export function getTestBattlefieldColliderCount() { return blockers.length + groundMeshes.filter(mesh => mesh.name.startsWith('COLLIDER_')).length }
