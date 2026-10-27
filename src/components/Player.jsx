import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { activeGroundHeight, activeGroundInfo, activeTerrainHeight, WORLD_SIZE } from './terrain.js'
import PlayerModel from './PlayerModel.jsx'
import { getPlayerSpawn } from '../world/worldConfig.js'
import { CAMERA_CONFIG, COMBAT_CONFIG } from '../combat/combatConfig.js'
import { RIFLE_ENABLED, WEAPONS } from '../weapons/registry.js'
import { resolveTestBattlefieldMovement } from '../world/testBattlefieldTerrain.js'
import { SHOW_GROUND_DEBUG } from '../world/worldConfig.js'

const RIFLE_CONFIG = WEAPONS.rifle

const typingTarget = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function Player({ controlsRef, name = 'Player', characterId, playerId = '', networkRef, mobileInputRef, attackRef, hp, alive = true, isBlocking = false, onBlockChange, spawnPosition, respawnPosition, damageFeedback, onAttack, onFire, onAimChange, fireRequestRef, weaponFireAtRef, weaponFireSequenceRef, isAiming = false, onAttackFinished, combatMode = false, mobileControls = false, controlsDisabled = false }) {
  const ref = useRef(), velocity = useRef(new THREE.Vector3()), movement = useRef({ speed: 0, sprint: false, time: 0 }), keys = useRef(Object.create(null)), muzzleRef = useRef(), aimPitchRef = useRef(0), aimingRef = useRef(isAiming), previousMovementPosition = useRef(new THREE.Vector3()), resolvedMovementPosition = useRef({ x: 0, z: 0 }), lastGroundSurface = useRef(null)
  const cameraAim = useRef(new THREE.Vector3()), cameraRight = useRef(new THREE.Vector3()), desiredTarget = useRef(new THREE.Vector3()), cameraBlendWeight = useRef(0), explorationDistance = useRef(CAMERA_CONFIG.explorationDistance), completedAttackId = useRef(null)
  const followPosition = useRef(new THREE.Vector3()), previousFollowPosition = useRef(null), followDelta = useRef(new THREE.Vector3())
  const inputModeRef = useRef(null), cameraPointerRef = useRef(null), physicalRightPointerId = useRef(null), lastMousePositions = useRef(new Map())
  inputModeRef.current = { mobileControls, controlsDisabled, alive }
  const aliveRef = useRef(alive)
  aliveRef.current = alive
  const blockingRef = useRef(isBlocking)
  blockingRef.current = isBlocking
  aimingRef.current = isAiming
  const { camera, gl, scene } = useThree()
  const spawn = spawnPosition || getPlayerSpawn(playerId)
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
    const cameraModeActive = isAiming || combatMode || cameraBlendWeight.current > 0.001
    const weight = cameraBlendWeight.current
    const targetHeight = THREE.MathUtils.lerp(CAMERA_CONFIG.targetHeight, isAiming ? CAMERA_CONFIG.rifleAimHeight : CAMERA_CONFIG.combatHeight, weight)
    const target = desiredTarget.current.set(playerPosition.x, playerPosition.y + targetHeight, playerPosition.z)
    cameraRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
    cameraRight.current.y = 0
    if (cameraRight.current.lengthSq() > 0.0001) cameraRight.current.normalize()
    target.addScaledVector(cameraRight.current, (isAiming ? CAMERA_CONFIG.rifleAimShoulderOffset : CAMERA_CONFIG.combatShoulderOffset) * weight)
    controlsRef.current.target.lerp(target, 1 - Math.exp(-CAMERA_CONFIG.targetDamping * dt))

    const offset = camera.position.clone().sub(controlsRef.current.target)
    const currentDistance = offset.length()
    if (!cameraModeActive && weight <= 0.001 && currentDistance > 0.001) explorationDistance.current = currentDistance
    const desiredDistance = THREE.MathUtils.lerp(explorationDistance.current, isAiming ? CAMERA_CONFIG.rifleAimDistance : CAMERA_CONFIG.combatDistance, weight)
    const nextDistance = desiredDistance
    if (currentDistance > 0.0001) camera.position.copy(controlsRef.current.target).addScaledVector(offset, nextDistance / currentDistance)
    controlsRef.current.update()
    // Keep the final orbit position above the actual terrain beneath the camera,
    // including while the exploration/combat distance is blending.
    const groundY = activeTerrainHeight(camera.position.x, camera.position.z)
    const minimumY = groundY + CAMERA_CONFIG.minimumGroundClearance
    if (camera.position.y < minimumY) camera.position.y = minimumY
  }
  useEffect(() => {
    const down = (e) => {
      if (!aliveRef.current || inputModeRef.current?.controlsDisabled || typingTarget(e.target)) return
      keys.current[e.code] = true
      if (e.code === 'KeyQ') { e.preventDefault(); onBlockChange?.(true) }
    }
    const up = (e) => { keys.current[e.code] = false; if (e.code === 'KeyQ') onBlockChange?.(false) }
    const rotateCamera = (dx, dy, pointerType) => {
      const controls = controlsRef.current
      const element = gl.domElement
      if (!controls || !element.clientHeight || !controls.enabled) return
      const speed = controls.rotateSpeed || 1
      const isTouch = pointerType === 'touch'
      const sensitivityX = isTouch ? CAMERA_CONFIG.mobileSensitivityX : CAMERA_CONFIG.mouseSensitivityX
      const sensitivityY = isTouch ? CAMERA_CONFIG.mobileSensitivityY : CAMERA_CONFIG.mouseSensitivityY
      const horizontalSign = controls.reverseOrbit || controls.reverseHorizontalOrbit ? 1 : -1
      const verticalSign = controls.reverseOrbit || controls.reverseVerticalOrbit ? 1 : -1
      controls.setAzimuthalAngle(controls.getAzimuthalAngle() + horizontalSign * 2 * Math.PI * dx * speed * sensitivityX / element.clientHeight)
      controls.setPolarAngle(controls.getPolarAngle() + verticalSign * 2 * Math.PI * dy * speed * sensitivityY / element.clientHeight)
    }
    const captureCameraPointer = (event) => {
      if (event.target !== gl.domElement || !controlsRef.current?.enabled) return
      const mode = inputModeRef.current
      if (!mode || mode.controlsDisabled || !mode.alive) return
      if (event.pointerType === 'mouse') {
        lastMousePositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (event.button !== 2) return
        event.preventDefault()
        event.stopImmediatePropagation()
        physicalRightPointerId.current = event.pointerId
        cameraPointerRef.current = { pointerId: event.pointerId, pointerType: 'mouse', x: event.clientX, y: event.clientY }
        if (RIFLE_ENABLED) {
          aimingRef.current = true
          onAimChange?.(true)
        }
      } else if (event.pointerType === 'touch' && mode.mobileControls) {
        const rect = gl.domElement.getBoundingClientRect()
        const inCameraArea = event.clientX >= rect.left + rect.width * 0.42
        if (!inCameraArea && !cameraPointerRef.current) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (cameraPointerRef.current || !inCameraArea) return
        cameraPointerRef.current = { pointerId: event.pointerId, pointerType: 'touch', x: event.clientX, y: event.clientY }
      } else return
      try { gl.domElement.setPointerCapture(event.pointerId) } catch {}
    }
    const moveCameraPointer = (event) => {
      const mode = inputModeRef.current
      const activePointer = cameraPointerRef.current
      const isOwnedDrag = activePointer?.pointerId === event.pointerId && activePointer.pointerType === event.pointerType
      if (!mode?.alive || mode.controlsDisabled) return
      if (event.pointerType === 'mouse') {
        const previous = lastMousePositions.current.get(event.pointerId)
        if (physicalRightPointerId.current !== null && isOwnedDrag && previous) {
          rotateCamera(event.clientX - previous.x, event.clientY - previous.y, 'mouse')
        }
        lastMousePositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      } else if (isOwnedDrag && event.pointerType === 'touch') {
        rotateCamera(event.clientX - activePointer.x, event.clientY - activePointer.y, 'touch')
        activePointer.x = event.clientX
        activePointer.y = event.clientY
      }
    }
    const releaseCameraPointer = (event) => {
      if (cameraPointerRef.current?.pointerId !== event.pointerId) return
      if (physicalRightPointerId.current === event.pointerId) physicalRightPointerId.current = null
      if (event.pointerType === 'mouse') { aimingRef.current = false; onAimChange?.(false) }
      cameraPointerRef.current = null
      if (gl.domElement.hasPointerCapture?.(event.pointerId)) {
        try { gl.domElement.releasePointerCapture(event.pointerId) } catch {}
      }
    }
    const clearTransientInput = () => {
      for (const code of Object.keys(keys.current)) keys.current[code] = false
      if (blockingRef.current) onBlockChange?.(false)
      mobileInputRef && (mobileInputRef.current = { x: 0, y: 0, sprint: false })
      const activePointer = cameraPointerRef.current
      if (activePointer && gl.domElement.hasPointerCapture?.(activePointer.pointerId)) {
        try { gl.domElement.releasePointerCapture(activePointer.pointerId) } catch {}
      }
      cameraPointerRef.current = null
      physicalRightPointerId.current = null
      lastMousePositions.current.clear()
      aimingRef.current = false
      onAimChange?.(false)
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') clearTransientInput() }
    const onContextMenu = event => { if (event.target === gl.domElement) event.preventDefault() }
    const fireRifle = () => {
      if (!RIFLE_ENABLED || !aliveRef.current || inputModeRef.current?.controlsDisabled || !aimingRef.current || typingTarget(document.activeElement)) return
      const raycaster = new THREE.Raycaster()
      raycaster.far = RIFLE_CONFIG.range
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
      const worldHit = raycaster.intersectObjects(scene.children, true).find(hit => {
        let node = hit.object
        while (node) {
          if (node.userData?.isPlayerCharacter) return false
          node = node.parent
        }
        return hit.object.isMesh
      })
      const aimPoint = worldHit?.point || raycaster.ray.at(RIFLE_CONFIG.range, new THREE.Vector3())
      const muzzle = new THREE.Vector3()
      if (muzzleRef.current) {
        muzzleRef.current.updateWorldMatrix(true, false)
        muzzleRef.current.getWorldPosition(muzzle)
      } else if (ref.current) {
        ref.current.updateWorldMatrix(true, false)
        muzzle.set(0, 1.65, 0).applyMatrix4(ref.current.matrixWorld)
      }
      const direction = aimPoint.sub(muzzle).normalize()
      if (direction.lengthSq() > 0.99) onFire?.({ x: direction.x, y: direction.y, z: direction.z }, { x: muzzle.x, y: muzzle.y, z: muzzle.z })
    }
    if (fireRequestRef) fireRequestRef.current = fireRifle
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', clearTransientInput)
    addEventListener('pointermove', moveCameraPointer, true); addEventListener('pointerup', releaseCameraPointer, true); addEventListener('pointercancel', releaseCameraPointer, true)
    gl.domElement.addEventListener('pointerdown', captureCameraPointer, true)
    gl.domElement.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      if (fireRequestRef?.current === fireRifle) fireRequestRef.current = null
      removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', clearTransientInput)
      removeEventListener('pointermove', moveCameraPointer, true); removeEventListener('pointerup', releaseCameraPointer, true); removeEventListener('pointercancel', releaseCameraPointer, true)
      gl.domElement.removeEventListener('pointerdown', captureCameraPointer, true)
      gl.domElement.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearTransientInput()
    }
  }, [controlsRef, gl, mobileInputRef, camera, scene, onFire, onAimChange, onBlockChange, fireRequestRef])
  useEffect(() => {
    if (alive || !ref.current) return
    velocity.current.set(0, 0, 0)
    keys.current = Object.create(null)
    if (mobileInputRef) mobileInputRef.current = { x: 0, y: 0, sprint: false }
  }, [alive, mobileInputRef])
  useEffect(() => {
    if (!spawnPosition || !ref.current || respawnPosition) return
    ref.current.position.set(spawnPosition.x, spawnPosition.y ?? activeGroundHeight(spawnPosition.x, spawnPosition.z), spawnPosition.z)
    velocity.current.set(0, 0, 0)
    if (networkRef) networkRef.current = { position: { x: ref.current.position.x, y: ref.current.position.y, z: ref.current.position.z }, rotation: ref.current.rotation.y, animation: 'idle', alive: true }
  }, [networkRef, respawnPosition, spawnPosition])
  useEffect(() => {
    if (alive && !controlsDisabled) return
    keys.current = Object.create(null)
    if (mobileInputRef) mobileInputRef.current = { x: 0, y: 0, sprint: false }
    const activePointer = cameraPointerRef.current
    if (activePointer && gl.domElement.hasPointerCapture?.(activePointer.pointerId)) {
      try { gl.domElement.releasePointerCapture(activePointer.pointerId) } catch {}
    }
    cameraPointerRef.current = null
    physicalRightPointerId.current = null
    lastMousePositions.current.clear()
    aimingRef.current = false
    onAimChange?.(false)
  }, [alive, controlsDisabled, gl, mobileInputRef, onAimChange])
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
      if (aimingRef.current) fireRequestRef?.current?.()
      else onAttack()
    }
    addEventListener('pointerdown', onPointerDown)
    return () => removeEventListener('pointerdown', onPointerDown)
  }, [alive, controlsDisabled, mobileControls, onAttack, onFire])
  useFrame((_, dt) => {
    if (!ref.current) return
    const now = performance.now()
    const currentAttack = attackRef?.current
    const isAttacking = Boolean(currentAttack?.until > now)
    const shouldUseCombatCamera = alive && (isAiming || combatMode || isAttacking)
    const targetWeight = shouldUseCombatCamera ? 1 : 0
    if (targetWeight === 1 && cameraBlendWeight.current <= 0.001 && controlsRef.current) {
      const currentDistance = camera.position.distanceTo(controlsRef.current.target)
      if (currentDistance > 0.001) explorationDistance.current = currentDistance
    }
    const blendSpeed = targetWeight > cameraBlendWeight.current ? (isAiming ? CAMERA_CONFIG.rifleAimTransitionSpeed : CAMERA_CONFIG.cameraZoomInSpeed) : CAMERA_CONFIG.cameraZoomOutSpeed
    cameraBlendWeight.current += (targetWeight - cameraBlendWeight.current) * (1 - Math.exp(-blendSpeed * dt))
    if (targetWeight === 0 && cameraBlendWeight.current < 0.001) cameraBlendWeight.current = 0
    if (targetWeight === 1 && cameraBlendWeight.current > 0.999) cameraBlendWeight.current = 1
    cameraBlendWeight.current = THREE.MathUtils.clamp(cameraBlendWeight.current, 0, 1)
    if (!alive) {
      velocity.current.set(0, 0, 0)
      movement.current.speed = 0
      movement.current.sprint = false
      movement.current.isBlocking = false
      movement.current.animation = 'death'
      movement.current.attackId = null
      movement.current.alive = false
      if (networkRef) networkRef.current = { position: { x: ref.current.position.x, y: ref.current.position.y, z: ref.current.position.z }, rotation: ref.current.rotation.y, animation: 'death', alive: false, isBlocking: false }
      const playerPosition = syncCameraTranslation()
      updateCameraFraming(dt, playerPosition)
      return
    }
    const aiming = isAiming || combatMode
    const direction = cameraAim.current
    camera.getWorldDirection(direction)
    aimPitchRef.current = isAiming ? Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) : 0
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
    const blocking = isBlocking && !keyboardDisabled
    const f = (keyboardDisabled ? 0 : (pressed.KeyW || pressed.ArrowUp ? 1 : 0) - (pressed.KeyS || pressed.ArrowDown ? 1 : 0)) - mobile.y
    const r = (keyboardDisabled ? 0 : (pressed.KeyD || pressed.ArrowRight ? 1 : 0) - (pressed.KeyA || pressed.ArrowLeft ? 1 : 0)) + mobile.x
    const input = new THREE.Vector3(r, 0, -f)
    const magnitude = Math.min(1, input.length())
    const sprint = !keyboardDisabled && !blocking && !isAiming && (!!(pressed.ShiftLeft || pressed.ShiftRight) || !!mobile.sprint)
    if (magnitude > 0.01) {
      input.normalize()
      const yaw = Math.atan2(camera.position.x - ref.current.position.x, camera.position.z - ref.current.position.z)
      input.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      velocity.current.lerp(input.multiplyScalar((sprint ? 24 : 12) * (blocking ? COMBAT_CONFIG.blockMovementMultiplier : 1) * magnitude), Math.min(1, dt * 9))
      if (!aiming && !blocking) ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z)
    } else velocity.current.lerp(new THREE.Vector3(), Math.min(1, dt * 8))
    if (aiming && direction.lengthSq() > 0.0001) {
      const yawDelta = Math.atan2(Math.sin(aimYaw - ref.current.rotation.y), Math.cos(aimYaw - ref.current.rotation.y))
      ref.current.rotation.y += yawDelta * (1 - Math.exp(-rotationSpeed * dt))
    }
    const previousPosition = previousMovementPosition.current.copy(ref.current.position)
    ref.current.position.addScaledVector(velocity.current, dt)
    const lim = WORLD_SIZE / 2 - 8
    ref.current.position.x = THREE.MathUtils.clamp(ref.current.position.x, -lim, lim)
    ref.current.position.z = THREE.MathUtils.clamp(ref.current.position.z, -lim, lim)
    const resolved = resolveTestBattlefieldMovement(previousPosition, ref.current.position, resolvedMovementPosition.current)
    ref.current.position.x = resolved.x
    ref.current.position.z = resolved.z
    const ground = activeGroundInfo(ref.current.position.x, ref.current.position.z, previousPosition.y)
    ref.current.position.y = ground.height
    if (SHOW_GROUND_DEBUG && ground.surface !== lastGroundSurface.current) {
      lastGroundSurface.current = ground.surface
      console.info('[Ground]', { surface: ground.surface, feetY: ground.height, terrainY: ground.terrainY, candidates: ground.candidates, position: [ref.current.position.x, ref.current.position.z] })
    }
    const playerPosition = syncCameraTranslation()
    movement.current.speed = velocity.current.length(); movement.current.sprint = sprint; movement.current.time += dt
    movement.current.alive = true
    movement.current.isBlocking = blocking
    const locomotion = movement.current.speed > .5 ? (sprint ? 'run' : 'walk') : 'idle'
    const attacking = attackRef?.current?.until > now
    const firingRifle = weaponFireAtRef?.current && now - weaponFireAtRef.current < COMBAT_CONFIG.rifleFireVisualMs
    if (attacking) attackRef.current.rotation = ref.current.rotation.y
    movement.current.animation = attacking ? 'attack' : firingRifle ? 'rifleFire' : locomotion
    movement.current.attackId = attacking ? attackRef.current.attackId : null
    movement.current.attackProgress = attacking ? THREE.MathUtils.clamp((now - attackRef.current.startedAt) / attackRef.current.durationMs, 0, 1) : 0
    movement.current.attackWindupRatio = attacking ? attackRef.current.windupMs / attackRef.current.durationMs : undefined
    movement.current.attackActiveEndRatio = attacking ? (attackRef.current.windupMs + attackRef.current.activeMs) / attackRef.current.durationMs : undefined
    movement.current.attackStartedAt = attacking ? attackRef.current.startedAt : 0
    movement.current.attackDurationMs = attacking ? attackRef.current.durationMs : 0
    movement.current.attackWindupMs = attacking ? attackRef.current.windupMs : 0
    movement.current.attackActiveMs = attacking ? attackRef.current.activeMs : 0
    movement.current.fireSequence = weaponFireSequenceRef?.current || 0
    if (networkRef) networkRef.current = { position: { x: ref.current.position.x, y: ref.current.position.y, z: ref.current.position.z }, rotation: ref.current.rotation.y, animation: movement.current.animation, alive: true, isBlocking: blocking }
    if (!attacking && currentAttack?.until > 0 && completedAttackId.current !== currentAttack.attackId) {
      completedAttackId.current = currentAttack.attackId
      onAttackFinished?.(currentAttack.attackId)
    }
    updateCameraFraming(dt, playerPosition)
  })
  // CharacterVisual normalizes the model so its geometry begins at local Y=0;
  // this group position is the player's feet, with no capsule-half-height offset.
  return <group ref={node => { ref.current = node; if (node) node.userData.isPlayerCharacter = true }} position={[spawn.x, spawn.y ?? activeGroundHeight(spawn.x, spawn.z), spawn.z]}><PlayerModel movementRef={movement} name={name} characterId={characterId} hp={hp} alive={alive} damageFeedback={damageFeedback} muzzleRef={muzzleRef} aimPitchRef={aimPitchRef}/></group>
}
