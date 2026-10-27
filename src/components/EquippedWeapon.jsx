import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { getWeapon } from '../weapons/registry.js'

const warnedMissingBones = new Set()

export default function EquippedWeapon({ characterModel, characterId, equippedWeaponId, muzzleRef, aimPitchRef }) {
  const weapon = getWeapon(equippedWeaponId)
  if (!weapon) return null
  return <LoadedWeapon weapon={weapon} characterModel={characterModel} characterId={characterId} muzzleRef={muzzleRef} aimPitchRef={aimPitchRef}/>
}

function LoadedWeapon({ weapon, characterModel, characterId, muzzleRef, aimPitchRef }) {
  const anchorRef = useRef(null), baseRotation = useRef(new THREE.Quaternion()), pitchRotation = useRef(new THREE.Quaternion()), pitchAxis = useRef(new THREE.Vector3(1, 0, 0))
  const { scene } = useGLTF(weapon.modelPath)
  const instance = useMemo(() => {
    const clone = cloneSkeleton(scene)
    clone.name = `${weapon.id}-${characterId || 'character'}-instance`
    clone.traverse(object => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
    })
    return clone
  }, [scene, weapon.id, characterId])

  useFrame(() => {
    if (!anchorRef.current) return
    pitchRotation.current.setFromAxisAngle(pitchAxis.current, aimPitchRef?.current || 0)
    anchorRef.current.quaternion.copy(baseRotation.current).multiply(pitchRotation.current)
  })

  useEffect(() => {
    let hand = weapon.attachmentBoneNames.map(name => characterModel.getObjectByName(name)).find(object => object?.isBone)
    if (!hand) {
      characterModel.traverse(object => {
        if (!hand && object.isSkinnedMesh) hand = weapon.attachmentBoneNames.map(name => object.skeleton.getBoneByName(name)).find(Boolean)
      })
    }
    if (!hand) {
      const warningKey = `${weapon.id}:${characterId || 'unknown'}`
      if (import.meta.env.DEV && !warnedMissingBones.has(warningKey)) {
        warnedMissingBones.add(warningKey)
        const availableBones = []
        characterModel.traverse(object => { if (object.isBone) availableBones.push(object.name) })
        console.warn(`[Weapon] Right-hand bone not found for character: ${characterId || 'unknown'} (expected ${weapon.attachmentBoneNames.join(' or ')}; available: ${availableBones.join(', ') || 'none'})`)
      }
      return undefined
    }

    const calibration = weapon.characterOverrides[characterId] || weapon.defaultAttachment
    const anchor = new THREE.Group()
    anchor.name = `${weapon.id}-weapon-anchor`
    anchor.position.fromArray(calibration.position)
    characterModel.updateWorldMatrix(true, true)
    const characterWorldRotation = characterModel.getWorldQuaternion(new THREE.Quaternion())
    const handWorldRotation = hand.getWorldQuaternion(new THREE.Quaternion())
    const weaponForwardCorrection = new THREE.Quaternion().setFromEuler(new THREE.Euler(...calibration.rotation))
    anchor.quaternion.copy(handWorldRotation.invert().multiply(characterWorldRotation).multiply(weaponForwardCorrection))
    baseRotation.current.copy(anchor.quaternion)
    anchorRef.current = anchor
    anchor.scale.setScalar(calibration.scale)
    const muzzle = new THREE.Object3D()
    muzzle.name = `${weapon.id}-muzzle`
    muzzle.position.fromArray(weapon.muzzlePosition || [0, 0, 1])
    if (muzzleRef) muzzleRef.current = muzzle
    hand.add(anchor)
    anchor.add(instance)
    anchor.add(muzzle)
    if (import.meta.env.DEV) console.info(`[Weapon] Attached ${weapon.id} to ${hand.name} for ${characterId}`)

    return () => {
      anchor.remove(instance)
      anchor.remove(muzzle)
      hand.remove(anchor)
      if (anchorRef.current === anchor) anchorRef.current = null
      if (muzzleRef?.current === muzzle) muzzleRef.current = null
    }
  }, [characterModel, characterId, instance, weapon])

  return null
}
