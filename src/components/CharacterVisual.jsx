import { Suspense, useEffect, useMemo } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { getCharacter } from '../characters/registry.js'

function LoadedCharacter({ character, movementRef, preview = false }) {
  const { scene, animations } = useGLTF(character.model)
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene)
    clone.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    const bounds = new THREE.Box3().setFromObject(clone)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const targetHeight = preview ? character.height * (2.7 / 3.35) : character.height
    const normalization = size.y > 0 ? targetHeight / size.y : 1
    clone.position.set(-center.x, -bounds.min.y, -center.z)
    clone.scale.setScalar(normalization * character.scale)
    return clone
  }, [scene, character, preview])
  const { actions, names } = useAnimations(animations, model)
  const clips = useMemo(() => ({
    idle: names.find(name => name.toLowerCase() === 'idle'),
    walk: names.find(name => name.toLowerCase() === 'walk'),
    run: names.find(name => name.toLowerCase() === 'run'),
  }), [names])
  const clipForState = state => clips[state] || (state === 'run' ? clips.walk : clips.run) || clips.idle

  useEffect(() => {
    const state = preview ? 'idle' : movementRef?.current?.animation || 'idle'
    const clip = clipForState(state)
    if (!clip || !actions[clip]) return
    Object.values(actions).forEach(action => action?.fadeOut(0.15))
    actions[clip].reset().fadeIn(0.15).play()
    return () => actions[clip]?.fadeOut(0.1)
  }, [actions, clips, movementRef, preview])

  useEffect(() => {
    if (preview || !movementRef) return
    let active = true
    const update = () => {
      if (!active) return
      const state = movementRef.current?.animation || 'idle'
      const clip = clipForState(state)
      for (const [name, action] of Object.entries(actions)) {
        if (!action) continue
        if (names.includes(clip) && name === clip) {
          if (!action.isRunning()) action.reset().fadeIn(0.12).play()
        } else if (action.isRunning()) action.fadeOut(0.12)
      }
    }
    const timer = setInterval(update, 120)
    return () => { active = false; clearInterval(timer) }
  }, [actions, clips, movementRef, names, preview])

  return <group rotation-y={character.rotationOffset} position={character.positionOffset}>
    <primitive object={model} />
  </group>
}

export default function CharacterVisual({ characterId, movementRef, preview = false, fallback = null }) {
  const character = getCharacter(characterId)
  return <Suspense fallback={fallback}><LoadedCharacter character={character} movementRef={movementRef} preview={preview}/></Suspense>
}
