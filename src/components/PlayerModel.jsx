import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import CharacterVisual from './CharacterVisual.jsx'

export default function PlayerModel({ movementRef, name = 'Player', characterId }) {
  const root = useRef()
  useFrame((_, dt) => {
    if (!root.current || !movementRef) return
    const { speed = 0, sprint = false, time = 0 } = movementRef.current
    const moving = speed > .35, phase = time * (sprint ? 12 : 8)
    const bob = moving ? Math.abs(Math.sin(phase * .5)) * (sprint ? .13 : .06) : Math.sin(time * 1.7) * .035
    root.current.position.y = THREE.MathUtils.damp(root.current.position.y, bob, 7, dt)
    root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, moving ? Math.sin(phase) * .025 : 0, 7, dt)
  })
  return <group ref={root}>
    <Billboard position={[0, 4.35, 0]}><Text fontSize={.42} outlineWidth={.035} outlineColor="#243a31" color="white" anchorX="center" anchorY="middle" maxWidth={4}>{name}</Text></Billboard>
    <CharacterVisual characterId={characterId} movementRef={movementRef} fallback={null}/>
  </group>
}
