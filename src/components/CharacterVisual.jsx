import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { getCharacter } from '../characters/registry.js'
import { SHOW_KNIGHT_DEBUG } from '../characters/registry.js'
import { COMBAT_CONFIG } from '../combat/combatConfig.js'
import EquippedWeapon from './EquippedWeapon.jsx'
import KnightRig from './KnightRig.jsx'
import SwordSlashEffect from './SwordSlashEffect.jsx'

const DEBUG_HELPER_NAMES = new Set(['HITBOX_Sword', 'BLOCK_Shield', 'COLLIDER_Body'])
const loggedAnimationModels = new Set()

function getVisibleModelBounds(model) {
  const bounds = new THREE.Box3()
  model.updateWorldMatrix(true, true)
  model.traverse(object => {
    if (!object.isMesh || DEBUG_HELPER_NAMES.has(object.name) || !object.geometry) return
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld))
  })
  return bounds
}

function LoadedCharacter({ character, movementRef, alive = true, preview = false, equippedWeaponId = null, muzzleRef, aimPitchRef, showAttackVfx = true, attackVfxScale = 0.88, attackVfxOpacity = 1 }) {
  const visual = useRef()
  const { scene, animations } = useGLTF(character.model)
  useEffect(() => {
    if (!import.meta.env.DEV || loggedAnimationModels.has(character.model)) return
    loggedAnimationModels.add(character.model)
    console.info('[Character animations]', character.model, animations.map(animation => ({
      name: animation.name,
      duration: animation.duration,
      tracks: animation.tracks.map(track => track.name),
    })))
  }, [animations, character.model])
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene)
    clone.traverse(object => {
      if (DEBUG_HELPER_NAMES.has(object.name)) {
        object.visible = Boolean(import.meta.env.DEV && SHOW_KNIGHT_DEBUG)
        object.userData.isGameplayDebugHelper = true
      }
      if (object.isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    const bounds = getVisibleModelBounds(clone)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const targetHeight = preview ? character.height * (2.7 / 3.35) : character.height
    const normalization = size.y > 0 ? targetHeight / size.y : 1
    const finalScale = normalization * character.scale
    clone.position.set(-center.x * finalScale, -bounds.min.y * finalScale, -center.z * finalScale)
    clone.scale.setScalar(finalScale)
    return clone
  }, [scene, character, preview])
  const { actions, names } = useAnimations(animations, model)
  const clips = useMemo(() => {
    const resolve = aliases => {
      const normalized = names.map(name => [name, name.toLowerCase()])
      return aliases.map(alias => normalized.find(([, lower]) => lower === alias)?.[0]).find(Boolean) ||
        aliases.map(alias => normalized.find(([, lower]) => lower.includes(alias))?.[0]).find(Boolean)
    }
    return {
      idle: resolve(['idle']),
      walk: resolve(['walk']),
      run: resolve(['run']),
      block: resolve(['block', 'guard']),
      attack: names.find(name => name.toLowerCase() === 'attack_sword_01') ||
        names.find(name => name.toLowerCase() === 'punch') || names.find(name => name.toLowerCase().includes('swordslash')) ||
        ['attack', 'melee', 'slash', 'swing', 'strike', 'sword'].map(alias => names.find(name => name.toLowerCase().includes(alias))).find(Boolean),
      rifleFire: names.find(name => ['rifle_fire', 'gun_shoot', 'shoot_onehanded'].includes(name.toLowerCase())) ||
        ['rifle_fire', 'shoot', 'gun_fire', 'fire'].map(alias => names.find(name => name.toLowerCase().includes(alias))).find(Boolean),
      hitReact: names.find(name => ['recievehit', 'receivehit', 'hitreact', 'damage'].includes(name.toLowerCase())) ||
        names.find(name => name.toLowerCase().includes('hit')),
      death: resolve(['death', 'die', 'dead', 'dying', 'defeat', 'knockout']),
    }
  }, [names])
  const clipForState = state => state === 'attack' ? clips.attack || clips.idle :
    state === 'rifleFire' ? clips.rifleFire || clips.idle :
    state === 'hitReact' ? clips.hitReact || clips.idle : clips[state] || (state === 'run' ? clips.walk : clips.run) || clips.idle

  useEffect(() => {
    if (!preview && !movementRef) return
    let active = true
    let previousState = null
    let previousAttackId = null
    const update = () => {
      if (!active) return
      // Character selection previews intentionally have no live player ref.
      const movement = movementRef?.current
      const dead = !preview && (alive === false || movement?.alive === false)
      const hitReact = movement?.hitReactUntil > performance.now()
      const state = preview ? 'idle' : dead ? 'death' : hitReact ? 'hitReact' : movement?.isBlocking ? 'block' :
        movement?.animation === 'rifleFire' ? 'rifleFire' : movement?.animation === 'attack' ? 'attack' : movement?.animation || 'idle'
      const actionId = state === 'attack' ? movement?.attackId : state === 'rifleFire' ? movement?.fireSequence : null
      if (state === previousState && actionId === previousAttackId) return
      if (previousState === 'death' && state !== 'death' && clips.death) actions[clips.death]?.stop()
      previousState = state
      previousAttackId = actionId
      const clip = clipForState(state)
      if (state === 'death') console.info(clips.death ? `[Death] animation: ${clips.death}` : '[Death] no clip found; using fallback')
      Object.values(actions).forEach(action => action?.fadeOut(0.1))
      const action = clip && actions[clip]
      if (!action) return
      action.reset()
      action.clampWhenFinished = state === 'death' || (state === 'attack' && Boolean(clips.attack)) || (state === 'rifleFire' && Boolean(clips.rifleFire)) || (state === 'hitReact' && Boolean(clips.hitReact))
      action.setLoop(action.clampWhenFinished ? THREE.LoopOnce : THREE.LoopRepeat, action.clampWhenFinished ? 1 : Infinity)
      if (state === 'attack') action.setDuration(COMBAT_CONFIG.attackAnimationMs / 1000)
      action.fadeIn(0.1).play()
    }
    update()
    const timer = setInterval(update, 50)
    return () => { active = false; clearInterval(timer) }
  }, [actions, alive, clips, movementRef, preview])

  useFrame((_, dt) => {
    if (!visual.current) return
    const active = !preview && movementRef?.current
    const dead = alive === false || active?.alive === false
    const fallbackDeath = dead && !clips.death
    const fallbackAttack = !dead && active && !clips.attack && movementRef.current.animation === 'attack'
    const fallbackHit = !dead && active && !clips.hitReact && movementRef.current.hitReactUntil > performance.now()
    const fallbackRifleFire = !dead && active && !clips.rifleFire && movementRef.current.animation === 'rifleFire'
    visual.current.rotation.x = THREE.MathUtils.damp(visual.current.rotation.x, fallbackDeath ? -.3 : fallbackHit ? -.12 : fallbackRifleFire ? -.035 : fallbackAttack ? .18 : 0, 7, dt)
    visual.current.rotation.z = THREE.MathUtils.damp(visual.current.rotation.z, fallbackDeath ? 1.48 : 0, 7, dt)
    const basePosition = character.positionOffset
    visual.current.position.y = THREE.MathUtils.damp(visual.current.position.y, basePosition[1] + (fallbackDeath ? .22 : 0), 7, dt)
  })

  return <group ref={visual} rotation-y={character.rotationOffset} position={character.positionOffset}>
    <primitive object={model} />
    {!preview && character.proceduralRig === 'knight' && <KnightRig model={model} movementRef={movementRef} alive={alive} bakedAttack={Boolean(clips.attack)}/>}
    {!preview && showAttackVfx && character.id === 'knight' && clips.attack && <Suspense fallback={null}><SwordSlashEffect model={model} movementRef={movementRef} effectScale={attackVfxScale} opacityMultiplier={attackVfxOpacity}/></Suspense>}
    {!preview && equippedWeaponId && <Suspense fallback={null}><EquippedWeapon characterModel={model} characterId={character.id} equippedWeaponId={equippedWeaponId} muzzleRef={muzzleRef} aimPitchRef={aimPitchRef}/></Suspense>}
  </group>
}

export default function CharacterVisual({ characterId, movementRef, alive = true, preview = false, fallback = null, equippedWeaponId = null, muzzleRef, aimPitchRef, showAttackVfx = true, attackVfxScale = 0.88, attackVfxOpacity = 1 }) {
  const character = getCharacter(characterId)
  return <Suspense fallback={fallback}><LoadedCharacter character={character} movementRef={movementRef} alive={alive} preview={preview} equippedWeaponId={equippedWeaponId} muzzleRef={muzzleRef} aimPitchRef={aimPitchRef} showAttackVfx={showAttackVfx} attackVfxScale={attackVfxScale} attackVfxOpacity={attackVfxOpacity}/></Suspense>
}
