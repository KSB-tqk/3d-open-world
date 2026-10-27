import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain.jsx'
import Scenery from './Scenery.jsx'
import TestBattlefield from './TestBattlefield.jsx'
import Player from './Player.jsx'
import RemotePlayer from './RemotePlayer.jsx'
import SceneReady from './SceneReady.jsx'
import CatNPC from './CatNPC.jsx'
import { TEST_BATTLEFIELD_SPAWN, USE_TEST_BATTLEFIELD, WORLD_MAP } from '../world/worldConfig.js'
import { activeTerrainHeight } from './terrain.js'
import CombatDebug from '../combat/CombatDebug.jsx'
import { CAMERA_CONFIG } from '../combat/combatConfig.js'

export default function World({ name, characterId, socket, connected, playerList, onReady, debugMap, combatDebug, mobileInputRef, localAttackRef, localPlayerStateRef, attackIntentRef, fireRequestRef, weaponFireAtRef, weaponFireSequenceRef, localHp, localAlive, localSpawnPosition, localRespawnPosition, localDamageFeedback, onAttack, onFire, onAimChange, isAiming, onAttackReady, onAttackFinished, combatMode, mobileControls, chatOpen, chatActive }) {
  const controls = useRef(), fallbackState = useRef(null), lastSent = useRef(0)
  const localState = localPlayerStateRef || fallbackState
  const spawn = localSpawnPosition || (USE_TEST_BATTLEFIELD ? TEST_BATTLEFIELD_SPAWN : WORLD_MAP.spawn)
  useFrame((_, dt) => {
    lastSent.current += dt
    if (connected && localState.current && localState.current.alive !== false && lastSent.current >= .075) {
      socket.emit('player:move', localState.current)
      lastSent.current = 0
    }
  })
  return <>
    {USE_TEST_BATTLEFIELD ? <TestBattlefield/> : <><Terrain/><Scenery debugMap={debugMap}/></>}<Player controlsRef={controls} name={name} characterId={characterId} playerId={socket?.id || name} networkRef={localState} mobileInputRef={mobileInputRef} attackRef={localAttackRef} attackIntentRef={attackIntentRef} fireRequestRef={fireRequestRef} weaponFireAtRef={weaponFireAtRef} weaponFireSequenceRef={weaponFireSequenceRef} hp={localHp} alive={localAlive} spawnPosition={localSpawnPosition} respawnPosition={localRespawnPosition} damageFeedback={localDamageFeedback} onAttack={onAttack} onFire={onFire} onAimChange={onAimChange} isAiming={isAiming} onAttackReady={onAttackReady} onAttackFinished={onAttackFinished} combatMode={combatMode} mobileControls={mobileControls} controlsDisabled={!localAlive || chatActive || (mobileControls && chatOpen)}/>
    <CatNPC playerStateRef={localState} mobileControls={mobileControls} interactionDisabled={chatActive || !localAlive}/>
    {import.meta.env.DEV && <CombatDebug enabled={combatDebug} showAimDirection={CAMERA_CONFIG.showCombatAimDebug} getTransform={() => localState.current} getAttack={() => localAttackRef.current}/>}
    {playerList.map(player => <group key={player.id}><RemotePlayer player={player}/>{import.meta.env.DEV && <CombatDebug enabled={combatDebug} showAimDirection={CAMERA_CONFIG.showCombatAimDebug} getTransform={() => player.target.current} getAttack={() => player.attack}/>}</group>)}
    <OrbitControls ref={controls} makeDefault enabled={!chatActive && (!mobileControls || !chatOpen)} enablePan={false} mouseButtons={{ LEFT: mobileControls ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }} minDistance={CAMERA_CONFIG.explorationMinDistance} maxDistance={CAMERA_CONFIG.explorationMaxDistance} minPolarAngle={Math.PI / 2 - CAMERA_CONFIG.maxPitch} maxPolarAngle={Math.PI / 2 - CAMERA_CONFIG.minPitch} target={[spawn.x, (spawn.y ?? activeTerrainHeight(spawn.x,spawn.z))+CAMERA_CONFIG.targetHeight, spawn.z]} />
    <SceneReady onReady={onReady}/>
  </>
}
