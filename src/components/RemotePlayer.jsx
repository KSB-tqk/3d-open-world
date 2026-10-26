import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import PlayerModel from './PlayerModel.jsx'

export default function RemotePlayer({ player }) {
  const group = useRef(), movement = useRef({ speed: 0, sprint: false, time: 0 })
  useFrame((_, dt) => {
    if (!group.current) return
    const target = player.target.current
    const position = target.position.isVector3 ? target.position : new THREE.Vector3(target.position.x, target.position.y, target.position.z)
    group.current.position.lerp(position, 1 - Math.exp(-dt * 10))
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, target.rotation, 10, dt)
    movement.current.time += dt
    const alive = player.alive !== false
    movement.current.alive = alive
    movement.current.speed = !alive || target.animation === 'idle' ? 0 : target.animation === 'run' ? 20 : 10
    movement.current.sprint = target.animation === 'run'
    const attacking = alive && player.attack?.until > performance.now()
    movement.current.animation = !alive ? 'death' : attacking ? 'attack' : target.animation === 'attack' ? 'idle' : target.animation || 'idle'
    movement.current.attackId = attacking ? player.attack.attackId : null
  })
  return <group ref={group}><PlayerModel movementRef={movement} name={player.name} characterId={player.characterId} hp={player.hp} alive={player.alive !== false} damageFeedback={player.damageFeedback}/></group>
}
