import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Billboard, Html, Text, useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { activeTerrainHeight } from './terrain.js'

const MOCHI = Object.freeze({
  name: 'Mochi',
  model: '/models/animals/cat_tabby_animated.glb',
  x: 18,
  z: -83,
  height: 1.15,
  interactionDistance: 3.5,
})
const isTyping = target => target instanceof HTMLElement && (
  target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
)

function CatModel({ playerStateRef, mobileControls, interactionDisabled }) {
  const groupRef = useRef()
  const phaseRef = useRef('IDLE')
  const canInteractRef = useRef(false)
  const interactionDisabledRef = useRef(interactionDisabled)
  interactionDisabledRef.current = interactionDisabled
  const [canInteract, setCanInteract] = useState(false)
  const [phase, setPhase] = useState('IDLE')
  const { scene, animations } = useGLTF(MOCHI.model)
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene)
    clone.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    // Box3 includes the GLB's Y-up root transform. Put the lowest rest-pose
    // geometry at local Y=0 and scale by its corrected world-space height.
    const bounds = new THREE.Box3().setFromObject(clone)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    clone.position.set(-center.x, -bounds.min.y, -center.z)
    clone.scale.setScalar(size.y > 0 ? MOCHI.height / size.y : 1)
    return clone
  }, [scene])
  const { actions, names, mixer } = useAnimations(animations, model)
  useEffect(() => {
    const idle = actions.Idle_Cute
    if (!idle) {
      console.error('[CatNPC] Missing required animation Idle_Cute. GLB clips:', names)
      return
    }
    idle.reset()
    idle.setLoop(THREE.LoopRepeat, Infinity)
    idle.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.15).play()
    return () => idle.fadeOut(0.1)
  }, [actions, names])

  const playOnce = useCallback(name => {
    const action = actions[name]
    if (!action) {
      console.error(`[CatNPC] Missing required animation ${name}. GLB clips:`, names)
      return null
    }
    action.reset()
    action.enabled = true
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.15).play()
    return action
  }, [actions, names])

  const pet = useCallback(() => {
    if (!canInteractRef.current || interactionDisabledRef.current || phaseRef.current !== 'IDLE') return
    // Confirm both clips before accepting, so feedback can never claim a pet
    // interaction succeeded when the exported action is missing.
    if (!actions.Pet_Reaction || !actions.Happy) {
      console.error('[CatNPC] Pet sequence unavailable. GLB clips:', names)
      return
    }
    phaseRef.current = 'PETTING'
    setPhase('PETTING')
    actions.Idle_Cute?.fadeOut(0.15)
    if (!playOnce('Pet_Reaction')) {
      phaseRef.current = 'IDLE'
      setPhase('IDLE')
    }
  }, [actions, names, playOnce])

  useEffect(() => {
    const onFinished = event => {
      if (event.action === actions.Pet_Reaction && phaseRef.current === 'PETTING') {
        phaseRef.current = 'HAPPY'
        setPhase('HAPPY')
        actions.Pet_Reaction.fadeOut(0.15)
        playOnce('Happy')
      } else if (event.action === actions.Happy && phaseRef.current === 'HAPPY') {
        phaseRef.current = 'IDLE'
        setPhase('IDLE')
        actions.Happy.fadeOut(0.15)
        const idle = actions.Idle_Cute
        if (idle) {
          idle.reset()
          idle.setLoop(THREE.LoopRepeat, Infinity)
          idle.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.15).play()
        }
      }
    }
    mixer.addEventListener('finished', onFinished)
    return () => mixer.removeEventListener('finished', onFinished)
  }, [actions, mixer, playOnce])

  useEffect(() => {
    const onKeyDown = event => {
      if (event.code !== 'KeyE' || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      if (!canInteractRef.current || interactionDisabledRef.current) return
      event.preventDefault()
      pet()
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [pet])

  useFrame(() => {
    if (groupRef.current) groupRef.current.position.y = activeTerrainHeight(MOCHI.x, MOCHI.z)
    const player = playerStateRef.current?.position
    const inRange = Boolean(player && Math.hypot(player.x - MOCHI.x, player.z - MOCHI.z) <= MOCHI.interactionDistance)
    const nextCanInteract = inRange && !interactionDisabledRef.current
    if (canInteractRef.current !== nextCanInteract) {
      canInteractRef.current = nextCanInteract
      setCanInteract(nextCanInteract)
    }
  })

  return <group ref={groupRef} position={[MOCHI.x, 0, MOCHI.z]}>
    <primitive object={model} />
    <Billboard position={[0, MOCHI.height + 0.3, 0]}>
      <Text fontSize={0.24} outlineWidth={0.025} outlineColor="#243a31" color="white" anchorX="center" anchorY="middle">{MOCHI.name}</Text>
      {phase !== 'IDLE' && <Text position={[0, 0.42, 0]} fontSize={0.42} outlineWidth={0.035} outlineColor="#773d48" color="#ff9db5" anchorX="center" anchorY="middle">♥</Text>}
    </Billboard>
    {canInteract && <Html position={[0, MOCHI.height + 0.02, 0]} center distanceFactor={10} zIndexRange={[20, 0]}>
      <button
        type="button"
        data-ui="cat-interaction"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); pet() }}
        style={{
          whiteSpace: 'nowrap', padding: '8px 12px', border: '1px solid #ffe1a0', borderRadius: 18,
          background: 'rgba(28, 43, 39, .9)', color: '#fff4d9', font: '700 13px system-ui, sans-serif',
          boxShadow: '0 3px 12px #14251c88', cursor: 'pointer', touchAction: 'manipulation',
        }}
      >{phase === 'IDLE' ? (mobileControls ? `Tap to pet ${MOCHI.name}` : `E · Pet ${MOCHI.name}`) : `${MOCHI.name} is happy!`}</button>
    </Html>}
  </group>
}

export default function CatNPC({ playerStateRef, mobileControls, interactionDisabled }) {
  return <CatModel playerStateRef={playerStateRef} mobileControls={mobileControls} interactionDisabled={interactionDisabled} />
}

useGLTF.preload(MOCHI.model)
