import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = new URL('../public/models/world/sunmeadow_valley_1v1_v5_with_colliders.glb', import.meta.url)
const WALKABLE = /^COLLIDER_(MainBridge$|[AB]_(ApproachGround$|StairRamp_|Walk_))/

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
  scene.traverse(object => {
    if (!object.isMesh || !object.name.startsWith('COLLIDER_')) return
    if (WALKABLE.test(object.name)) groundMeshes.push(object)
    else if (/^COLLIDER_[AB]_BaseGround$/.test(object.name)) courtyardMeshes.push(object)
  })
  if (terrain) groundMeshes.unshift(terrain)
  const spawnGroundMeshes = [...groundMeshes, ...courtyardMeshes]
  const raycaster = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0)
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
  return { positions, colliderCount: colliderCount.length }
}
