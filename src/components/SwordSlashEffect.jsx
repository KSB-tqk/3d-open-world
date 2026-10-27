import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { COMBAT_CONFIG } from '../combat/combatConfig.js'

const EFFECT_MODEL = '/models/effects/sword_slash_effect_v1.glb'
const EFFECT_START_MS = COMBAT_CONFIG.attackWindupMs + 30
const EFFECT_END_MS = COMBAT_CONFIG.attackWindupMs + COMBAT_CONFIG.attackActiveMs + 50

export default function SwordSlashEffect({ model, movementRef, effectScale = 0.88, opacityMultiplier = 1 }) {
  const { scene } = useGLTF(EFFECT_MODEL)
  const effect = useMemo(() => {
    const root = scene.clone(true)
    const materials = []
    root.name = 'KnightSwordSlashEffect'
    root.visible = false
    root.traverse(object => {
      if (!object.isMesh) return
      object.castShadow = false
      object.receiveShadow = false
      object.frustumCulled = false
      object.renderOrder = 4
      const createMaterial = objectName => {
        const isCore = objectName.includes('Core')
        const material = new THREE.MeshBasicMaterial({
          // The source GLB has one constant vertex color per mesh. Copy it into
          // a material color so its alpha renders consistently in WebGL.
          color: isCore ? 0xf5faff : 0x7dd2ff,
          transparent: true,
          opacity: isCore ? 225 / 255 : 170 / 255,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
        material.userData.baseOpacity = material.opacity
        materials.push(material)
        return material
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(() => createMaterial(object.name))
        : createMaterial(object.name)
    })
    return { root, materials }
  }, [scene])
  const swordAnchor = useMemo(() => model.getObjectByName('SwordRoot') || model.getObjectByName('RightHandAnchor'), [model])

  useEffect(() => {
    const { root, materials } = effect
    root.visible = false
    root.position.set(0, 0, 0)
    root.rotation.set(0, 0, 0)
    root.scale.setScalar(effectScale)
    model.add(root)
    if (!swordAnchor && import.meta.env.DEV) console.warn('[SwordSlashEffect] Knight model has no SwordRoot or RightHandAnchor')
    return () => {
      root.removeFromParent()
      materials.forEach(material => material.dispose())
    }
  }, [effect, model, swordAnchor])

  useFrame(() => {
    const { root, materials } = effect
    const state = movementRef?.current
    const elapsed = Number.isFinite(state?.attackStartedAt) ? performance.now() - state.attackStartedAt : -1
    const active = Boolean(
      swordAnchor &&
      state?.alive !== false &&
      state?.animation === 'attack' &&
      state?.attackId != null &&
      elapsed >= EFFECT_START_MS &&
      elapsed <= EFFECT_END_MS,
    )
    root.visible = active
    if (!active) return

    model.updateWorldMatrix(true, true)
    const position = swordAnchor.getWorldPosition(new THREE.Vector3())
    root.position.copy(model.worldToLocal(position))

    const progress = THREE.MathUtils.clamp((elapsed - EFFECT_START_MS) / (EFFECT_END_MS - EFFECT_START_MS), 0, 1)
    const opacity = Math.min(1, progress / 0.18, (1 - progress) / 0.28)
    for (const material of materials) material.opacity = material.userData.baseOpacity * opacity * opacityMultiplier
    const scale = effectScale + 0.16 * Math.sin(progress * Math.PI)
    root.scale.setScalar(scale)
  })

  return null
}
