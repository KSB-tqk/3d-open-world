import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PIVOT_NAMES = [
  'HipsPivot', 'RightShoulderPivot', 'RightElbowPivot',
  'LeftShoulderPivot', 'LeftElbowPivot', 'NeckPivot', 'RightHipPivot',
  'LeftHipPivot', 'RightKneePivot', 'LeftKneePivot',
]

const lerp = THREE.MathUtils.lerp
const smooth = value => {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function rotationSnapshot(object) {
  return object ? {
    position: object.position.clone(),
    rotation: object.rotation.clone(),
    scale: object.scale.clone(),
  } : null
}

export default function KnightRig({ model, movementRef, alive = true, bakedAttack = false }) {
  const rig = useMemo(() => {
    const pivots = Object.fromEntries(PIVOT_NAMES.map(name => [name, model.getObjectByName(name)]))
    const rest = Object.fromEntries(PIVOT_NAMES.map(name => [name, rotationSnapshot(pivots[name])]))
    return { pivots, rest }
  }, [model])

  useFrame((_, dt) => {
    const state = movementRef?.current || {}
    const dead = !alive || state.alive === false
    const blocking = !dead && state.isBlocking === true
    const attacking = !dead && state.animation === 'attack'
    const bakedAttackActive = bakedAttack && attacking
    const sprint = state.sprint === true
    const phase = (state.time || 0) * (sprint ? 12 : 7.5)
    const stride = Math.sin(phase)
    const gait = Math.min(1, (state.speed || 0) / (sprint ? 18 : 9))
    const legAmount = dead ? 0 : (sprint ? 0.48 : 0.29) * gait
    const armAmount = sprint ? 0.3 : 0.18
    const attackProgress = THREE.MathUtils.clamp(state.attackProgress ?? 0, 0, 1)
    const windupEnd = THREE.MathUtils.clamp(state.attackWindupRatio ?? 0.27, 0.05, 0.8)
    const activeEnd = THREE.MathUtils.clamp(state.attackActiveEndRatio ?? 0.54, windupEnd + 0.05, 0.95)

    let swordShoulderX = 0
    let swordElbowX = 0
    if (attacking) {
      if (attackProgress < windupEnd) {
        const t = smooth(attackProgress / windupEnd)
        swordShoulderX = lerp(0, -1.08, t)
        swordElbowX = lerp(0, -0.48, t)
      } else if (attackProgress < activeEnd) {
        const t = smooth((attackProgress - windupEnd) / (activeEnd - windupEnd))
        swordShoulderX = lerp(-1.08, 1.22, t)
        swordElbowX = lerp(-0.48, 0.22, t)
      } else {
        const t = smooth((attackProgress - activeEnd) / Math.max(0.001, 1 - activeEnd))
        swordShoulderX = lerp(1.22, 0, t)
        swordElbowX = lerp(0.22, 0, t)
      }
    }

    const rightLeg = Math.cos(phase) * legAmount
    const leftLeg = -rightLeg
    const rightShoulder = blocking ? 0 : attacking ? swordShoulderX : -rightLeg * armAmount
    const rightElbow = blocking ? 0 : attacking ? swordElbowX : Math.max(0, -rightLeg) * 0.16
    const leftShoulderX = blocking ? 0.68 : -leftLeg * armAmount
    const leftShoulderZ = blocking ? 0.52 : 0
    const leftElbowX = blocking ? -0.2 : Math.max(0, -leftLeg) * 0.14
    const breathe = !dead && !blocking && !attacking ? Math.sin((state.time || 0) * 1.7) * 0.018 : 0

    const apply = (name, x = 0, y = 0, z = 0) => {
      const pivot = rig.pivots[name], base = rig.rest[name]
      if (!pivot || !base) return
      pivot.position.copy(base.position)
      pivot.scale.copy(base.scale)
      const blend = name.includes('HipPivot') || name.includes('KneePivot') ? 19 : 15
      pivot.rotation.set(
        THREE.MathUtils.damp(pivot.rotation.x, base.rotation.x + x, blend, dt),
        THREE.MathUtils.damp(pivot.rotation.y, base.rotation.y + y, blend, dt),
        THREE.MathUtils.damp(pivot.rotation.z, base.rotation.z + z, blend, dt),
      )
    }
    const attackTwist = attacking ? Math.sin(attackProgress * Math.PI) * 0.14 : 0
    if (!bakedAttackActive) apply('HipsPivot', breathe + (sprint && gait > 0.1 ? 0.045 : 0), attackTwist)
    apply('RightHipPivot', rightLeg)
    apply('LeftHipPivot', leftLeg)
    apply('RightKneePivot', Math.max(0, -rightLeg) * (sprint ? 0.9 : 0.55))
    apply('LeftKneePivot', Math.max(0, -leftLeg) * (sprint ? 0.9 : 0.55))
    if (!bakedAttackActive) {
      apply('RightShoulderPivot', rightShoulder)
      apply('RightElbowPivot', rightElbow)
    }
    apply('LeftShoulderPivot', leftShoulderX, 0, leftShoulderZ)
    apply('LeftElbowPivot', leftElbowX)
  })

  return null
}
