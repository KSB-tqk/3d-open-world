import { useLayoutEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { SHOW_MAP_COLLIDERS, USE_TEST_BATTLEFIELD } from '../world/worldConfig.js'
import { registerTestBattlefield } from '../world/testBattlefieldTerrain.js'

const MODEL_PATH = '/models/world/sunmeadow_valley_1v1_v5_with_colliders.glb'

export default function TestBattlefield() {
  const { scene } = useGLTF(MODEL_PATH)

  useLayoutEffect(() => {
    const terrain = scene.getObjectByName('VIS_Terrain') || scene.getObjectByName('Terrain')
    if (!terrain?.isMesh) {
      console.error(`[TestBattlefield] Expected a mesh named "VIS_Terrain" or "Terrain" in ${MODEL_PATH}`)
      return undefined
    }
    return registerTestBattlefield(scene, SHOW_MAP_COLLIDERS)
  }, [scene])

  // The GLB is Y-up and its terrain spans 600 x 600 units, so it stays at
  // identity transform to match the existing map's scale and origin.
  return <primitive object={scene} />
}

if (USE_TEST_BATTLEFIELD) useGLTF.preload(MODEL_PATH)
