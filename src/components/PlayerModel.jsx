import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import CharacterVisual from './CharacterVisual.jsx'
import { COMBAT_CONFIG } from '../combat/combatConfig.js'
import { RIFLE_ENABLED } from '../weapons/registry.js'

export default function PlayerModel({ movementRef, name = 'Player', characterId, hp = COMBAT_CONFIG.maxHp, alive = true, damageFeedback, equippedWeaponId = 'rifle', muzzleRef, aimPitchRef }) {
  const root = useRef(), [feedbackVisible, setFeedbackVisible] = useState(false)
  const safeHp = THREE.MathUtils.clamp(Number.isFinite(hp) ? hp : COMBAT_CONFIG.maxHp, 0, COMBAT_CONFIG.maxHp)
  const healthRatio = safeHp / COMBAT_CONFIG.maxHp
  useFrame((_, dt) => {
    if (!root.current || !movementRef) return
    if (!alive || movementRef.current.alive === false) {
      root.current.position.y = THREE.MathUtils.damp(root.current.position.y, 0, 8, dt)
      root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, 0, 8, dt)
      return
    }
    const { speed = 0, sprint = false, time = 0 } = movementRef.current
    const moving = speed > .35, phase = time * (sprint ? 12 : 8)
    const bob = moving ? Math.abs(Math.sin(phase * .5)) * (sprint ? .13 : .06) : Math.sin(time * 1.7) * .035
    root.current.position.y = THREE.MathUtils.damp(root.current.position.y, bob, 7, dt)
    root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, moving ? Math.sin(phase) * .025 : 0, 7, dt)
  })
  useEffect(() => {
    if (!damageFeedback) { setFeedbackVisible(false); return }
    if (movementRef?.current) movementRef.current.hitReactUntil = performance.now() + 500
    setFeedbackVisible(true)
    const timeout = setTimeout(() => setFeedbackVisible(false), COMBAT_CONFIG.hitFeedbackMs)
    return () => clearTimeout(timeout)
  }, [damageFeedback?.id])
  return <group ref={root}>
    <Billboard position={[0, 4.35, 0]}><Text fontSize={.42} outlineWidth={.035} outlineColor="#243a31" color="white" anchorX="center" anchorY="middle" maxWidth={4}>{name}</Text></Billboard>
    <Billboard position={[0, 3.83, 0]}>
      <mesh position={[0, 0, -.01]}><planeGeometry args={[1.25, .13]}/><meshBasicMaterial color="#18252b" depthWrite={false}/></mesh>
      {healthRatio > 0 && <mesh position={[(healthRatio - 1) * .57, 0, 0]}><planeGeometry args={[1.14 * healthRatio, .07]}/><meshBasicMaterial color={healthRatio <= .25 ? '#ed5353' : '#7ee19a'} depthWrite={false}/></mesh>}
      <Text position={[0, -.18, 0]} fontSize={.16} outlineWidth={.012} outlineColor="#18252b" color="white" anchorX="center" anchorY="middle">{safeHp} / {COMBAT_CONFIG.maxHp} HP</Text>
    </Billboard>
    {feedbackVisible && damageFeedback && <Billboard position={[0, 5.05, 0]}><Text fontSize={damageFeedback.defeated ? .32 : .4} outlineWidth={.035} outlineColor="#4b1f1b" color="#ff7867" anchorX="center" anchorY="middle">{damageFeedback.defeated ? 'Player defeated' : `-${damageFeedback.damage}`}</Text></Billboard>}
    <CharacterVisual characterId={characterId} movementRef={movementRef} alive={alive} fallback={null} equippedWeaponId={RIFLE_ENABLED ? equippedWeaponId : null} muzzleRef={muzzleRef} aimPitchRef={aimPitchRef}/>
  </group>
}
