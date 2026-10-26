import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { COMBAT_CONFIG } from './combatConfig.js'

export default function CombatDebug({ getTransform, getAttack, enabled, showAimDirection = false }) {
  const root = useRef(), hurtbox = useRef(), hitbox = useRef(), aimDirection = useRef()
  useFrame(() => {
    if (!root.current) return
    const transform = getTransform()
    if (!enabled || !transform) {
      root.current.visible = false
      return
    }
    root.current.visible = true
    root.current.position.set(transform.position.x, transform.position.y, transform.position.z)
    const attack = getAttack()
    const elapsed = attack ? performance.now() - attack.startedAt : -1
    const phase = attack && elapsed >= 0 && elapsed < attack.durationMs
      ? elapsed < attack.windupMs ? 'windup'
        : elapsed < attack.windupMs + attack.activeMs ? 'active' : 'recovery'
      : 'idle'
    root.current.rotation.y = phase !== 'idle' && Number.isFinite(attack.rotation) ? attack.rotation : transform.rotation
    aimDirection.current.visible = showAimDirection
    hurtbox.current.visible = true
    hitbox.current.visible = phase === 'active' || phase === 'windup'
    hitbox.current.material.opacity = phase === 'active' ? 0.38 : 0.08
    hitbox.current.material.color.set(phase === 'active' ? '#ff3d25' : '#ffc14d')
  })
  const box = COMBAT_CONFIG.attackHitbox
  const hurt = COMBAT_CONFIG.playerHurtbox
  return <group ref={root}>
    <mesh ref={aimDirection} position={[0, 1.55, 1.5]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.025, 0.025, 3, 6]}/>
      <meshBasicMaterial color="#53e8ff" depthWrite={false}/>
    </mesh>
    <mesh ref={hurtbox} position={[0, hurt.height / 2, 0]}>
      <cylinderGeometry args={[hurt.radius, hurt.radius, hurt.height, 12]}/>
      <meshBasicMaterial color="#43e07a" transparent opacity={0.12} depthWrite={false}/>
    </mesh>
    <mesh ref={hitbox} position={[0, (box.minHeight + box.maxHeight) / 2, box.centerForward]}>
      <boxGeometry args={[box.width, box.maxHeight - box.minHeight, box.depth]}/>
      <meshBasicMaterial color="#ff3d25" transparent opacity={0.38} depthWrite={false}/>
    </mesh>
  </group>
}
