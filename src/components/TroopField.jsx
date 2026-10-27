import { useEffect, useRef, useState } from 'react'
import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import CharacterVisual from './CharacterVisual.jsx'
import { TROOP_CONFIG } from '../combat/troopConfig.js'
import { COMBAT_CONFIG } from '../combat/combatConfig.js'

const TEAM_COLORS = Object.freeze({ A: '#64b8ff', B: '#ff7069' })

function TroopUnit({ troop, clockOffset }) {
  const group = useRef(null)
  const movement = useRef({ alive: true, animation: 'idle', speed: 0, time: 0 })
  const lastSequence = useRef(-1)
  const lastPosition = useRef(new THREE.Vector3(troop.position.x, troop.position.y, troop.position.z))
  const teamColor = TEAM_COLORS[troop.team] || '#e5d7a3'

  useFrame((_, dt) => {
    if (!group.current) return
    const target = troop.position
    group.current.position.lerp(_targetPosition.set(target.x, target.y, target.z), 1 - Math.exp(-dt * 9))
    const displacement = group.current.position.distanceTo(lastPosition.current)
    movement.current.speed = dt > 0 ? Math.min(14, displacement / dt) : 0
    lastPosition.current.copy(group.current.position)
    const yawDelta = Math.atan2(Math.sin(troop.yaw - group.current.rotation.y), Math.cos(troop.yaw - group.current.rotation.y))
    group.current.rotation.y += yawDelta * (1 - Math.exp(-dt * 10))

    const age = troop.attackSequence > 0
      ? Math.max(0, Date.now() - clockOffset - troop.attackStartedAt)
      : Infinity
    const attacking = troop.alive && age < COMBAT_CONFIG.attackAnimationMs
    if (troop.attackSequence !== lastSequence.current) {
      lastSequence.current = troop.attackSequence
      movement.current.attackId = `${troop.id}-${troop.attackSequence}`
    }
    movement.current.alive = troop.alive
    movement.current.time += dt
    movement.current.attackStartedAt = attacking ? performance.now() - age : 0
    movement.current.attackProgress = attacking ? THREE.MathUtils.clamp(age / COMBAT_CONFIG.attackAnimationMs, 0, 1) : 0
    movement.current.attackWindupRatio = COMBAT_CONFIG.attackWindupMs / COMBAT_CONFIG.attackAnimationMs
    movement.current.attackActiveEndRatio = (COMBAT_CONFIG.attackWindupMs + COMBAT_CONFIG.attackActiveMs) / COMBAT_CONFIG.attackAnimationMs
    movement.current.animation = !troop.alive ? 'death' : attacking ? 'attack' : movement.current.speed > 0.45 ? 'walk' : 'idle'
    movement.current.isBlocking = false
  })

  return <group ref={node => {
    if (!node) return
    if (!group.current) node.position.set(troop.position.x, troop.position.y, troop.position.z)
    group.current = node
  }} scale={TROOP_CONFIG.visualScale}>
    <CharacterVisual characterId="knight" movementRef={movement} alive={troop.alive} equippedWeaponId={null} attackVfxScale={0.52} attackVfxOpacity={0.5}/>
    <group position={[-0.48, 2.72, -0.14]}>
      <mesh position={[0, 0.16, 0]} castShadow><cylinderGeometry args={[0.035, 0.035, 0.46, 5]}/><meshStandardMaterial color="#68553a"/></mesh>
      <mesh position={[0.16, 0.22, 0]} castShadow><boxGeometry args={[0.34, 0.22, 0.045]}/><meshStandardMaterial color={teamColor} roughness={0.82}/></mesh>
    </group>
    {troop.alive && (troop.hp < troop.maxHp || troop.state === 'ATTACK') && <Billboard position={[0, 3.73, 0]}>
      <mesh position={[0, 0, -0.01]}><planeGeometry args={[0.76, 0.075]}/><meshBasicMaterial color="#18252b" depthWrite={false}/></mesh>
      <mesh position={[(troop.hp / troop.maxHp - 1) * 0.34, 0, 0]}><planeGeometry args={[0.66 * troop.hp / troop.maxHp, 0.04]}/><meshBasicMaterial color={troop.hp / troop.maxHp < 0.3 ? '#ed5353' : teamColor} depthWrite={false}/></mesh>
    </Billboard>}
  </group>
}

const _targetPosition = new THREE.Vector3()

export default function TroopField({ socket }) {
  const [troops, setTroops] = useState([])
  const [clockOffset, setClockOffset] = useState(0)

  useEffect(() => {
    if (!socket) return undefined
    const onSnapshot = snapshot => {
      if (!Array.isArray(snapshot?.troops)) return
      setClockOffset(Date.now() - (snapshot.serverTime || Date.now()))
      setTroops(snapshot.troops)
    }
    const onDisconnect = () => setTroops([])
    socket.on('troops:snapshot', onSnapshot)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('troops:snapshot', onSnapshot)
      socket.off('disconnect', onDisconnect)
    }
  }, [socket])

  return <>{troops.map(troop => <TroopUnit key={troop.id} troop={troop} clockOffset={clockOffset}/>)}</>
}
