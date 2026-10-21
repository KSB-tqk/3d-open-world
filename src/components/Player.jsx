import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { terrainHeight, WORLD_SIZE } from './terrain.js'
import PlayerModel from './PlayerModel.jsx'
import { WORLD_MAP } from '../world/worldConfig.js'

const typingTarget = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function Player({ controlsRef, name = 'Player', characterId, networkRef, mobileInputRef, controlsDisabled = false }) {
  const ref = useRef(), velocity = useRef(new THREE.Vector3()), movement = useRef({ speed: 0, sprint: false, time: 0 }), keys = useRef(Object.create(null))
  const { camera } = useThree()
  useEffect(() => {
    const down = (e) => { if (typingTarget(e.target)) return; keys.current[e.code] = true }
    const up = (e) => { keys.current[e.code] = false }
    const blur = () => { for (const code of Object.keys(keys.current)) keys.current[code] = false }
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur) }
  }, [])
  useFrame((_, dt) => {
    if (!ref.current) return
    const keyboardDisabled = controlsDisabled || typingTarget(document.activeElement)
    const pressed = keys.current, mobile = keyboardDisabled ? { x: 0, y: 0, sprint: false } : mobileInputRef?.current || { x: 0, y: 0, sprint: false }
    const f = (keyboardDisabled ? 0 : (pressed.KeyW || pressed.ArrowUp ? 1 : 0) - (pressed.KeyS || pressed.ArrowDown ? 1 : 0)) - mobile.y
    const r = (keyboardDisabled ? 0 : (pressed.KeyD || pressed.ArrowRight ? 1 : 0) - (pressed.KeyA || pressed.ArrowLeft ? 1 : 0)) + mobile.x
    const input = new THREE.Vector3(r, 0, -f)
    const magnitude = Math.min(1, input.length())
    const sprint = !keyboardDisabled && (!!(pressed.ShiftLeft || pressed.ShiftRight) || !!mobile.sprint)
    if (magnitude > 0.01) {
      input.normalize()
      const yaw = Math.atan2(camera.position.x - ref.current.position.x, camera.position.z - ref.current.position.z)
      input.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      velocity.current.lerp(input.multiplyScalar((sprint ? 24 : 12) * magnitude), Math.min(1, dt * 9))
      ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z)
    } else velocity.current.lerp(new THREE.Vector3(), Math.min(1, dt * 8))
    ref.current.position.addScaledVector(velocity.current, dt)
    const lim = WORLD_SIZE / 2 - 8
    ref.current.position.x = THREE.MathUtils.clamp(ref.current.position.x, -lim, lim)
    ref.current.position.z = THREE.MathUtils.clamp(ref.current.position.z, -lim, lim)
    ref.current.position.y = terrainHeight(ref.current.position.x, ref.current.position.z)
    movement.current.speed = velocity.current.length(); movement.current.sprint = sprint; movement.current.time += dt
    movement.current.animation = movement.current.speed > .5 ? (sprint ? 'run' : 'walk') : 'idle'
    if (networkRef) networkRef.current = { position: { x: ref.current.position.x, y: ref.current.position.y, z: ref.current.position.z }, rotation: ref.current.rotation.y, animation: movement.current.animation }
    if (controlsRef.current) {
      controlsRef.current.target.lerp(new THREE.Vector3(ref.current.position.x, ref.current.position.y + 2.15, ref.current.position.z), 1 - Math.pow(.001, dt))
      controlsRef.current.update()
    }
  })
  return <group ref={ref} position={[WORLD_MAP.spawn.x, terrainHeight(WORLD_MAP.spawn.x, WORLD_MAP.spawn.z), WORLD_MAP.spawn.z]}><PlayerModel movementRef={movement} name={name} characterId={characterId}/></group>
}
