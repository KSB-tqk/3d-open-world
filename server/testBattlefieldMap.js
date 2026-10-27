import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = new URL('../public/models/world/sunmeadow_valley_1v1_v5_with_colliders.glb', import.meta.url)
const WALKABLE = /^COLLIDER_(MainBridge$|[AB]_(ApproachGround$|StairRamp_|Walk_))/
const COURTYARD_GROUND = /^COLLIDER_[AB]_BaseGround$/
const NON_BLOCKING_TERRAIN = /^COLLIDER_Terrain_/

export async function loadTestBattlefieldMap() {
  // GLTFLoader uses ProgressEvent in browser environments; Node 18/20 do not
  // provide it globally, and the GLB does not need browser rendering APIs.
  globalThis.ProgressEvent ??= class ProgressEvent {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init) }
  }
  const file = await readFile(MODEL_URL)
  const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
  const { scene } = await new GLTFLoader().parseAsync(arrayBuffer, '')
  scene.updateMatrixWorld(true)

  const positions = {}
  for (const name of ['Spawn_A', 'Spawn_B', 'Flag_A_CaptureZone', 'Flag_B_CaptureZone']) {
    const object = scene.getObjectByName(name)
    if (!object) throw new Error(`[Battlefield] V5 map is missing required marker ${name}`)
    positions[name] = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
  }

  const terrain = scene.getObjectByName('VIS_Terrain') || scene.getObjectByName('Terrain')
  const groundMeshes = []
  const courtyardMeshes = []
  const blockers = []
  scene.traverse(object => {
    if (!object.isMesh || !object.name.startsWith('COLLIDER_')) return
    if (WALKABLE.test(object.name)) groundMeshes.push(object)
    else if (/^COLLIDER_[AB]_BaseGround$/.test(object.name)) courtyardMeshes.push(object)
    else if (!NON_BLOCKING_TERRAIN.test(object.name)) blockers.push({ name: object.name, box: new THREE.Box3().setFromObject(object) })
  })
  if (terrain) groundMeshes.unshift(terrain)
  const spawnGroundMeshes = [...groundMeshes, ...courtyardMeshes]
  const raycaster = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0)
  const courtyardBounds = {}
  for (const side of ['A', 'B']) {
    const left = blockers.find(item => item.name === `COLLIDER_${side}_Wall_Left`)
    const right = blockers.find(item => item.name === `COLLIDER_${side}_Wall_Right`)
    const back = blockers.find(item => item.name === `COLLIDER_${side}_Wall_Back`)
    const front = blockers.find(item => item.name === `COLLIDER_${side}_Wall_Front_L`)
    if (left && right && back && front) courtyardBounds[side] = side === 'A'
      ? { minX: left.box.max.x, maxX: right.box.min.x, minZ: back.box.max.z, maxZ: front.box.min.z }
      : { minX: left.box.max.x, maxX: right.box.min.x, minZ: front.box.max.z, maxZ: back.box.min.z }
  }
  for (const side of ['A', 'B']) {
    const spawn = positions[`Spawn_${side}`]
    origin.set(spawn.x, spawn.y + 50, spawn.z)
    raycaster.set(origin, down)
    raycaster.far = 100
    const hits = raycaster.intersectObjects(spawnGroundMeshes, false)
    // Spawn markers are authored inside each fort's bounded courtyard. Choose
    // the highest real terrain/base-floor hit instead of the broad Terrain_* pad.
    if (hits[0]) spawn.y = hits[0].point.y + 0.04
  }

  const colliderCount = []
  scene.traverse(object => { if (object.isMesh && object.name.startsWith('COLLIDER_')) colliderCount.push(object.name) })
  console.info(`[Battlefield] V5 server map loaded: ${colliderCount.length} COLLIDER_ meshes; spawn A ${positions.Spawn_A.toArray().map(v => v.toFixed(2))}; spawn B ${positions.Spawn_B.toArray().map(v => v.toFixed(2))}`)
  const groundRaycaster = new THREE.Raycaster()
  const groundOrigin = new THREE.Vector3()
  const groundDown = new THREE.Vector3(0, -1, 0)
  const troopRadius = 0.4
  const troopHeight = 2.9
  const overlapsBlocker = (x, z, feetY, blocker) => {
    const box = blocker.box
    if (feetY + troopHeight <= box.min.y || feetY >= box.max.y) return false
    const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x)
    const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z)
    const dx = x - closestX, dz = z - closestZ
    return dx * dx + dz * dz < troopRadius * troopRadius
  }
  const groundHeight = (x, z, referenceY = Infinity) => {
    if (!terrain && !spawnGroundMeshes.length) return null
    groundOrigin.set(x, Number.isFinite(referenceY) ? referenceY + 1.3 : 1000, z)
    groundRaycaster.set(groundOrigin, groundDown)
    groundRaycaster.far = Number.isFinite(referenceY) ? 5 : 1100
    const hits = groundRaycaster.intersectObjects(spawnGroundMeshes, false)
    const valid = hits.find(hit => {
      if (Number.isFinite(referenceY) && (hit.point.y > referenceY + 1.25 || hit.point.y < referenceY - 0.55)) return false
      const side = hit.object.name.includes('_A_') ? 'A' : hit.object.name.includes('_B_') ? 'B' : null
      if (!COURTYARD_GROUND.test(hit.object.name)) return true
      const bounds = courtyardBounds[side]
      return Boolean(bounds && x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ)
    })
    if (valid) return valid.point.y + 0.04
    if (terrain) {
      const terrainHit = groundRaycaster.intersectObject(terrain, false)[0]
      if (terrainHit) return Number.isFinite(referenceY)
        ? THREE.MathUtils.clamp(terrainHit.point.y + 0.04, referenceY - 0.55, referenceY + 1.25)
        : terrainHit.point.y + 0.04
    }
    return Number.isFinite(referenceY) ? referenceY : null
  }
  const resolveMovement = (from, to) => {
    if (!blockers.length) return { x: to.x, z: to.z }
    let x = from.x, z = from.z
    const dx = to.x - from.x, dz = to.z - from.z
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (troopRadius * 0.5)))
    const stepX = dx / steps, stepZ = dz / steps
    for (let i = 0; i < steps; i++) {
      const nextX = x + stepX
      if (!blockers.some(blocker => overlapsBlocker(nextX, z, from.y, blocker))) x = nextX
      const nextZ = z + stepZ
      if (!blockers.some(blocker => overlapsBlocker(x, nextZ, from.y, blocker))) z = nextZ
    }
    return { x, z }
  }

  return { positions, colliderCount: colliderCount.length, groundHeight, resolveMovement }
}
