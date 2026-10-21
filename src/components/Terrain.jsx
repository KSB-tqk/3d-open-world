import * as THREE from 'three'
import { useMemo } from 'react'
import { WORLD_SIZE, terrainHeight } from './terrain.js'

export default function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 220, 220)
    const p = g.attributes.position
    const colors = new Float32Array(p.count * 3)
    const meadow = new THREE.Color()
    const accent = new THREE.Color()
    for (let i = 0; i < p.count; i++) p.setZ(i, terrainHeight(p.getX(i), -p.getY(i)))
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = -p.getY(i)
      const y = p.getZ(i)
      const variation = (Math.sin(x * 0.031 + z * 0.017) + Math.cos(z * 0.026 - x * 0.013)) * 0.035
      const elevation = THREE.MathUtils.smoothstep(y, 7, 21)
      const lowland = THREE.MathUtils.smoothstep(2 - y, 0, 9)
      meadow.setRGB(0.37 + variation, 0.66 + variation, 0.27 + variation * 0.5)
      accent.setRGB(0.54, 0.62, 0.35)
      meadow.lerp(accent, elevation * 0.72)
      accent.setRGB(0.34, 0.57, 0.31)
      meadow.lerp(accent, lowland * 0.42)
      meadow.toArray(colors, i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geometry} rotation-x={-Math.PI / 2} receiveShadow>
    <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
  </mesh>
}
