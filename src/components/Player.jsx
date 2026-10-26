import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { terrainHeight, WORLD_SIZE } from './terrain.js'
import PlayerModel from './PlayerModel.jsx'
import { getPlayerSpawn } from '../world/worldConfig.js'
import { CAMERA_CONFIG } from '../combat/combatConfig.js'

const typingTarget = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function Player({ controlsRef, name = 'Player', characterId, playerId = '', networkRef, mobileInputRef, attackRef, attackIntentRef, hp, alive = true, respawnPosition, damageFeedback, onAttack, onAttackReady, onAttackFinished, combatMode = false, mobileControls = false, controlsDisabled = false }) {
  const ref = useRef(), velocity = useRef(new THREE.Vector3()), movement = useRef({ speed: 0, sprint: false, time: 0 }), keys = useRef(Object.create(null))
  const cameraAim = useRef(new THREE.Vector3()), cameraRight = useRef(new THREE.Vector3()), desiredTarget = useRef(new THREE.Vector3()), cameraBlendWeight = useRef(0), explorationDistance = useRef(CAMERA_CONFIG.explorationDistance), completedAttackId = useRef(null)
  const followPosition = useRef(new THREE.Vector3()), previousFollowPosition = useRef(null), followDelta = useRef(new THREE.Vector3())
  const aliveRef = useRef(alive)
  aliveRef.current = alive
  const { camera } = useThree()
  const spawn = getPlayerSpawn(playerId)
  const syncCameraTranslation = () => {
    if (!ref.current) return followPosition.current.set(0, 0, 0)
    ref.current.getWorldPosition(followPosition.current)
    if (previousFollowPosition.current) {
      // Move the orbit rig with the player; only camera-relative offsets are damped below.
      followDelta.current.subVectors(followPosition.current, previousFollowPosition.current)
      if (controlsRef.current && followDelta.current.lengthSq() > 0) controlsRef.current.target.add(followDelta.current)
      camera.position.add(followDelta.current)
    } else {
      previousFollowPosition.current = new THREE.Vector3()
    }
    previousFollowPosition.current.copy(followPosition.current)
    return followPosition.current
  }
  const updateCameraFraming = (dt, playerPosition) => {
    if (!controlsRef.current) return
    const cameraModeActive = combatMode || attackIntentRef?.current?.pending || cameraBlendWeight.current > 0.001
    const weight = cameraBlendWeight.current
    const targetHeight = THREE.MathUtils.lerp(CAMERA_CONFIG.targetHeight, CAMERA_CONFIG.combatHeight, weight)
    const target = desiredTarget.current.set(playerPosition.x, playerPosition.y + targetHeight, playerPosition.z)
    cameraRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
    cameraRight.current.y = 0
    if (cameraRight.current.lengthSq() > 0.0001) cameraRight.current.normalize()
    target.addScaledVector(cameraRight.current, CAMERA_CONFIG.combatShoulderOffset * weight)
    controlsRef.current.target.lerp(target, 1 - Math.exp(-CAMERA_CONFIG.targetDamping * dt))

    const offset = camera.position.clone().sub(controlsRef.current.target)
    const currentDistance = offset.length()
    if (!cameraModeActive && weight <= 0.001 && currentDistance > 0.001) explorationDistance.current = currentDistance
    const desiredDistance = THREE.MathUtils.lerp(explorationDistance.current, CAMERA_CONFIG.combatDistance, weight)
    const nextDistance = desiredDistance
    if (currentDistance > 0.0001) camera.position.copy(controlsRef.current.target).addScaledVector(offset, nextDistance / currentDistance)
    controlsRef.current.update()
  }
  useEffect(() => {
    const down = (e) => { if (!aliveRef.current || typingTarget(e.target)) return; keys.current[e.code] = true }
    const up = (e) => { keys.current[e.code] = false }
    const blur = () => { for (const code of Object.keys(keys.current)) keys.current[code] = false }
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur) }
  }, [])
  useEffect(() => {
    if (alive || !ref.current) return
    velocity.current.set(0, 0, 0)
    keys.current = Object.create(null)
    if (mobileInputRef) mobileInputRef.current = { x: 0, y: 0, sprint: false }
  }, [alive, mobileInputRef])
  useEffect(() => {
    if (!respawnPosition || !ref.current) return
    ref.current.position.set(respawnPosition.x, respawnPosition.y, respawnPosition.z)
    velocity.current.set(0, 0, 0)
    movement.current.speed = 0
    movement.current.sprint = false
    movement.current.animation = 'idle'
    movement.current.alive = true
    keys.current = Object.create(null)
    if (mobileInputRef) mobileInputRef.current = { x: 0, y: 0, sprint: false }
    if (networkRef) networkRef.current = { position: { ...respawnPosition }, rotation: ref.current.rotation.y, animation: 'idle', alive: true }
  }, [mobileInputRef, networkRef, respawnPosition])
  useEffect(() => {
    if (mobileControls || !onAttack) return
    const interactive = target => target instanceof Element && target.closest('button,a,input,textarea,select,summary,[role="button"],[contenteditable="true"],.chat,.mobile-controls,.mobile-mode-toggle,.start-screen,[data-ui]')
    const onPointerDown = event => {
      if (!alive || event.button !== 0 || event.pointerType === 'touch' || controlsDisabled || typingTarget(document.activeElement) || interactive(event.target)) return
      onAttack()
    }
    addEventListener('pointerdown', onPointerDown)
    return () => removeEventListener('pointerdown', onPointerDown)
  }, [alive, controlsDisabled, mobileControls, onAttack])
  useFrame((_, dt) => {
    if (!ref.current) return
    const now = performance.now()
    const currentAttack = attackRef?.current
    const isAttacking = Boolean(currentAttack?.until > now)
    const shouldUseCombatCamera = alive && (combatMode || Boolean(attackIntentRef?.current?.pending) || isAttacking)
    const targetWeight = shouldUseCombatCamera ? 1 : 0
    if (targetWeight === 1 && cameraBlendWeight.current <= 0.001 && controlsRef.current) {
      const currentDistance = camera.position.distanceTo(controlsRef.current.target)
      if (currentDistance > 0.001) explorationDistance.current = currentDistance
    }
    const blendSpeed = targetWeight > cameraBlendWeight.current ? CAMERA_CONFIG.cameraZoomInSpeed : CAMERA_CONFIG.cameraZoomOutSpeed
    cameraBlendWeight.current += (targetWeight - cameraBlendWeight.current) * (1 - Math.exp(-blendSpeed * dt))
    if (targetWeight === 0 && cameraBlendWeight.current < 0.001) cameraBlendWeight.current = 0
    if (targetWeight === 1 && cameraBlendWeight.current > 0.999) cameraBlendWeight.current = 1
    cameraBlendWeight.current = THREE.MathUtils.clamp(cameraBlendWeight.current, 0, 1)
    if (!alive) {
      velocity.current.set(0, 0, 0)
      movement.current.speed = 0
      movement.current.sprint = false
      movement.current.animation = 'death'
      movement.current.attackId = null
      if (attackIntentRef) attackIntentRef.current.pending = false
      movement.current.alive = false
      if (networkRef) networkRef.current = { position: { x: ref.current.position.x, y: ref.current.position.y, z: ref.current.position.z }, rotation: ref.current.rotation.y, animation: 'death', alive: false }
      const playerPosition = syncCameraTranslation()
      updateCameraFraming(dt, playerPosition)
      return
    }
    const aiming = shouldUseCombatCamera
    const direction = cameraAim.current
    camera.getWorldDirection(direction)
    direction.y = 0
    if (direction.lengthSq() > 0.0001) direction.normalize()
    const aimYaw = Math.atan2(direction.x, direction.z)
    const attackElapsed = isAttacking ? now - currentAttack.startedAt : -1
    const attackTurnMultiplier = !isAttacking ? 1 :
      attackElapsed < currentAttack.windupMs ? CAMERA_CONFIG.attackWindupTurnMultiplier :
        attackElapsed < currentAttack.windupMs + currentAttack.activeMs ? CAMERA_CONFIG.attackActiveTurnMultiplier : CAMERA_CONFIG.attackRecoveryTurnMultiplier
    const rotationSpeed = isAttacking ? CAMERA_CONFIG.attackTurnSpeed * attackTurnMultiplier : CAMERA_CONFIG.combatRotationSpeed
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
      if (!aiming) ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z)
    } else velocity.current.lerp(new THREE.Vector3(), Math.min(1, dt * 8))
    if (aiming && direction.lengthSq() > 0.0001) {
      const yawDelta = Math.atan2(Math.sin(aimYaw - ref.current.rotation.y), Math.cos(aimYaw - ref.current.rotation.y))
      ref.current.rotation.y += yawDelta * (1 - Math.exp(-rotationSpeed * dt))
    }
    ref.current.position.addScaledVector(velocity.current, dt)
    const lim = WORLD_SIZE / 2 - 8
    ref.current.position.x = THREE.MathUtils.clamp(ref.current.position.x, -lim, lim)
    ref.current.position.z = THREE.MathUtils.clamp(ref.current.position.z, -lim, lim)
    ref.current.position.y = terrainHeight(ref.current.position.x, ref.current.position.z)
    const playerPosition = syncCameraTranslation()
    movement.current.speed = velocity.current.length(); movement.current.sprint = sprint; movement.current.time += dt
    movement.current.alive = true
    const locomotion = movement.current.speed > .5 ? (sprint ? 'run' : 'walk') : 'idle'
    const attacking = attackRef?.current?.until > now
    if (attacking) attackRef.current.rotation = ref.current.rotation.y
    movement.current.animation = attacking ? 'attack' : locomotion
    movement.current.attackId = attacking ? attackRef.current.attackId : null
    if (networkRef) networkRef.current = { position: { x: ref.current.position.x, y: ref.current.position.y, z: ref.current.position.z }, rotation: ref.current.rotation.y, animation: movement.current.animation, alive: true }
    const attackIntent = attackIntentRef?.current
    if (attackIntent?.pending && (Math.abs(Math.atan2(Math.sin(aimYaw - ref.current.rotation.y), Math.cos(aimYaw - ref.current.rotation.y))) < 0.12 || performance.now() - attackIntent.requestedAt >= 650)) {
      attackIntent.pending = false
      onAttackReady?.(ref.current.rotation.y)
    }
    if (!attacking && currentAttack?.until > 0 && completedAttackId.current !== currentAttack.attackId) {
      completedAttackId.current = currentAttack.attackId
      onAttackFinished?.(currentAttack.attackId)
    }
    updateCameraFraming(dt, playerPosition)
  })
  return <group ref={ref} position={[spawn.x, terrainHeight(spawn.x, spawn.z), spawn.z]}><PlayerModel movementRef={movement} name={name} characterId={characterId} hp={hp} alive={alive} damageFeedback={damageFeedback}/></group>
}
